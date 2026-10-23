// Systems: a feature is one defineSystem() object (docs/ARCHITECTURE.md 3.2). [P]
//
//   export default defineSystem({
//     name: 'farming', needs: ['props'],      boot order, and the permission for ctx.use('props')
//     events: {},                             private event schemas, declared on the bus under this owner
//     slice: { version, order, defaults(), serialize(ctx), load(d, ctx), migrate, shift },   name defaults to the system name
//     facade: { harvest: 'harvest' },         Game method name -> api method (S6A legacy: a function or { get, set } installed on Game as is)
//     init(ctx), newGame(ctx), start(ctx, { fresh }), update(ctx, dt, t),
//     api(ctx) { return { harvest }; },       what other systems get from ctx.use('farming')
//   });
//
// core.js boots a list of systems in `needs` order. Each system gets its own ctx: the core scoped to the system's name
// (every registry add records the owner), a gated use(), and `state`, a plain object that belongs to this system in this
// core. Keep per-core data there (never in module variables), so two cores can run the same system side by side.

const NAME = /^[a-z][A-Za-z0-9]*$/;
const HOOKS = ['init', 'newGame', 'start', 'update', 'api'];
const KEYS = new Set(['name', 'needs', 'events', 'slice', 'facade', ...HOOKS]);
const SLICE_KEYS = new Set(['name', 'version', 'order', 'defaults', 'serialize', 'load', 'migrate', 'shift']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function checkSlice(name, slice) {
  const at = `system ${name}: slice`;
  if (!isObj(slice)) throw new Error(`${at} must be an object`);
  for (const k of Object.keys(slice)) if (!SLICE_KEYS.has(k)) throw new Error(`${at} has unknown field '${k}'`);
  if (!Number.isInteger(slice.version) || slice.version < 1) throw new Error(`${at}.version must be an integer >= 1`);
  if (!Number.isFinite(slice.order)) throw new Error(`${at}.order must be a number`);
  for (const f of ['defaults', 'serialize', 'load']) if (typeof slice[f] !== 'function') throw new Error(`${at}.${f} must be a function`);
  if (slice.shift !== undefined && typeof slice.shift !== 'function') throw new Error(`${at}.shift must be a function`);
  for (let n = 1; n < slice.version; n++) if (typeof slice.migrate?.[n] !== 'function') throw new Error(`${at}.migrate has no step from v${n}`);
}

/** Validates a system definition and returns it frozen, with `needs` and `events` filled in. */
export function defineSystem(spec) {
  if (!isObj(spec)) throw new Error('defineSystem: expected an object');
  const { name } = spec;
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`defineSystem: bad name ${JSON.stringify(name)}`);
  for (const k of Object.keys(spec)) if (!KEYS.has(k)) throw new Error(`system ${name}: unknown field '${k}'`);
  const needs = spec.needs ?? [];
  if (!Array.isArray(needs) || needs.some((n) => typeof n !== 'string' || !NAME.test(n))) throw new Error(`system ${name}: needs must be a list of system names`);
  if (new Set(needs).size !== needs.length) throw new Error(`system ${name}: needs lists a system twice`);
  if (needs.includes(name)) throw new Error(`system ${name} cannot need itself`);
  if (spec.events !== undefined && !isObj(spec.events)) throw new Error(`system ${name}: events must be an object`);
  const legacy = (v) => typeof v === 'function' || (isObj(v) && ('get' in v || 'set' in v));
  if (spec.facade !== undefined && (!isObj(spec.facade) || Object.values(spec.facade).some((v) => typeof v !== 'string' && !legacy(v)))) throw new Error(`system ${name}: facade maps Game method names to api method names`);
  for (const h of HOOKS) if (spec[h] !== undefined && typeof spec[h] !== 'function') throw new Error(`system ${name}: ${h} must be a function`);
  if (spec.facade && Object.values(spec.facade).some((v) => typeof v === 'string') && !spec.api) throw new Error(`system ${name}: a facade needs an api`);
  if (spec.slice !== undefined) checkSlice(name, spec.slice);
  return Object.freeze({ ...spec, needs: Object.freeze([...needs]), events: Object.freeze({ ...(spec.events || {}) }) });
}

/**
 * Boot order: every system after the ones it needs; otherwise the order of the list (so systems/index.js decides ties).
 * Throws on a duplicate name, a missing need or a cycle.
 */
export function bootOrder(list) {
  const byName = new Map();
  for (const s of list) {
    if (byName.has(s.name)) throw new Error(`system ${s.name} is registered twice`);
    byName.set(s.name, s);
  }
  for (const s of list) for (const n of s.needs) if (!byName.has(n)) throw new Error(`system ${s.name} needs '${n}', which is not registered`);
  const done = new Set(), out = [];
  let rest = [...list];
  while (rest.length) {
    const i = rest.findIndex((s) => s.needs.every((n) => done.has(n)));
    if (i < 0) throw new Error(`systems need each other in a cycle: ${rest.map((s) => `${s.name} -> ${s.needs.filter((n) => !done.has(n)).join('|')}`).join(', ')}`);
    const [s] = rest.splice(i, 1);
    done.add(s.name);
    out.push(s);
  }
  return out;
}

/**
 * The ctx a system sees: the core scoped to the system's name, plus
 *   use(name)  the api of a system listed in `needs` (anything else throws), and
 *   state      this system's private object.
 * `apis` is the core's name -> api map; it is read when use() is called, so only booted systems resolve.
 */
export function systemCtx(core, spec, apis, state) {
  const scoped = core.as(spec.name);
  const needs = new Set(spec.needs);
  const use = (name) => {
    if (!needs.has(name)) throw new Error(`system '${spec.name}' uses '${name}' but does not list it in needs`);
    if (!apis.has(name)) throw new Error(`system '${spec.name}' used '${name}' before it was booted`);
    return apis.get(name);
  };
  return new Proxy(scoped, {
    get(t, key) {
      if (key === 'use') return use;
      if (key === 'state') return state;
      if (key === 'system') return spec.name;
      return Reflect.get(t, key);
    },
  });
}

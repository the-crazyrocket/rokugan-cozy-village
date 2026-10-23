// Hook registries (section 3.2): tools actions resolvers hotbar guards sweeps keys todo today sheets views hud daily. [P]
// Every registry validates a definition when it is added, rejects duplicates and records the `owner` of each entry.
// Owner scoping: hooks.as('wp26') (or ctx.as('wp26'), see scopeCtx) returns the same registries with the owner filled in.
// A WP adds a registry of its own with hooks.define(name, cfg) / ctx.hooks.define(name, cfg) without touching this file.
//
//   id-keyed:    reg.add(def)              def[field] is the key                      hotbar resolvers todo today views hud daily
//   arg-keyed:   reg.add(key, def)         key is the first argument                  tools actions sheets keys(bind)
//   multi:       reg.add(kind, fn, opts)   many entries per kind                      guards
// Common reads: get(key) has(key) all() ids() size version owned(owner) remove(keyOrEntry) removeOwner(owner) as(owner).
// all() is sorted (higher `priority` first, ascending `order`, then registration order) and frozen.
import { validate } from './schema.js';

const open = (fields) => ({ fields, open: true });
const HUD_SLOTS = ['toolbar', 'preview', 'shutter', 'corner'];

/** Registry configs. field = name of the key property, arg = key is the first argument, sort = [property, direction]. */
export const REGISTRIES = {
  tools: { field: 'id', arg: true, spec: open({ use: 'function', mesh: 'any?', group: 'string?' }) },
  hotbar: { field: 'id', sort: ['order', 1], spec: open({ id: 'string', order: 'number', name: 'string?', hint: 'string?', icon: 'any?', compact: 'any?', when: 'cond?' }) },
  resolvers: {
    field: 'id', sort: ['priority', -1], spec: open({ id: 'string', priority: 'number', fn: 'function' }),
    // highest priority non-null action wins; null means walk
    extra: (api) => ({ resolve(t, ctx) { for (const e of api.all()) { const a = e.fn(t, ctx); if (a) return a; } return null; } }),
  },
  actions: { field: 'kind', arg: true, spec: open({ perform: 'function', range: 'number?', queueable: 'any?', sweep: 'any?', button: 'any?' }) },
  guards: {
    field: 'kind', multi: true, kinds: ['place', 'terraform', 'reclaim', 'dig'], sort: ['priority', -1],
    spec: open({ kind: 'string', fn: 'function', priority: 'number' }),
    wrap: (fn, args) => ({ fn, priority: (args[2] && args[2].priority) ?? 50 }),
    // the first reason wins; null means allowed
    extra: (api, kinds) => ({
      check(kind, p, ctx) { for (const e of api.get(kind) || []) { const r = e.fn(p, ctx); if (r) return r; } return null; },
      declare(kind) { kinds.add(kind); },
    }),
  },
  keys: {
    field: 'code', arg: true, verb: 'bind', spec: open({ code: 'string', fn: 'function' }),
    wrap: (def) => (typeof def === 'function' ? { fn: def } : def),
    extra: (api) => ({ press(code, ctx) { const e = api.get(code); if (!e) return false; e.fn(ctx); return true; } }),
  },
  todo: {
    field: 'id', sort: ['priority', -1], spec: open({ id: 'string', priority: 'number', when: 'function' }),
    // what to show now: [{ id, priority, icon, text, onTap }]
    extra: (api) => ({ collect(ctx) { const out = []; for (const e of api.all()) { const r = e.when(ctx); if (r) out.push({ id: e.id, priority: e.priority, ...r }); } return out; } }),
  },
  today: { field: 'id', verb: 'addSection', sort: ['order', 1], spec: open({ id: 'string', order: 'number', render: 'function' }) },
  sheets: { field: 'name', arg: true, spec: open({ render: 'function', live: 'any?' }) },
  views: { field: 'name', spec: open({ name: 'string', init: 'function?', update: 'function?', dispose: 'function?' }) },
  hud: {
    field: 'id', sort: ['order', 1], spec: open({ id: 'string', slot: { enum: HUD_SLOTS }, order: 'number', when: 'cond?', render: 'function' }),
    extra: (api) => ({ slot: (slot) => api.all().filter((e) => e.slot === slot) }),
  },
  daily: { field: 'id', verb: 'contribute', sort: ['order', 1], spec: open({ id: 'string', order: 'number', roll: 'function', base: 'bool?' }) },
};

function makeRegistry(name, cfg) {
  const { field = 'id', arg = false, verb = 'add', multi = false, sort, wrap } = cfg;
  const spec = cfg.spec || open({ [field]: 'string' });
  const kinds = cfg.kinds ? new Set(cfg.kinds) : null;
  const store = new Map();
  const handles = new Map();
  let cache = null, version = 0, seq = 0;

  const cmp = (a, b) => (sort ? sort[1] * (a[sort[0]] - b[sort[0]]) : 0) || a.seq - b.seq;
  const touch = () => { cache = null; version++; };
  const all = () => cache ||= Object.freeze([...store.values()].flat().sort(cmp));

  function build(owner) {
    const api = {
      name, owner, field,
      get version() { return version; },
      get size() { return all().length; },
      /** An entry (a sorted frozen list for a multi registry). */
      get: (key) => (multi ? Object.freeze([...(store.get(key) || [])]) : store.get(key)),
      has: (key) => (multi ? !!(store.get(key) || []).length : store.has(key)),
      all,
      ids: () => [...store.keys()],
      owned: (who) => all().filter((e) => e.owner === who),
      add(...args) {
        let key, def;
        if (arg || multi) [key, def] = args; else { [def] = args; key = def && def[field]; }
        if (wrap) def = wrap(def, args);
        if (typeof key !== 'string' || !key) throw new Error(`${name}: missing ${field}`);
        if (!def || typeof def !== 'object') throw new Error(`${name}.${key}: expected a definition object`);
        if (kinds && !kinds.has(key)) throw new Error(`${name}: unknown ${field} '${key}' (${[...kinds].join(', ')})`);
        const entry = { ...def, [field]: key, owner: owner ?? def.owner ?? null, seq: ++seq };
        const errs = validate(spec, entry, `${name}.${key}`);
        if (errs.length) throw new Error(errs.join('; '));
        if (multi) store.set(key, [...(store.get(key) || []), entry].sort(cmp));
        else {
          const prev = store.get(key);
          if (prev) throw new Error(`${name}: '${key}' is already registered${prev.owner ? ` by ${prev.owner}` : ''}`);
          store.set(key, entry);
        }
        touch();
        return entry;
      },
      remove(keyOrEntry) {
        const key = typeof keyOrEntry === 'string' ? keyOrEntry : keyOrEntry && keyOrEntry[field];
        const cur = store.get(key);
        if (!cur) return false;
        if (multi && typeof keyOrEntry !== 'string') {
          const rest = cur.filter((e) => e !== keyOrEntry);
          if (rest.length === cur.length) return false;
          if (rest.length) store.set(key, rest); else store.delete(key);
        } else store.delete(key);
        touch();
        return true;
      },
      removeOwner(who) { for (const e of all().filter((x) => x.owner === who)) api.remove(e); },
      as: (o) => handle(o),
    };
    if (verb !== 'add') api[verb] = api.add;
    if (cfg.extra) Object.assign(api, cfg.extra(api, kinds));
    return api;
  }
  function handle(owner) {
    if (!handles.has(owner)) handles.set(owner, build(owner));
    return handles.get(owner);
  }
  return handle(null);
}

/** Read-only view of the actions that opt into sweep (drag-over) use. */
function makeSweeps(actions) {
  const sweeps = {
    name: 'sweeps',
    get version() { return actions.version; },
    get: (kind) => { const a = actions.get(kind); return a && a.sweep ? a : undefined; },
    has: (kind) => sweeps.get(kind) !== undefined,
    all: () => actions.all().filter((a) => a.sweep),
    ids: () => sweeps.all().map((a) => a.kind),
    kinds: () => sweeps.ids(),
    as: () => sweeps,
  };
  return sweeps;
}

const RESERVED = new Set(['define', 'get', 'has', 'names', 'entries', 'owners', 'owner', 'as', 'hooks', 'sweeps']);

/** createHooks({ target }): when `target` (the ctx) is given, every registry is also installed as target[name], plus target.hooks and target.as. */
export function createHooks({ target } = {}) {
  const regs = new Map();
  const hubs = new Map();
  const derived = {};

  function hubFor(owner) {
    if (hubs.has(owner)) return hubs.get(owner);
    const hub = {
      owner,
      /** Adds a registry: cfg = { field = 'id', arg, verb = 'add', multi, sort: [prop, 1|-1], spec, wrap, kinds, extra }. */
      define(name, cfg = {}) {
        if (RESERVED.has(name) || regs.has(name) || !/^[a-z][A-Za-z0-9]*$/.test(name)) throw new Error(`hooks.define: bad or taken registry name '${name}'`);
        const reg = makeRegistry(name, cfg);
        regs.set(name, reg);
        for (const [o, h] of hubs) h[name] = reg.as(o);
        if (target) target[name] = reg;
        return hub[name];
      },
      get: (name) => { const r = regs.get(name); return r && r.as(owner); },
      has: (name) => regs.has(name),
      names: () => [...regs.keys()],
      /** Every entry of every registry: [{ registry, key, owner }], for lints. */
      entries: () => [...regs].flatMap(([name, r]) => r.all().map((e) => ({ registry: name, key: e[r.field], owner: e.owner }))),
      owners: () => new Set([...regs.values()].flatMap((r) => r.all().map((e) => e.owner))),
      as: hubFor,
    };
    hubs.set(owner, hub);
    for (const [name, r] of regs) hub[name] = r.as(owner);
    hub.sweeps = derived.sweeps;
    return hub;
  }

  const root = hubFor(null);
  for (const name of Object.keys(REGISTRIES)) root.define(name, REGISTRIES[name]);
  derived.sweeps = makeSweeps(regs.get('actions'));
  for (const h of hubs.values()) h.sweeps = derived.sweeps;
  if (target) {
    target.sweeps = derived.sweeps;
    target.hooks = root;
    if (!target.as) target.as = (owner) => scopeCtx(target, owner);
  }
  return root;
}

/**
 * ctx.as(owner): a view of ctx whose scoped members (anything with an `as(owner)` method: registries, hooks, bus, sched,
 * cond, content, schema) record `owner`. Everything else reads and writes through to ctx.
 */
export function scopeCtx(ctx, owner) {
  const made = new Map();
  return new Proxy(ctx, {
    get(t, key) {
      if (key === 'owner') return owner;
      if (key === 'as') return (o) => scopeCtx(ctx, o);
      const v = Reflect.get(t, key);
      if (v === null || typeof v !== 'object' || typeof v.as !== 'function') return v;
      if (!made.has(v)) made.set(v, v.as(owner));
      return made.get(v);
    },
  });
}

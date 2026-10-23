// createCore: wires the bus, hook registries, content, conditions, time, scheduler, away, inventory, flags and the save
// (docs/ARCHITECTURE.md 3.1-3.8) into one object, the ctx every system sees. [P]
//
//   createCore({ now, mono, rng, storage, strict, blobs, content, dev, hemisphere, carry, devOffset, pollMs, systems })
//     now() real wall clock ms (default: the local clock), mono() monotonic ms, rng a core/rng stream, storage a Web Storage
//     look-alike (default: memory), blobs a core/blobs store, strict makes bad events and handler errors throw (tests),
//     content a createContent() instance (default: the module singleton), dev the save namespace (see save-storage),
//     systems a list booted straight away.
//
// Time travels through ctx.now(): inside a catch-up it is the `at` of the entry being run, otherwise time.now().
// Everything below that touches the wall clock goes through the injected now/mono, so a test can drive it by hand.
import { createBus } from './bus.js';
import { createHooks } from './hooks.js';
import { content as sharedContent } from './content.js';
import { schema } from './schema.js';
import { createCond } from './cond.js';
import { createTime } from './time.js';
import { createSched, catchUp as runCatchUp, schedSlice } from './sched.js';
import { createAway, awaySlice } from './away.js';
import { createInventory, createMoney } from './inventory.js';
import { createFlags } from './flags.js';
import { createSave } from './save.js';
import { createSaveStorage, createMemoryStorage } from './save-storage.js';
import { createRng } from './rng.js';
import { createMemoryBlobs, assertBlobStore } from './blobs.js';
import { bootOrder, systemCtx } from './system.js';

const OWN_KEYS = new Set(['money', 'inv', 'time', 'flags']); // what the `core` slice holds itself; everything else is a part or kept as is
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

export function createCore({
  now, mono, rng, storage, strict = false, blobs, content = sharedContent, dev = false,
  hemisphere, carry = 0, devOffset = 0, pollMs = 500, systems,
} = {}) {
  const provided = new Map(); // world, props, friendship, tagsOf: set by the systems that own them (core.provide)
  const time = createTime({ realNow: now, perf: mono, carry, devOffset, hemisphere, festivals: () => (content.festivals ? content.festivals.entries() : []) });
  const sched = createSched({ time });
  const nowFn = () => (sched.sim ? sched.sim.at : time.now());

  const bus = createBus({ now: nowFn, strict });
  let quiet = 0; // loading a save changes money and items without telling anyone
  const gate = { emit: (name, payload) => { if (!quiet) bus.emit(name, payload); } };
  const inv = createInventory({ bus: gate, keep: (id) => content.items?.get(id)?.kind === 'tool' });
  const money = createMoney({ bus: gate });
  const flags = createFlags();
  const away = createAway({ now: nowFn });
  away.attach(bus);
  const save = createSave();
  const store = createSaveStorage({ storage: storage ?? createMemoryStorage(), save, dev, now: nowFn, strict });
  const apis = new Map();
  const running = new Map(); // name -> { spec, ctx, api, state } in boot order
  const facade = {};
  const parts = new Map();   // pieces of the `core` slice owned by someone else (player, stats, tool ...)
  let rest = {};             // keys of the core slice nobody claimed yet, written back as they were
  let lastTick = nowFn(), lastPoll = null, booted = false;

  const core = {
    strict, content, schema, bus, time, sched, away, inv, money, flags, save, storage: store, facade,
    cond: createCond(),
    rng: rng ?? createRng(1),
    blobs: assertBlobStore(blobs ?? createMemoryBlobs({ now: nowFn })),
    ext: {},
    now: nowFn,
    mono: () => time.mono(),
    get world() { return provided.get('world') ?? null; },
    groundY: (x, z) => { const f = provided.get('groundY'); return f ? f(x, z) : provided.get('world')?.groundY?.(x, z) ?? 0; },
    /** Hands the core something it cannot import: 'world', 'props' (cond reads props.within), 'friendship', 'tagsOf', 'groundY' (fn(x, z), wins over world.groundY). */
    provide(key, value) { provided.set(key, value); return value; },
    use(name) { // ungated: the Game facade and tests. Systems get a gated one on their own ctx.
      if (!apis.has(name)) throw new Error(`no system '${name}' is booted`);
      return apis.get(name);
    },
    get systems() { return running; },
    get lastTick() { return lastTick; },

    say(text, icon, tone) { return bus.emit('say', { text, ...(icon != null && { icon }), ...(tone != null && { tone }) }); },
    sfx(name, opts) { return bus.emit('sfx', { name, ...(opts != null && { opts }) }); },
    fx: { burst: (x, y, z, opts) => bus.emit('fx', { kind: 'burst', x, y, z, ...(opts != null && { opts }) }) },
    invalidate: (what) => bus.emit('invalidate', { what }),
    sparkle: (x, y, z) => bus.emit('fx', { kind: 'sparkle', x, y, z }),

    /** The context conditions are evaluated against (section 3.4). */
    condCtx(extra = {}) {
      const t = nowFn();
      return {
        now: t, hour: time.hour(t), season: time.season(t), weather: time.weather(t), festival: time.festival(t), day: time.day(t),
        world: core.world, props: provided.get('props') ?? null, inv, flags,
        friendship: provided.get('friendship'), tagsOf: provided.get('tagsOf'), ...extra,
      };
    },

    /**
     * Claims a key of the `core` slice: part(name, { serialize(ctx), load(value, ctx), defaults?(ctx) }). A value already
     * loaded under that key is handed over at once. Until a part exists the key travels through load and save untouched.
     */
    part(name, spec) {
      if (typeof name !== 'string' || !name || OWN_KEYS.has(name) || parts.has(name)) throw new Error(`core.part: bad or taken name '${name}'`);
      if (typeof spec?.serialize !== 'function' || typeof spec?.load !== 'function') throw new Error(`core.part ${name} needs serialize() and load()`);
      parts.set(name, spec);
      if (name in rest) { const v = rest[name]; delete rest[name]; spec.load(v, core); }
      return spec;
    },

    /** Boots the systems once, in `needs` order: events, slice, api and facade first, then every init(). */
    boot(list) {
      if (booted) throw new Error('core.boot: already booted');
      booted = true;
      const order = bootOrder(list);
      for (const spec of order) {
        const state = {};
        const ctx = systemCtx(core, spec, apis, state);
        const entry = { spec, ctx, state, api: null, failed: false };
        running.set(spec.name, entry);
        if (Object.keys(spec.events).length) bus.as(spec.name).declareAll(spec.events);
        if (spec.slice) {
          const sl = spec.slice;
          save.register({
            ...sl, name: sl.name ?? spec.name,
            defaults: () => sl.defaults(ctx), serialize: () => sl.serialize(ctx), load: (d) => sl.load(d, ctx),
          });
        }
        entry.api = spec.api ? spec.api(ctx) ?? {} : {};
        apis.set(spec.name, entry.api);
        for (const [method, apiName] of Object.entries(spec.facade || {})) {
          if (typeof apiName !== 'string') continue; // legacy entries are installed on Game by systems/install.js
          if (typeof entry.api[apiName] !== 'function') throw new Error(`system ${spec.name}: facade ${method} -> api.${apiName} is not a function`);
          if (method in facade) throw new Error(`system ${spec.name}: facade method '${method}' is already provided`);
          facade[method] = (...args) => entry.api[apiName](...args);
        }
      }
      for (const { spec, ctx } of running.values()) if (spec.init) spec.init(ctx);
      return core;
    },

    /** Every slice back to its defaults, then each system's newGame(). Writes nothing. */
    newGame() {
      quiet++;
      try { save.load({ state: 'ok', env: save.defaults() }, core); } finally { quiet--; }
      save.forget();
      for (const { spec, ctx } of running.values()) if (spec.newGame) spec.newGame(ctx);
      lastTick = nowFn();
      time.tick({ silent: true });
      return core;
    },

    /** After load or newGame, before the first frame. */
    start({ fresh = false } = {}) {
      for (const { spec, ctx } of running.values()) if (spec.start) spec.start(ctx, { fresh });
      return core;
    },

    /** Frame update: the 0.5 s time poll, then each system's update(ctx, dt, t) in boot order. */
    update(dt, t) {
      const m = time.mono();
      if (lastPoll === null || m - lastPoll >= pollMs) { lastPoll = m; core.tick(); }
      for (const e of running.values()) {
        if (!e.spec.update) continue;
        try { e.spec.update(e.ctx, dt, t); } catch (error) {
          if (strict) throw error;
          if (!e.failed) { e.failed = true; console.error(`system ${e.spec.name}: update failed`, error); }
        }
      }
    },

    /** Foreground time: runs what became due since the last tick, with meta.away false. A clock that went backwards just resets. */
    tick() {
      const to = nowFn();
      if (to <= lastTick) { lastTick = to; return null; }
      return core.catchUp(lastTick, to, { away: false });
    },

    /**
     * Runs every scheduler entry and day boundary in (from, to] in time order (section 3.5). With away (the default) the events
     * carry meta.away and the away aggregator summarises them: the result has `summary`. from > to does nothing and clamps lastTick.
     */
    catchUp(from, to, { away: isAway = true } = {}) {
      if (isAway) away.begin(from);
      bus.setAway(isAway);
      let res;
      try { res = runCatchUp(core, from, to, { away: isAway }); } finally { bus.setAway(false); }
      lastTick = to;
      time.tick({ silent: true });
      if (isAway) res.summary = away.end(to);
      return res;
    },

    /** Back from a break without reloading (an app resumed): catches up from `from` (default: the last tick) to now. */
    resume(from = lastTick) { return core.catchUp(from, nowFn()); },

    /** Dev clock: jumps forward and catches up. Saving the real namespace is refused while the offset is set. */
    skipTime(ms) {
      const from = lastTick;
      time.skip(ms);
      return core.catchUp(from, nowFn());
    },

    /** True when nothing may be written: an unreadable or newer save, a stale build, a dev clock on the real namespace, ?date. */
    get readOnly() { syncLocks(); return store.readOnly; },
    inspect() { syncLocks(); return store.inspect(); },

    /** The envelope as it would be saved now. A throwing slice keeps its last good value (and throws here in strict mode). */
    serialize() {
      const env = save.serialize(core, { savedAt: nowFn(), timeOffset: time.carry });
      if (strict && save.errors.length) throw save.errors[0].error;
      return env;
    },

    /** Writes the save: { ok, reason?, backup? }. A real failure also emits saveFailed; read-only is not a failure. */
    saveNow({ backup = false } = {}) {
      syncLocks();
      const res = store.writeSave(store.readOnly ? null : core.serialize(), { backup });
      if (!res.ok && res.reason !== 'readonly') bus.emit('saveFailed', { reason: res.reason });
      return res;
    },

    /**
     * Applies an inspect() result that is `ok`: every slice in order, then the catch-up from savedAt to now (opts.catchUp false skips it).
     * -> { state, failed, unknown, catchUp?, quarantineKey? }. A slice whose load throws locks writes and is quarantined; the rest still load.
     */
    load(prepared, { catchUp: doCatch = true } = {}) {
      if (prepared?.state !== 'ok') return { state: prepared?.state ?? 'unreadable', failed: [], unknown: [] };
      quiet++;
      let res;
      try { res = save.load(prepared, core); } finally { quiet--; }
      if (res.failed.length) { res.quarantineKey = store.sliceFailed(res.failed, prepared.env); return res; }
      const to = nowFn(), at = prepared.env.savedAt;
      lastTick = to;
      time.tick({ silent: true });
      if (doCatch) res.catchUp = core.catchUp(Number.isFinite(at) ? at : to, to);
      return res;
    },

    /** inspect() then load(): { state: 'none' | 'ok' | 'unreadable' | 'future', ... }. 'none' applies nothing: the caller starts a new game. */
    loadSaved(opts) {
      const found = core.inspect();
      return found.state === 'ok' ? { ...found, ...core.load(found, opts) } : found;
    },
  };

  /** The dev clock and ?date sessions never write the real village (3.6): lock the store while either is on. */
  function syncLocks() {
    if (!time.savingAllowed || (!dev && time.devOffset !== 0)) store.lock('time'); else store.unlock('time');
  }

  createHooks({ target: core });

  save.register({
    name: 'core', version: 1, order: 0,
    defaults: () => ({
      money: 0, inv: [], time: { carry: 0 }, flags: {},
      ...Object.fromEntries([...parts].filter(([, p]) => p.defaults).map(([k, p]) => [k, p.defaults(core)])),
    }),
    serialize: () => {
      const out = { ...rest };
      for (const [k, p] of parts) out[k] = p.serialize(core);
      return Object.assign(out, { money: money.get(), inv: inv.serialize(), time: time.serialize(), flags: flags.serialize() });
    },
    load(d) {
      if (!isObj(d)) throw new Error('core slice is not an object');
      money.set(d.money ?? 0);
      inv.load(d.inv);
      time.load(d.time);
      flags.load(d.flags);
      rest = {};
      for (const [k, v] of Object.entries(d)) if (!OWN_KEYS.has(k) && !parts.has(k)) rest[k] = v;
      for (const [k, p] of parts) p.load(k in d ? d[k] : p.defaults?.(core), core);
    },
    migrate: {},
    shift: (d, dx, dz) => (isObj(d) && Array.isArray(d.player) ? { ...d, player: [d.player[0] + dx, d.player[1] + dz, ...d.player.slice(2)] } : d),
  });
  save.register(schedSlice);
  save.register(awaySlice);

  if (systems) core.boot(systems);
  return core;
}

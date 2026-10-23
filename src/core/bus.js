// Synchronous, error-isolated event bus. [P]
//   bus.on(name, fn(payload, meta), { priority = 50, owner }) -> off()      higher priority first, then registration order
//   bus.once(name, fn, opts) -> off()   bus.onAny(fn, opts) -> off()        onAny sees every event, ordered with the rest
//   bus.emit(name, payload = {}) -> payload                                 meta = { name, at, away, seq }
//   bus.filter(name, fn(value, payload, meta) -> value?, opts) -> off()     bus.apply(name, value, payload) -> value
//   bus.declare(name, fields, { owner })                                    private event schema (a system's `events:`)
// In strict mode (tests) an undeclared event, a payload that breaks its schema, a handler error and a re-entrancy
// overflow throw; otherwise they are reported through onError and the bus carries on.
import { EVENTS } from './events.js';
import { validateFields } from './schema.js';

export const PRIO = Object.freeze({ STATE: 90, GAME: 50, VIEW: 10 });

export function createBus({ now = () => 0, strict = false, events = EVENTS, maxDepth = 8, onError } = {}) {
  const declared = new Map(Object.entries(events));
  const owners = new Map();       // event name -> owner that declared it
  const handlers = new Map();     // name -> entry[]
  const filters = new Map();      // name -> entry[]
  let anyList = [];
  let cache = new Map();          // name -> merged entry[] (replaced, never mutated, so emit can iterate a snapshot)
  let regSeq = 0, seq = 0, depth = 0, away = false;

  const report = (e, entry, meta) => {
    if (onError) onError(e, entry, meta);
    else console.error(`bus: handler${entry && entry.owner ? ` of ${entry.owner}` : ''} failed${meta ? ` on '${meta.name}'` : ''}`, e);
  };
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  const byPriority = (a, b) => b.priority - a.priority || a.seq - b.seq;

  function register(map, name, fn, opts = {}, once = false) {
    const entry = { name, fn, priority: opts.priority ?? PRIO.GAME, owner: opts.owner ?? null, seq: ++regSeq, once, dead: false };
    if (name === null) anyList = [...anyList, entry];
    else map.set(name, [...(map.get(name) || []), entry]);
    cache = new Map();
    return () => remove(map, entry);
  }
  function remove(map, entry) {
    if (entry.dead) return;
    entry.dead = true;
    if (entry.name === null) anyList = anyList.filter((e) => e !== entry);
    else map.set(entry.name, map.get(entry.name).filter((e) => e !== entry));
    cache = new Map();
  }
  const listFor = (name) => {
    let l = cache.get(name);
    if (!l) { l = [...(handlers.get(name) || []), ...anyList].sort(byPriority); cache.set(name, l); }
    return l;
  };

  function build(owner) {
    const scope = (opts) => (owner && !(opts && opts.owner) ? { ...opts, owner } : opts);
    const api = {
      owner,
      get strict() { return strict; },
      get away() { return away; },
      /** Marks events emitted from now on as catch-up (meta.away = true). */
      setAway(flag) { away = !!flag; },
      on: (name, fn, opts) => register(handlers, name, fn, scope(opts)),
      once: (name, fn, opts) => register(handlers, name, fn, scope(opts), true),
      onAny: (fn, opts) => register(handlers, null, fn, scope(opts)),
      filter: (name, fn, opts) => register(filters, name, fn, scope(opts)),
      declare(name, fields = {}) {
        if (declared.has(name) && !same(declared.get(name), fields)) throw new Error(`bus: event '${name}' is already declared${owners.get(name) ? ` by ${owners.get(name)}` : ''}`);
        declared.set(name, fields);
        if (owner) owners.set(name, owner);
      },
      declareAll(map) { for (const name of Object.keys(map)) api.declare(name, map[name]); },
      has: (name) => declared.has(name),
      fieldsOf: (name) => declared.get(name),
      emit(name, payload = {}) {
        if (strict) {
          const fields = declared.get(name);
          if (!fields) throw new Error(`bus: unknown event '${name}'`);
          const errs = validateFields(fields, payload, `event.${name}`);
          if (errs.length) throw new Error(`bus: bad payload for '${name}': ${errs.join('; ')}`);
        }
        if (depth >= maxDepth) {
          const e = new Error(`bus: '${name}' emitted ${depth} levels deep (cap ${maxDepth})`);
          if (strict) throw e;
          report(e, null, { name });
          return payload;
        }
        const meta = { name, at: now(), away, seq: ++seq };
        depth++;
        try {
          for (const h of listFor(name)) {
            if (h.dead) continue;
            if (h.once) remove(handlers, h);
            try { h.fn(payload, meta); } catch (e) { if (strict) throw e; report(e, h, meta); }
          }
        } finally { depth--; }
        return payload;
      },
      apply(name, value, payload = {}) {
        const list = filters.get(name);
        if (!list || !list.length) return value;
        const meta = { name, at: now(), away, seq };
        for (const f of [...list].sort(byPriority)) {
          if (f.dead) continue;
          try { const r = f.fn(value, payload, meta); if (r !== undefined) value = r; } catch (e) { if (strict) throw e; report(e, f, meta); }
        }
        return value;
      },
      /** Registrations, for lints and debugging: [{ name, priority, owner, kind }]. */
      list: () => [
        ...[...handlers.values()].flat().map((e) => ({ name: e.name, priority: e.priority, owner: e.owner, kind: 'on' })),
        ...anyList.map((e) => ({ name: '*', priority: e.priority, owner: e.owner, kind: 'any' })),
        ...[...filters.values()].flat().map((e) => ({ name: e.name, priority: e.priority, owner: e.owner, kind: 'filter' })),
      ],
      /** Event names someone listens to that nobody declared (typos). */
      undeclared: () => [...handlers.keys()].filter((n) => handlers.get(n).length && !declared.has(n)),
      /** Drops every handler and filter registered under `who`. */
      removeOwner(who) {
        for (const map of [handlers, filters]) for (const list of [...map.values()]) for (const e of list) if (e.owner === who) remove(map, e);
        for (const e of anyList) if (e.owner === who) remove(handlers, e);
      },
      as: (o) => build(o),
    };
    return api;
  }
  return build(null);
}

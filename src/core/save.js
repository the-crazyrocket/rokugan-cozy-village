// Save v4: an envelope { v, savedAt, timeOffset, slices: { name: { v, d } } } and a registry of slices.
// prepare() parses and migrates without touching the game; load() then applies the slices in `order`.
import { migrateRaw, SAVE_VERSION } from './migrations/index.js';

export { SAVE_VERSION };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const unreadable = (reason, extra) => ({ state: 'unreadable', reason, ...extra });
const jsonClone = (d) => { const s = JSON.stringify(d); if (s === undefined) throw new Error('slice produced no data'); return JSON.parse(s); };

export function createSave() {
  const specs = new Map();
  const envSteps = [];
  const last = new Map(); // name -> { v, d }: the last good value, written again when serialize throws
  const unknown = new Map(); // name -> { v, d } for slices this build does not know, written back untouched
  let sorted = [];

  const api = {
    errors: [], // slices whose serialize threw in the latest serialize()

    register(spec) {
      const { name, version, order } = spec;
      if (typeof name !== 'string' || !name) throw new Error('a slice needs a name');
      if (specs.has(name)) throw new Error(`slice ${name} is already registered`);
      if (!Number.isInteger(version) || version < 1) throw new Error(`slice ${name} needs an integer version`);
      if (!Number.isFinite(order)) throw new Error(`slice ${name} needs an order`);
      for (const f of ['defaults', 'serialize', 'load']) if (typeof spec[f] !== 'function') throw new Error(`slice ${name} needs ${f}()`);
      for (let n = 1; n < version; n++) if (typeof spec.migrate?.[n] !== 'function') throw new Error(`slice ${name} has no migration from v${n}`);
      specs.set(name, spec);
      sorted = [...specs.values()].sort((a, b) => a.order - b.order);
      unknown.delete(name);
      return spec;
    },

    envMigration({ id, when, run }) {
      if (!id || typeof when !== 'function' || typeof run !== 'function') throw new Error('an env migration needs id, when and run');
      if (envSteps.some((m) => m.id === id)) throw new Error(`env migration ${id} is already registered`);
      envSteps.push({ id, when, run });
    },

    names: () => sorted.map((s) => s.name),
    has: (name) => specs.has(name),

    /** A full envelope of defaults (a new village before any system has run). */
    defaults(extra = {}) {
      const slices = {};
      for (const s of sorted) slices[s.name] = { v: s.version, d: jsonClone(s.defaults()) };
      return { v: SAVE_VERSION, savedAt: 0, timeOffset: 0, slices, ...extra };
    },

    /** Snapshot every slice. A throwing serialize keeps that slice's previous good value (see `errors`). */
    serialize(ctx, { savedAt, timeOffset = 0 } = {}) {
      api.errors = [];
      const slices = {};
      for (const s of sorted) {
        try {
          const entry = { v: s.version, d: jsonClone(s.serialize(ctx)) };
          last.set(s.name, entry);
          slices[s.name] = entry;
        } catch (error) {
          api.errors.push({ slice: s.name, error });
          if (last.has(s.name)) slices[s.name] = last.get(s.name);
        }
      }
      for (const [name, entry] of unknown) if (!specs.has(name)) slices[name] = entry;
      return { v: SAVE_VERSION, savedAt: savedAt ?? ctx?.now?.() ?? 0, timeOffset, slices };
    },

    /**
     * Parse (a JSON string or an object), migrate and validate. Never applies anything.
     * -> { state: 'ok', env, from, unknown } | { state: 'future', reason, from, newer } | { state: 'unreadable', reason, slice?, error? }
     */
    prepare(input) {
      let raw;
      try { raw = typeof input === 'string' ? JSON.parse(input) : structuredClone(input); } catch (error) { return unreadable('json', { error }); }
      if (!isObj(raw)) return unreadable('shape');
      const from = raw.v;
      if (!Number.isInteger(from) || from < 1) return unreadable('version');
      if (from > SAVE_VERSION) return { state: 'future', reason: 'envelope', from, newer: [] };
      let env;
      try { env = migrateRaw(raw); } catch (error) { return unreadable('migrate', { from, error }); }
      if (!isObj(env.slices)) return unreadable('shape', { from });
      for (const [name, e] of Object.entries(env.slices)) {
        if (!isObj(e) || !Number.isInteger(e.v) || e.v < 1) return unreadable('slice-shape', { from, slice: name });
      }
      try {
        for (const m of envSteps) {
          if (!m.when(env)) continue;
          const out = m.run(env);
          if (out) env = out;
        }
      } catch (error) { return unreadable('env-migrate', { from, error }); }
      const newer = sorted.filter((s) => env.slices[s.name] && env.slices[s.name].v > s.version).map((s) => s.name);
      if (newer.length) return { state: 'future', reason: 'slice', from, newer };
      for (const s of sorted) {
        const e = env.slices[s.name];
        if (!e) continue;
        let { v, d } = e;
        try {
          while (v < s.version) {
            d = s.migrate[v](d, env);
            if (d === undefined) throw new Error(`migration of ${s.name} from v${v} returned nothing`);
            v++;
          }
        } catch (error) { return unreadable('slice-migrate', { from, slice: s.name, error }); }
        env.slices[s.name] = { v, d: d ?? null };
      }
      return { state: 'ok', env, from, unknown: Object.keys(env.slices).filter((n) => !specs.has(n)) };
    },

    /**
     * Apply a prepared save in slice order. A slice that is missing or stored as null gets defaults(); one whose load throws is
     * reported in `failed` and does not stop the others. Anything but state 'ok' applies nothing.
     */
    load(prepared, ctx) {
      if (prepared.state !== 'ok') return { state: prepared.state, failed: [], unknown: [] };
      const { env } = prepared;
      const failed = [];
      for (const s of sorted) {
        const stored = env.slices[s.name];
        const d = stored?.d ?? jsonClone(s.defaults());
        try { s.load(d, ctx); } catch (error) { failed.push({ slice: s.name, error }); }
        last.set(s.name, { v: s.version, d });
      }
      unknown.clear();
      for (const [name, e] of Object.entries(env.slices)) if (!specs.has(name)) unknown.set(name, e);
      return { state: failed.length ? 'unreadable' : 'ok', failed, unknown: [...unknown.keys()] };
    },

    /** Forget remembered slices (a new village starts clean). */
    forget() { last.clear(); unknown.clear(); },

    /** Re-centre every slice that holds coordinates; mutates and returns env. */
    shiftAll(env, dx, dz) {
      for (const s of sorted) {
        const e = env.slices?.[s.name];
        if (!e || typeof s.shift !== 'function') continue;
        const out = s.shift(e.d, dx, dz);
        if (out !== undefined) e.d = out;
      }
      return env;
    },
  };
  return api;
}

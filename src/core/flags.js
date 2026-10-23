// Named flags and counters ('shrine.ebisu', 'caught.koi'). Values are booleans, finite numbers or strings; the core slice stores the plain map.
const ok = (v) => typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

export function createFlags() {
  let map = new Map();
  return {
    get(name, fallback) { return map.has(name) ? map.get(name) : fallback; },
    /** Truthy test used by the `flag` condition: a counter at 0 or a flag set to false is not set. */
    has(name) { const v = map.get(name); return v !== undefined && v !== false && v !== 0 && v !== ''; },
    set(name, value = true) {
      if (!ok(value)) throw new Error(`flags: ${name} must be a boolean, number or string`);
      map.set(name, value);
      return value;
    },
    /** Set once: true the first time, false when it was already set. */
    once(name) {
      if (this.has(name)) return false;
      map.set(name, true);
      return true;
    },
    inc(name, n = 1) { const v = (Number(map.get(name)) || 0) + n; map.set(name, v); return v; },
    count(name) { return Number(map.get(name)) || 0; },
    clear(name) { return map.delete(name); },
    keys(prefix = '') { return [...map.keys()].filter((k) => k.startsWith(prefix)).sort(); },
    serialize() { return Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))); },
    load(d) { map = new Map(Object.entries(d && typeof d === 'object' ? d : {}).filter(([, v]) => ok(v))); },
  };
}

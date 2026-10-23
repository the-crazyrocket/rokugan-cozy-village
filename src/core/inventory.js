// Items by quality key, and money. An item of star quality q > 1 is stored under `id~q`; star 1 keeps the plain id,
// so inventories saved before quality existed load unchanged. Plain Map inside: `Game.inv` can stay a Map view of it.

export const MAX_QUALITY = 5;

export const itemKey = (id, q = 1) => (q > 1 ? `${id}~${q}` : id);

export function parseKey(key) {
  const i = key.lastIndexOf('~');
  if (i > 0) {
    const q = Number(key.slice(i + 1));
    if (Number.isInteger(q) && q > 1) return { id: key.slice(0, i), quality: q };
  }
  return { id: key, quality: 1 };
}

const clampQ = (q) => Math.min(MAX_QUALITY, Math.max(1, Math.floor(q) || 1));
const count = (n) => Math.floor(Number(n));
const reasonOf = (r) => (typeof r === 'string' ? r : r?.reason) || 'misc';

/**
 * opts: bus (anything with emit(name, payload)), keep(id) -> true for items that stay at 0 instead of leaving the map (tools),
 * map (an existing Map to adopt). give and take emit itemGain / itemLoss { item, n, reason }.
 */
export function createInventory({ bus = null, keep = () => false, map = new Map() } = {}) {
  const emit = (name, payload) => { if (bus) bus.emit(name, payload); };

  const inv = {
    map,

    count(id, { minQ = 1 } = {}) {
      let n = 0;
      for (let q = clampQ(minQ); q <= MAX_QUALITY; q++) n += map.get(itemKey(id, q)) || 0;
      return n;
    },

    give(id, n = 1, { reason, quality = 1 } = {}) {
      n = count(n);
      if (!(n > 0)) return 0;
      const key = itemKey(id, clampQ(quality));
      map.set(key, (map.get(key) || 0) + n);
      emit('itemGain', { item: id, n, reason: reasonOf(reason) });
      return n;
    },

    /** Takes the lowest stars first; all or nothing. */
    take(id, n = 1, { minQ = 1, reason } = {}) {
      n = count(n);
      if (!(n > 0)) return n === 0;
      if (inv.count(id, { minQ }) < n) return false;
      let left = n;
      for (let q = clampQ(minQ); q <= MAX_QUALITY && left > 0; q++) {
        const key = itemKey(id, q), have = map.get(key) || 0;
        if (!have) continue;
        const used = Math.min(have, left);
        left -= used;
        if (used === have && !(q === 1 && keep(id))) map.delete(key); else map.set(key, have - used);
      }
      emit('itemLoss', { item: id, n, reason: reasonOf(reason) });
      return true;
    },

    has(need, { minQ = 1 } = {}) {
      return Object.entries(need).every(([id, n]) => inv.count(id, { minQ }) >= n);
    },

    /** Atomic: takes everything or nothing. */
    takeAll(need, { minQ = 1, reason } = {}) {
      if (!inv.has(need, { minQ })) return false;
      for (const [id, n] of Object.entries(need)) inv.take(id, n, { minQ, reason });
      return true;
    },

    giveAll(items, reason) {
      for (const [id, n] of Object.entries(items)) inv.give(id, n, { reason });
    },

    entries: () => [...map],
    serialize: () => [...map],

    /** Replace the contents from serialize() output; entries that cannot be items are dropped. */
    load(entries) {
      map.clear();
      for (const [key, n] of entries || []) {
        if (typeof key === 'string' && Number.isInteger(n) && (n > 0 || (n === 0 && keep(parseKey(key).id)))) map.set(key, n);
      }
    },
  };
  return inv;
}

/** Koku. add and spend take a non-negative amount; spend returns false (and changes nothing) when there is not enough. */
export function createMoney({ bus = null, value = 0 } = {}) {
  let v = value;
  const change = (delta, reason) => { v += delta; if (bus && delta) bus.emit('moneyChange', { delta, reason: reasonOf(reason) }); return v; };
  const amount = (n) => { if (!Number.isFinite(n) || n < 0) throw new RangeError(`bad amount ${n}`); return n; };
  return {
    get: () => v,
    add: (n, reason) => change(amount(n), reason),
    spend(n, reason) {
      if (amount(n) > v) return false;
      change(-n, reason);
      return true;
    },
    /** Jump to a value (loading, a new village, `game.money = n`); emits the difference. */
    set(n, reason) { if (!Number.isFinite(n) || n < 0) throw new RangeError(`bad amount ${n}`); return change(n - v, reason); },
  };
}

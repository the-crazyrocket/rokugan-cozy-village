// Seeded randomness. mulberry32, hash2 and hashString are bit-identical copies of
// game/world.js and game/clock.js (golden fixtures depend on them): do not change them.

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, z, s = 0) {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Stable 32-bit hash of a string (seeds the daily roll). */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Integer in [a, b] from any () => [0,1) stream. */
export const rngInt = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));

export const rngPick = (rnd, list) => list[Math.floor(rnd() * list.length)];

/** One id from [[id, weight], ...] (the shape of fishPool); null when the pool is empty. */
export function rngWeighted(rnd, pairs) {
  let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of pairs) { r -= w; if (r <= 0) return id; }
  return pairs.length ? pairs[pairs.length - 1][0] : null;
}

const SEP = '\u001f';

function stream(next, path) {
  const rng = (...keys) => {
    if (!keys.length) return next();
    const sub = path + SEP + keys.map(String).join(SEP);
    return stream(mulberry32(hashString(sub)), sub);
  };
  rng.int = (a, b) => rngInt(next, a, b);
  rng.pick = (list) => rngPick(next, list);
  rng.chance = (p) => next() < p;
  rng.weighted = (pairs) => rngWeighted(next, pairs);
  rng.path = path;
  return rng;
}

/**
 * A seeded root stream. rng() draws the next float of the root; rng(...keys) returns an
 * independent sub-stream that depends only on (seed, keys), never on how much the root or
 * its siblings have drawn, so adding a consumer cannot shift anyone else's numbers.
 * Sub-streams are streams too (rng('a')('b') equals rng('a', 'b')).
 */
export function createRng(seed = 1) {
  const n = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return stream(mulberry32(n), 's' + n);
}

/**
 * Wraps an unseeded () => [0,1) source (passed in by a [B] file) with the same
 * interface. Sub-streams are seeded once from the source, then deterministic per keys.
 */
export function wrapRng(source, seed = null) {
  const root = stream(source, 'w');
  const base = () => (seed ??= Math.floor(source() * 4294967296));
  const wrapped = (...keys) => (keys.length ? createRng(base())(...keys) : source());
  return Object.assign(wrapped, { int: root.int, pick: root.pick, chance: root.chance, weighted: root.weighted, path: 'w' });
}

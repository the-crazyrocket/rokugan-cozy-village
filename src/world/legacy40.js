// FROZEN. Verbatim copy of World.generate() from the 40x40 island of save v3, used only by the v3 -> v4 migration to
// expand a saved tile diff into full arrays. Never edit it and never import the live generator here.
// The one addition: river and pond tiles record their kind (3 stream, 2 pond) instead of a bare 1.
export const LEGACY_W = 40, LEGACY_H = 40;
const W = LEGACY_W, H = LEGACY_H;
const T = { WATER: 0, GRASS: 1, SAND: 2, PATH: 3, SOIL: 4 };

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, z, s = 0) {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The generated island: `kind` holds today's T values (0-4), `water` is 0 land, 1 sea, 2 pond, 3 stream. */
export function generateLegacy40() {
  const tiles = new Uint8Array(W * H);
  const fresh = new Uint8Array(W * H);
  const idx = (x, z) => z * W + x;
  const inBounds = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const get = (x, z) => (inBounds(x, z) ? tiles[idx(x, z)] : T.WATER);
  const set = (x, z, t) => { if (inBounds(x, z)) tiles[idx(x, z)] = t; };
  const isWater = (x, z) => get(x, z) === T.WATER;
  const isLand = (x, z) => !isWater(x, z);
  const isFresh = (x, z) => inBounds(x, z) && fresh[idx(x, z)] !== 0;

  const rnd = mulberry32(1337);
  const cx = W / 2, cz = H / 2;
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    const a = Math.atan2(dz, dx);
    const r = 14.2 + Math.sin(a * 3 + ph[0]) * 1.4 + Math.sin(a * 5 + ph[1]) * 0.8 + Math.sin(a * 9 + ph[2]) * 0.4;
    set(x, z, Math.hypot(dx, dz) < r ? T.GRASS : T.WATER);
  }
  // pond (north-west) and a river meandering to the east coast
  const carve = (x, z, kind) => { if (inBounds(x, z)) { set(x, z, T.WATER); fresh[idx(x, z)] = kind; } };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (((x + 0.5 - 13) / 3.2) ** 2 + ((z + 0.5 - 13.5) / 2.6) ** 2 < 1) carve(x, z, 2);
  }
  for (let x = 15; x < W; x++) {
    const zc = 14 + Math.round(Math.sin((x - 15) * 0.32) * 1.6 + (x - 15) * 0.12);
    const seaHere = [zc, zc + 1].every((z) => isWater(x, z) && !isFresh(x, z));
    if (seaHere) break; // reached the coast
    for (const z of [zc, zc + 1]) if (isLand(x, z)) carve(x, z, 3);
  }
  // sandy beaches next to the sea
  const sea = (x, z) => isWater(x, z) && !isFresh(x, z);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!isLand(x, z)) continue;
    let nearSea = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (sea(x + dx, z + dz) && inBounds(x + dx, z + dz)) nearSea = true;
    if (nearSea || (sea(x + 2, z) && hash2(x, z) < 0.5) || (sea(x, z + 2) && hash2(x, z, 1) < 0.5)) set(x, z, T.SAND);
  }
  // village paths: plaza + roads
  const path = (x, z) => { if (isLand(x, z)) set(x, z, T.PATH); };
  for (let z = 19; z <= 22; z++) for (let x = 18; x <= 22; x++) path(x, z);
  for (let z = 22; z <= 33; z++) { path(20, z); path(21, z); }
  for (let x = 22; x <= 27; x++) path(x, 20);
  for (let z = 15; z <= 19; z++) path(25, z);
  for (let x = 10; x <= 18; x++) path(x, 21);
  for (let z = 17; z <= 21; z++) path(10, z);

  const water = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (tiles[i] === T.WATER) water[i] = fresh[i] || 1;
  return { w: W, h: H, kind: tiles, water };
}

/** The v3 save stored `World.diff()`: [index, kind] pairs against generate(). Returns full arrays {w, h, kind, height, water}. */
export function legacyArrays(diff = []) {
  const { w, h, kind, water } = generateLegacy40();
  const fresh = water.slice();
  for (const e of diff || []) {
    if (!Array.isArray(e)) continue;
    const [i, t] = e;
    if (!Number.isInteger(i) || i < 0 || i >= w * h || !Number.isInteger(t) || t < 0 || t > 255) continue;
    kind[i] = t;
    water[i] = t === T.WATER ? (fresh[i] || 1) : 0;
  }
  return { w, h, kind, height: new Uint8Array(w * h), water };
}

// Tile grid world: deterministic island generation + tile queries.
export const W = 40, H = 40;
export const T = { WATER: 0, GRASS: 1, SAND: 2, PATH: 3, SOIL: 4 };

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

export class World {
  constructor() {
    this.tiles = new Uint8Array(W * H);
    this.fresh = new Uint8Array(W * H); // 1 = river/pond water
    this.generate();
    this.base = this.tiles.slice(); // pristine terrain (save stores diffs)
  }

  idx(x, z) { return z * W + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < W && z < H; }
  get(x, z) { return this.inBounds(x, z) ? this.tiles[this.idx(x, z)] : T.WATER; }
  set(x, z, t) { if (this.inBounds(x, z)) this.tiles[this.idx(x, z)] = t; }
  isWater(x, z) { return this.get(x, z) === T.WATER; }
  isLand(x, z) { return !this.isWater(x, z); }
  isFresh(x, z) { return this.inBounds(x, z) && this.fresh[this.idx(x, z)] === 1; }

  generate() {
    const rnd = mulberry32(1337);
    const cx = W / 2, cz = H / 2;
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      const a = Math.atan2(dz, dx);
      const r = 14.2 + Math.sin(a * 3 + ph[0]) * 1.4 + Math.sin(a * 5 + ph[1]) * 0.8 + Math.sin(a * 9 + ph[2]) * 0.4;
      this.set(x, z, Math.hypot(dx, dz) < r ? T.GRASS : T.WATER);
    }
    // pond (north-west) and a river meandering to the east coast
    const carve = (x, z) => { if (this.inBounds(x, z)) { this.set(x, z, T.WATER); this.fresh[this.idx(x, z)] = 1; } };
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (((x + 0.5 - 13) / 3.2) ** 2 + ((z + 0.5 - 13.5) / 2.6) ** 2 < 1) carve(x, z);
    }
    for (let x = 15; x < W; x++) {
      const zc = 14 + Math.round(Math.sin((x - 15) * 0.32) * 1.6 + (x - 15) * 0.12);
      const seaHere = [zc, zc + 1].every((z) => this.isWater(x, z) && !this.isFresh(x, z));
      if (seaHere) break; // reached the coast
      for (const z of [zc, zc + 1]) if (this.isLand(x, z)) carve(x, z);
    }
    // sandy beaches next to the sea
    const sea = (x, z) => this.isWater(x, z) && !this.isFresh(x, z);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!this.isLand(x, z)) continue;
      let nearSea = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (sea(x + dx, z + dz) && this.inBounds(x + dx, z + dz)) nearSea = true;
      if (nearSea || (sea(x + 2, z) && hash2(x, z) < 0.5) || (sea(x, z + 2) && hash2(x, z, 1) < 0.5)) this.set(x, z, T.SAND);
    }
    // village paths: plaza + roads
    const path = (x, z) => { if (this.isLand(x, z)) this.set(x, z, T.PATH); };
    for (let z = 19; z <= 22; z++) for (let x = 18; x <= 22; x++) path(x, z);
    for (let z = 22; z <= 33; z++) { path(20, z); path(21, z); }
    for (let x = 22; x <= 27; x++) path(x, 20);
    for (let z = 15; z <= 19; z++) path(25, z);
    for (let x = 10; x <= 18; x++) path(x, 21);
    for (let z = 17; z <= 21; z++) path(10, z);
  }

  /** Tiles changed from the generated terrain (for the save file). */
  diff() {
    const out = [];
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] !== this.base[i]) out.push([i, this.tiles[i]]);
    return out;
  }
  applyDiff(d) { for (const [i, t] of d || []) this.tiles[i] = t; }
}

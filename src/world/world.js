// The tile grid: arrays (kind, height, water, derived fresh/wet/stairs), accessors, island generation, save arrays. [P]
// i = z * w + x. `kind` holds T values, `height` the surface level (y = LEVEL_Y * height), `water` a WK value.
import { mulberry32, hash2 } from '../core/rng.js';
import { rleEncode, rleDecode } from '../core/rle.js';
import { T, WK } from './kinds.js';
import { WORLD_W, WORLD_H, CHUNK, MAX_HEIGHT, LEVEL_Y, WATER_Y, STAIR_DIRS, chunkCols } from './coords.js';

export { mulberry32, hash2, T, WK };

const ARRAYS = ['kind', 'height', 'water'];

export class World {
  constructor({ w = WORLD_W, h = WORLD_H, generate = true } = {}) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.kind = new Uint8Array(n);
    this.height = new Uint8Array(n);
    this.water = new Uint8Array(n).fill(WK.SEA);
    this.fresh = new Uint8Array(n); // derived: 1 = river/pond water (water >= POND)
    this.wet = new Uint8Array(n);    // derived: 0 dry, 1 beside fresh water, 2 land holding water
    this.stairs = new Uint8Array(n); // derived from placed props: direction in bits 0-2, ramp in bit 3
    this.tiles = this.kind;          // the old name of `kind`
    this.version = 0;                // bumped by every change
    this.dirty = new Set();          // chunk ids (CHUNK x CHUNK tiles) changed since the renderer last took them
    this.derivers = [];              // fn(world, rect) -> void: the derived arrays beyond the per-tile ones (flow, fall), see refresh()
    this.cols = chunkCols(w);
    if (generate) this.generate();
    this.base = this.kind.slice(); // pristine terrain (v3 saves store diffs)
  }

  idx(x, z) { return z * this.w + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }

  kindAt(x, z) { return this.inBounds(x, z) ? this.kind[z * this.w + x] : T.WATER; }
  heightAt(x, z) { return this.inBounds(x, z) ? this.height[z * this.w + x] : 0; }
  /** 0 on land, else a WK value; beyond the edge is open sea. */
  waterKind(x, z) { return this.inBounds(x, z) ? this.water[z * this.w + x] : WK.SEA; }
  stairsAt(x, z) { return this.inBounds(x, z) ? this.stairs[z * this.w + x] : 0; }

  setKind(x, z, t) { if (this.inBounds(x, z)) { this.kind[z * this.w + x] = t; this.touch(x, z); } }
  setHeight(x, z, v) {
    if (this.inBounds(x, z)) { this.height[z * this.w + x] = Math.max(0, Math.min(MAX_HEIGHT, v | 0)); this.touch(x, z); }
  }
  setWater(x, z, k) { if (this.inBounds(x, z)) { this.water[z * this.w + x] = k; this.touch(x, z); } }
  setStairs(x, z, v) { if (this.inBounds(x, z)) { this.stairs[z * this.w + x] = v; this.touch(x, z); } }

  isWater(x, z) { return this.kindAt(x, z) === T.WATER; }
  isLand(x, z) { return !this.isWater(x, z); }
  isFresh(x, z) { return this.inBounds(x, z) && this.fresh[z * this.w + x] === 1; }

  /** Surface level of the tile under a world position, in y units. */
  levelY(x, z) { return LEVEL_Y * this.heightAt(Math.floor(x), Math.floor(z)); }
  /** Water surface y under a world position (the tile's level plus the shared dip). */
  waterY(x, z) { return this.levelY(x, z) + WATER_Y; }

  /**
   * Whether one step between neighbouring tiles is allowed by the terrain: level ground, or one level up or down a stair that
   * stands on the lower tile and climbs towards the higher one. `heightOf(x, z)` stands in for heightAt, to ask about terrain
   * that is not there yet (world/edit.js).
   */
  canStep(x0, z0, x1, z1, heightOf = (x, z) => this.heightAt(x, z)) {
    if (!this.inBounds(x0, z0) || !this.inBounds(x1, z1)) return false;
    const h0 = heightOf(x0, z0), h1 = heightOf(x1, z1);
    if (h0 === h1) return true;
    if (Math.abs(h0 - h1) !== 1) return false;
    const [lx, lz, hx, hz] = h0 < h1 ? [x0, z0, x1, z1] : [x1, z1, x0, z0];
    return this.climbsTo(lx, lz) === hz * this.w + hx;
  }

  /** The tile index a stair on (x, z) climbs onto, or -1 when there is no stair. */
  climbsTo(x, z) {
    const s = this.stairsAt(x, z);
    if (!s) return -1;
    const [dx, dz] = STAIR_DIRS[(s - 1) & 3];
    return this.inBounds(x + dx, z + dz) ? (z + dz) * this.w + x + dx : -1;
  }

  // old names
  get(x, z) { return this.kindAt(x, z); }
  set(x, z, t) { this.setKind(x, z, t); }

  /** Marks (x,z) changed: version, dirty chunk, and the derived arrays around it. */
  touch(x, z) {
    this.version++;
    this.dirty.add(Math.floor(z / CHUNK) * this.cols + Math.floor(x / CHUNK));
    this.derive(x, z);
    this.derive(x + 1, z); this.derive(x - 1, z); this.derive(x, z + 1); this.derive(x, z - 1);
  }

  /** Adds a derived array (flow, fall ...): fn(world, { x, z, w, h }) runs from refresh() after a batch of changes. Returns the way to take it back. */
  registerDerived(fn) {
    this.derivers.push(fn);
    return () => { const i = this.derivers.indexOf(fn); if (i >= 0) this.derivers.splice(i, 1); };
  }

  /** After a batch of changes in a rect: the registered derived arrays are rebuilt for it (fresh and wet follow every setter). */
  refresh(rect = { x: 0, z: 0, w: this.w, h: this.h }) {
    for (const fn of this.derivers) fn(this, rect);
  }

  derive(x, z) {
    if (!this.inBounds(x, z)) return;
    const i = z * this.w + x;
    this.fresh[i] = this.water[i] >= WK.POND ? 1 : 0;
    let wet = 0;
    if (this.kind[i] !== T.WATER) {
      if (this.water[i]) wet = 2;
      else if (this.isFresh(x + 1, z) || this.isFresh(x - 1, z) || this.isFresh(x, z + 1) || this.isFresh(x, z - 1)) wet = 1;
    }
    this.wet[i] = wet;
  }

  /** The changed chunk ids, sorted; the set is emptied. */
  takeDirty() {
    const out = [...this.dirty].sort((a, b) => a - b);
    this.dirty.clear();
    return out;
  }

  generate() {
    const { w: W, h: H } = this;
    const rnd = mulberry32(1337);
    const cx = W / 2, cz = H / 2;
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      const a = Math.atan2(dz, dx);
      const r = 14.2 + Math.sin(a * 3 + ph[0]) * 1.4 + Math.sin(a * 5 + ph[1]) * 0.8 + Math.sin(a * 9 + ph[2]) * 0.4;
      const land = Math.hypot(dx, dz) < r;
      this.setKind(x, z, land ? T.GRASS : T.WATER);
      this.setWater(x, z, land ? WK.NONE : WK.SEA);
    }
    // pond (north-west) and a river meandering to the east coast; authored on the 40x40 island, which sits O tiles in
    // (LEGACY_OFF in the 64x64 world; a 40x40 World is the old island itself)
    const O = (W - 40) >> 1;
    const carve = (x, z, k) => { if (this.inBounds(x, z)) { this.setKind(x, z, T.WATER); this.setWater(x, z, k); } };
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (((x - O + 0.5 - 13) / 3.2) ** 2 + ((z - O + 0.5 - 13.5) / 2.6) ** 2 < 1) carve(x, z, WK.POND);
    }
    for (let x = 15 + O; x < W; x++) {
      const zc = 14 + O + Math.round(Math.sin((x - O - 15) * 0.32) * 1.6 + (x - O - 15) * 0.12);
      const seaHere = [zc, zc + 1].every((z) => this.isWater(x, z) && !this.isFresh(x, z));
      if (seaHere) break; // reached the coast
      for (const z of [zc, zc + 1]) if (this.isLand(x, z)) carve(x, z, WK.STREAM);
    }
    // sandy beaches next to the sea
    const sea = (x, z) => this.isWater(x, z) && !this.isFresh(x, z);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!this.isLand(x, z)) continue;
      let nearSea = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (sea(x + dx, z + dz) && this.inBounds(x + dx, z + dz)) nearSea = true;
      if (nearSea || (sea(x + 2, z) && hash2(x - O, z - O) < 0.5) || (sea(x, z + 2) && hash2(x - O, z - O, 1) < 0.5)) this.setKind(x, z, T.SAND);
    }
    // village paths: plaza + roads
    const path = (x, z) => { if (this.isLand(x + O, z + O)) this.setKind(x + O, z + O, T.PATH); };
    for (let z = 19; z <= 22; z++) for (let x = 18; x <= 22; x++) path(x, z);
    for (let z = 22; z <= 33; z++) { path(20, z); path(21, z); }
    for (let x = 22; x <= 27; x++) path(x, 20);
    for (let z = 15; z <= 19; z++) path(25, z);
    for (let x = 10; x <= 18; x++) path(x, 21);
    for (let z = 17; z <= 21; z++) path(10, z);
  }

  /** The persisted arrays (the `world` save slice): sizes and three run-length coded arrays. */
  serialize() {
    return { w: this.w, h: this.h, kind: rleEncode(this.kind), height: rleEncode(this.height), water: rleEncode(this.water) };
  }

  /** Replaces the arrays from serialize() output. Throws (leaving the world untouched) on a size mismatch or bad runs. */
  load(d) {
    if (!d || d.w !== this.w || d.h !== this.h) throw new Error(`world: saved ${d?.w}x${d?.h} does not fit ${this.w}x${this.h}`);
    const n = this.w * this.h;
    const next = ARRAYS.map((k) => rleDecode(d[k], n));
    ARRAYS.forEach((k, j) => this[k].set(next[j]));
    for (let i = 0; i < n; i++) this.fresh[i] = this.water[i] >= WK.POND ? 1 : 0;
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) this.derive(x, z);
    this.version++;
    for (let c = 0; c < this.cols * chunkCols(this.h); c++) this.dirty.add(c);
  }

  /** Tiles changed from the generated terrain (v3 saves). */
  diff() {
    const out = [];
    for (let i = 0; i < this.kind.length; i++) if (this.kind[i] !== this.base[i]) out.push([i, this.kind[i]]);
    return out;
  }
  applyDiff(d) {
    for (const [i, t] of d || []) {
      if (!Number.isInteger(i) || i < 0 || i >= this.kind.length) continue;
      this.kind[i] = t;
      this.touch(i % this.w, Math.floor(i / this.w));
    }
  }
}

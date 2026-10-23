// World generation and tile queries (the island is the same every run).
import assert from 'node:assert/strict';
import { World, T, mulberry32, hash2 } from '../../src/game/world.js';
import { propCells } from '../../src/game/props.js';

const land = (w, x, z) => w.isLand(x, z);

export default function () {
  const w = new World();
  const W = w.w, H = w.h;
  assert.deepEqual([W, H], [40, 40]);
  assert.equal(w.tiles.length, W * H);
  assert.deepEqual(w.base, w.tiles, 'base keeps the pristine terrain');
  assert.deepEqual(new World().tiles, w.tiles, 'generation is deterministic');
  assert.deepEqual(new World().fresh, w.fresh);

  const n = (t) => w.tiles.filter((v) => v === t).length;
  assert.deepEqual([n(T.WATER), n(T.GRASS), n(T.SAND), n(T.PATH), n(T.SOIL)], [1027, 396, 115, 62, 0]);
  assert.equal(w.fresh.reduce((s, v) => s + v, 0), 64);
  for (let i = 0; i < W * H; i++) if (w.fresh[i]) assert.equal(w.tiles[i], T.WATER, 'fresh water is water');

  // the sea surrounds the island: the map edge is all sea, never fresh
  for (let i = 0; i < W; i++) for (const [x, z] of [[i, 0], [i, H - 1], [0, i], [W - 1, i]]) assert.ok(w.isWater(x, z) && !w.isFresh(x, z), `edge ${x},${z}`);
  // out of bounds reads as sea
  assert.equal(w.get(-1, 5), T.WATER);
  assert.equal(w.get(W, 5), T.WATER);
  assert.equal(w.inBounds(W - 1, H - 1) && !w.inBounds(W, 0) && !w.inBounds(0, -1), true);
  assert.equal(w.isFresh(-3, 4), false);

  // authored places the game relies on
  assert.ok(land(w, 17, 23), 'player start');
  assert.ok([[11, 26], [14, 26], [11, 28], [14, 28]].every(([x, z]) => w.get(x, z) === T.GRASS), 'starter field is grass');
  for (const [x, z] of [[18, 19], [22, 22], [20, 33], [21, 33], [10, 21], [25, 18]]) assert.equal(w.get(x, z), T.PATH, `path ${x},${z}`);
  assert.ok(land(w, 22, 9) && land(w, 25, 10), 'shrine and stone sit on land');
  assert.ok(propCells('shrine', 22, 9, 0).cells.every((c) => land(w, c.x, c.z)), 'shrine footprint on land');
  assert.ok(land(w, 20, 33) && w.isWater(20, 35) && !w.isFresh(20, 35), 'the pier starts at the south beach and runs into the sea');
  assert.ok(w.isWater(25, 16) && w.isFresh(25, 16), 'the river the bridge crosses');
  assert.ok(w.isFresh(13, 13), 'pond');

  // beaches: every land tile touching the sea is sand (or a road that runs down to it)
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!w.isLand(x, z) || [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => !(w.isWater(x + dx, z + dz) && !w.isFresh(x + dx, z + dz) && w.inBounds(x + dx, z + dz)))) continue;
    assert.ok([T.SAND, T.PATH].includes(w.get(x, z)), `beach ${x},${z}`);
  }

  // diff / applyDiff: only changed tiles are stored, and they restore exactly
  assert.deepEqual(w.diff(), []);
  w.set(11, 26, T.SOIL); w.set(12, 26, T.SOIL); w.set(-1, 0, T.SOIL);
  assert.deepEqual(w.diff(), [[26 * W + 11, T.SOIL], [26 * W + 12, T.SOIL]]);
  const w2 = new World();
  w2.applyDiff(w.diff());
  assert.deepEqual(w2.tiles, w.tiles);
  w2.applyDiff(null);

  // rng helpers
  const a = mulberry32(42), b = mulberry32(42);
  const seq = Array.from({ length: 5 }, () => a());
  assert.deepEqual(seq, Array.from({ length: 5 }, () => b()));
  assert.ok(seq.every((v) => v >= 0 && v < 1) && new Set(seq).size === 5);
  assert.notDeepEqual(seq, Array.from({ length: 5 }, mulberry32(43)));
  assert.equal(hash2(3, 4), hash2(3, 4));
  assert.notEqual(hash2(3, 4), hash2(4, 3));
  assert.notEqual(hash2(3, 4, 1), hash2(3, 4, 0));
  for (let i = 0; i < 50; i++) { const v = hash2(i, i * 7, i); assert.ok(v >= 0 && v < 1); }
}

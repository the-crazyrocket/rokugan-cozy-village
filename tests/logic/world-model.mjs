// The world data model: arrays, accessors and their old aliases, derived arrays, save arrays, dirty chunks, surface and path step.
import assert from 'node:assert/strict';
import { World, T, WK } from '../../src/world/world.js';
import { World as ShimWorld, T as ShimT } from '../../src/game/world.js';
import { generateLegacy40 } from '../../src/world/legacy40.js';
import { growArray } from '../../src/game/grow.js';
import { WORLD_W, WORLD_H, LEGACY_OFF, legacy, chunkIndex, tileIndex, tileX, tileZ, inBounds, WATER_Y } from '../../src/world/coords.js';
import { createSurface } from '../../src/world/surface.js';
import { findPath } from '../../src/world/pathfind.js';
import { findPath as shimFindPath } from '../../src/game/pathfind.js';
import { PropIndex } from '../../src/systems/props.js';
import { BRIDGE_DECK, PIER_DECK } from '../../src/assets/blockouts.js';
import { LEGACY_OFF as O } from '../../src/world/coords.js';

function arrays() {
  assert.equal(ShimWorld, World);
  assert.equal(ShimT, T);
  assert.deepEqual(T, { WATER: 0, GRASS: 1, SAND: 2, PATH: 3, SOIL: 4, GRAVEL: 5, STEPPING: 6, BOARDWALK: 7, PLAZA: 8 });
  const w = new World();
  assert.deepEqual([w.w, w.h, WORLD_W, WORLD_H], [64, 64, 64, 64]);
  for (const k of ['kind', 'height', 'water', 'fresh', 'wet', 'stairs']) assert.ok(w[k] instanceof Uint8Array && w[k].length === 64 * 64, k);
  assert.equal(w.tiles, w.kind, 'tiles is the old name of kind');
  assert.ok(w.height.every((v) => v === 0), 'height is 0 everywhere');
  assert.equal(w.version > 0, true);

  // water is today's fresh array plus the sea, told apart into pond and stream like legacy40
  const old40 = generateLegacy40(), old = { kind: growArray(old40.kind, 64, 64, T.WATER), water: growArray(old40.water, 64, 64, WK.SEA) }; // the old island, in the middle
  assert.deepEqual(w.kind, old.kind);
  assert.deepEqual(w.water, old.water, 'water kinds equal the frozen generator');
  assert.deepEqual(w.fresh, old.water.map((v) => (v >= 2 ? 1 : 0)));
  for (let i = 0; i < w.kind.length; i++) assert.equal(w.water[i] === 0, w.kind[i] !== T.WATER, `water only where there is no ground ${i}`);
  assert.equal(w.waterKind(25 + O, 15 + O), WK.STREAM);
  assert.equal(w.waterKind(13 + O, 13 + O), WK.POND);
  assert.equal(w.waterKind(0, 0), WK.SEA);
  assert.equal(w.waterKind(20 + O, 20 + O), WK.NONE);
  assert.equal(w.waterKind(-1, 4), WK.SEA, 'beyond the edge is sea');

  // accessors and aliases
  assert.equal(w.kindAt(20 + O, 21 + O), T.PATH);
  assert.equal(w.get(20 + O, 21 + O), w.kindAt(20 + O, 21 + O));
  assert.equal(w.idx(3, 2), 2 * 64 + 3);
  assert.equal(w.kindAt(-1, 0), T.WATER);
  assert.equal(w.heightAt(-1, 0), 0);
  assert.equal(w.stairsAt(99, 0), 0);
  w.setKind(-1, 0, T.SOIL); w.setHeight(99, 0, 3); w.setWater(0, -4, 2);
  assert.deepEqual([...w.kind], [...old.kind], 'out of bounds writes do nothing');
  assert.deepEqual([tileIndex(40, 3, 2), tileX(40, 83), tileZ(40, 83), inBounds(40, 40, 39, 39), inBounds(40, 40, 40, 0)], [83, 3, 2, true, false]);

  // the new kinds are plain values
  w.setKind(20 + O, 20 + O, T.PLAZA);
  assert.equal(w.get(20 + O, 20 + O), T.PLAZA);
  assert.ok(w.isLand(20 + O, 20 + O));

  // other sizes work and a blank world is open sea
  const big = new World({ w: 64, h: 64 });
  assert.equal(big.kind.length, 4096);
  assert.equal(big.idx(0, 1), 64);
  const blank = new World({ w: 8, h: 6, generate: false });
  assert.ok(blank.kind.every((v) => v === T.WATER) && blank.water.every((v) => v === WK.SEA) && blank.fresh.every((v) => v === 0));
}

function derived() {
  const w = new World({ w: 6, h: 6, generate: false });
  for (let z = 0; z < 6; z++) for (let x = 0; x < 6; x++) { w.setKind(x, z, T.GRASS); w.setWater(x, z, WK.NONE); }
  assert.ok(w.wet.every((v) => v === 0));
  w.setKind(2, 2, T.WATER); w.setWater(2, 2, WK.POND);
  assert.equal(w.fresh[w.idx(2, 2)], 1);
  assert.equal(w.isFresh(2, 2), true);
  assert.deepEqual([w.wet[w.idx(1, 2)], w.wet[w.idx(3, 2)], w.wet[w.idx(2, 1)], w.wet[w.idx(1, 1)], w.wet[w.idx(2, 2)]], [1, 1, 1, 0, 0], 'beside fresh water is damp');
  w.setWater(2, 2, WK.SEA);
  assert.equal(w.fresh[w.idx(2, 2)], 0);
  assert.ok(w.wet.every((v) => v === 0), 'the sea does not dampen');
  w.setKind(4, 4, T.GRASS); w.setWater(4, 4, WK.TIDE);
  assert.equal(w.wet[w.idx(4, 4)], 2, 'land holding water is flooded');
  assert.equal(w.fresh[w.idx(4, 4)], 1);

  w.setStairs(1, 1, 0b1010);
  assert.equal(w.stairsAt(1, 1), 10);
}

function heights() {
  const w = new World();
  w.setHeight(5, 5, 2);
  assert.equal(w.heightAt(5, 5), 2);
  w.setHeight(5, 5, 99);
  assert.equal(w.heightAt(5, 5), 4, 'clamped to 4');
  w.setHeight(5, 5, -3);
  assert.equal(w.heightAt(5, 5), 0);
  assert.equal(w.waterY(25.5, 15.5), WATER_Y, 'level water is the shared dip');
  w.setHeight(25 + O, 15 + O, 2);
  assert.equal(w.waterY(25.5 + O, 15.5 + O), 1 + WATER_Y, 'a raised pond sits half a metre per level higher');
  assert.equal(w.levelY(25.9 + O, 15.1 + O), 1);

  // steps: level ground, or one level up a stair that stands on the lower tile and climbs towards the higher one
  const a = [10, 10], b = [11, 10];
  assert.equal(w.canStep(...a, ...b), true);
  w.setHeight(11, 10, 1);
  assert.equal(w.canStep(...a, ...b), false, 'a cliff');
  w.setStairs(11, 10, 4);
  assert.equal(w.canStep(...a, ...b), false, 'a stair on the upper tile leads nowhere');
  w.setStairs(11, 10, 0);
  w.setStairs(10, 10, 1);
  assert.equal(w.canStep(...a, ...b), false, 'a stair climbing the other way');
  w.setStairs(10, 10, 4); // rot 3 climbs towards +x
  assert.equal(w.canStep(...a, ...b), true);
  assert.equal(w.canStep(...b, ...a), true, 'both ways');
  assert.equal(w.canStep(10, 11, 11, 10), false, 'not diagonally');
  w.setHeight(11, 10, 2);
  assert.equal(w.canStep(...a, ...b), false, 'stairs span one level');
  assert.equal(w.canStep(63, 63, 64, 63), false, 'off the map');
}

function dirty() {
  const w = new World();
  assert.equal(w.cols, 4);
  assert.equal(chunkIndex(40, 17, 3), 1);
  assert.equal(chunkIndex(40, 39, 39), 8);
  assert.equal(w.takeDirty().length, 16, 'a fresh world has every chunk to draw');
  assert.equal(w.dirty.size, 0);
  const v = w.version;
  w.setKind(20 + O, 20 + O, T.SOIL);
  assert.equal(w.version, v + 1);
  assert.deepEqual(w.takeDirty(), [10]);
  w.setHeight(0, 39, 1); w.setWater(39, 0, 1); w.setHeight(1, 38, 1);
  assert.deepEqual(w.takeDirty(), [2, 8]);
  assert.deepEqual(w.takeDirty(), []);
  w.applyDiff([[(20 + O) * 64 + 20 + O, T.PATH]]);
  assert.deepEqual(w.takeDirty(), [10], 'applyDiff marks tiles too');
}

function saveArrays() {
  const w = new World();
  w.setKind(11 + O, 26 + O, T.SOIL); w.setHeight(3, 3, 0); w.setHeight(30 + O, 30 + O, 2); w.setKind(25 + O, 25 + O, T.GRAVEL);
  const data = JSON.parse(JSON.stringify(w.serialize()));
  assert.deepEqual([data.w, data.h], [64, 64]);
  assert.ok(Array.isArray(data.kind) && data.kind.length % 2 === 0 && data.kind.length < 700, 'run-length coded');
  const r = new World({ generate: false });
  const kind = r.kind;
  r.load(data);
  assert.equal(r.kind, kind, 'load fills the arrays in place');
  for (const k of ['kind', 'height', 'water', 'fresh', 'wet']) assert.deepEqual(r[k], w[k], k);
  assert.deepEqual(r.serialize(), w.serialize());
  assert.equal(r.takeDirty().length, 16);

  const before = r.serialize();
  for (const bad of [null, { ...data, w: 40 }, { ...data, kind: [1, 5] }, { ...data, water: 'x' }, { ...data, height: data.height.slice(0, -2) }]) {
    assert.throws(() => r.load(bad), /world|RLE/);
    assert.deepEqual(r.serialize(), before, 'a failed load changes nothing');
  }
  // the arrays do not depend on the generator: a hand-edited world loads into a blank one
  const odd = new World({ w: 4, h: 4, generate: false });
  odd.setKind(1, 1, T.PLAZA); odd.setHeight(1, 1, 3);
  const copy = new World({ w: 4, h: 4, generate: false });
  copy.load(odd.serialize());
  assert.equal(copy.kindAt(1, 1), T.PLAZA);
  assert.equal(copy.heightAt(1, 1), 3);
}

function coords() {
  assert.equal(LEGACY_OFF, 12, 'the 40x40 island in the middle of 64x64');
  assert.deepEqual(legacy(22.5, 12.5), { x: 34.5, z: 24.5 });
  assert.deepEqual(legacy(20, 20), { x: 20 + LEGACY_OFF, z: 20 + LEGACY_OFF });
}

function surface() {
  const w = new World();
  const props = new PropIndex(w);
  const s = createSurface(w, props);
  assert.equal(s.groundY(20.5 + O, 20.5 + O), 0);
  assert.equal(s.groundY(-3, 99), 0);
  const bridge = props.add('bridge', 25 + O, 15 + O, 0);
  const pier = props.add('pier', 20 + O, 33 + O, 0);
  // the pre-Wave-0 formula, written out again
  const old = (p, px, pz) => {
    if (p.type === 'pier') return PIER_DECK + 0.04;
    const th = -p.rot * Math.PI / 2, dx = px - p.cx, dz = pz - p.cz;
    return BRIDGE_DECK(-dx * Math.sin(th) + dz * Math.cos(th)) + 0.04;
  };
  let n = 0;
  for (const p of [bridge, pier]) for (const c of p.cells) for (const [fx, fz] of [[0.5, 0.5], [0.1, 0.9], [0.99, 0.01]]) {
    const px = c.x + fx, pz = c.z + fz;
    assert.equal(s.groundY(px, pz), old(props.at(c.x, c.z), px, pz), `${p.type} ${px},${pz}`);
    assert.equal(props.deckHeight(px, pz), s.groundY(px, pz));
    n++;
  }
  assert.ok(n >= 20);
  assert.ok(s.groundY(25.5 + O, 15.5 + O) > 0.4 && s.groundY(25.5 + O, 13.5 + O) === 0, 'the span rises mid-river and the land beside it is flat');
  w.setHeight(25 + O, 13 + O, 2);
  assert.equal(s.groundY(25.5 + O, 13.5 + O), 1, 'terrain level counts');
  assert.equal(s.canStep(25 + O, 13 + O, 25 + O, 12 + O), false);
  w.setHeight(25 + O, 12 + O, 2);
  assert.equal(s.canStep(25 + O, 13 + O, 25 + O, 12 + O), true);
}

function pathing() {
  const open = () => true, W = 10, H = 10;
  const p = findPath({ x: 0, z: 0 }, { x: 5, z: 0 }, open, W, H);
  assert.equal(p.length, 6, 'the old positional call');
  assert.deepEqual(shimFindPath({ x: 0, z: 0 }, { x: 5, z: 0 }, open, W, H), p, 'the old import path still works');
  assert.deepEqual(findPath({ x: 0, z: 0 }, { x: 5, z: 0 }, open, W, H, undefined, null), p, 'omitted maxNodes and step');
  assert.equal(findPath({ x: 0, z: 0 }, { x: 9, z: 9 }, open, W, H, 3), null, 'maxNodes stops the search');
  assert.ok(findPath({ x: 0, z: 0 }, { x: 9, z: 9 }, open, W, H, 100));

  // a step callback forbids moves: a wall at x=3 that only z>=8 can cross
  const wall = (x0, z0, x1, z1) => !((x0 < 3 && x1 >= 3 || x0 >= 3 && x1 < 3) && Math.max(z0, z1) < 8);
  const around = findPath({ x: 0, z: 0 }, { x: 5, z: 0 }, open, W, H, 12000, wall);
  assert.ok(around && around.some((c) => c.z >= 8), 'goes around');
  for (let i = 1; i < around.length; i++) assert.ok(wall(around[i - 1].x, around[i - 1].z, around[i].x, around[i].z));
  // a diagonal needs both legs
  const noLeg = (x0, z0, x1, z1) => !(x0 === 0 && z0 === 0 && x1 === 1 && z1 === 0);
  const diag = findPath({ x: 0, z: 0 }, { x: 1, z: 1 }, open, W, H, 100, noLeg);
  assert.deepEqual(diag, [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }]);
  // a number is a cost: rough ground at x=2 is avoided when a detour is cheaper
  const rough = (x0, z0, x1, z1) => (x1 === 2 && z1 < 3 ? 9 : 1);
  const smooth = findPath({ x: 0, z: 1 }, { x: 4, z: 1 }, open, W, H, 12000, rough);
  assert.ok(smooth.every((c) => c.x !== 2 || c.z >= 3), 'costly tiles are avoided');
  assert.equal(findPath({ x: 0, z: 0 }, { x: 5, z: 0 }, open, W, H, 12000, () => false), null);

  // terrain steps through the world
  const w = new World();
  const land = (x, z) => w.isLand(x, z);
  const a = { x: 20 + O, z: 22 + O }, b = { x: 20 + O, z: 28 + O };
  assert.ok(findPath(a, b, land, w.w, w.h, 12000, (...c) => w.canStep(...c)));
  for (let x = 0; x < w.w; x++) w.setHeight(x, 25 + O, 1);
  assert.equal(findPath(a, b, land, w.w, w.h, 12000, (...c) => w.canStep(...c)), null, 'a ridge across the island cuts the way');
  assert.ok(findPath(a, b, land, w.w, w.h), 'without step the terrain is ignored, as before');
}

export default function () {
  arrays();
  derived();
  heights();
  dirty();
  saveArrays();
  coords();
  surface();
  pathing();
}

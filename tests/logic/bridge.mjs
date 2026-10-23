// The 1x4 bridge: footprint, span rule, deck height and the load-time fix-up of old saves.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../../src/game/world.js';
import { PropManager, propCells } from '../../src/game/props.js';
import { BRIDGE_CELLS, bridgeCells, spanOk, fixBridges } from '../../src/game/bridgefix.js';
import { BLOCKOUTS, BRIDGE_DECK } from '../../src/assets/blockouts.js';
import { readFixture, clone } from '../lib/fixtures.mjs';
import { LEGACY_OFF as O } from '../../src/world/coords.js';
import { growSave } from '../../src/game/grow.js';

const cellsOf = (p) => propCells(p.type, p.x, p.z, p.rot).cells;
const bridge = (id, x, z, rot = 0) => ({ id, type: 'bridge', x, z, rot });
const span = (w, x, z, rot = 0) => bridgeCells(x, z, rot).map((c) => (w.isWater(c.x, c.z) ? 'w' : 'l')).join('');

export default function () {
  const w = new World();
  assert.deepEqual(BLOCKOUTS.bridge.footprint, [1, 4]);
  assert.equal(BRIDGE_CELLS, BLOCKOUTS.bridge.footprint[1]);

  // the pure cell arithmetic is the same as propCells for every rotation
  for (const rot of [0, 1, 2, 3]) for (const [x, z] of [[25, 15], [3, 7], [30, 30]]) {
    assert.deepEqual(bridgeCells(x, z, rot), cellsOf(bridge(1, x, z, rot)).map(({ x, z }) => ({ x, z })), `cells ${x},${z} rot ${rot}`);
  }
  assert.deepEqual(bridgeCells(25, 15, 0).map((c) => [c.x, c.z]), [[25, 14], [25, 15], [25, 16], [25, 17]]);

  // the river at x=25 is water at z=15,16: anchor 15 is land-water-water-land, its neighbours are not
  assert.equal(span(w, 25 + O, 15 + O), 'lwwl');
  assert.ok(spanOk(w, bridgeCells(25 + O, 15 + O, 0)) && spanOk(w, bridgeCells(25 + O, 15 + O, 2)));
  assert.equal(span(w, 25 + O, 14 + O), 'llww');
  assert.equal(span(w, 25 + O, 16 + O), 'wwll');
  assert.ok(!spanOk(w, bridgeCells(25 + O, 14 + O, 0)) && !spanOk(w, bridgeCells(25 + O, 16 + O, 0)));

  // the span rule on a made-up world: 3 wide water has one end hanging, open water at both ends is fine
  const grid = (s) => ({ inBounds: () => true, isWater: (x) => s[x] === 'w', get: (x) => (s[x] === 'w' ? 0 : s[x] === 's' ? 4 : 1) });
  assert.ok(spanOk(grid('lwwlll'), bridgeCells(1, 0, 1)), 'lwwl');
  assert.ok(!spanOk(grid('lwwwll'), bridgeCells(1, 0, 1)), 'lwww hangs');
  assert.ok(spanOk(grid('wwwwll'), bridgeCells(1, 0, 1)), 'wwww open water');
  assert.ok(!spanOk(grid('swwlll'), bridgeCells(1, 0, 1)), 'soil at an end');
  assert.ok(!spanOk(grid('llwwll'), bridgeCells(1, 0, 1)), 'land in the middle');
  assert.ok(!spanOk(w, bridgeCells(-1, 5, 0)), 'out of bounds');

  // canPlace uses the same rule
  const pm = new PropManager(new THREE.Scene(), { assets: {} }, w);
  assert.ok(pm.canPlace('bridge', 25 + O, 15 + O, 0));
  assert.ok(!pm.canPlace('bridge', 25 + O, 14 + O, 0) && !pm.canPlace('bridge', 25 + O, 16 + O, 0));
  assert.ok(!pm.canPlace('bridge', 10 + O, 10 + O, 0), 'not on dry land');
  assert.ok(pm.canPlace('bridge', 0 + O, 10 + O, 0), 'over open sea');

  // deck: arched, symmetric, resting on the banks at both ends
  assert.ok(Math.abs(BRIDGE_DECK(0) - 0.4) < 1e-9);
  for (const z of [0.3, 1, 1.7, 2]) assert.equal(BRIDGE_DECK(z), BRIDGE_DECK(-z));
  assert.ok(BRIDGE_DECK(2) < 0.12 && BRIDGE_DECK(2) > 0.08);
  assert.ok(BRIDGE_DECK(0) > BRIDGE_DECK(1) && BRIDGE_DECK(1) > BRIDGE_DECK(2));

  // saved bridges from the v3 fixtures (anchor 25,15, no footprint stored) are already sound
  for (const n of ['fresh', 'mid', 'ebisu']) {
    const s = growSave(readFixture(`save-v3-${n}.json`), 64, 64); // moved to the middle of the 64x64 world
    const world = new World();
    world.applyDiff(s.tiles);
    const before = clone(s.props);
    const r = fixBridges(s.props, world, cellsOf);
    assert.deepEqual(r.report, [], `${n}: nothing to fix`);
    assert.deepEqual(r.props, before, `${n}: props unchanged`);
    assert.deepEqual(s.props, before, `${n}: input not mutated`);
    const b = r.props.find((p) => p.type === 'bridge');
    assert.deepEqual([b.x, b.z, b.rot], [25 + O, 15 + O, 0]);
    assert.ok(spanOk(world, cellsOf(b)), `${n}: lands on both banks`);
  }

  // moved or bagged: one tile along the axis at most
  const others = [{ id: 2, type: 'crate', x: 20 + O, z: 20 + O, rot: 0 }];
  let r = fixBridges([bridge(1, 25 + O, 14 + O), ...others], w, cellsOf);
  assert.deepEqual(r.report, [{ id: 1, action: 'moved', from: [25 + O, 14 + O], to: [25 + O, 15 + O] }]);
  assert.deepEqual(r.props.map((p) => [p.type, p.x, p.z]), [['bridge', 25 + O, 15 + O], ['crate', 20 + O, 20 + O]]);
  r = fixBridges([bridge(1, 25 + O, 16 + O)], w, cellsOf);
  assert.deepEqual(r.report, [{ id: 1, action: 'moved', from: [25 + O, 16 + O], to: [25 + O, 15 + O] }]);
  r = fixBridges([bridge(1, 25 + O, 12 + O)], w, cellsOf);
  assert.deepEqual(r.report, [{ id: 1, action: 'bag', from: [25 + O, 12 + O] }], 'two tiles off: back to the bag');
  assert.deepEqual(r.props, []);
  r = fixBridges([bridge(1, 10 + O, 10 + O, 1)], w, cellsOf);
  assert.equal(r.report[0].action, 'bag', 'on dry land');
  r = fixBridges([bridge(1, 25 + O, 14 + O), { id: 3, type: 'crate', x: 25 + O, z: 17 + O, rot: 0 }], w, cellsOf);
  assert.equal(r.report[0].action, 'bag', 'the shifted span would sit on a crate');
  assert.deepEqual(r.props.map((p) => p.type), ['crate']);
  r = fixBridges([bridge(1, 25 + O, 14 + O), bridge(2, 25 + O, 15 + O)], w, cellsOf);
  assert.deepEqual(r.report.map((x) => [x.id, x.action]), [[1, 'bag']], 'two bridges never share a span');
  assert.deepEqual(r.props.map((p) => p.id), [2]);
  r = fixBridges([bridge(1, 25 + O, 15 + O)], w);
  assert.deepEqual(r.report, [], 'works without a cellsOf');
}

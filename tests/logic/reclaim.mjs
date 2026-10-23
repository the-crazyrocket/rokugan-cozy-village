// Wave 2 shore reclaiming: the basket of earth over the sea beside the shore, paid in koku and stone that rise with each tile.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import { T, WK } from '../../src/world/kinds.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';
import daily from '../../src/systems/daily.js';
import terrainrules from '../../src/systems/terrainrules.js';
import reclaim, { reclaimCost } from '../../src/systems/reclaim.js';

export default function () {
  const world = new World();
  const core = createCore({ strict: true, now: () => Date.UTC(2026, 0, 15, 12), mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, daily, terrainrules, reclaim]);
  core.start({ fresh: true });
  const r = core.use('reclaim'), said = [];
  core.bus.on('say', (p) => said.push(p.text));

  // the costs climb from 20 koku and 1 stone to 300 koku and 4 stone
  assert.deepEqual(reclaimCost(0), { koku: 20, stone: 1 });
  assert.ok(reclaimCost(30).koku > reclaimCost(10).koku);
  assert.deepEqual(reclaimCost(500), { koku: 300, stone: 4 });

  // a sea tile beside a sea-level beach, away from the player
  let spot = null;
  for (let z = 0; z < world.h && !spot; z++) for (let x = 0; x < world.w && !spot; x++) if (r.can(x, z) && Math.abs(x - 32) + Math.abs(z - 32) > 6) spot = { x, z };
  assert.ok(spot, 'some shore to fill');
  assert.equal(r.can(0, 0), false, 'open sea far from land');

  // no money, then no stone: refused with a reason
  assert.equal(r.reclaim(spot.x, spot.z), false);
  assert.match(said.at(-1), /20 koku/);
  core.money.add(100, 'test');
  assert.equal(r.reclaim(spot.x, spot.z), false);
  assert.match(said.at(-1), /stone/);
  core.inv.give('stone', 5);

  // filled in: sand, paid for, counted, and the next tile costs more
  assert.equal(r.reclaim(spot.x, spot.z), true);
  assert.deepEqual([world.get(spot.x, spot.z), world.waterKind(spot.x, spot.z)], [T.SAND, WK.NONE]);
  assert.equal(core.money.get(), 80);
  assert.equal(core.inv.count('stone'), 4);
  assert.equal(r.count, 1);
  assert.ok(r.cost().koku >= 20);

  // the count travels in the save's ext
  const ext = core.saveParts();
  assert.deepEqual(ext.reclaim, { n: 1 });
  core.loadParts({});
  assert.equal(r.count, 0);
  core.loadParts(ext);
  assert.equal(r.count, 1);
}

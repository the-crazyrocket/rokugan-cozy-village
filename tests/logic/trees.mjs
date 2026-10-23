// Trees: a sapling planted on open ground grows in real time (drawn small until grown); the axe fells a grown tree for wood and a
// stump that sprouts again, or lifts a young one back out; the shovel digs a stump out; a young tree picked up is its sapling again.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import trees, { STAGE_MS, REGROW_MS, SCALES, HITS, HIT_S } from '../../src/systems/trees.js';

export default function () {
  const now = { t: new Date(2026, 3, 10, 9).getTime() };
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', new World());
  core.boot([props, player, trees]);
  core.start({ fresh: true });
  const tr = core.use('trees'), pr = core.use('props');
  const seen = [];
  for (const e of ['chopHit', 'treeFell', 'chopStop']) core.bus.on(e, () => seen.push(e), { owner: 'test' });
  const fell = (x, z) => { assert.equal(tr.chop(x, z), true); for (let i = 0; i < 20 && tr.felling; i++) core.update(HIT_S / 2); };
  assert.equal(core.inv.count('axe'), 1, 'the axe is a gift');

  core.inv.give('sapling_pine', 3);
  const spots = [];
  for (let z = 4; z < 60 && spots.length < 3; z += 3) for (let x = 4; x < 60 && spots.length < 3; x += 3) if (tr.canPlant('sapling_pine', x, z)) spots.push({ x, z });
  const [a, b, c] = spots;

  // planted: a small pine, growing a stage every half day
  assert.equal(tr.plant('sapling_pine', a.x, a.z), true);
  const p = pr.at(a.x, a.z);
  assert.equal(p.type, 'pine');
  assert.equal(core.inv.count('sapling_pine'), 2);
  assert.equal(tr.canPlant('sapling_pine', a.x, a.z), false, 'the tile is taken');
  assert.deepEqual([tr.stage(p.id), tr.scale(p.id)], [0, SCALES[0]]);
  assert.equal(core.bus.apply('build.pickupItem', 'prop_pine', { id: p.id, prop: 'pine' }), 'sapling_pine', 'picked up young, it is a sapling again');
  now.t += STAGE_MS;
  assert.equal(tr.stage(p.id), 1);
  now.t += STAGE_MS;
  tr.tick();
  assert.deepEqual([tr.stage(p.id), tr.scale(p.id)], [2, 1], 'grown a day after planting');
  assert.equal(core.bus.apply('build.pickupItem', 'prop_pine', { id: p.id, prop: 'pine' }), 'prop_pine');

  // felled over a few strokes (busy meanwhile): wood and a stump, which sprouts again
  assert.equal(tr.chop(a.x, a.z), true);
  assert.ok(tr.felling && core.bus.apply('interact.busy', false), 'busy felling');
  assert.equal(pr.at(a.x, a.z).type, 'pine', 'still standing after the first stroke');
  for (let i = 0; i < 20 && tr.felling; i++) core.update(HIT_S / 2);
  assert.deepEqual(seen, [...Array(HITS).fill('chopHit'), 'treeFell']);
  assert.equal(core.inv.count('wood'), 3);
  const st = pr.at(a.x, a.z);
  assert.equal(st.type, 'stump');
  assert.ok(tr.isStump(st.id));
  now.t += REGROW_MS;
  tr.tick();
  const again = pr.at(a.x, a.z);
  assert.equal(again.type, 'pine', 'the stump sprouted');
  assert.equal(tr.stage(again.id), 0);

  // a young tree is lifted, not felled
  const before = core.inv.count('sapling_pine');
  assert.equal(tr.chop(a.x, a.z), true);
  assert.equal(pr.at(a.x, a.z), null, 'no stump');
  assert.equal(core.inv.count('sapling_pine'), before + 1);

  // the shovel digs a stump out
  tr.plant('sapling_pine', b.x, b.z);
  now.t += 2 * STAGE_MS;
  fell(b.x, b.z);
  const wood = core.inv.count('wood');
  assert.equal(tr.unstump(b.x, b.z), true);
  assert.equal(pr.at(b.x, b.z), null);
  assert.equal(core.inv.count('wood'), wood + 1);

  // a tree nobody planted is grown; a stump left long away sprouts and grows on in the catch-up
  tr.plant('sapling_pine', c.x, c.z);
  now.t += 2 * STAGE_MS;
  fell(c.x, c.z);
  now.t += REGROW_MS + 2 * STAGE_MS;
  tr.tick();
  assert.equal(tr.stage(pr.at(c.x, c.z).id), 2, 'sprouted while away, and grew');

  // walking off stops the felling: the tree stands
  tr.plant('sapling_pine', b.x, b.z);
  now.t += 2 * STAGE_MS;
  seen.length = 0;
  tr.chop(b.x, b.z);
  const pl = core.use('player'), at = pl.cell();
  pl.warp(at.x + 3.5, at.z + 0.5);
  core.update(HIT_S);
  assert.equal(tr.felling, null);
  assert.deepEqual(seen, ['chopHit', 'chopStop']);
  assert.equal(pr.at(b.x, b.z).type, 'pine');
}

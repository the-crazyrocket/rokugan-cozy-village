// Bugs: a few are out each hour, in their habitat and at their time; the net catches one on its tile, and the book counts it.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import fishing from '../../src/systems/fishing.js';
import bugs from '../../src/systems/bugs.js';

export default function () {
  const now = { t: new Date(2026, 6, 10, 21, 30).getTime() }; // a July evening: fireflies
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', new World());
  core.boot([props, player, fishing, bugs]);
  core.start({ fresh: true });
  const b = core.use('bugs');
  assert.equal(core.inv.count('net'), 1, 'the net is a gift');
  const out = b.out();
  assert.ok(out.length > 0);
  for (const id of new Set(out.map((x) => x.id))) assert.ok(out.filter((x) => x.id === id).length <= 2, 'two of a kind at most');
  for (const x of out) assert.ok(core.cond.evaluate(core.content.bugs.get(x.id).when, core.condCtx()), `${x.id} is about now`);
  assert.deepEqual(b.out(), out, 'the same bugs all hour');
  const first = out[0];
  assert.equal(b.catch(first.x, first.z), true);
  assert.equal(core.inv.count(first.id), 1);
  assert.equal(core.use('fishing').caught[first.id], 1, 'the book counts it');
  assert.ok(!b.out().some((x) => x.slot === first.slot), 'caught is gone');
  now.t += 3600e3;
  assert.equal(b.out().length > 0 && b.out() !== out, true, 'a new hour, new bugs');
}

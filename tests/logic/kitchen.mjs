// Daikoku's chapter: the mill grinds one batch in real time (done even if the game was closed) and is collected by hand; the
// kitchen makes exactly the dish whose ingredients are in the pot (discovered the first time) and a stew from anything else.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import props from '../../src/systems/props.js';
import kitchen from '../../src/systems/kitchen.js';

export default function () {
  const now = { t: Date.UTC(2026, 5, 1, 12) };
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', new World());
  core.boot([props, kitchen]);
  core.start({ fresh: true });
  const k = core.use('kitchen'), inv = core.inv;

  // the mill
  assert.equal(k.state(7), 'idle');
  assert.equal(k.startMill(7, 'mill_komeko'), false, 'no rice');
  inv.give('rice', 4);
  assert.equal(k.startMill(7, 'mill_komeko'), true);
  assert.equal(inv.count('rice'), 1);
  assert.equal(k.startMill(7, 'mill_komeko'), false, 'one batch at a time');
  assert.equal(k.state(7), 'working');
  assert.equal(k.collect(7), false);
  now.t += 4 * 60e3;
  assert.equal(k.state(7), 'done');
  const saved = JSON.parse(JSON.stringify(core.saveParts()));
  assert.equal(saved.kitchen.jobs[7].recipe, 'mill_komeko', 'the batch travels in the save');
  assert.equal(k.collect(7), true);
  assert.deepEqual([inv.count('komeko'), k.state(7)], [2, 'idle']);

  // the kitchen
  assert.equal(k.match({ komeko: 2 }).id, 'mochi');
  assert.equal(k.match({ komeko: 1 }), null, 'exact amounts only');
  assert.equal(k.known('mochi'), false);
  assert.deepEqual(k.cook({ komeko: 2 }), { dish: 'mochi', discovered: true });
  assert.equal(k.known('mochi'), true);
  assert.equal(inv.count('mochi'), 1);
  inv.give('daikon', 1); inv.give('ayu', 1);
  assert.deepEqual(k.cook({ daikon: 1, ayu: 1 }), { dish: 'zosui', discovered: false }, 'anything else is a stew');
  assert.deepEqual([inv.count('daikon'), inv.count('ayu'), inv.count('zosui')], [0, 0, 1]);
  assert.equal(k.cook({ tai: 1, rice: 2 }), null, 'not in the bag');
  assert.ok(k.dishes().find((d) => d.id === 'zosui').known, 'the stew needs no discovering');
  assert.equal(core.content.itemMap().get('mochi').sell, 80);
}

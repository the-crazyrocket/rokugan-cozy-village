// Wave 3 villagers: Kenji is there from the start and Ume once her house is built; where they are is the schedule at that hour;
// talking once a day and one gift a day make friends, and a heart pays out its reward.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';
import daily from '../../src/systems/daily.js';
import shrine from '../../src/systems/shrine.js';
import terrainrules from '../../src/systems/terrainrules.js';
import craft from '../../src/systems/craft.js';
import projects from '../../src/systems/projects.js';
import villagers, { heartsOf } from '../../src/systems/villagers.js';
import { HOME } from '../../src/content/base/landmarks.js';

export default function () {
  const now = { t: new Date(2026, 0, 15, 9).getTime() };
  const world = new World();
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, daily, shrine, terrainrules, craft, projects, villagers]);
  const pr = core.use('props');
  for (const p of [...pr.list].filter((q) => q.type === 'minka')) pr.remove(p, { to: 'gone' });
  assert.ok(pr.add('minka', HOME.x - 4, HOME.z - 4, 0, 0, { via: 'load' }) && pr.add('minka', HOME.x + 6, HOME.z + 4, 0, 0, { via: 'load' }));
  core.start({ fresh: true });
  const vs = core.use('villagers');

  assert.deepEqual(vs.present(), ['kenji'], 'Ume waits for her house');
  // 9:00 with nothing building: Kenji is at the workbench
  const bench = pr.list.find((p) => p.type === 'workbench');
  const k = vs.where('kenji');
  assert.ok(k && !k.indoors && Math.hypot(k.x - bench.x, k.z - bench.z) < 4, 'Kenji works at the bench in the morning');
  assert.equal(k.do, 'work');
  assert.equal(vs.at(Math.floor(k.x), Math.floor(k.z)), 'kenji');
  // 23:00: asleep indoors, beside the second house from home
  now.t = new Date(2026, 0, 15, 23).getTime();
  vs.step(0.1);
  assert.ok(vs.where('kenji').moving, 'he walks home');
  for (let i = 0; i < 200; i++) vs.step(0.25);
  assert.equal(vs.where('kenji').indoors, true);
  assert.equal(vs.at(Math.floor(vs.where('kenji').x), Math.floor(vs.where('kenji').z)), null, 'nobody to tap while asleep');
  // the morning after he walks out: a path, not a jump
  now.t = new Date(2026, 0, 16, 9).getTime();
  vs.step(0.1);
  const w = vs.where('kenji');
  assert.ok(w.moving || w.path === null);

  // talking: the first chat of the day is friendship, the second is not
  const first = vs.talk('kenji');
  assert.match(first, /Kenji\. I build things/, 'the hello line comes first, once');
  assert.equal(vs.points('kenji'), 2);
  assert.notEqual(vs.talk('kenji'), first);
  assert.equal(vs.points('kenji'), 2);

  // gifts: one a day, by taste; the first heart gives wood
  core.inv.give('wood', 3); core.inv.give('shell', 2);
  assert.equal(vs.taste('kenji', 'wood'), 'love');
  assert.equal(vs.taste('kenji', 'ayu'), 'like');
  assert.equal(vs.taste('kenji', 'shell'), 'dislike');
  assert.equal(vs.taste('kenji', 'stone'), 'neutral');
  vs.give('kenji', 'wood');
  assert.equal(vs.points('kenji'), 10);
  assert.equal(vs.hearts('kenji'), 1);
  assert.equal(core.inv.count('wood'), 2 + 6, 'the first heart: 6 wood');
  assert.equal(vs.give('kenji', 'wood'), null, 'one present a day');
  assert.equal(core.inv.count('wood'), 8);
  assert.equal(core.cond.evaluate({ friendship: { who: 'kenji', min: 1 } }, core.condCtx()), true, 'conditions read the hearts');
  assert.deepEqual([heartsOf(0), heartsOf(19), heartsOf(500)], [0, 1, 10]);

  // the save keeps friendship
  const saved = JSON.parse(JSON.stringify(core.saveParts()));
  assert.deepEqual(saved.villagers.pts, { kenji: 10 });

  // Ume moves in with her house
  core.use('projects').done.push('ume_house');
  vs.step(0.1);
  assert.deepEqual(vs.present(), ['kenji', 'ume']);
}

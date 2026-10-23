// Wave 2 making things: the workbench recipes and Kenji's projects (paid, built in real time, finished on the next look even
// when the clock ran on while the game was closed), on a real World with the real systems.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import { T } from '../../src/world/kinds.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';
import daily from '../../src/systems/daily.js';
import shrine from '../../src/systems/shrine.js';
import terrainrules from '../../src/systems/terrainrules.js';
import craft from '../../src/systems/craft.js';
import projects from '../../src/systems/projects.js';
import { shapeOf } from '../../src/content/base/projects.js';

function boot(now) {
  const world = new World();
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, daily, shrine, terrainrules, craft, projects]);
  core.start({ fresh: true });
  return { core, world, pr: core.use('props'), cr: core.use('craft'), pj: core.use('projects') };
}

export default function () {
  const now = { t: Date.UTC(2026, 0, 15, 12) };
  const { core, world, pr, cr, pj } = boot(now);
  const inv = core.inv;

  // a new village has its workbench and the project board standing
  assert.ok(pr.list.some((p) => p.type === 'workbench'), 'the workbench is placed');
  assert.ok(pr.list.some((p) => p.type === 'noticeboard'), 'the board is placed');

  // crafting takes the inputs and gives the outputs
  assert.equal(cr.can('fence'), false);
  inv.give('wood', 5);
  assert.equal(cr.make('fence'), true);
  assert.deepEqual([inv.count('wood'), inv.count('prop_fence')], [3, 2]);

  // projects: the first is open, the rest wait their turn
  assert.deepEqual(pj.list().map((p) => p.status), ['open', 'locked', 'locked', 'locked']);
  assert.match(pj.why('grove'), /Still needed/);
  core.money.add(2000, 'test');
  inv.give('stone', 30); inv.give('wood', 30); inv.give('earth', 20); inv.give('clay', 5);

  // start: paid, a sand foundation out in the sea, scaffolding up
  const shape = shapeOf('grove');
  assert.ok(shape.tiles.some((t) => world.isWater(t.x, t.z)), 'the grove grows out of the sea');
  assert.equal(pj.start('grove'), true);
  assert.equal(core.money.get(), 2000 - 250);
  assert.ok(shape.tiles.every((t) => world.isLand(t.x, t.z)), 'the foundation is down');
  assert.ok(pr.list.some((p) => p.type === 'scaffold'));
  assert.match(pj.why('hill'), /Finish the project before/);

  // not yet; then the clock runs past doneAt
  pj.check();
  assert.equal(pj.status('grove'), 'building');
  now.t += 2 * 3600e3 + 1;
  pj.check();
  assert.equal(pj.status('grove'), 'done');
  assert.ok(!pr.list.some((p) => p.type === 'scaffold'), 'the scaffolding is down');
  assert.ok(pr.list.filter((p) => p.type === 'bamboo').length >= 8, 'a grove of bamboo');
  assert.ok(shape.tiles.some((t) => world.kindAt(t.x, t.z) === T.PATH), 'a path through it');
  assert.equal(core.flags.has('project_grove'), true);
  assert.deepEqual(pj.takeFresh(), ['grove']);

  // the hill: stairs up three levels; finished while "away" (state saved, clock moved on, loaded back)
  assert.equal(pj.status('hill'), 'open');
  assert.equal(pj.start('hill'), true);
  const ext = core.saveParts();
  now.t += 7 * 3600e3;
  core.loadParts(ext);
  core.use('projects').check();
  assert.equal(pj.status('hill'), 'done');
  const top = shapeOf('hill').tiles.filter((t) => t.height === 3);
  assert.ok(top.length >= 5 && top.every((t) => world.heightAt(t.x, t.z) === 3), 'a level-3 top');
  assert.equal(pr.list.filter((p) => p.type === 'stairs').length, 3, 'three flights of stairs');

  // the islet, with its bridge
  assert.equal(pj.start('islet'), true);
  now.t += 11 * 3600e3;
  pj.check();
  assert.ok(pr.list.some((p) => p.type === 'bridge' && p.x >= 46), 'a bridge to the islet');
}

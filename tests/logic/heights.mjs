// Wave 1 hills on a real World with the real systems: the shovel and the earth (terraform), stairs as props (the derived stairs
// array, where they may stand, the ramp of groundY), walking (no stepping off a cliff, paths take the stairs) and level footprints.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import { T } from '../../src/world/kinds.js';
import { LEVEL_Y } from '../../src/world/coords.js';
import { createSurface } from '../../src/world/surface.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';
import daily from '../../src/systems/daily.js';
import terrainrules from '../../src/systems/terrainrules.js';
import terraform, { EARTH, START_EARTH } from '../../src/systems/terraform.js';

function boot() {
  const world = new World();
  const core = createCore({ strict: true, now: () => Date.UTC(2026, 0, 15, 12), mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, daily, terrainrules, terraform]);
  core.start({ fresh: true });
  const said = [];
  core.bus.on('say', (p) => said.push(p.text));
  const pr = core.use('props');
  return { core, world, said, pr, pl: core.use('player'), tf: core.use('terraform'), surface: createSurface(world, pr) };
}

/** The top-left corner of an n x n patch of plain grass. */
function meadow(world, n = 8) {
  for (let z = 0; z <= world.h - n; z++) for (let x = 0; x <= world.w - n; x++) {
    let ok = true;
    for (let dz = 0; dz < n && ok; dz++) for (let dx = 0; dx < n && ok; dx++) ok = world.get(x + dx, z + dz) === T.GRASS;
    if (ok) return { x, z };
  }
  throw new Error('no meadow');
}
const stand = (b, x, z) => b.pl.warp(x + 0.5, z + 0.5);

function shovel() {
  const b = boot(), m = meadow(b.world), inv = b.core.inv;
  assert.equal(inv.count('shovel'), 1, 'start() hands out a shovel');
  assert.equal(inv.count(EARTH), START_EARTH);
  stand(b, m.x, m.z);

  // earth piles a level on, the shovel digs it off again; the bag pays and is paid
  assert.equal(b.tf.raise(m.x + 1, m.z), true);
  assert.equal(b.world.heightAt(m.x + 1, m.z), 1);
  assert.equal(inv.count(EARTH), START_EARTH - 1);
  assert.equal(b.tf.raise(m.x + 1, m.z), true);
  assert.equal(b.world.heightAt(m.x + 1, m.z), 2);
  assert.equal(b.tf.lower(m.x + 1, m.z), true);
  assert.equal(b.world.heightAt(m.x + 1, m.z), 1);
  assert.equal(inv.count(EARTH), START_EARTH - 1);

  // the rules: not on the player, not without earth
  assert.equal(b.tf.raise(m.x, m.z), false);
  assert.match(b.said.at(-1), /standing there/);
  inv.take(EARTH, inv.count(EARTH));
  assert.equal(b.tf.raise(m.x + 3, m.z), false);
  assert.match(b.said.at(-1), /No earth/);
  inv.give(EARTH, 3);

  // a crate on the tile goes back to the bag
  b.pr.add('crate', m.x + 3, m.z + 3, 0);
  assert.equal(b.tf.raise(m.x + 3, m.z + 3), true);
  assert.equal(b.pr.at(m.x + 3, m.z + 3), null);
  assert.equal(inv.count('prop_crate'), 1);

  // a fresh start does not hand out a second shovel
  b.core.start();
  assert.equal(inv.count('shovel'), 1);
}

function stairs() {
  const b = boot(), m = meadow(b.world), w = b.world;
  stand(b, m.x, m.z + 6);
  // a level-1 ledge along row m.z+1..m.z+2 (columns m.x .. m.x+5)
  for (let x = m.x; x < m.x + 6; x++) for (const z of [m.z + 1, m.z + 2]) w.setHeight(x, z, 1);
  const foot = { x: m.x + 2, z: m.z + 3 }; // the lower tile in front of the ledge; rot 0 climbs towards -z

  // where stairs may go: at the foot of a step, facing up it
  assert.match(b.pr.check('stairs', foot.x, foot.z, 2), /foot of a step/, 'facing away');
  assert.match(b.pr.check('stairs', m.x + 7, m.z + 5, 0), /foot of a step/, 'nothing to climb');
  assert.equal(b.pr.check('stairs', foot.x, foot.z, 0), null);
  assert.equal(b.pr.check('crate', m.x, m.z + 2, 0), null, 'a crate on top of the ledge is fine');
  assert.match(b.pr.check('torii', m.x + 5, m.z + 2, 0), /not level/, 'a 3x1 torii hanging off the end of the ledge is not');

  // a cliff stops a walk; the stairs make the way up
  assert.equal(w.canStep(foot.x, foot.z, foot.x, foot.z - 1), false);
  assert.equal(b.pl.walkTo({ x: m.x + 3, z: m.z + 1 }), false, 'no way up without stairs');
  const st = b.pr.add('stairs', foot.x, foot.z, 0);
  assert.equal(w.stairsAt(foot.x, foot.z), 1);
  assert.equal(w.canStep(foot.x, foot.z, foot.x, foot.z - 1), true);
  assert.equal(b.pl.walkable(foot.x, foot.z), true, 'stairs are walked on');
  assert.equal(b.pl.walkTo({ x: m.x + 3, z: m.z + 1 }), true);
  assert.ok(b.pl.state.path.some((p) => Math.floor(p.x) === foot.x && Math.floor(p.y) === foot.z), 'the path takes the stairs');

  // the ramp: level at the front edge, one level up at the back
  assert.ok(b.surface.groundY(foot.x + 0.5, foot.z + 0.999) < 0.01);
  assert.ok(Math.abs(b.surface.groundY(foot.x + 0.5, foot.z + 0.5) - LEVEL_Y / 2) < 1e-9);
  assert.ok(Math.abs(b.surface.groundY(foot.x + 0.5, foot.z + 0.01) - LEVEL_Y * 0.99) < 1e-9);
  assert.equal(b.surface.groundY(foot.x + 0.5, foot.z - 0.5), LEVEL_Y, 'on the ledge');

  // stairs and the tile they lead to keep their ground
  stand(b, m.x + 6, m.z + 6);
  assert.equal(b.tf.lower(foot.x, foot.z - 1), false);
  assert.match(b.said.at(-1), /Stairs lead up there/);
  b.pr.remove(st, { to: 'bag' });
  assert.equal(w.stairsAt(foot.x, foot.z), 0, 'taking the stairs away clears the derived array');
}

function water() {
  const b = boot(), m = meadow(b.world), w = b.world, inv = b.core.inv;
  stand(b, m.x + 7, m.z + 7);
  // flat ground opens into a pond; the earth fills it back in
  const e0 = inv.count(EARTH);
  assert.equal(b.tf.lower(m.x, m.z + 6), true);
  assert.deepEqual([w.kindAt(m.x, m.z + 6), w.waterKind(m.x, m.z + 6), inv.count(EARTH)], [T.WATER, 2, e0 + 1]);
  assert.equal(b.tf.raise(m.x, m.z + 6), true);
  assert.deepEqual([w.kindAt(m.x, m.z + 6), w.waterKind(m.x, m.z + 6), inv.count(EARTH)], [T.GRASS, 0, e0]);

  // a 3x3 hill: its middle digs into a pond on the hill, its edge cuts down a level
  for (let z = m.z; z < m.z + 3; z++) for (let x = m.x + 1; x < m.x + 4; x++) w.setHeight(x, z, 1);
  const mid = { x: m.x + 2, z: m.z + 1 };
  assert.equal(b.tf.digKind(mid.x, mid.z), 'pond');
  assert.equal(b.tf.lower(mid.x, mid.z), true);
  assert.deepEqual([w.kindAt(mid.x, mid.z), w.heightAt(mid.x, mid.z)], [T.WATER, 1], 'a pond up on the hill');
  assert.equal(w.waterY(mid.x + 0.5, mid.z + 0.5) > 0, true);
  assert.equal(b.tf.digKind(m.x + 1, m.z), 'cut', 'a corner of the hill, no water beside it');

  // the pond may not spill: widening it to the west edge (open ground below) is refused
  assert.equal(b.tf.digKind(mid.x - 1, mid.z), 'pond');
  assert.equal(b.tf.lower(mid.x - 1, mid.z), false);
  assert.match(b.said.at(-1), /spill/);
  // a pond at the foot of the west edge first: then the water may fall into it
  assert.equal(b.tf.lower(m.x, mid.z), true);
  assert.deepEqual([w.kindAt(m.x, mid.z), w.heightAt(m.x, mid.z)], [T.WATER, 0]);
  assert.equal(b.tf.lower(mid.x - 1, mid.z), true, 'a waterfall');
  assert.deepEqual([w.kindAt(mid.x - 1, mid.z), w.heightAt(mid.x - 1, mid.z)], [T.WATER, 1]);
  // and cutting the bank that holds the pond up is refused
  assert.equal(b.tf.lower(mid.x + 1, mid.z), false);
  assert.match(b.said.at(-1), /spill/);
}

function walking() {
  const b = boot(), m = meadow(b.world), w = b.world;
  w.setHeight(m.x + 3, m.z + 3, 1);
  // walking east along row m.z+3 from m.x+1 stops at the cliff instead of climbing it
  b.pl.warp(m.x + 1.5, m.z + 3.5);
  for (let i = 0; i < 120; i++) b.pl.move(1 / 30, { x: 1, z: 0, speed: 1 });
  assert.equal(Math.floor(b.pl.state.pos.x), m.x + 2);
  assert.ok(b.pl.state.pos.x < m.x + 3 - 0.2, 'the body stays off the step');
  assert.equal(b.pl.canStand(), true);
}

export default function () {
  shovel();
  stairs();
  water();
  walking();
}

// Growing the island a plot at a time: the basket on the shore marks out a square of sea, paid in koku, stone and wood, filled in
// over time (also while away), sand that grows to grass a day later except along the new beach; every second plot an outcrop, which
// the quarry gives stone from a few blows a day. The price per tile rises gently.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import { T, WK } from '../../src/world/kinds.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';
import daily from '../../src/systems/daily.js';
import shrine from '../../src/systems/shrine.js';
import terrainrules from '../../src/systems/terrainrules.js';
import reclaim, { plotCost, plotMs, GRASS_MS } from '../../src/systems/reclaim.js';
import quarry, { STRIKES, STONE } from '../../src/systems/quarry.js';

export default function () {
  const world = new World();
  const now = { t: Date.UTC(2026, 0, 15, 12) };
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, daily, shrine, terrainrules, reclaim, quarry]);
  core.start({ fresh: true });
  const r = core.use('reclaim'), q = core.use('quarry'), pr = core.use('props'), said = [];
  core.bus.on('say', (p) => said.push(p.text));

  // the price per tile rises gently: a 25-tile plot is 250 koku at first, 625 by the tenth, never over 30 a tile
  assert.deepEqual(plotCost(25, 0), { koku: 250, stone: 10, wood: 5 });
  assert.equal(plotCost(25, 10).koku, 625);
  assert.equal(plotCost(25, 100).koku, 750);
  assert.ok(plotMs(25) > plotMs(9));

  // a shore tile of open sea: the 5x5 plot over it takes in sea only, joined, touching the land
  let spot = null;
  for (let z = 0; z < world.h && !spot; z++) for (let x = 0; x < world.w && !spot; x++) if (r.shore(x, z) && r.plotAt(x, z, 5)?.tiles.length >= 15) spot = { x, z };
  assert.ok(spot, 'some shore to grow from');
  assert.equal(r.shore(1, 1), false, 'not at the edge of the world');
  const plot = r.plotAt(spot.x, spot.z, 5);
  assert.ok(plot.tiles.every((t) => world.isWater(t.x, t.z) && t.x >= plot.x0 && t.x < plot.x0 + 5 && t.z >= plot.z0 && t.z < plot.z0 + 5));
  assert.ok(r.plotAt(spot.x, spot.z, 3).tiles.length <= 9);

  // short of everything, then paid for and under way: the sea is still sea until it is done
  assert.match(r.why(plot), /Still needed: \d+ koku, \d+ stone, \d+ wood/);
  const c = r.cost(plot.tiles.length);
  core.money.add(c.koku * 2, 'test'); core.inv.give('stone', c.stone * 2); core.inv.give('wood', c.wood * 2);
  assert.equal(r.start(plot), true);
  assert.equal(core.money.get(), c.koku);
  assert.ok(r.active && world.isWater(spot.x, spot.z));
  assert.equal(r.why(r.plotAt(spot.x, spot.z) ?? plot), 'The village is still filling in the last plot.');
  assert.equal(r.fillable(plot.tiles[0].x, plot.tiles[0].z), false, 'a plot under way is not offered again');

  // the save carries it; done (here: the time passes as if away) it is sand, the old beach behind it included in the grass to come
  const ext = core.saveParts();
  core.loadParts({}); assert.equal(r.active, null);
  core.loadParts(ext); assert.equal(r.active.tiles.length, plot.tiles.length);
  now.t += plotMs(plot.tiles.length);
  r.check();
  assert.equal(r.active, null);
  assert.equal(r.plots, 1);
  assert.ok(plot.tiles.every((t) => world.get(t.x, t.z) === T.SAND && world.waterKind(t.x, t.z) === WK.NONE), 'all sand');
  assert.match(said.at(-1), /new plot is land/);
  const notch = (x, z) => r.fillable(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => world.isLand(x + dx, z + dz)).length >= 3;
  for (let z = plot.z0 - 1; z <= plot.z0 + 5; z++) for (let x = plot.x0 - 1; x <= plot.x0 + 5; x++) assert.equal(notch(x, z), false, `no notch of sea left at ${x},${z}`);

  // a day on: inland sand is grass, sand by the sea is still beach
  now.t += GRASS_MS;
  r.check();
  const bySea = (t) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dz]) => world.isWater(t.x + dx, t.z + dz) && world.waterKind(t.x + dx, t.z + dz) === WK.SEA);
  const kinds = plot.tiles.map((t) => [world.get(t.x, t.z), bySea(t)]);
  assert.ok(kinds.some(([k]) => k === T.GRASS), 'some grass');
  assert.ok(kinds.every(([k, sea]) => (sea ? k === T.SAND : k === T.GRASS)), 'grass inland, a beach along the sea');

  // the island starts with an outcrop: a few blows a day, then spent until tomorrow
  core.use('daily').ensure();
  const rock = pr.list.find((p) => p.type === 'outcrop');
  assert.ok(rock, 'an outcrop to quarry');
  const stone = core.inv.count('stone');
  for (let i = 0; i < STRIKES; i++) assert.equal(q.strike(rock.x, rock.z), true);
  assert.equal(q.strike(rock.x, rock.z), false);
  assert.match(said.at(-1), /tomorrow/);
  assert.equal(core.inv.count('stone'), stone + STRIKES * STONE);

  // a shut-in pool of sea is filled with the plot; a second plot turns up another outcrop
  const pool = r.pockets();
  assert.ok(Array.isArray(pool));
  let next = null;
  for (let z = 0; z < world.h && !next; z++) for (let x = 0; x < world.w && !next; x++) if (r.shore(x, z) && (r.plotAt(x, z, 6)?.tiles.length ?? 0) >= 20) next = r.plotAt(x, z, 6);
  assert.ok(next);
  core.money.add(5000, 'test'); core.inv.give('stone', 50); core.inv.give('wood', 50);
  assert.equal(r.start(next), true);
  now.t += plotMs(next.tiles.length);
  r.check();
  assert.equal(r.plots, 2);
  assert.equal(pr.list.filter((p) => p.type === 'outcrop').length, 2, 'the second plot turned up an outcrop');
  assert.equal(r.pockets().length, 0, 'no shut-in sea left behind');
}

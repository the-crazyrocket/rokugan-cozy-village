// Wave 2 gathering: the daily finds (rocks, branches, clay, shells) and shaking trees, on a real World with the real systems.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import { T } from '../../src/world/kinds.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';
import daily from '../../src/systems/daily.js';
import market from '../../src/systems/market.js';
import shrine from '../../src/systems/shrine.js';
import fishing from '../../src/systems/fishing.js';
import stats from '../../src/systems/stats.js';
import requests from '../../src/systems/requests.js';
import gather, { NODES } from '../../src/systems/gather.js';

export default function () {
  const world = new World();
  let now = Date.UTC(2026, 0, 15, 12);
  const core = createCore({ strict: true, now: () => now, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, daily, market, shrine, fishing, stats, requests, gather]);
  core.start({ fresh: true });
  const g = core.use('gather'), inv = core.inv, events = [];
  core.bus.on('gather', (p) => events.push(p));
  core.use('daily').ensure();

  // every kind turns up, on the kind of ground it belongs to, and none on top of another
  const spots = g.visible();
  for (const kind of Object.keys(NODES)) assert.ok(spots.some((s) => s.kind === kind), `some ${kind} today`);
  assert.equal(new Set(spots.map((s) => `${s.x},${s.z}`)).size, spots.length);
  for (const s of spots.filter((s) => s.kind === 'shells')) assert.equal(world.get(s.x, s.z), T.SAND);

  // taking a rock gives stone, once
  const rock = spots.find((s) => s.kind === 'rock');
  assert.equal(g.take(rock.x, rock.z), true);
  assert.equal(inv.count('stone'), NODES.rock.n);
  assert.equal(g.take(rock.x, rock.z), false);
  assert.deepEqual(events.at(-1), { item: 'stone', n: 2, x: rock.x, z: rock.z, kind: 'rock' });

  // a tree shakes once a day; a pine gives wood, bamboo gives bamboo
  const pine = core.use('props').list.find((p) => p.type === 'pine') || core.use('props').add('pine', rock.x, rock.z, 0);
  assert.ok(g.shakable(pine.x, pine.z));
  assert.equal(g.shake(pine.x, pine.z), true);
  assert.equal(g.shake(pine.x, pine.z), false, 'once a day');
  assert.equal(inv.count('wood'), 1);

  // the next day: new finds, and the trees can be shaken again
  now += 24 * 3600e3;
  core.use('daily').ensure();
  assert.ok(g.shakable(pine.x, pine.z));
  assert.ok(g.visible().length >= spots.length - 2);

  // a day rolled before gathering existed gets its finds on first look
  delete core.use('daily').state.ext.gather;
  assert.ok(g.visible().length > 0);
}

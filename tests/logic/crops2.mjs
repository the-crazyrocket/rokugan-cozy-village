// Wave 2 farming: the new crops' places (wasabi beside a stream, lotus in a pond) and the harvest bonuses (in season, tea up high).
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import { T, WK } from '../../src/world/kinds.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';

export default function () {
  const world = new World();
  const now = { t: Date.UTC(2026, 9, 23, 12) }; // autumn
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming]);
  core.start({ fresh: true });
  const f = core.use('farming'), inv = core.inv, said = [];
  core.bus.on('say', (p) => said.push(p.text));
  const plant = (x, z, seed) => f.plant(x, z, null, f.crop(x, z), world.get(x, z), seed);

  // a patch of grass far from any stream, and one beside a stream
  const find = (ok) => { for (let z = 1; z < world.h - 1; z++) for (let x = 1; x < world.w - 1; x++) if (ok(x, z)) return { x, z }; return null; };
  const nearStream = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dz]) => world.isWater(x + dx, z + dz) && world.waterKind(x + dx, z + dz) === WK.STREAM);
  const dry = find((x, z) => world.get(x, z) === T.GRASS && !nearStream(x, z) && !world.isWater(x + 2, z));
  const bank = find((x, z) => world.get(x, z) === T.GRASS && nearStream(x, z));
  assert.ok(dry && bank, 'the island has both');
  for (const t of [dry, bank]) world.set(t.x, t.z, T.SOIL);

  // wasabi only beside a stream
  inv.give('seed_wasabi', 2);
  plant(dry.x, dry.z, 'seed_wasabi');
  assert.equal(f.crop(dry.x, dry.z), undefined);
  assert.match(said.at(-1), /only grows/);
  plant(bank.x, bank.z, 'seed_wasabi');
  assert.equal(f.crop(bank.x, bank.z)?.type, 'wasabi');

  // lotus goes into a pond, never into soil, and is always watered
  const pond = find((x, z) => world.get(x, z) === T.WATER && world.waterKind(x, z) === WK.POND);
  assert.ok(pond, 'a pond');
  inv.give('seed_lotus', 2);
  plant(dry.x, dry.z, 'seed_lotus');
  assert.match(said.at(-1), /straight into a pond/);
  plant(pond.x, pond.z, 'seed_lotus');
  const lotus = f.crop(pond.x, pond.z);
  assert.equal(lotus?.type, 'lotus');
  assert.equal(lotus.wet, true);

  // in season (autumn: kabocha) one more at harvest; out of season (edamame) none
  assert.equal(f.bonus({ type: 'kabocha', x: dry.x, z: dry.z }), 1);
  assert.equal(f.bonus({ type: 'edamame', x: dry.x, z: dry.z }), 0);
  world.setHeight(dry.x, dry.z, 1);
  assert.equal(f.bonus({ type: 'tea', x: dry.x, z: dry.z }), 1, 'tea up on a hill');
}

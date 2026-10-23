// Wave 3 visitors: an arrangement draws its visitor (rolled per hour, the same whether watched or caught up after), the gift goes
// into the bag, it leaves after its stay, and a photo goes into the scrapbook.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/world/world.js';
import { T } from '../../src/world/kinds.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import visitors from '../../src/systems/visitors.js';

function boot(now) {
  const world = new World();
  const core = createCore({ strict: true, now: () => now.t, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, visitors]);
  core.start({ fresh: true });
  return { core, world, pr: core.use('props'), vs: core.use('visitors') };
}

function meadow(world, n = 6) {
  for (let z = 0; z <= world.h - n; z++) for (let x = 0; x <= world.w - n; x++) {
    let ok = true;
    for (let dz = 0; dz < n && ok; dz++) for (let dx = 0; dx < n && ok; dx++) ok = world.get(x + dx, z + dz) === T.GRASS;
    if (ok) return { x, z };
  }
  throw new Error('no meadow');
}

export default function () {
  const H = 3600e3, t0 = new Date(2026, 5, 10, 21).getTime();
  const run = (watch) => {
    const now = { t: t0 };
    const { core, world, pr, vs } = boot(now);
    const m = meadow(world);
    for (const p of pr.list.filter((q) => q.type === 'crate')) pr.remove(p, { to: 'gone' });
    assert.ok(pr.add('crate', m.x + 2, m.z + 2, 0) && pr.add('crate', m.x + 3, m.z + 2, 0));
    vs.check();
    const log = [];
    core.bus.on('visit', (p) => log.push(p.visitor));
    for (let h = 0; h < 30; h++) { now.t += H; if (watch) vs.check(); }
    if (!watch) vs.check(true);
    return { core, vs, log, now };
  };
  const a = run(true), b = run(false);
  assert.ok(a.vs.seen('tanuki') > 0, 'two crates bring a tanuki at night');
  assert.equal(a.vs.seen('tanuki'), b.vs.seen('tanuki'), 'the same visits caught up as watched');
  assert.equal(a.vs.seen('kitsune'), 0, 'no torii, no fox');
  assert.equal(a.core.inv.count('mushroom'), a.vs.seen('tanuki'), 'a mushroom per tanuki visit');
  assert.equal(b.core.inv.count('mushroom'), b.vs.seen('tanuki'));
  assert.ok(b.log.length === 0, 'caught-up visits are not announced one by one');
  assert.ok(b.vs.takeFresh().includes('tanuki'), 'they go into the away card');
  // photo: only while it is here
  const here = a.vs.here.find((h) => h.id === 'tanuki');
  if (here) {
    assert.equal(a.vs.photo('tanuki'), true);
    assert.equal(a.vs.photos('tanuki'), 1);
    assert.equal(a.vs.at(here.x, here.z).id, 'tanuki');
    a.now.t = here.until + 1;
    a.vs.check();
  }
  assert.equal(a.vs.photo('tanuki'), false, 'gone after its stay');
}

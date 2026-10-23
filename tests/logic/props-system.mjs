// The props system in a strict core: place/remove events with `via`/`to`, the place guard registry, per-core state, the view that follows the events.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import props from '../../src/systems/props.js';
import { PropManager } from '../../src/game/props.js';
import { createCore } from '../../src/core/core.js';
import { PRIO } from '../../src/core/bus.js';
import { defineSystem } from '../../src/core/system.js';
import { World } from '../../src/game/world.js';
import { T } from '../../src/world/kinds.js';

function boot(extra = [], world = new World()) {
  const core = createCore({ strict: true, now: () => 1e12, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, ...extra]);
  return { core, world, api: core.use('props') };
}
const log = (core, ...names) => {
  const out = [];
  for (const n of names) core.bus.on(n, (p, m) => out.push([n, p, m.away]));
  return out;
};

function events() {
  const { core, api } = boot();
  const seen = log(core, 'place', 'remove');
  const p = api.add('crate', 20, 20, 1);
  assert.deepEqual(seen, [['place', { prop: 'crate', id: p.id, x: 20, z: 20, rot: 1, via: 'build' }, false]]);
  const q = api.add('crate', 22, 20, 0, 9, { via: 'project' });
  assert.equal(q.id, 9);
  assert.equal(seen[1][1].via, 'project');
  assert.equal(api.nextId, 10);
  api.remove(p, { to: 'bag' });
  api.remove(q);
  assert.deepEqual(seen.slice(2).map(([n, pl]) => [n, pl.id, pl.to]), [['remove', p.id, 'bag'], ['remove', 9, 'gone']]);
  assert.deepEqual(seen[2][1], { prop: 'crate', id: p.id, x: 20, z: 20, to: 'bag' });

  // a bad payload is the caller's bug: strict mode throws
  assert.throws(() => api.add('crate', 24, 20, 0, 0, { via: 'sorcery' }), /via/);
  assert.throws(() => api.remove(api.add('crate', 26, 20, 0, 0, { via: 'load' }), { to: 'void' }), /to/);

  // state settles before anyone is told: a STATE handler sees the prop, the cells and the version
  const { core: c2, api: a2 } = boot();
  let at = null;
  c2.bus.on('place', ({ id, x, z }) => { at = { listed: a2.get(id)?.id === id, there: a2.at(x, z)?.id === id, v: a2.version }; }, { priority: PRIO.STATE });
  a2.add('crate', 20, 20, 0);
  assert.deepEqual(at, { listed: true, there: true, v: 1 });
  c2.bus.on('remove', ({ id, x, z }) => { at = { gone: a2.get(id) === null && a2.at(x, z) === null, v: a2.version }; });
  a2.remove(a2.at(20, 20));
  assert.deepEqual(at, { gone: true, v: 2 });

  // events carry meta.away during a catch-up like any other
  const { core: c3, api: a3 } = boot();
  const s3 = log(c3, 'place');
  c3.bus.setAway(true);
  a3.add('crate', 20, 20, 0, 0, { via: 'load' });
  assert.equal(s3[0][2], true);
}

function guards() {
  const { core, api, world } = boot();
  const seen = [];
  assert.equal(api.canPlace('crate', 20, 20, 0), true);
  assert.equal(api.check('crate', 20, 20, 0), null);

  // a guard sees what is being placed and where, and one reason is enough
  const off = core.as('farming').guards.add('place', (p, ctx) => {
    seen.push(p);
    assert.ok(ctx);
    return p.cells.some((c) => c.x === 20 && c.z === 20) ? 'crop' : null;
  });
  assert.equal(api.check('crate', 20, 20, 0), 'crop');
  assert.equal(api.canPlace('crate', 20, 20, 0), false);
  assert.equal(api.canPlace('crate', 22, 20, 0), true);
  assert.deepEqual(seen[0], { prop: 'crate', x: 20, z: 20, rot: 0, via: 'build', ignoreId: 0, cells: [{ x: 20, z: 20, block: 1 }] });
  assert.equal(api.check('crate', 20, 20, 0, { via: 'move', ignoreId: 7 }), 'crop');
  assert.deepEqual([seen.at(-1).via, seen.at(-1).ignoreId], ['move', 7]);

  // add() is not vetoed: restoring a save must not be, and callers check first
  assert.equal(api.add('crate', 20, 20, 0, 0, { via: 'load' }).type, 'crate');

  // the footprint's and the terrain's own reasons win; the guard is only asked about a prop that would otherwise fit
  seen.length = 0;
  assert.equal(api.check('crate', -1, 5, 0), 'bounds');
  assert.equal(api.check('crate', 20, 20, 0), 'occupied');
  assert.equal(api.check('crate', 5, 5, 0), 'water');
  world.set(30, 30, T.SOIL);
  assert.equal(api.check('crate', 30, 30, 0), 'soil');
  assert.equal(api.check('bridge', 10, 10, 0), 'span');
  assert.equal(api.check('pier', 10, 10, 0), 'water');
  assert.deepEqual(seen, [], 'never asked');
  assert.equal(api.check('crate', 20, 20, 0, { ignoreId: api.at(20, 20).id }), 'crop', 'the guard still has its say when the footprint is only blocked by ignoreId');

  // priority order, the first reason wins, removal lifts the veto
  const order = [];
  core.guards.add('place', () => { order.push('late'); return 'late'; }, { priority: 10 });
  core.guards.add('place', () => { order.push('early'); return null; }, { priority: 90 });
  assert.equal(api.check('crate', 20, 20, 0, { ignoreId: api.at(20, 20).id }), 'crop');
  assert.deepEqual(order, ['early'], 'crop (priority 50) vetoed before the late one was asked');
  core.guards.remove(off);
  assert.equal(api.check('crate', 20, 20, 0, { ignoreId: api.at(20, 20).id }), 'late');
}

function systemsAndState() {
  // another system vetoes through the registry and reads props through its declared need
  const seen = [];
  const farming = defineSystem({
    name: 'farming', needs: ['props'],
    init(ctx) {
      const crops = new Set(['20,20']);
      ctx.state.crops = crops;
      ctx.guards.add('place', (p) => (p.cells.some((c) => crops.has(`${c.x},${c.z}`)) ? 'crop' : null));
      seen.push(ctx.use('props'));
    },
  });
  const { core, api } = boot([farming]);
  assert.equal(seen[0], api);
  assert.equal(api.canPlace('crate', 20, 20, 0), false);
  assert.equal(core.guards.get('place')[0].owner, 'farming');
  assert.equal(core.systems.get('farming').state.crops.size, 1);

  const stranger = defineSystem({ name: 'stranger', init(ctx) { ctx.use('props'); } });
  assert.throws(() => boot([stranger]), /does not list it in needs/);

  // two cores, two villages
  const a = boot(), b = boot();
  a.api.add('crate', 20, 20, 0);
  assert.equal(a.api.list.length, 1);
  assert.equal(b.api.list.length, 0);
  assert.equal(b.api.canPlace('crate', 20, 20, 0), true);

  // conditions see the props of their core
  assert.equal(a.core.condCtx().props, a.api);
  a.api.add('well', 16, 19, 0);
  const cc = a.core.condCtx({ at: { x: 16, z: 19 } });
  assert.equal(a.core.cond.evaluate({ near: { prop: 'well' } }, cc), true);
  assert.equal(a.core.cond.evaluate({ near: { prop: 'torii' } }, cc), false);
  assert.equal(b.core.cond.evaluate({ near: { prop: 'well' } }, b.core.condCtx({ at: { x: 16, z: 19 } })), false);

  // a core without a world boots fine and says what is missing when the store is used
  const bare = createCore({ strict: true, systems: [props] });
  assert.throws(() => bare.use('props').list, /has no world/);
  bare.provide('world', new World());
  assert.deepEqual(bare.use('props').list, []);
}

function view() {
  // meshes follow the events, whoever places the prop
  const world = new World();
  const core = createCore({ strict: true });
  core.provide('world', world);
  core.boot([props]);
  const pm = new PropManager(new THREE.Scene(), { assets: {}, sheets: {} }, world, core);
  let changes = 0;
  pm.onChange = () => changes++;
  const api = core.use('props');
  const p = api.add('crate', 20, 20, 0, 0, { via: 'project' });
  assert.ok(p.mesh.isMesh && pm.group.children.includes(p.mesh) && p.mesh.userData.propId === p.id, 'a system-placed prop gets its mesh');
  assert.equal(changes, 1);
  assert.equal(pm.list, api.list);
  const q = pm.add('crate', 22, 20, 0);
  assert.ok(q.mesh && pm.at(22, 20) === q && api.at(22, 20) === q);
  api.remove(p, { to: 'bag' });
  assert.ok(!pm.group.children.includes(p.mesh) && pm.group.children.includes(q.mesh));
  pm.remove(q, { to: 'bag' });
  assert.equal(pm.group.children.length, 0);
  assert.equal(changes, 4);
  assert.equal(pm.version, 4);

  // guards act through the manager too; legacy playerCell / farm options are ignored (the owners of those guards register them)
  core.guards.add('place', (g) => (g.cells.some((c) => c.x === 20 && c.z === 20) ? 'player' : null));
  assert.equal(pm.canPlace('crate', 20, 20, 0), false);
  assert.equal(pm.canPlace('crate', 20, 20, 0, { playerCell: { x: 0, z: 0 }, farm: new Map() }), false);
  assert.equal(pm.canPlace('crate', 22, 20, 0, { playerCell: { x: 22, z: 20 }, farm: new Map([[20 * 40 + 22, {}]]) }), true);
}

export default function () {
  events();
  guards();
  systemsAndState();
  view();
}

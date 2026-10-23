// The build system in a strict core: state per core, the event order of placing, storing, rotating and moving, the preview, the legacy facade.
import assert from 'node:assert/strict';
import build from '../../src/systems/build.js';
import props from '../../src/systems/props.js';
import ghostView from '../../src/render/views/ghost-view.js';
import { createCore } from '../../src/core/core.js';
import { PRIO } from '../../src/core/bus.js';
import { defineSystem } from '../../src/core/system.js';
import { World } from '../../src/game/world.js';
import { LEGACY_OFF as O } from '../../src/world/coords.js';

function boot(opts = {}) {
  const world = new World();
  const at = { cell: { x: 2, z: 2 } };
  const player = defineSystem({ name: 'player', api: () => ({ cell: () => at.cell }) });
  const core = createCore({ strict: true, now: () => 1e12, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, build]);
  const log = [];
  core.bus.onAny((payload, m) => log.push([m.name, payload]), { priority: PRIO.VIEW });
  core.inv.give('prop_crate', opts.crates ?? 2);
  log.length = 0;
  const flush = () => log.splice(0).map(([n, p]) => (n === 'say' ? `say:${p.text}` : n === 'place' || n === 'remove' ? `${n}:${p.prop}:${p.via || p.to}` : n === 'invalidate' ? `ui` : n === 'itemGain' || n === 'itemLoss' ? `${n}:${p.item}` : n === 'sfx' ? `sfx:${p.name}` : n === 'buildMode' ? `mode:${p.on}` : n));
  return { core, world, at, b: core.use('build'), pr: core.use('props'), flush };
}

function state() {
  const { core, b } = boot();
  assert.deepEqual([b.mode, b.sel, b.rot, b.cursor, b.moving], ['play', 'pickup', 0, null, null]);
  assert.deepEqual(core.systems.get('build').spec.needs, ['props', 'player']);
  const other = boot();
  b.sel = 'prop_crate'; b.rot = 3;
  assert.deepEqual([other.b.sel, other.b.rot], ['pickup', 0], 'a core has its own state');

  // the Game side: accessors and delegating methods, with `this` the Game
  const game = { core: { use: (n) => { assert.equal(n, 'build'); return b; } } };
  for (const [name, entry] of Object.entries(build.facade)) {
    if (typeof entry === 'function') game[name] = entry.bind(game);
    else Object.defineProperty(game, name, { get: entry.get, set: entry.set });
  }
  game.buildSel = 'prop_crate';
  assert.equal(b.sel, 'prop_crate');
  game.toggleBuild(true);
  assert.equal(game.mode, 'build');
  assert.equal(game.buildRot, 3);
  game.rotate();
  assert.equal(b.rot, 0);
  assert.deepEqual(Object.keys(build.facade).sort(), ['buildAt', 'buildCursor', 'buildRot', 'buildSel', 'cancelBuildPreview', 'confirmBuild', 'mode', 'moveProp', 'moving', 'pickUp', 'rotate', 'rotateProp', 'toggleBuild']);
}

function toggling() {
  const { b, flush } = boot();
  b.toggle();
  assert.equal(b.mode, 'build');
  assert.deepEqual(flush(), ['mode:true', 'ui']);
  b.rotate();
  assert.deepEqual(flush(), ['say:Rotated 90°']);
  assert.equal(b.rot, 1);
  b.cursor = { x: 5, z: 5 };
  b.toggle(false);
  assert.deepEqual([b.mode, b.cursor], ['play', null]);
  assert.deepEqual(flush(), ['ui', 'mode:false', 'ui'], 'dropping the preview refreshes, then the mode change and its refresh');
  b.rotate();
  assert.deepEqual([flush(), b.rot], [[], 1], 'rotating does nothing outside build mode');
  b.toggle(true); b.toggle(true);
  assert.equal(b.mode, 'build');
  flush();
}

function placing() {
  const { core, b, pr, flush, world } = boot();
  b.sel = 'prop_crate';
  b.toggle(true); flush();
  const events = [];
  core.bus.on('haptic', (p) => events.push(['haptic', p]));
  core.bus.on('fx', (p) => events.push(['fx', p.kind, p.opts.n]));
  assert.equal(b.buildAt(20 + O, 20 + O), true);
  assert.deepEqual(flush(), ['itemLoss:prop_crate', 'ui', 'place:crate:build', 'sfx:place', 'haptic', 'fx', 'say:Placed crate.']);
  assert.deepEqual(events, [['haptic', { ms: 12 }], ['fx', 'burst', 16]]);
  assert.equal(pr.at(20 + O, 20 + O).type, 'crate');
  assert.equal(core.inv.count('prop_crate'), 1);

  // the same cell is taken; the player's tile and a crop are other systems' vetoes (place guards)
  assert.equal(b.buildAt(20 + O, 20 + O), false);
  assert.deepEqual(flush(), ['say:Can\'t place that here.']);
  core.guards.add('place', (p) => (p.cells.some((c) => c.x === 22 + O && c.z === 20 + O) ? 'crop' : null));
  assert.equal(b.buildAt(22 + O, 20 + O), false);
  assert.equal(core.inv.count('prop_crate'), 1);
  flush();

  // the last one: the selection falls back to storing
  assert.equal(b.buildAt(24 + O, 20 + O), true);
  assert.equal(b.sel, 'pickup');
  assert.deepEqual(flush(), ['itemLoss:prop_crate', 'ui', 'place:crate:build', 'sfx:place', 'haptic', 'fx', 'say:Placed crate.', 'ui']);
  b.sel = 'prop_crate';
  assert.equal(b.buildAt(26 + O, 20 + O), false);
  assert.deepEqual(flush(), ['say:You have none left. Buy more at the stall.']);
  b.sel = 'bamboo';
  assert.equal(b.buildAt(26 + O, 20 + O), false, 'not a prop');
  flush();

  // the preview says what the ghost shows
  core.inv.give('prop_crate');
  b.sel = 'prop_crate';
  assert.deepEqual(b.preview({ x: 28 + O, z: 20 + O }), { type: 'crate', rot: b.rot, ok: true });
  assert.deepEqual(b.preview({ x: 20 + O, z: 20 + O }), { type: 'crate', rot: b.rot, ok: false });
  assert.deepEqual(b.preview({ x: 22 + O, z: 20 + O }), { type: 'crate', rot: b.rot, ok: false }, 'vetoed by a guard');
  b.sel = 'bamboo';
  assert.equal(b.preview({ x: 28 + O, z: 20 + O }), null);
  b.sel = 'pickup';
  assert.deepEqual(b.preview({ x: 20 + O, z: 20 + O }), { pickup: true, ok: true });
  assert.deepEqual(b.preview({ x: 28 + O, z: 20 + O }), { pickup: true, ok: false });
  const stall = pr.add('stall', 19 + O, 18 + O, 0);
  assert.deepEqual(b.preview({ x: stall.x, z: stall.z }), { pickup: true, ok: false }, 'a fixed prop cannot be taken');
  assert.equal(world.isLand(28 + O, 20 + O), true);
}

function storing() {
  const { core, b, at, pr, flush } = boot({ crates: 0 });
  b.sel = 'pickup';
  assert.equal(b.buildAt(20 + O, 20 + O), false);
  assert.deepEqual(flush(), ['say:Nothing to pick up here.']);
  const crate = pr.add('crate', 20 + O, 20 + O, 0);
  flush();
  assert.equal(b.buildAt(20 + O, 20 + O), true);
  assert.deepEqual(flush(), ['remove:crate:bag', 'itemGain:prop_crate', 'ui', 'sfx:pickup', 'fx', 'say:Picked up crate.']);
  assert.equal(core.inv.count('prop_crate'), 1);
  assert.equal(pr.at(20 + O, 20 + O), null);

  const stall = pr.add('stall', 19 + O, 18 + O, 0);
  flush();
  assert.equal(b.pickUp(stall), false);
  assert.deepEqual(flush(), ['say:The merchant would miss their stall!']);
  assert.equal(pr.get(stall.id), stall);

  // a bridge cannot go while the player stands on it
  const bridge = pr.add('bridge', 25 + O, 15 + O, 0);
  flush();
  at.cell = { x: bridge.cells[1].x, z: bridge.cells[1].z };
  assert.equal(b.pickUp(bridge), false);
  assert.deepEqual(flush(), ['say:Step off the bridge first.']);
  at.cell = { x: 2, z: 2 };
  assert.equal(b.pickUp(bridge, { quiet: true }), true);
  assert.deepEqual(flush(), ['remove:bridge:bag', 'itemGain:prop_bridge', 'ui', 'sfx:pickup', 'fx']);
  assert.ok(crate.id > 0);
}

function rotating() {
  const { b, pr, flush } = boot();
  const a = pr.add('crate', 20 + O, 20 + O, 0);
  const id = a.id;
  flush();
  const r = b.rotateProp(a);
  assert.equal(r.id, id);
  assert.equal(r.rot, 1);
  assert.deepEqual(flush(), ['remove:crate:gone', 'place:crate:move']);
  assert.equal(pr.get(id), r);

  const stall = pr.add('stall', 19 + O, 18 + O, 0);
  flush();
  assert.equal(b.rotateProp(stall), false);
  assert.deepEqual(flush(), ['say:Hana likes her stall just where it is.']);

  // a long prop that does not fit turned stays as it was
  const torii = pr.add('torii', 20 + O, 30 + O, 0);
  const now = new Set(torii.cells.map((c) => `${c.x},${c.z}`));
  const extra = pr.cells('torii', 20 + O, 30 + O, 1).cells.find((c) => !now.has(`${c.x},${c.z}`));
  pr.add('crate', extra.x, extra.z, 0);
  flush();
  assert.equal(b.rotateProp(torii), false);
  assert.deepEqual(flush(), ['say:No room to rotate it here.']);
  assert.equal(pr.get(torii.id).rot, 0);
}

function moving() {
  const { core, b, pr, flush } = boot({ crates: 0 });
  const crate = pr.add('crate', 20 + O, 20 + O, 2);
  flush();
  b.toggle(true); flush();
  assert.equal(b.moveProp(crate), true);
  assert.deepEqual(flush(), ['remove:crate:bag', 'itemGain:prop_crate', 'ui', 'sfx:pickup', 'fx', 'ui']);
  assert.deepEqual([b.sel, b.rot, b.cursor, b.moving], ['prop_crate', 2, { x: 20 + O, z: 20 + O }, { type: 'crate', x: 20 + O, z: 20 + O, rot: 2, id: crate.id }]);
  assert.deepEqual(b.preview(b.cursor), { type: 'crate', rot: 2, ok: true });

  // drag it elsewhere and confirm: the placement counts as a move
  b.cursor = { x: 24 + O, z: 20 + O };
  assert.equal(b.confirm(), true);
  assert.deepEqual(flush().filter((x) => x.startsWith('place') || x.startsWith('say')), ['place:crate:move', 'say:Placed crate.']);
  assert.deepEqual([b.moving, b.cursor, b.sel], [null, null, 'pickup']);
  assert.equal(pr.at(24 + O, 20 + O).type, 'crate');
  assert.equal(b.confirm(), false, 'nothing to confirm');

  // cancel puts the prop back where it was, with its id
  const c2 = pr.at(24 + O, 20 + O);
  b.moveProp(c2); flush();
  b.cursor = { x: 30 + O, z: 20 + O };
  b.cancelPreview();
  assert.deepEqual(flush(), ['itemLoss:prop_crate', 'ui', 'place:crate:move', 'ui']);
  assert.equal(pr.at(24 + O, 20 + O).id, c2.id);
  assert.equal(core.inv.count('prop_crate'), 0);

  // cancel with the spot taken keeps the prop in the bag
  b.moveProp(pr.at(24 + O, 20 + O)); flush();
  pr.add('crate', 24 + O, 20 + O, 0, 0, { via: 'project' }); flush();
  b.cancelPreview();
  assert.deepEqual(flush(), ['ui']);
  assert.equal(core.inv.count('prop_crate'), 1);

  // leaving build mode drops the preview too
  b.sel = 'prop_crate'; b.cursor = { x: 4, z: 4 };
  b.toggle(false);
  assert.equal(b.cursor, null);
}

function ghost() {
  // the ghost view asks preview() for the tile: the cursor wins over the hover, which wins over the target
  const { b, pr } = boot();
  const shown = [], hid = [];
  const game = {
    core: { use: () => b }, ghost: { show: (...a) => shown.push(a), hide: () => hid.push(1) },
    cursor: { material: { color: { setHex: (c) => shown.push(['color', c]) } } },
    hoverTile: { x: 21 + O, z: 21 + O }, targetTile: () => ({ x: 22 + O, z: 22 + O }),
  };
  for (const [name, fn] of Object.entries(ghostView.facade)) game[name] = fn.bind(game);
  game.updateGhost();
  assert.deepEqual([shown.length, hid.length], [0, 1], 'hidden outside build mode');
  b.toggle(true);
  pr.add('crate', 21 + O, 21 + O, 0);
  game.updateGhost();
  assert.deepEqual(shown.pop(), ['color', 0x9fe08a], 'storing: the cursor tells whether there is a prop');
  game.hoverTile = null;
  game.updateGhost();
  assert.deepEqual(shown.pop(), ['color', 0xffffff]);
  b.sel = 'bamboo'; b.rot = 1;
  game.updateGhost();
  assert.equal(hid.length, 4, 'not a prop: hidden');
  b.sel = 'prop_crate';
  game.updateGhost();
  assert.deepEqual(shown.pop().slice(0, 4), ['crate', 22 + O, 22 + O, 1]);
  b.cursor = { x: 21 + O, z: 21 + O };
  game.updateGhost();
  assert.deepEqual(shown.pop(), ['crate', 21 + O, 21 + O, 1, false]);
}

export default function () {
  state();
  toggling();
  placing();
  storing();
  rotating();
  moving();
  ghost();
}

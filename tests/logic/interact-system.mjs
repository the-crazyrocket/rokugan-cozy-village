// The interact system in a strict core with the real systems around it: what a tile resolves to, the tap / action key / sweep paths, the queue
// and its limits, performing and using the tools, the events it emits for the UI (and their order), the filter that asks whether a card is open,
// the handlers that empty the queue or perform an arrival, and the Game facade.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import interact from '../../src/systems/interact.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import build from '../../src/systems/build.js';
import daily from '../../src/systems/daily.js';
import stats from '../../src/systems/stats.js';
import farming from '../../src/systems/farming.js';
import shrine from '../../src/systems/shrine.js';
import market from '../../src/systems/market.js';
import forage from '../../src/systems/forage.js';
import fishing from '../../src/systems/fishing.js';
import { installFacades } from '../../src/systems/install.js';
import { createCore } from '../../src/core/core.js';
import { PRIO } from '../../src/core/bus.js';
import { World, T } from '../../src/game/world.js';
import { HOTBAR } from '../../src/game/data.js';

const T0 = new Date(2026, 0, 15, 12).getTime();
const same = (a, b, msg = 'same') => assert.deepEqual(a, b, msg);
const SYSTEMS = [props, player, build, daily, stats, farming, shrine, market, forage, fishing, interact];

function boot({ rolls = [] } = {}) {
  const world = new World();
  const ui = { modal: false };
  const queue = [...rolls];
  const core = createCore({ strict: true, now: () => T0, mono: () => 1000, rng: () => (queue.length ? queue.shift() : 0.5) });
  core.provide('world', world);
  core.boot(SYSTEMS);
  core.bus.filter('ui.modalOpen', () => ui.modal, { priority: PRIO.VIEW });
  core.use('daily').ensure();
  const log = [];
  core.bus.onAny((payload, m) => log.push([m.name, payload]), { priority: PRIO.VIEW });
  const flush = () => log.splice(0).filter(([n]) => n !== 'place' && n !== 'remove').map(([n, p]) => (n === 'say' ? `say:${p.text}` : n === 'sfx' ? `sfx:${p.name}` : n === 'haptic' ? `haptic:${p.ms}` : n === 'invalidate' ? `inv:${p.what}`
    : n === 'openSheet' ? `sheet:${p.name}` : n === 'floatLabel' ? `label:${p.text}@${p.x},${p.z}` : n === 'buildSelect' ? `select:${p.index}` : n === 'itemGain' || n === 'itemLoss' ? `${n}:${p.item}`
      : n === 'fx' ? `fx:${p.opts?.n}` : n === 'harvest' ? `harvest:${p.crop}x${p.n}` : n === 'forage' ? `forage:${p.item}` : n));
  core.use('daily').state.forage = []; // no wild greens until a test puts one down
  return {
    core, world, ui, log, flush, i: core.use('interact'), pl: core.use('player'), st: core.use('player').state, pr: core.use('props'),
    fa: core.use('farming'), fi: core.use('fishing'), fo: core.use('forage'), b: core.use('build'), mk: core.use('market'), sh: core.use('shrine'), day: core.use('daily'),
  };
}

/** The top-left corner of an n x n block of plain grass (no paths, sand or water). */
function meadow(world, n = 8) {
  for (let z = 0; z <= world.h - n; z++) for (let x = 0; x <= world.w - n; x++) {
    let ok = true;
    for (let dz = 0; dz < n && ok; dz++) for (let dx = 0; dx < n && ok; dx++) ok = world.get(x + dx, z + dz) === T.GRASS;
    if (ok) return { x, z };
  }
  throw new Error('no meadow');
}

/** A land tile with fresh water on its east side for three tiles: the fishing spot. */
function shore(world) {
  for (let z = 1; z < world.h - 1; z++) for (let x = 1; x < world.w - 4; x++) {
    if (world.isLand(x, z) && [1, 2, 3].every((k) => world.isWater(x + k, z) && world.isFresh(x + k, z))) return { x, z };
  }
  throw new Error('no shore');
}

const stand = (t, x, z) => t.st.pos.set(x + 0.5, 0, z + 0.5);
const ripeCrop = (t, x, z, extra = {}) => { const c = { type: 'rice', x, z, progress: 3, last: T0, wet: false, ...extra }; t.fa.farm.set(z * t.world.w + x, c); return c; };

function needs() {
  const t = boot();
  same([...t.core.systems.get('interact').spec.needs], ['props', 'player', 'build', 'farming', 'fishing', 'forage', 'market', 'shrine']);
  assert.equal(t.i.slot, 0);
  same(t.i.queue, []);
  assert.deepEqual([t.i.cooldown, t.i.hover], [0, null]);
  assert.equal(t.i.tool(), 'hand');
  // two cores, two queues
  const other = boot();
  assert.notEqual(other.i.queue, t.i.queue);
  t.i.queue.push({ kind: 'x' });
  same(other.i.queue, []);
}

function resolve() {
  const t = boot();
  const m = meadow(t.world);
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });
  const kind = (tile) => t.i.resolve(tile).kind;

  // plain ground walks; the hoe tills grass and sand, not paths
  assert.equal(kind(at(0, 0)), 'walk');
  t.i.slot = HOTBAR.indexOf('hoe');
  same(t.i.resolve(at(0, 0)), { kind: 'till', t: at(0, 0), icon: 'icons:hoe', label: 'Till' });
  t.world.set(m.x, m.z, T.PATH);
  assert.equal(kind(at(0, 0)), 'walk');
  t.world.set(m.x, m.z, T.SAND);
  assert.equal(kind(at(0, 0)), 'till');
  t.i.slot = 0;

  // soil: no seed, the can, the seed in hand, the last seed used, any seed
  t.world.set(m.x + 1, m.z, T.SOIL);
  same(t.i.resolve(at(1, 0)), { kind: 'noseed', t: at(1, 0) });
  t.core.inv.give('seed_daikon', 2);
  same(t.i.resolve(at(1, 0)), { kind: 'plant', t: at(1, 0), seed: 'seed_daikon', icon: t.core.content.itemMap().get('seed_daikon').icon, label: 'Plant' });
  t.core.inv.give('seed_rice', 2);
  t.i.slot = HOTBAR.indexOf('seed_rice');
  assert.equal(t.i.resolve(at(1, 0)).seed, 'seed_rice');
  t.i.slot = 0;
  t.fa.lastSeed = 'seed_rice';
  assert.equal(t.i.resolve(at(1, 0)).seed, 'seed_rice');
  t.i.slot = HOTBAR.indexOf('can');
  same(t.i.resolve(at(1, 0)), { kind: 'water', t: at(1, 0), icon: 'icons:can', label: 'Water' });
  t.i.slot = 0;

  // crops: thirsty, watered (inspect), ripe
  const c = ripeCrop(t, m.x + 2, m.z, { progress: 1, wet: false });
  t.world.set(m.x + 2, m.z, T.SOIL);
  assert.equal(kind(at(2, 0)), 'water');
  c.wet = true;
  same(t.i.resolve(at(2, 0)), { kind: 'inspect', t: at(2, 0), crop: c });
  c.progress = 3;
  same(t.i.resolve(at(2, 0)), { kind: 'harvest', t: at(2, 0), icon: t.core.content.itemMap().get('rice').icon, label: 'Harvest' });

  // wild greens beat the tile under them; a prop is inspected, the shrine is approached from the front, the stall is the shop
  t.day.state.forage = [{ x: m.x + 3, z: m.z, item: 'wildflower', taken: false }];
  assert.equal(kind(at(3, 0)), 'forage');
  t.day.state.forage[0].taken = true;
  t.pr.add('crate', m.x + 4, m.z, 0);
  same(t.i.resolve(at(4, 0)).kind, 'inspect');
  assert.equal(t.i.resolve(at(4, 0)).prop.type, 'crate');
  const sh = t.pr.add('shrine_old', m.x + 5, m.z + 3, 0);
  same(t.i.resolve({ x: sh.x, z: sh.z }), { kind: 'shrine', t: { x: sh.x, z: sh.z + 1 }, icon: 'icons2:bell', label: 'Shrine' });
  const stall = t.pr.add('stall', m.x, m.z + 3, 0);
  assert.equal(kind({ x: stall.x, z: stall.z }), 'shop');
  t.mk.cell = at(6, 6);
  same(t.i.resolve(at(6, 6)), { kind: 'shop', t: at(6, 6), icon: 'icons:koku', label: 'Shop' });

  // water is fished unless a bridge or the pier is over it
  const s = shore(t.world);
  same(t.i.resolve({ x: s.x + 1, z: s.z }), { kind: 'fish', t: { x: s.x + 1, z: s.z }, icon: 'icons:rod', label: 'Fish' });
  t.pr.add('bridge', 25, 15, 0);
  assert.equal(kind({ x: 25, z: 15 }), 'walk', 'the bridge is for walking on');
}

function slots() {
  const t = boot();
  t.i.selectSlot(3);
  assert.equal(t.i.slot, 3);
  assert.equal(t.i.tool(), 'rod');
  same(t.flush(), ['inv:ui']);
  t.i.selectSlot(HOTBAR.length);
  t.i.selectSlot(-1);
  assert.equal(t.i.slot, 3);
  same(t.flush(), []);

  // choosing a slot drops a cast line
  const s = shore(t.world);
  stand(t, s.x, s.z);
  t.st.facing = Math.PI / 2;
  t.fi.start({ x: s.x + 1, z: s.z });
  assert.ok(t.fi.cast);
  t.flush();
  t.i.selectSlot(0);
  assert.equal(t.fi.cast, null);
  same(t.flush(), ['bubble', 'inv:ui']);

  // in build mode the choice belongs to the build bar
  t.b.toggle(true);
  t.flush();
  t.i.selectSlot(2);
  assert.equal(t.i.slot, 0);
  same(t.flush(), ['select:2']);
}

function tapping() {
  const t = boot();
  const m = meadow(t.world);
  stand(t, m.x, m.z);
  const far = { x: m.x + 5, z: m.z + 5 };

  // tapping ground walks there and forgets the queue and any waiting action
  t.i.queue.push({ kind: 'plant', t: { x: 1, z: 1 } });
  t.st.pending = { kind: 'fish', t: { x: 2, z: 2 } };
  same(t.i.tap(far), { kind: 'walk', t: far });
  same(t.i.queue, []);
  assert.equal(t.st.pending, null);
  assert.ok(t.st.path.length > 0 && t.st.dest.x === far.x);
  same(t.flush(), ['queueChange']);

  // a tile that cannot be walked on: walk next to it
  t.pr.add('crate', m.x + 2, m.z + 2, 0);
  t.flush();
  t.i.tap({ x: m.x + 2, z: m.z + 2 });
  same(t.flush(), [`label:Crate@${m.x + 2},${m.z + 2}`, 'queueChange'], 'a prop is only inspected');
  t.world.set(m.x + 6, m.z, T.WATER);
  t.i.tap({ x: m.x + 6, z: m.z });
  assert.ok(t.st.path, 'walking next to the water');
  t.flush();

  // inspecting says so with a floating label, in the tile's own words
  const c = ripeCrop(t, m.x + 3, m.z + 1, { progress: 1, wet: true });
  t.world.set(m.x + 3, m.z + 1, T.SOIL);
  t.i.tap({ x: m.x + 3, z: m.z + 1 });
  same(t.flush(), [`label:Rice · ready in 18 min · watered@${m.x + 3},${m.z + 1}`, 'queueChange']);
  c.progress = 3;
  t.i.inspect({ kind: 'inspect', t: { x: m.x + 3, z: m.z + 1 } });
  same(t.flush(), [`label:Rice · ready!@${m.x + 3},${m.z + 1}`]);
  t.i.inspect({ kind: 'noseed', t: { x: 1, z: 1 } });
  same(t.flush(), ['label:No seeds — Hana sells them@1,1']);
  t.i.inspect({ kind: 'inspect', t: { x: m.x, z: m.z } });
  t.i.inspect({ kind: 'inspect', t: { x: m.x + 2, z: m.z + 2 } });
  t.world.set(m.x + 1, m.z, T.SOIL);
  t.i.inspect({ kind: 'inspect', t: { x: m.x + 1, z: m.z } });
  t.i.inspect({ kind: 'inspect', t: { x: m.x + 6, z: m.z } });
  t.i.inspect({ kind: 'inspect', t: { x: 0, z: 0 } });
  t.day.state.forage = [{ x: m.x + 4, z: m.z, item: 'warabi', taken: false }];
  t.i.inspect({ kind: 'inspect', t: { x: m.x + 4, z: m.z } });
  same(t.flush(), [`label:Soft grass@${m.x},${m.z}`, `label:Crate@${m.x + 2},${m.z + 2}`, `label:Tilled soil@${m.x + 1},${m.z}`, `label:The sea@${m.x + 6},${m.z}`, 'label:The sea@0,0', `label:Warabi shoots · tap to pick@${m.x + 4},${m.z}`]);
  const stone = t.pr.add('stone', m.x + 5, m.z + 5, 0);
  t.i.inspect({ kind: 'inspect', t: { x: stone.x, z: stone.z } });
  t.sh.awake.push('ebisu');
  t.i.inspect({ kind: 'inspect', t: { x: stone.x, z: stone.z } });
  const well = t.pr.add('well', m.x + 2, m.z + 5, 0);
  t.i.inspect({ kind: 'inspect', t: { x: well.x, z: well.z } });
  same(t.flush().filter((l) => l.startsWith('label')).map((l) => l.replace(/@.*/, '')), ['label:A mossy stone, bound with rope. Something sleeps inside.', 'label:A warm hum comes from the stone… Daikoku is stirring.', 'label:The well water is cool and clear.']);

  // an empty label is not shown
  t.world.set(m.x + 7, m.z, 99);
  t.i.inspect({ kind: 'inspect', t: { x: m.x + 7, z: m.z } });
  same(t.flush(), []);
}

function queueing() {
  const t = boot();
  const m = meadow(t.world);
  stand(t, m.x, m.z);
  t.core.inv.give('seed_rice', 3);
  for (let k = 1; k <= 4; k++) t.world.set(m.x + k, m.z + 2, T.SOIL);
  const plant = (k) => t.i.resolve({ x: m.x + k, z: m.z + 2 });

  // idle: the action starts at once (walking over first), nothing is queued
  assert.equal(t.i.isBusy(), false);
  assert.equal(t.i.enqueue(plant(1)), true);
  same(t.i.queue, []);
  assert.equal(t.i.isBusy(), true, 'walking over to it');
  same(t.st.pending && t.st.pending.t, { x: m.x + 1, z: m.z + 2 });

  // busy: further ones wait; the same tile twice (waiting or on its way) does not
  assert.equal(t.i.enqueue(plant(2)), true);
  assert.equal(t.i.enqueue(plant(2)), false);
  assert.equal(t.i.enqueue(plant(1)), false);
  same(t.i.queue.map((a) => a.t.x - m.x), [2]);

  // the queue is capped, with a word about it
  t.flush();
  t.i.queue.length = 0;
  for (let k = 0; k < 24; k++) t.i.queue.push({ kind: 'plant', seed: 'seed_rice', t: { x: 100 + k, z: 0 } });
  assert.equal(t.i.enqueue(plant(3)), false);
  same(t.flush(), ['say:That’s plenty to do for now!']);

  // taking the controls drops the queue, so does build mode; a path-following move does not
  t.core.bus.emit('playerMove', { manual: false });
  assert.equal(t.i.queue.length, 24);
  t.core.bus.emit('playerMove', { manual: true });
  same(t.i.queue, []);
  t.i.queue.push({ kind: 'x', t: { x: 1, z: 1 } });
  t.b.toggle(true);
  same(t.i.queue, []);
  t.flush();
}

function sweeping() {
  const t = boot();
  const m = meadow(t.world);
  stand(t, m.x, m.z);
  for (let k = 0; k < 5; k++) t.world.set(m.x + k, m.z + 3, T.SOIL);
  const row = (k) => ({ x: m.x + k, z: m.z + 3 });

  // nothing to plant with: soil is not swept
  assert.equal(t.i.sweep(row(0)), null);
  t.core.inv.give('seed_rice', 2);
  const first = t.i.sweep(row(0));
  assert.equal(first.kind, 'plant');
  assert.ok(t.st.pending, 'the first one starts');
  // seeds bound the plantings: the one on its way and the queue count
  assert.equal(t.i.sweep(row(1)).kind, 'plant');
  assert.equal(t.i.sweep(row(2)), null, 'two seeds, two plantings');
  same(t.i.queue.map((a) => a.t.x - m.x), [1]);
  assert.equal(t.i.sweep(row(1)), null, 'already queued');
  // plain ground is not swept; a crop's tile is, only when it is ripe or thirsty
  assert.equal(t.i.sweep({ x: m.x + 6, z: m.z }), null);
  const c = ripeCrop(t, m.x + 3, m.z + 3);
  assert.equal(t.i.sweep(row(3)).kind, 'harvest');
  c.progress = 1;
  assert.equal(t.i.sweep(row(3)), null, 'the same tile is already queued');
  // not while fishing, not in build mode, not with a card open
  t.i.queue.length = 0;
  c.progress = 1; c.wet = false;
  t.ui.modal = true;
  assert.equal(t.i.sweep(row(3)), null);
  t.ui.modal = false;
  assert.equal(t.i.sweep(row(3)).kind, 'water');
  t.b.toggle(true);
  assert.equal(t.i.sweep(row(3)), null);
}

function pump() {
  const t = boot();
  const m = meadow(t.world);
  stand(t, m.x, m.z);
  const a = { kind: 'till', t: { x: m.x + 1, z: m.z } };
  t.world.set(m.x + 1, m.z, T.GRASS);

  // the cooldown runs down; the next queued action starts only when the player is free and no card is open
  t.i.queue.push(a);
  t.i.cooldown = 0.5;
  t.i.tick(0.2);
  assert.equal(t.i.queue.length, 1);
  assert.ok(Math.abs(t.i.cooldown - 0.3) < 1e-9);
  t.i.tick(0.2);
  assert.equal(t.i.queue.length, 1, 'still cooling down');
  t.ui.modal = true;
  t.i.tick(1);
  assert.equal(t.i.cooldown, 0);
  assert.equal(t.i.queue.length, 1, 'a card is open');
  t.ui.modal = false;
  t.st.path = [{ x: 1, y: 1 }];
  t.i.tick(0.1);
  assert.equal(t.i.queue.length, 1, 'still walking');
  t.st.path = null;
  t.st.pending = { kind: 'x', t: { x: 1, z: 1 } };
  t.i.tick(0.1);
  assert.equal(t.i.queue.length, 1, 'an action is waiting');
  t.st.pending = null;
  t.i.tick(0.1);
  same(t.i.queue, []);
  assert.equal(t.i.cooldown, 0.3, 'the action was performed (next to us) and the cooldown is back');
  assert.equal(t.world.get(m.x + 1, m.z), T.SOIL);
  assert.equal(t.i.isBusy(), true, 'cooling down counts as busy');
  t.i.tick(0.3);
  assert.equal(t.i.isBusy(), false);
}

function performing() {
  const t = boot();
  const m = meadow(t.world);
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });
  stand(t, m.x, m.z);
  t.flush();

  // the cards
  t.i.perform({ kind: 'shop', t: at(1, 0) });
  t.i.perform({ kind: 'shrine', t: at(1, 0) });
  same(t.flush(), ['sheet:shop', 'sheet:shrine']);
  assert.equal(t.i.cooldown, 0.3);

  // till (a green under the hoe is picked first), water, plant (and remember the seed)
  t.day.state.forage = [{ x: m.x + 1, z: m.z, item: 'wildflower', taken: false }];
  t.i.perform({ kind: 'till', t: at(1, 0) });
  assert.equal(t.world.get(m.x + 1, m.z), T.SOIL);
  const out = t.flush();
  const order = ['say:Found wildflowers!', 'forage:wildflower', 'say:Tilled the earth.'].map((l) => out.indexOf(l));
  assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `the green first: ${out}`);
  t.i.perform({ kind: 'water', t: at(1, 0) });
  same(t.flush().filter((l) => l.startsWith('say')), ['say:Watered the soil.']);
  t.core.inv.give('seed_tea', 1);
  t.i.perform({ kind: 'plant', t: at(1, 0), seed: 'seed_tea' });
  assert.equal(t.fa.lastSeed, 'seed_tea');
  assert.equal(t.fa.crop(m.x + 1, m.z).type, 'tea');
  assert.ok(t.flush().includes('say:Planted tea.'));

  // harvest only when ripe
  t.i.perform({ kind: 'harvest', t: at(1, 0) });
  same(t.flush(), []);
  t.fa.crop(m.x + 1, m.z).progress = 3;
  t.i.perform({ kind: 'harvest', t: at(1, 0) });
  const h = t.flush();
  assert.ok(h[h.length - 1].startsWith('harvest:tea'), 'the harvest event is the last thing');
  assert.ok(h.some((l) => l.startsWith('say:Harvested')));

  // forage
  t.day.state.forage = [{ x: m.x + 2, z: m.z, item: 'warabi', taken: false }];
  t.i.perform({ kind: 'forage', t: at(2, 0) });
  assert.ok(t.flush().includes('forage:warabi'));

  // fishing takes the rod in hand and casts
  const s = shore(t.world);
  stand(t, s.x, s.z);
  t.st.facing = Math.PI / 2;
  t.i.perform({ kind: 'fish', t: { x: s.x + 1, z: s.z } });
  assert.equal(t.i.tool(), 'rod');
  assert.ok(t.fi.cast);
  assert.ok(t.flush().includes('say:Cast into fresh water... wait for a bite!'));
  // an unknown kind does nothing but cool down
  t.i.cooldown = 0;
  t.i.perform({ kind: 'walk', t: at(0, 0) });
  assert.equal(t.i.cooldown, 0.3);
}

function startAction() {
  const t = boot();
  const m = meadow(t.world);
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });
  t.world.set(m.x + 3, m.z + 3, T.GRASS);
  t.core.inv.give('seed_rice', 1);
  t.world.set(m.x + 3, m.z + 3, T.SOIL);

  // next to the tile: face it and do it now
  stand(t, m.x + 2, m.z + 3);
  t.i.startAction({ kind: 'plant', seed: 'seed_rice', t: at(3, 3) });
  assert.equal(t.fa.crop(m.x + 3, m.z + 3).type, 'rice');
  assert.equal(t.st.path, null);
  assert.ok(Math.abs(t.st.facing - Math.PI / 2) < 1e-9, 'turned to face it');

  // away from it: walk to a stand tile with the action waiting; arriving performs it
  stand(t, m.x, m.z);
  t.world.set(m.x + 5, m.z + 5, T.SOIL);
  t.core.inv.give('seed_rice', 1);
  const act = { kind: 'plant', seed: 'seed_rice', t: at(5, 5) };
  t.i.startAction(act);
  assert.equal(t.st.pending, act);
  assert.ok(t.st.path && t.st.path.length);
  for (let n = 0; n < 400 && t.st.path; n++) t.pl.move(0.05, null);
  assert.equal(t.st.path, null);
  assert.equal(t.fa.crop(m.x + 5, m.z + 5)?.type, 'rice', 'arrived and planted through the arrive event');
  assert.equal(t.st.pending, null);

  // the stand tiles: next to it, the nearest first, never the tile itself or water
  stand(t, m.x, m.z);
  const tiles = t.i.standTiles({ kind: 'harvest', t: at(3, 3) });
  assert.equal(tiles.length, 8);
  assert.ok(tiles.every((s) => Math.max(Math.abs(s.x - m.x - 3), Math.abs(s.z - m.z - 3)) === 1));
  assert.ok(tiles.every((s, k) => !k || tiles[k - 1].d <= s.d));
  assert.deepEqual({ x: tiles[0].x, z: tiles[0].z }, at(3, 2), 'the straight side nearest the player (corners cost a little more)');
  const fishing2 = t.i.standTiles({ kind: 'fish', t: at(3, 3) });
  assert.equal(fishing2.length, 24, 'two tiles away is fine for fishing');

  // nowhere to stand: say so
  t.flush();
  for (const s of fishing2) t.pr.add('crate', s.x, s.z, 0);
  stand(t, m.x, m.z);
  const lone = at(3, 3);
  t.i.startAction({ kind: 'harvest', t: lone });
  same(t.flush().filter((l) => l.startsWith('say')), ["say:Can't reach that spot."]);
  t.i.goAndAct(at(4, 4));
}

function actionKey() {
  const t = boot();
  const m = meadow(t.world);
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });
  stand(t, m.x, m.z);
  t.st.facing = Math.PI / 2; // east: the tile in front is m.x + 1
  t.flush();

  // a farm action in front: queue and walk dropped, the player turns, it happens
  t.world.set(m.x + 1, m.z, T.SOIL);
  t.core.inv.give('seed_rice', 1);
  t.i.queue.push({ kind: 'x', t: at(9, 9) });
  t.st.path = [{ x: 1, y: 1 }];
  t.i.action();
  same(t.i.queue, []);
  assert.equal(t.st.path, null);
  assert.equal(t.fa.crop(m.x + 1, m.z).type, 'rice');
  t.flush();

  // something to look at in front: inspect, no action
  t.fa.crop(m.x + 1, m.z).wet = true;
  t.i.action();
  same(t.flush(), [`label:Rice · ready in 30 min · watered@${m.x + 1},${m.z}`]);
  assert.equal(t.i.cooldown > 0, true);

  // plain ground in front: the tool in hand is used on it (the hand says what is there)
  t.world.set(m.x + 1, m.z, T.GRASS);
  t.fa.farm.clear();
  t.pr.add('crate', m.x + 1, m.z, 0);
  t.i.action();
  same(t.flush().filter((l) => l.startsWith('label')), [`label:Crate@${m.x + 1},${m.z}`]);

  // a card open: nothing happens
  t.ui.modal = true;
  t.i.action();
  t.i.tap(at(3, 3));
  same(t.flush(), []);
  t.ui.modal = false;

  // a line out: both the key and a tap reel it in
  const s = shore(t.world);
  stand(t, s.x, s.z);
  t.st.facing = Math.PI / 2;
  t.fi.start({ x: s.x + 1, z: s.z });
  t.flush();
  t.i.action();
  assert.equal(t.fi.cast, null);
  assert.ok(t.flush().includes('say:Too early — the fish swam away.'));
  t.fi.start({ x: s.x + 1, z: s.z });
  t.flush();
  assert.equal(t.i.tap(at(3, 3)), null);
  assert.equal(t.fi.cast, null);
}

function buildMode() {
  const t = boot();
  const m = meadow(t.world);
  t.core.inv.give('prop_crate', 5);
  stand(t, m.x, m.z);
  t.st.facing = Math.PI / 2;
  t.b.toggle(true);
  t.b.sel = 'prop_crate';
  t.flush();

  // a tap builds on that tile; the action key on the hover tile, else the one in front; with a preview it confirms the preview
  assert.equal(t.i.tap({ x: m.x + 3, z: m.z + 3 }), null);
  assert.ok(t.pr.at(m.x + 3, m.z + 3));
  t.i.hover = { x: m.x + 4, z: m.z + 4 };
  t.i.action();
  assert.ok(t.pr.at(m.x + 4, m.z + 4), 'the hover tile');
  t.i.hover = null;
  t.i.action();
  assert.ok(t.pr.at(m.x + 1, m.z), 'the tile in front');
  t.b.cursor = { x: m.x + 6, z: m.z + 6 };
  t.i.action();
  assert.ok(t.pr.at(m.x + 6, m.z + 6), 'the preview is confirmed');
  assert.equal(t.b.cursor, null);
  t.b.sel = 'pickup';
  t.b.cursor = { x: 1, z: 1 };
  t.i.action();
  assert.equal(t.pr.at(m.x + 1, m.z), null, 'storing ignores the preview and uses the target');
}

function arrivals() {
  const t = boot();
  const m = meadow(t.world);
  t.world.set(m.x + 1, m.z, T.GRASS);
  stand(t, m.x, m.z);
  t.i.slot = HOTBAR.indexOf('hoe');
  t.flush();
  t.core.bus.emit('arrive', { action: { kind: 'till', t: { x: m.x + 1, z: m.z } } });
  assert.equal(t.world.get(m.x + 1, m.z), T.SOIL);
  assert.equal(t.i.cooldown, 0.3);
  assert.ok(t.flush().includes('say:Tilled the earth.'));
}

function tools() {
  const t = boot();
  const m = meadow(t.world);
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });
  stand(t, m.x, m.z);
  t.flush();
  const says = () => t.flush().filter((l) => l.startsWith('say'));

  // the hand: crops, greens, the shrine, props
  const c = ripeCrop(t, m.x + 1, m.z, { progress: 1, wet: false });
  t.world.set(m.x + 1, m.z, T.SOIL);
  t.i.useTool(at(1, 0));
  same(says(), ['say:Rice: ready in 24 min · water me!']);
  c.wet = true;
  t.i.useTool(at(1, 0));
  same(says(), ['say:Rice: ready in 18 min · watered']);
  t.fa.farm.clear();
  t.day.state.forage = [{ x: m.x + 2, z: m.z, item: 'wildflower', taken: false }];
  t.i.useTool(at(2, 0));
  assert.ok(says().includes('say:Found wildflowers!'));
  t.pr.add('crate', m.x + 3, m.z, 0);
  t.i.useTool(at(3, 0));
  same(says(), ['say:Crate. Use build mode (B) to move it.']);
  const stall = t.pr.add('stall', m.x, m.z + 3, 0);
  t.i.useTool({ x: stall.x, z: stall.z });
  same(t.flush(), ['sheet:shop']);
  const sh = t.pr.add('shrine_old', m.x + 4, m.z + 3, 0);
  t.i.useTool({ x: sh.x, z: sh.z });
  same(t.flush(), ['sheet:shrine']);
  t.mk.cell = at(6, 6);
  t.i.useTool(at(6, 6), 'can');
  same(t.flush(), ['sheet:shop'], 'the merchant is never watered');

  // the well: only the can may use it; any ripe crop is harvested, unless watering
  const well = t.pr.add('well', m.x + 5, m.z, 0);
  t.i.useTool({ x: well.x, z: well.z });
  same(says(), ['say:The well water is cool and clear.']);
  t.i.useTool({ x: well.x, z: well.z }, 'can');
  same(says(), ['say:Your watering can never runs dry here. ♪']);
  const r = ripeCrop(t, m.x + 1, m.z + 1);
  t.world.set(m.x + 1, m.z + 1, T.SOIL);
  t.i.useTool(at(1, 1), 'can');
  assert.equal(r.wet, true, 'the can on a ripe crop waters it');
  t.flush();
  t.i.useTool(at(1, 1), 'rod');
  assert.equal(t.fa.crop(m.x + 1, m.z + 1), undefined, 'any other tool harvests it');
  assert.ok(t.flush().some((l) => l.startsWith('harvest:rice')));

  // the hoe, the can, the rod and a seed
  t.i.useTool(at(1, 2), 'hoe');
  t.i.useTool(at(1, 2), 'hoe');
  same(says(), ['say:Tilled the earth.', 'say:Already tilled. Plant some seeds!']);
  t.i.useTool(at(1, 2), 'can');
  same(says(), ['say:Watered the soil.']);
  t.core.inv.give('seed_daikon', 1);
  t.i.useTool(at(1, 2), 'seed_daikon');
  same(says(), ['say:Planted daikon.']);
  t.i.useTool(at(1, 2), 'seed_daikon');
  same(says(), ['say:Something is already growing here.']);
  t.i.useTool(at(1, 2), 'rod');
  same(says(), ['say:Face the water to cast your line.']);
  t.i.slot = HOTBAR.indexOf('hoe');
  t.i.useTool(at(2, 2));
  same(says(), ['say:Tilled the earth.'], 'the tool in hand is the default');
}

function modalFilter() {
  // nobody answering means no card is open; a view that says yes wins over one that says no
  const core = createCore({ strict: true, now: () => T0, mono: () => 0 });
  core.provide('world', new World());
  core.boot(SYSTEMS);
  assert.equal(core.bus.apply('ui.modalOpen', false), false);
  core.bus.filter('ui.modalOpen', (open) => open || true, { priority: PRIO.VIEW });
  const i = core.use('interact');
  const m = meadow(core.world);
  assert.equal(i.tap({ x: m.x, z: m.z }), null);
  assert.equal(i.sweep({ x: m.x, z: m.z }), null);
}

function facade() {
  const core = createCore({ strict: true, now: () => T0, mono: () => 0 });
  core.provide('world', new World());
  core.boot(SYSTEMS);
  const game = { core };
  installFacades(game, SYSTEMS);
  const i = core.use('interact');
  assert.equal(game.slot, 0);
  game.slot = 4;
  assert.equal(i.slot, 4);
  assert.equal(game.tool, 'seed_rice');
  const q = [];
  game.queue = q;
  assert.equal(i.queue, q);
  game.actionCooldown = 4;
  assert.equal(i.cooldown, 4);
  assert.equal(game.isBusy(), true);
  game.hoverTile = { x: 1, z: 2 };
  same(i.hover, { x: 1, z: 2 });
  game.actionCooldown = 0;
  assert.equal(game.isBusy(), false);
  for (const name of ['selectSlot', 'resolve', 'isBusy', 'action', 'clickTile', 'tap', 'enqueue', 'sweepTile', 'inspect', 'standTiles', 'startAction', 'perform', 'goAndAct', 'useTool']) {
    assert.equal(typeof game[name], 'function', name);
  }
  const m = meadow(core.world);
  assert.deepEqual(game.resolve(m), { kind: 'walk', t: m });
  // the tap the old way: clickTile is tap
  assert.deepEqual(game.clickTile(m), { kind: 'walk', t: m });
}

export default function () {
  needs();
  resolve();
  slots();
  tapping();
  queueing();
  sweeping();
  pump();
  performing();
  startAction();
  actionKey();
  buildMode();
  arrivals();
  tools();
  modalFilter();
  facade();
}

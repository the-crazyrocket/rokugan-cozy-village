// S7: the central switches are registries. What the real systems register (resolvers with the priorities of section 3.2, actions, tools, hotbar,
// keys), how a made-up extra entry slots in (a resolver that wins or loses, a tool, an action, a hotbar entry, a key), and that the lint
// notices two resolvers with the same priority.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { systems } from '../../src/systems/index.js';
import { createCore } from '../../src/core/core.js';
import { PRIO } from '../../src/core/bus.js';
import { World, T } from '../../src/game/world.js';
import { lintCore } from '../lib/archlint.mjs';

const T0 = new Date(2026, 0, 15, 12).getTime();
const same = (a, b, msg) => assert.deepEqual(a, b, msg);

function boot() {
  const world = new World();
  const core = createCore({ strict: true, now: () => T0, mono: () => 1000, rng: () => 0.5 });
  core.provide('world', world);
  core.boot(systems);
  core.bus.filter('ui.modalOpen', () => false, { priority: PRIO.VIEW });
  core.use('daily').ensure();
  core.use('daily').state.forage = [];
  const log = [];
  core.bus.onAny((p, m) => log.push([m.name, p]), { priority: PRIO.VIEW });
  return { core, world, log, i: core.use('interact'), pl: core.use('player'), st: core.use('player').state, pr: core.use('props'), fa: core.use('farming') };
}

function meadow(world, n = 8) {
  for (let z = 0; z <= world.h - n; z++) for (let x = 0; x <= world.w - n; x++) {
    let ok = true;
    for (let dz = 0; dz < n && ok; dz++) for (let dx = 0; dx < n && ok; dx++) ok = world.get(x + dx, z + dz) === T.GRASS;
    if (ok) return { x, z };
  }
  throw new Error('no meadow');
}

const stand = (t, x, z) => t.st.pos.set(x + 0.5, 0, z + 0.5);

function resolvers() {
  const t = boot();
  const r = t.core.resolvers.all();
  same(r.map((e) => [e.id, e.priority, e.owner]), [
    ['shop', 100, 'market'], ['villager', 95, 'villagers'], ['visitor', 94, 'visitors'], ['bug', 93, 'bugs'], ['shrine', 90, 'shrine'], ['forage', 80, 'forage'], ['gather', 75, 'gather'], ['crop', 70, 'farming'],
    ['forestry', 67, 'trees'], ['terraform', 65, 'terraform'], ['reclaim', 64, 'reclaim'], ['sapling', 61, 'trees'], ['soil', 60, 'farming'], ['pond-plant', 55, 'farming'], ['fish', 50, 'fishing'], ['projects', 46, 'projects'], ['workbench', 44, 'craft'], ['mill', 43, 'kitchen'], ['shake', 42, 'gather'], ['kitchen', 41, 'kitchen'], ['prop-inspect', 40, 'props'], ['till', 30, 'farming'],
  ], 'the converted branches of Game.resolve, each owned by the system it belongs to');
  same(lintCore(t.core), []);
}

function extraResolvers() {
  const t = boot();
  const m = meadow(t.world);
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });
  const asked = [];
  const wp = t.core.as('wp99');
  const add = (id, priority, when) => wp.resolvers.add({ id, priority, fn: (tile, ix) => { asked.push(id); return when(tile, ix) ? { kind: id, t: tile } : null; } });

  // the crate (inspect, 40): a resolver at 45 beats it, one at 35 loses to it
  t.pr.add('crate', m.x, m.z, 0);
  add('low', 35, (tile) => tile.x === m.x);
  assert.equal(t.i.resolve(at(0, 0)).kind, 'inspect', 'the lower resolver loses');
  same(asked, [], 'and is not even asked');
  add('high', 45, (tile) => tile.x === m.x);
  assert.equal(t.i.resolve(at(0, 0)).kind, 'high', 'the higher one wins');
  same(asked, ['high']);

  // above the shop, nothing below is even asked; a null answer falls through to the next one down
  asked.length = 0;
  t.world.set(m.x + 1, m.z, T.SOIL);
  add('top', 101, (tile) => tile.x === m.x + 5);
  assert.equal(t.i.resolve(at(1, 0)).kind, 'noseed', 'the soil answers when nobody above does');
  same(asked, ['top'], 'soil (60) answered before the made-up 45 and 35 were asked');
  assert.equal(t.i.resolve(at(5, 0)).kind, 'top');
  t.pr.add('stall', m.x, m.z + 4, 0);
  assert.equal(t.i.resolve(at(0, 4)).kind, 'shop');
  t.core.resolvers.remove('top');
  assert.equal(t.i.resolve(at(5, 0)).kind, 'walk', 'with every resolver silent the answer is walk');

  // the second argument is the interact api: the tool in hand
  let tool = null;
  add('probe', 32, (tile, ix) => { tool = ix.tool(); return false; });
  t.i.resolve(at(6, 6));
  assert.equal(tool, 'seed_rice');
  t.i.setKit('dig');
  t.i.resolve(at(6, 6));
  assert.equal(tool, 'hoe');
  assert.equal(t.i.resolve(at(6, 6)).kind, 'till', 'till (30) still answers, after the probe (32) said no');
  t.i.setKit('play');

  // the lint: two resolvers on one priority
  add('twin', 40, () => false);
  const dup = lintCore(t.core).map((v) => v.msg);
  assert.equal(dup.length, 1);
  assert.match(dup[0], /resolver priority 40 is used by 'prop-inspect' and 'twin'/);
  assert.throws(() => wp.resolvers.add({ id: 'low', priority: 1, fn: () => null }), /already registered/);
}

function hotbar() {
  const t = boot();
  const all = t.core.hotbar.all();
  // the dig kit holds the land tools; the play kit only the seeds, since taps pick everything else by context
  same(all.filter((e) => e.kit === 'dig').map((e) => [e.id, e.order, e.owner]), [['hoe', 20, 'interact'], ['axe', 25, 'trees'], ['shovel', 46, 'terraform'], ['earth', 47, 'terraform']]);
  const bar = all.filter((e) => !e.kit).slice(0, 3); // then the Wave 2 seeds, in the seeds group too
  same(bar.map((e) => e.id), ['seed_rice', 'seed_daikon', 'seed_tea']);
  same(bar.map((e) => e.order), [50, 51, 52]);
  same(bar.map((e) => e.compact), ['seeds', 'seeds', 'seeds']);
  assert.ok(all.every((e) => e.kit || (['farming', 'trees'].includes(e.owner) && e.compact === 'seeds')), 'nothing but seeds and saplings in the play kit');
  assert.ok(all.filter((e) => e.owner === 'farming' && e.compact === 'seeds').length >= 10, 'every crop has its seed in the seeds group');
  assert.ok(bar.every((e) => e.icon && e.name === t.core.content.itemMap().get(e.id).name && e.icon === t.core.content.itemMap().get(e.id).icon));
  same(t.i.hotbar().map((e) => e.id), all.filter((e) => !e.kit && !e.when).map((e) => e.id), 'the Wave 2 seeds wait until there are some in the bag');
  assert.equal(t.core.hotbar.get('earth').hint, 'Pile the ground up a level, or fill a pond back in');

  // an entry before the seeds shifts the slots after it; selectSlot and tool() follow the registry
  t.core.as('wp99').hotbar.add({ id: 'trap', order: 44, name: 'Trap', icon: 'icons:basket', compact: true });
  same(t.i.hotbar().map((e) => e.id), ['trap', 'seed_rice', 'seed_daikon', 'seed_tea']);
  t.i.selectSlot(0);
  assert.equal(t.i.tool(), 'trap');
  t.i.selectSlot(3);
  assert.equal(t.i.tool(), 'seed_tea');
  t.i.selectSlot(4);
  assert.equal(t.i.tool(), 'seed_tea', 'past the end does nothing');
  t.i.equip('seed_daikon');
  assert.equal(t.i.slot, 2);
  t.i.equip('nothing');
  t.i.equip('hoe');
  assert.equal(t.i.slot, 2, 'the hoe is in the other kit');
  assert.throws(() => t.core.as('wp98').hotbar.add({ id: 'trap', order: 46 }), /already registered by wp99/);

  // `when` hides an entry while its condition is false; the slots close up
  const t2 = boot();
  t2.core.as('wp99').hotbar.add({ id: 'noon', order: 15, name: 'Noon', when: { hour: [12, 13] } });
  t2.core.as('wp99').hotbar.add({ id: 'night', order: 16, name: 'Night', when: { hour: [0, 1] } });
  same(t2.i.hotbar().map((e) => e.id).slice(0, 3), ['noon', 'seed_rice', 'seed_daikon'], 'noon is shown at 12:00, night is not');
  t2.i.selectSlot(1);
  assert.equal(t2.i.tool(), 'seed_rice');
  assert.equal(lintCore(t2.core).length, 0);
  t2.core.as('wp98').hotbar.add({ id: 'dup', order: 15 });
  assert.match(lintCore(t2.core)[0].msg, /hotbar order 15 is used by 'noon' and 'dup'/);
}

function actions() {
  const t = boot();
  const a = (kind) => t.core.actions.get(kind);
  same(t.core.actions.all().map((e) => e.kind).sort(), ['chop', 'collect', 'cook', 'craft', 'dig', 'fish', 'forage', 'gather', 'harvest', 'inspect', 'mill', 'net', 'noseed', 'photo', 'pile', 'plant', 'plantTree', 'projects', 'reclaim', 'shake', 'shop', 'shrine', 'talk', 'till', 'unstump', 'water']);
  same(t.core.sweeps.kinds().sort(), ['dig', 'forage', 'gather', 'harvest', 'pile', 'plant', 'till', 'water'], 'what a swipe over the field queues');
  same(t.core.actions.all().filter((e) => e.button).map((e) => e.kind).sort(), ['chop', 'collect', 'cook', 'craft', 'dig', 'fish', 'harvest', 'mill', 'net', 'photo', 'pile', 'plant', 'plantTree', 'projects', 'reclaim', 'shop', 'shrine', 'talk', 'till', 'unstump', 'water'], 'what the action button shows');
  same(t.core.actions.all().filter((e) => e.queueable).map((e) => e.kind).sort(), ['chop', 'collect', 'cook', 'craft', 'dig', 'fish', 'forage', 'gather', 'harvest', 'mill', 'net', 'photo', 'pile', 'plant', 'plantTree', 'projects', 'reclaim', 'shake', 'shop', 'shrine', 'talk', 'till', 'unstump', 'water']);
  same(t.core.actions.all().filter((e) => e.range).map((e) => [e.kind, e.range]), [['fish', 2], ['photo', 3], ['net', 1]]);
  assert.equal(a('inspect').queueable, false);
  assert.equal(a('noseed').queueable, false);
  assert.equal(a('forage').owner, 'forage');

  // a made-up kind with a range of 2: performed from two tiles away, without walking
  const m = meadow(t.world);
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });
  const done = [];
  const wp = t.core.as('wp99');
  wp.actions.add('chat', { range: 2, queueable: true, button: true, sweep: true, perform: (act, ix) => done.push([act.kind, act.t, typeof ix.useTool]) });
  wp.actions.add('wave', { queueable: true, perform: (act) => done.push([act.kind]) });
  assert.ok(t.core.sweeps.has('chat') && !t.core.sweeps.has('wave'));
  stand(t, m.x, m.z);
  t.i.startAction({ kind: 'chat', t: at(2, 0) });
  same(done, [['chat', at(2, 0), 'function']], 'in range at distance 2');
  assert.equal(t.st.path, null);
  t.i.cooldown = 0;
  t.i.startAction({ kind: 'wave', t: at(2, 0) });
  same(done.length, 1, 'range 1: the player walks over first');
  assert.ok(t.st.pending || t.st.path);
  assert.ok(t.i.standTiles({ kind: 'chat', t: at(4, 4) }).every((s) => Math.max(Math.abs(s.x - m.x - 4), Math.abs(s.z - m.z - 4)) <= 2));
  assert.ok(t.i.standTiles({ kind: 'wave', t: at(4, 4) }).every((s) => Math.max(Math.abs(s.x - m.x - 4), Math.abs(s.z - m.z - 4)) <= 1));

  // a swipe queues a sweep kind
  t.core.as('wp98').resolvers.add({ id: 'chat', priority: 42, fn: (tile) => (tile.x === m.x + 6 ? { kind: 'chat', t: tile } : null) });
  t.st.pending = null; t.st.path = null; t.i.cooldown = 1;
  t.i.queue.length = 0;
  assert.equal(t.i.sweep(at(6, 0)).kind, 'chat');
  assert.equal(t.i.queue.length, 1);
  assert.equal(t.i.sweep(at(7, 0)), null, 'nothing there to sweep');
}

function tools() {
  const t = boot();
  const wave2 = ['seed_edamame', 'seed_kabocha', 'seed_lotus', 'seed_nasu', 'seed_satsuma_imo', 'seed_shiso', 'seed_wasabi'];
  same(t.core.tools.ids().sort(), ['axe', 'can', 'earth', 'hand', 'hoe', 'net', 'rod', 'seed_daikon', ...wave2.slice(0, 5), 'seed_rice', ...wave2.slice(5, 6), 'seed_tea', ...wave2.slice(6), 'shovel'].sort());
  same(t.core.tools.all().length, 18);
  assert.equal(t.core.tools.get('rod').owner, 'fishing');
  assert.equal(t.core.tools.get('can').owner, 'farming');
  assert.equal(t.core.tools.get('hoe').owner, 'interact');
  for (const id of ['hand', 'can', 'rod', 'net']) assert.ok(!t.core.hotbar.has(id), `${id} has no slot: a tap picks it`);

  // a made-up tool is used with the tile and the interact api, by the name used for it
  const m = meadow(t.world);
  const used = [];
  t.core.as('wp99').tools.add('trap', { use: (tile, ix) => used.push([tile, ix.tool()]) });
  t.i.useTool({ x: m.x, z: m.z }, 'trap');
  same(used, [[{ x: m.x, z: m.z }, 'seed_rice']]);
  t.i.useTool({ x: m.x, z: m.z }, 'nothing');
  assert.equal(used.length, 1, 'an unknown tool does nothing');
  // the shop is checked before any tool
  const stall = t.pr.add('stall', m.x + 3, m.z + 3, 0);
  t.log.length = 0;
  t.i.useTool({ x: stall.x, z: stall.z }, 'trap');
  assert.equal(used.length, 1);
  assert.ok(t.log.some(([n, p]) => n === 'openSheet' && p.name === 'shop'));
}

function keys() {
  const t = boot();
  const names = t.core.keys.ids().sort();
  same(names, ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Enter', 'KeyE', 'KeyG', 'KeyR', 'Space']);
  assert.equal(t.core.keys.get('KeyR').owner, 'build');
  assert.equal(t.core.keys.get('Space').owner, 'interact');
  assert.equal(t.core.keys.press('KeyZ', t.core), false);
  const sent = () => t.log.splice(0).map(([n, p]) => (n === 'openSheet' ? `sheet:${p.name}` : n === 'say' ? `say:${p.text}` : n === 'buildMode' ? `build:${p.on}` : n));

  // 1-9 pick the seed, or the land tool with G's dig kit (building and the bag are B and I, bound by the page); in build mode the digits belong to the build bar
  assert.equal(t.core.keys.press('Digit3', t.core), true);
  assert.equal(t.i.tool(), 'seed_tea');
  t.core.keys.press('Digit9', t.core);
  assert.equal(t.i.tool(), 'seed_tea', 'no ninth seed yet');
  t.core.keys.press('KeyG', t.core);
  t.core.keys.press('Digit3', t.core);
  assert.equal(t.i.tool(), 'shovel');
  t.core.keys.press('KeyG', t.core);
  assert.equal(t.i.tool(), 'seed_tea', 'back to the seeds');
  const ninth = t.i.tool();
  t.core.use('build').toggle(true);
  assert.ok(sent().includes('build:true'));
  assert.equal(t.core.use('build').mode, 'build');
  t.core.keys.press('Digit2', t.core);
  assert.ok(sent().includes('buildSelect'));
  assert.equal(t.i.tool(), ninth, 'the tool in hand is unchanged');
  t.core.keys.press('KeyR', t.core);
  assert.ok(sent().includes('say:Rotated 90°'));
  t.core.use('build').toggle(false);
  sent();
  t.core.keys.press('KeyR', t.core);
  assert.deepEqual(sent(), [], 'rotating does nothing outside build mode');

  // the action key: what the tile in front resolves to
  const m = meadow(t.world);
  stand(t, m.x, m.z);
  const front = t.pl.target();
  let n = 0;
  t.core.as('wp99').actions.add('chat', { queueable: true, perform: () => { n++; } });
  t.core.as('wp99').resolvers.add({ id: 'chat', priority: 45, fn: (tile) => (tile.x === front.x && tile.z === front.z ? { kind: 'chat', t: tile } : null) });
  for (const code of ['Space', 'KeyE', 'Enter']) { t.i.cooldown = 0; t.core.keys.press(code, t.core); }
  assert.equal(n, 3);
  t.core.as('wp99').keys.bind('KeyJ', () => { n = 100; });
  t.core.keys.press('KeyJ', t.core);
  assert.equal(n, 100);
  assert.throws(() => t.core.as('wp98').keys.bind('KeyJ', () => {}), /already registered/);
}

export default function () {
  resolvers();
  extraResolvers();
  hotbar();
  actions();
  tools();
  keys();
}

// The shrine system in a strict core: the offering rules, the event order of offering and waking, the landmarks and clearing a spot for
// them (props api, farming api), the camera tour and the glitter, the saved state, the Game facade.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import shrine from '../../src/systems/shrine.js';
import props from '../../src/systems/props.js';
import { createCore } from '../../src/core/core.js';
import { PRIO } from '../../src/core/bus.js';
import { defineSystem } from '../../src/core/system.js';
import { LANDMARKS } from '../../src/content/base/landmarks.js';
import { World } from '../../src/game/world.js';
import { FORTUNES } from '../../src/game/data.js';

const EBISU = FORTUNES.ebisu;
const BAG = Object.values(EBISU.offerings).flatMap((o) => Object.entries(o.items));

function boot({ rolls = [] } = {}) {
  const world = new World();
  const me = { stands: true, warped: null };
  const cleared = [], crops = new Map();
  const player = defineSystem({ name: 'player', api: () => ({ canStand: () => me.stands, warp: (x, z) => { me.warped = [x, z]; me.stands = true; } }) });
  const daily = defineSystem({ name: 'daily', api: () => ({ state: null }) });
  const farming = defineSystem({ name: 'farming', api: () => ({ clearTile: (x, z) => { cleared.push([x, z]); return crops.get(`${x},${z}`) ?? null; } }) });
  const clock = { mono: 1000 };
  const queue = [...rolls], draws = [];
  const rng = () => { const r = queue.length ? queue.shift() : 0.5; draws.push(r); return r; };
  const core = createCore({ strict: true, now: () => new Date(2026, 0, 15, 12).getTime(), mono: () => clock.mono, rng });
  core.provide('world', world);
  core.boot([props, player, farming, daily, shrine]);
  const log = [];
  core.bus.onAny((payload, m) => log.push([m.name, payload]), { priority: PRIO.VIEW });
  const flush = () => log.splice(0).map(([n, p]) => (n === 'say' ? `say:${p.text}` : n === 'sfx' ? `sfx:${p.name}` : n === 'haptic' ? `haptic:${p.ms}` : n === 'invalidate' ? 'ui'
    : n === 'itemGain' || n === 'itemLoss' ? `${n}:${p.item}${p.n > 1 ? `x${p.n}` : ''}` : n === 'fx' ? `${p.kind}${p.opts ? `:${p.opts.n}` : ''}` : n === 'place' || n === 'remove' ? `${n}:${p.prop}:${p.via || p.to}` : n === 'offer' ? `offer:${p.offering}` : n === 'wake' ? `wake:${p.fortune}` : n));
  return { core, world, me, clock, cleared, crops, draws, log, flush, sh: core.use('shrine'), pr: core.use('props') };
}

const ids = (pr) => pr.list.map((p) => p.type).sort().join();

function queries() {
  const { core, sh, flush } = boot();
  const [harvest, river] = EBISU.offerings;
  assert.deepEqual([sh.current(), sh.isAwake('ebisu'), sh.awake, sh.given, sh.offerable()], ['ebisu', false, [], {}, false]);
  assert.equal(core.systems.get('shrine').spec.needs.join(), 'props,player,farming,daily');
  assert.equal(sh.canGive('ebisu', harvest, 'rice'), 0, 'an empty bag gives nothing');
  assert.equal(sh.missing('ebisu', harvest), '3 rice, 2 daikon');

  core.inv.give('rice', 5); core.inv.give('koi', 1); flush();
  assert.equal(sh.canGive('ebisu', harvest, 'rice'), 3, 'no more than the offering wants');
  assert.equal(sh.canGive('ebisu', river, 'koi'), 1);
  assert.equal(sh.canGive('ebisu', river, 'ayu'), 0);
  assert.deepEqual([sh.canOffer('ebisu', harvest), sh.canOffer('ebisu', river), sh.canOffer('ebisu', EBISU.offerings[2]), sh.offerable()], [true, true, false, true]);
  assert.equal(sh.doneCount('ebisu'), 0);

  // a little at a time: what was given stays given
  const res = sh.offer('harvest');
  assert.deepEqual(res, { gave: { rice: 3 }, done: false });
  assert.deepEqual(sh.slot('ebisu', harvest), { rice: 3 });
  assert.equal(sh.givenOf('ebisu', harvest, 'rice'), 3);
  assert.equal(sh.missing('ebisu', harvest), '2 daikon');
  assert.equal(core.inv.count('rice'), 2);
  assert.equal(sh.canGive('ebisu', harvest, 'rice'), 0);
  assert.deepEqual(sh.given, { 'ebisu.harvest': { rice: 3 } });
  core.inv.give('daikon', 9); flush();
  assert.deepEqual(sh.offer('harvest'), { gave: { daikon: 2 }, done: true });
  assert.deepEqual([sh.done('ebisu', harvest), sh.doneCount('ebisu'), sh.canOffer('ebisu', harvest), sh.ready('ebisu')], [true, 1, false, false]);
  assert.equal(core.inv.count('daikon'), 7);
}

function offering() {
  const { core, sh, flush, pr } = boot();
  assert.equal(sh.offer('harvest'), null);
  assert.deepEqual(flush(), ['say:Nothing to offer for that yet.']);
  assert.equal(sh.offer('nonsense'), null, 'no such offering');
  assert.equal(sh.offer('harvest', null), null, 'no Fortune left');
  flush();

  // with the shrine standing: item, bag refresh, then the offer fact, sound, haptic, burst, toast
  sh.ensureLandmarks(); flush();
  core.inv.give('rice', 1); flush();
  assert.ok(sh.offer('harvest'));
  assert.deepEqual(flush(), ['itemLoss:rice', 'ui', 'offer:harvest', 'sfx:coin', 'haptic:12', 'burst:12', `say:Offered. Still needed: 2 rice, 2 daikon.`, 'ui']);
  const payloads = [];
  core.bus.on('offer', (p) => payloads.push(p), { priority: PRIO.STATE });
  core.inv.give('rice', 2); core.inv.give('daikon', 2); flush();
  sh.offer('harvest');
  assert.deepEqual(payloads, [{ fortune: 'ebisu', offering: 'harvest', gave: { rice: 2, daikon: 2 } }]);
  assert.deepEqual(flush(), ['itemLoss:ricex2', 'ui', 'itemLoss:daikonx2', 'ui', 'offer:harvest', 'sfx:claim', 'haptic:25', 'burst:26', 'say:Offering complete: A farmer’s thanks!', 'ui']);

  // the last offering says the bell is ready
  for (const id of ['river', 'grove', 'sea']) {
    const o = EBISU.offerings.find((x) => x.id === id);
    for (const [it, n] of Object.entries(o.items)) core.inv.give(it, n);
    flush();
    sh.offer(id);
  }
  const last = flush();
  assert.deepEqual(last.slice(-3), ['say:Offering complete: Gifts of the sea!', 'say:Every offering is made. Ring the bell to wake Ebisu!', 'ui']);
  assert.equal(sh.ready('ebisu'), true);
  assert.equal(sh.offerable(), true, 'the bell is something to do');
  assert.equal(sh.offer('sea'), null, 'nothing left to give');
  assert.ok(pr.list.some((p) => p.type === 'shrine_old'));
}

function landmarks() {
  const { sh, pr, flush, me, cleared, core } = boot();
  const L = LANDMARKS;
  sh.ensureLandmarks();
  assert.equal(ids(pr), 'shrine_old,stone');
  assert.deepEqual(flush(), ['place:stone:load', 'place:shrine_old:load']);
  assert.deepEqual([pr.at(L.stone.x, L.stone.z).type, pr.at(L.shrine.x, L.shrine.z).type], ['stone', 'shrine_old']);
  assert.ok(cleared.length > 0, 'every footprint cell was cleared of crops and soil');
  sh.ensureLandmarks();
  assert.deepEqual([ids(pr), flush()], ['shrine_old,stone', []], 'nothing to do the second time');

  // the player stands where the shrine now is
  assert.equal(me.warped, null);
  me.stands = false;
  sh.ensureLandmarks();
  assert.deepEqual(me.warped, [L.shrine.x + 1, L.shrine.z + 2.5]);

  // the chapter moves on: the old shrine goes, the new one and the pier come
  sh.awake.push('ebisu');
  sh.ensureLandmarks();
  assert.equal(ids(pr), 'pier,shrine,stone');
  assert.deepEqual(flush(), ['remove:shrine_old:gone', 'place:shrine:load', 'place:pier:load']);
  sh.awake.length = 0;
  sh.ensureLandmarks();
  assert.equal(ids(pr), 'shrine_old,stone', 'asleep again: the pier and the new shrine go');
  assert.ok(core.inv.count('prop_crate') === 0);
}

function clearing() {
  const { sh, pr, core, crops, cleared, flush } = boot();
  const L = LANDMARKS;
  // decorations go back to the bag, a fixed prop stays, a crop gives its seed back
  const crate = pr.add('crate', L.shrine.x, L.shrine.z);
  const stall = pr.add('stall', L.stone.x - 6, L.stone.z + 8);
  crops.set(`${L.shrine.x + 1},${L.shrine.z}`, 'seed_rice');
  flush();
  sh.clearSpot('shrine_old', L.shrine.x, L.shrine.z);
  const out = flush();
  assert.ok(pr.get(stall.id), 'a prop that is not in the way stays');
  assert.equal(pr.get(crate.id), null);
  assert.equal(core.inv.count('prop_crate'), 1);
  assert.equal(core.inv.count('seed_rice'), 1);
  assert.deepEqual(out.filter((e) => e.startsWith('remove') || e.startsWith('itemGain')), ['remove:crate:bag', 'itemGain:prop_crate', 'itemGain:seed_rice']);
  assert.ok(out.indexOf('remove:crate:bag') < out.indexOf('itemGain:prop_crate'), 'the removal is announced, then the bag refresh');
  assert.ok(cleared.some(([x, z]) => x === L.shrine.x + 1 && z === L.shrine.z));

  // a fixed prop in the footprint is left alone (the stall is not a decoration)
  const { sh: sh2, pr: pr2, core: core2 } = boot();
  pr2.add('stall', L.shrine.x, L.shrine.z);
  sh2.clearSpot('shrine_old', L.shrine.x, L.shrine.z);
  assert.equal(pr2.at(L.shrine.x, L.shrine.z).type, 'stall');
  assert.equal(core2.inv.count('prop_stall'), 0);
}

function waking() {
  const { core, sh, pr, flush, clock } = boot();
  sh.ensureLandmarks(); flush();
  assert.equal(sh.wake(), false, 'the offerings are not made');
  assert.equal(sh.wake('ebisu'), false);
  assert.equal(sh.wake(null), false);
  assert.deepEqual([flush(), sh.awake, core.inv.count('bait')], [[], [], 0]);

  for (const [it, n] of BAG) core.inv.give(it, n);
  for (const o of EBISU.offerings) sh.offer(o.id);
  flush();
  const woke = [];
  core.bus.on('wake', (p) => woke.push(p), { priority: PRIO.STATE });
  assert.equal(sh.ready('ebisu'), true);
  clock.mono = 5000;
  assert.equal(sh.wake(), true);
  assert.deepEqual(woke, [{ fortune: 'ebisu' }]);
  assert.deepEqual(flush(), [
    'remove:shrine_old:gone', 'place:shrine:load', 'place:pier:load', // the landmarks
    'itemGain:baitx5', 'ui', // the gift
    'sfx:fanfare', 'haptic:60', 'burst:30', 'burst:30', 'burst:30', 'burst:30', // the festival
    'say:Ebisu wakes!', 'ui', 'wake:ebisu',
  ]);
  assert.deepEqual([sh.awake, sh.isAwake('ebisu'), sh.current(), sh.ready('ebisu'), sh.offerable()], [['ebisu'], true, null, false, false]);
  assert.equal(core.inv.count('bait'), 5);
  assert.equal(ids(pr), 'pier,shrine,stone');
  assert.equal(sh.wake(), false, 'a Fortune wakes once');
  assert.equal(sh.offer('harvest'), null);
  flush();

  // the camera visits the shrine, then the pier (with a splash), then comes home
  const shrineProp = pr.list.find((p) => p.type === 'shrine'), pier = pr.list.find((p) => p.type === 'pier');
  assert.deepEqual(sh.focusQ.map((f) => [f.x, f.z, f.until, !!f.burst]), [[shrineProp.cx, shrineProp.cz, 5000 + 2400, false], [pier.cx, pier.cz, 5000 + 4600, true]]);
  assert.deepEqual(sh.cameraFocus(), { x: shrineProp.cx, z: shrineProp.cz, until: 7400 });
  clock.mono = 7401;
  const second = sh.cameraFocus();
  assert.deepEqual([second.x, second.z, second.burst], [pier.cx, pier.cz, false]);
  assert.deepEqual(flush(), ['burst:22', 'burst:22', 'burst:22'], 'the splash happens once, as the camera arrives');
  assert.equal(sh.cameraFocus(), second);
  assert.deepEqual(flush(), []);
  clock.mono = 9601;
  assert.equal(sh.cameraFocus(), null);
  assert.equal(sh.focusQ.length, 0);

  // glitter while the celebration lasts, two sparkles a frame, then it stops
  assert.equal(sh.celebrateT, 4.5);
  sh.tick(1);
  assert.deepEqual(flush(), ['sparkle', 'sparkle']);
  assert.equal(sh.celebrateT, 3.5);
  sh.celebrateT = 0.2;
  sh.tick(1);
  flush();
  assert.equal(sh.celebrateT < 0, true);
  sh.tick(1);
  assert.deepEqual(flush(), [], 'no more glitter');
}

function glitter() {
  const t = boot({ rolls: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] });
  t.sh.ensureLandmarks();
  for (const [it, n] of BAG) t.core.inv.give(it, n);
  for (const o of EBISU.offerings) t.sh.offer(o.id);
  t.sh.wake();
  t.log.length = 0; t.draws.length = 0;
  t.sh.tick(0.5);
  assert.deepEqual(t.draws, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 'x, y, z from the injected rng, in that order, twice');
  const sh = t.pr.list.find((p) => p.type === 'shrine');
  const fx = t.log.filter(([n]) => n === 'fx').map(([, p]) => p);
  assert.deepEqual(fx[0], { kind: 'sparkle', x: sh.cx + (0.1 - 0.5) * 2.2, y: 0.3 + 0.2 * 1.6, z: sh.cz + (0.3 - 0.5) * 2.2 });
  assert.equal(fx.length, 2);
}

function saving() {
  const a = boot();
  a.sh.load({ given: { 'ebisu.harvest': { rice: 3 } }, awake: ['ebisu', 'ghost'] });
  assert.deepEqual(a.sh.serialize(), { given: { 'ebisu.harvest': { rice: 3 } }, awake: ['ebisu'] }, 'an unknown Fortune is dropped');
  assert.equal(a.sh.givenOf('ebisu', EBISU.offerings[0], 'rice'), 3);
  a.sh.load(undefined);
  assert.deepEqual(a.sh.serialize(), { given: {}, awake: [] });
  a.sh.load({ given: 5, awake: 'ebisu' });
  assert.deepEqual(a.sh.serialize(), { given: {}, awake: [] }, 'junk loads as empty');
  a.sh.load({ given: { 'ebisu.sea': { tai: 1 } }, awake: [] });
  const b = boot();
  assert.deepEqual(b.sh.given, {}, 'a core has its own state');
  assert.deepEqual(JSON.parse(JSON.stringify(a.sh.serialize())), { given: { 'ebisu.sea': { tai: 1 } }, awake: [] });
}

function facade() {
  const { sh, core, pr } = boot();
  const game = { core: { use: (n) => { assert.equal(n, 'shrine'); return sh; } } };
  for (const [name, entry] of Object.entries(shrine.facade)) {
    if (typeof entry === 'function') game[name] = entry.bind(game);
    else Object.defineProperty(game, name, { get: entry.get, set: entry.set, enumerable: true });
  }
  assert.deepEqual(Object.keys(shrine.facade).sort(), ['cameraFocus', 'celebrateT', 'clearSpot', 'ensureLandmarks', 'focusQ', 'offer', 'shrine', 'wakeFortune']);
  assert.equal(game.shrine, sh);
  assert.equal(game.shrine.current(), 'ebisu');
  game.ensureLandmarks();
  assert.equal(ids(pr), 'shrine_old,stone');
  assert.equal(game.offer('harvest'), null);
  core.inv.give('rice', 3);
  assert.deepEqual(game.offer('harvest', 'ebisu'), { gave: { rice: 3 }, done: false });
  assert.equal(game.wakeFortune(), false);
  assert.deepEqual([game.focusQ, game.celebrateT, game.cameraFocus()], [[], 0, null]);
  game.focusQ = [{ x: 1, z: 2, until: 1e9 }];
  game.celebrateT = 2;
  assert.deepEqual([sh.focusQ.length, sh.celebrateT], [1, 2]);
  assert.deepEqual(game.cameraFocus(), { x: 1, z: 2, until: 1e9 });
}

export default function () {
  queries();
  offering();
  landmarks();
  clearing();
  waking();
  glitter();
  saving();
  facade();
}

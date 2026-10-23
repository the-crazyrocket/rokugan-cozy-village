// The fishing system in a strict core: the bite pool as conditions (equal to the old fishPool), casting, the bite, reeling in, the events and their order, the Game facade.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import fishing, { fishWhen, BAIT_RARE } from '../../src/systems/fishing.js';
import props from '../../src/systems/props.js';
import { createCore } from '../../src/core/core.js';
import { createContent } from '../../src/core/content.js';
import { PRIO } from '../../src/core/bus.js';
import { defineSystem } from '../../src/core/system.js';
import { World } from '../../src/game/world.js';
import { FISH } from '../../src/game/data.js';
import { fishPoolOld, SPOTS } from '../lib/golden-data.mjs';

const at = (h) => new Date(2026, 0, 15, h).getTime();
const same = (a, b, msg) => assert.deepEqual(a.filter(([id]) => !FISH[id]?.when), b, msg); // the old fish (the Wave 2 ones carry conditions)

/** A shore tile with water east of it: { x, z } of the land tile, `fresh` picks the river or pond. */
function shore(world, fresh) {
  for (let z = 1; z < world.h - 1; z++) for (let x = 1; x < world.w - 4; x++) {
    if (!world.isLand(x, z) || ![1, 2, 3].every((k) => world.isWater(x + k, z) && world.isFresh(x + k, z) === fresh)) continue;
    return { x, z };
  }
  throw new Error('no shore');
}

function boot({ hour = 12, rolls = [], content } = {}) {
  const world = new World();
  const me = { cell: { x: 2, z: 2 }, facing: { x: 1, z: 0 }, turned: null, stopped: 0, swung: 0 };
  const player = defineSystem({
    name: 'player',
    api: () => ({ cell: () => me.cell, facing: () => me.facing, face: (t) => { me.turned = t; }, stop: () => { me.stopped++; }, swing: () => { me.swung++; } }),
  });
  const clock = { hour, mono: 1000 };
  const draws = [];
  const queue = [...rolls];
  const rng = () => { const r = queue.length ? queue.shift() : 0.5; draws.push(r); return r; };
  const core = createCore({ strict: true, now: () => at(clock.hour), mono: () => clock.mono, rng, ...(content && { content }) });
  core.provide('world', world);
  core.boot([props, player, fishing]);
  const log = [];
  core.bus.onAny((payload, m) => log.push([m.name, payload]), { priority: PRIO.VIEW });
  const flush = () => log.splice(0).map(([n, p]) => (n === 'say' ? `say:${p.text}` : n === 'sfx' ? `sfx:${p.name}` : n === 'haptic' ? `haptic:${p.ms}` : n === 'bubble' ? `bubble:${p.text}` : n === 'invalidate' ? 'ui' : n === 'itemGain' || n === 'itemLoss' ? `${n}:${p.item}` : n === 'fx' ? `fx:${p.opts.n}` : n));
  return { core, world, me, clock, draws, flush, log, f: core.use('fishing'), pr: core.use('props') };
}

function conditions() {
  assert.deepEqual(fishWhen({ water: 'sea', deep: true, hours: [19, 5] }), { water: 'sea', standing: 'pier', hour: [19, 5] });
  assert.deepEqual(fishWhen({ water: 'fresh' }), { water: 'fresh' });
  const own = { hour: [1, 2] };
  assert.equal(fishWhen({ water: 'sea', when: own }), own, 'a fish with a `when` uses it as is');

  // the system's pool is the old Game.fishPool: 24 hours x fresh / sea shore / pier x bait
  const { f, core } = boot();
  let compared = 0;
  for (const [spot, [fresh, pier]] of Object.entries(SPOTS)) for (const bait of [false, true]) for (let h = 0; h < 24; h++) {
    same(f.pool(fresh, pier, h, bait), fishPoolOld(fresh, pier, h, bait), `${spot} bait=${bait} h=${h}`);
    compared++;
  }
  assert.equal(compared, 144);
  assert.ok(f.pool(false, true, 12, false).length > f.pool(false, false, 12, false).length, 'the pier adds the deep fish');
  assert.equal(BAIT_RARE, 3);

  // hour and bait default to now and the bag
  const b = boot({ hour: 20 });
  same(b.f.pool(false, true), fishPoolOld(false, true, 20, false));
  b.core.inv.give('bait', 2);
  same(b.f.pool(false, true), fishPoolOld(false, true, 20, true));
  assert.ok(b.f.pool(true, false).some(([id]) => id === 'koi'));
  assert.equal(core.systems.get('fishing').spec.needs.join(), 'props,player');

  // content with a `when` condition (a spring-only fish) joins the pool through core/cond
  const content = createContent({ packs: false });
  content.add('fish', 'oikawa', { name: 'Oikawa', sell: 90, weight: 4, window: 800, when: { water: 'fresh', season: ['spring'], hour: [5, 10] }, size: [30, 55], shadow: 'm' });
  const spring = boot({ content, hour: 8 });
  const ids = (pool) => pool.map(([id]) => id);
  spring.clock.hour = 8;
  const inSeason = (h, month) => { const t = new Date(2026, month, 15, h).getTime(); const c = createCore({ strict: true, now: () => t, mono: () => 0, content }); c.provide('world', new World()); c.boot([props, defineSystem({ name: 'player', api: () => ({}) }), fishing]); return ids(c.use('fishing').pool(true, false)); };
  assert.ok(inSeason(8, 3).includes('oikawa'), 'April morning');
  assert.ok(!inSeason(8, 6).includes('oikawa'), 'July morning');
  assert.ok(!inSeason(14, 3).includes('oikawa'), 'April afternoon');
}

function casting() {
  const t = boot({ rolls: [0, 0.5] });
  const { f, world, me, flush, draws, pr } = t;
  const s = shore(world, true);
  me.cell = s; me.facing = { x: 1, z: 0 };
  assert.equal(f.cast, null);
  f.start({ x: s.x + 1, z: s.z });
  assert.deepEqual(flush(), ['sfx:cast', 'fx:10', 'say:Cast into fresh water... wait for a bite!']);
  const c = f.cast;
  assert.deepEqual([c.phase, c.fish, c.spot, c.bait, c.t0, c.biteAt], ['wait', 'ayu', { x: s.x + 1, z: s.z }, false, 1000, 1000 + 2000 + 0.5 * 4000]);
  assert.deepEqual([c.x, c.z], [s.x + 1.5 + 0.1, s.z + 0.5]);
  assert.deepEqual([me.turned, me.stopped, me.swung], [{ x: s.x + 1, z: s.z }, 1, 1]);
  assert.deepEqual(draws, [0, 0.5], 'the fish is rolled first, then the wait');

  // looking along the line for water: three tiles out, never a bridge, never past three
  f.cancel(); flush();
  me.cell = { x: 20, z: 25 };
  f.start({ x: 20, z: 26 }); // dry land for three tiles
  assert.deepEqual(flush(), ['say:Face the water to cast your line.']);
  assert.equal(f.cast, null);
  me.cell = s;
  f.start({ x: s.x + 3, z: s.z }); flush();
  assert.deepEqual(f.cast.spot, { x: s.x + 3, z: s.z });
  f.cancel(); flush();
  f.start({ x: s.x + 5, z: s.z }); flush(); // far target: the first water along the way
  assert.deepEqual(f.cast.spot, { x: s.x + 1, z: s.z });
  f.cancel(); flush();
  pr.add('bridge', s.x + 1, s.z, 0);
  assert.equal(pr.isBridge(s.x + 1, s.z), true);
  f.start({ x: s.x + 1, z: s.z });
  const spot = f.cast?.spot;
  assert.ok(!spot || !pr.isBridge(spot.x, spot.z), 'a bridge tile is not water to fish in');
  f.cancel(); flush();

  // sea from the shore, then from the pier (deep fish), with bait (faster wait, rare fish weigh more)
  const sea = boot({ rolls: [0.99, 0] });
  const ss = shore(sea.world, false);
  sea.me.cell = ss;
  sea.f.start({ x: ss.x + 1, z: ss.z });
  assert.deepEqual(sea.flush(), ['sfx:cast', 'fx:10', 'say:Cast into the sea... wait for a bite!']);
  assert.equal(sea.f.cast.fish, sea.f.pool(false, false).at(-1)[0], 'the last of the shore pool at 0.99');
  assert.ok(!FISH[sea.f.cast.fish].deep);

  const pier = boot({ rolls: [0.999, 0], hour: 12 });
  const ps = shore(pier.world, false);
  pier.me.cell = ps;
  pier.pr.add('pier', ps.x, ps.z, 0);
  assert.equal(pier.pr.at(ps.x, ps.z)?.type, 'pier');
  pier.core.inv.give('bait', 1);
  pier.flush();
  pier.f.start({ x: ps.x + 1, z: ps.z });
  assert.deepEqual(pier.flush(), ['sfx:cast', 'fx:10', 'say:Cast from the pier into deep water...']);
  assert.equal(pier.f.cast.bait, true);
  assert.equal(pier.f.cast.biteAt, 1000 + (2000 + 0 * 4000) * 0.7, 'bait cuts the wait by 30%');
  assert.ok(pier.f.pool(false, true).some(([id]) => id === pier.f.cast.fish));
  assert.equal(pier.f.cast.fish, 'maguro', '0.999 lands on the last, rarest entry');

  // a core of its own
  assert.equal(boot().f.cast, null);
  assert.equal(t.f.cast, null);
}

function biting() {
  const t = boot({ rolls: [0, 0] });
  const { f, core, world, me, clock, flush } = t;
  const s = shore(world, true);
  me.cell = s;
  f.start({ x: s.x + 1, z: s.z }); flush();
  assert.equal(f.tick(), 1000, 'returns the time it used');
  clock.mono = 2999;
  f.tick();
  assert.deepEqual([f.cast.phase, flush()], ['wait', []]);
  clock.mono = 3000;
  assert.equal(f.tick(), 3000);
  const c = f.cast;
  assert.deepEqual([c.phase, c.window, c.biteEnd], ['bite', FISH.ayu.window, 3000 + FISH.ayu.window]);
  assert.deepEqual(flush(), ['bubble:!', 'sfx:bite', 'haptic:40', 'fx:8']);
  clock.mono = 3000 + FISH.ayu.window;
  assert.equal(f.tick(), clock.mono, 'right at the end is still a bite');
  clock.mono += 1;
  assert.equal(f.tick(), null);
  assert.deepEqual(flush(), ['say:It got away...', 'sfx:miss', 'bubble:null']);
  assert.equal(f.cast, null);
  assert.equal(f.tick(), null, 'nothing out: nothing to do');

  // touch grace
  clock.mono = 5000;
  f.start({ x: s.x + 1, z: s.z });
  clock.mono = 5000 + 2000 + 0.5 * 4000;
  f.tick(150);
  assert.equal(f.cast.window, FISH[f.cast.fish].window + 150);
}

function reeling() {
  const t = boot({ rolls: [0, 0, 0, 0, 0, 0, 0, 0] });
  const { f, core, world, me, clock, flush } = t;
  const s = shore(world, true);
  me.cell = s;
  const caught = [];
  core.bus.on('catch', (p) => caught.push(p), { priority: PRIO.STATE });

  // nothing out, nothing happens
  f.reel();
  assert.deepEqual(flush(), []);

  // too early
  f.start({ x: s.x + 1, z: s.z }); flush();
  f.reel();
  assert.deepEqual(flush(), ['say:Too early — the fish swam away.', 'sfx:miss', 'bubble:null']);
  assert.deepEqual([f.cast, caught.length, f.lastCatch], [null, 0, null]);

  // the first catch: item and bag refresh, burst, toast, fanfare, haptic, the bubble goes, then `catch`
  f.start({ x: s.x + 1, z: s.z }); flush();
  clock.mono = 1000 + 2000;
  f.tick(); flush();
  f.reel();
  assert.deepEqual(flush(), ['itemGain:ayu', 'ui', 'fx:22', 'say:Your first Ayu!', 'sfx:fanfare', 'haptic:30', 'bubble:null', 'catch']);
  assert.deepEqual(caught, [{ kind: 'fish', id: 'ayu', size: 0, water: 'fresh', spot: { x: s.x + 1, z: s.z }, bait: null, first: true, via: 'rod' }]);
  assert.equal(core.inv.count('ayu'), 1);
  assert.deepEqual([f.lastCatch, f.caught, f.cast], ['ayu', { ayu: 1 }, null]);

  // the second one is a plain catch; bait is used up
  core.inv.give('bait', 1); flush();
  f.start({ x: s.x + 1, z: s.z }); flush();
  clock.mono += 2000;
  f.tick(); flush();
  f.reel();
  assert.deepEqual(flush(), ['itemGain:ayu', 'ui', 'fx:22', 'itemLoss:bait', 'ui', 'say:You caught a Ayu! (1 bait used)', 'sfx:catch', 'haptic:30', 'bubble:null', 'catch']);
  assert.deepEqual([caught[1].first, caught[1].bait, f.caught], [false, 'bait', { ayu: 2 }]);
  assert.equal(core.inv.count('bait'), 0);

  // bait that ran out between the cast and the reel is not reported
  core.inv.give('bait', 1);
  f.start({ x: s.x + 1, z: s.z }); flush();
  core.inv.take('bait'); flush();
  clock.mono += 2000;
  f.tick(); flush();
  f.reel();
  assert.deepEqual(flush().slice(0, 6), ['itemGain:ayu', 'ui', 'fx:22', 'say:You caught a Ayu!', 'sfx:catch', 'haptic:30']);
  assert.equal(caught[2].bait, null);
  // a fish with a size rolls one in its range (the rolls here land just past the middle)
  // a fish with a size reports the middle of its range
  const content = createContent({ packs: false });
  content.add('fish', 'oikawa', { name: 'Oikawa', sell: 90, weight: 1e6, window: 800, when: { water: 'fresh' }, size: [30, 55], shadow: 'm' });
  const big = boot({ content, rolls: [0.5, 0] });
  big.me.cell = s;
  big.core.bus.on('catch', (p) => caught.push(p));
  big.f.start({ x: s.x + 1, z: s.z });
  assert.equal(big.f.cast.fish, 'oikawa');
  big.clock.mono = 1000 + 2000;
  big.f.tick();
  big.f.reel();
  assert.deepEqual([caught.at(-1).id, caught.at(-1).size], ['oikawa', 44]);

  // the catch counter can be swapped (Game keeps stats.caught pointing at it)
  const table = { koi: 3 };
  f.caught = table;
  assert.equal(f.caught, table);
}

function modes() {
  const { f, core, world, me, flush, clock } = boot({ rolls: [0, 0] });
  const s = shore(world, true);
  me.cell = s;
  f.start({ x: s.x + 1, z: s.z }); flush();
  core.bus.emit('buildMode', { on: true });
  assert.equal(f.cast, null, 'build mode drops the line');
  assert.deepEqual(flush(), ['bubble:null', 'buildMode'], 'the state handler cancels before the view-priority log sees the mode change');
  core.bus.emit('buildMode', { on: false });
  assert.deepEqual(flush(), ['buildMode'], 'nothing cast, nothing to say');
}

function facade() {
  // the Game side: accessors and delegating methods, with `this` the Game
  const { f, core, world, me } = boot({ rolls: [0, 0] });
  const game = { core: { use: (n) => { assert.equal(n, 'fishing'); return f; } } };
  for (const [name, entry] of Object.entries(fishing.facade)) {
    if (typeof entry === 'function') game[name] = entry.bind(game);
    else Object.defineProperty(game, name, { get: entry.get, set: entry.set });
  }
  assert.deepEqual(Object.keys(fishing.facade).sort(), ['cancelFishing', 'fishPool', 'fishing', 'lastCatch', 'reel', 'rollFish', 'startFishing']);
  const s = shore(world, true);
  me.cell = s;
  assert.equal(game.fishing, null);
  game.startFishing({ x: s.x + 1, z: s.z });
  assert.equal(game.fishing, f.cast);
  assert.equal(game.fishing.phase, 'wait');
  same(game.fishPool(true, false, 12, false), fishPoolOld(true, false, 12, false));
  assert.ok(f.pool(true, false).some(([id]) => id === game.rollFish(true, false)));
  game.cancelFishing();
  assert.equal(game.fishing, null);
  game.lastCatch = 'koi';
  assert.equal(f.lastCatch, 'koi');
}

export default function () {
  conditions();
  casting();
  biting();
  reeling();
  modes();
  facade();
}

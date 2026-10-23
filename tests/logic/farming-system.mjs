// The farming system in a strict core: growth from timestamps (against the old tickCrops), the hoe / can / seed branches and their
// events, harvesting and the order of what follows it (toast, then stats and Hana's requests), cropRipe, the place guard,
// clearing a tile, seeds and the Game facade.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import farming, { RIPE } from '../../src/systems/farming.js';
import props from '../../src/systems/props.js';
import stats from '../../src/systems/stats.js';
import daily from '../../src/systems/daily.js';
import requests from '../../src/systems/requests.js';
import { createCore } from '../../src/core/core.js';
import { PRIO } from '../../src/core/bus.js';
import { defineSystem } from '../../src/core/system.js';
import { hash2, mulberry32 } from '../../src/core/rng.js';
import { MIN } from '../../src/core/time.js';
import { World, T } from '../../src/game/world.js';
import { RIPE as DATA_RIPE, CROPS, ITEMS } from '../../src/game/data.js';

const T0 = new Date(2026, 0, 15, 12).getTime();
const same = (a, b, msg) => assert.deepEqual(a, b, msg);

function boot({ extra = [], now = T0 } = {}) {
  const world = new World();
  const clock = { now };
  const me = { swung: 0 };
  const player = defineSystem({ name: 'player', api: () => ({ swing: () => { me.swung++; } }) });
  const core = createCore({ strict: true, now: () => clock.now, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, ...extra]);
  const log = [];
  core.bus.onAny((payload, m) => log.push([m.name, payload, m.away]), { priority: PRIO.VIEW });
  const flush = () => log.splice(0).map(([n, p]) => (n === 'say' ? `say:${p.text}` : n === 'sfx' ? `sfx:${p.name}` : n === 'haptic' ? `haptic:${p.ms}` : n === 'invalidate' ? `inv:${p.what}`
    : n === 'itemGain' || n === 'itemLoss' ? `${n}:${p.item}${p.n > 1 ? `x${p.n}` : ''}` : n === 'fx' ? `fx:${p.opts.n}` : n === 'cropRipe' ? `ripe:${p.crop}` : n));
  return { core, world, clock, me, log, flush, f: core.use('farming'), pr: core.use('props') };
}

/** The old tickCrops body, on a bare Map: the oracle for the growth rules. */
function oldTick(farm, wetSoil, now) {
  let changed = false;
  const stage = (c) => Math.min(RIPE, Math.floor(c.progress + 1e-9));
  for (const c of farm.values()) {
    const sp = CROPS[c.type].stageMs;
    let dt = Math.max(0, now - c.last);
    c.last = now;
    if (c.progress >= RIPE) continue;
    const before = stage(c);
    if (c.wet) {
      const wetMs = ((before + 1 - c.progress) * sp) / 2;
      if (dt >= wetMs) { c.progress = before + 1; dt -= wetMs; c.wet = false; changed = true; } else { c.progress += (dt * 2) / sp; dt = 0; }
    }
    c.progress = Math.min(RIPE, c.progress + dt / sp);
    if (stage(c) !== before) changed = true;
  }
  for (const [i, until] of wetSoil) if (until < now) { wetSoil.delete(i); changed = true; }
  return changed;
}

const field = (t, x = 11, z = 26) => { t.world.set(x, z, T.SOIL); return { x, z }; };

function basics() {
  assert.equal(RIPE, DATA_RIPE, 'the same stage count as game/data.js');
  const t = boot();
  assert.equal(t.core.systems.get('farming').spec.needs.join(), 'player,props');
  assert.ok(t.f.farm instanceof Map && t.f.wetSoil instanceof Map && t.f.farm.size === 0 && t.f.lastSeed === null);
  assert.equal(t.f.crop(11, 26), undefined);

  // stages and the time to ripe (rice: 3 stages of 12 minutes; watering halves only the current stage)
  const c = { type: 'rice', x: 11, z: 26, progress: 0, last: T0, wet: false };
  assert.deepEqual([t.f.stage(c), t.f.timeToRipe(c)], [0, 36 * MIN]);
  c.wet = true;
  assert.equal(t.f.timeToRipe(c), 30 * MIN);
  c.wet = false; c.progress = 1.5;
  assert.deepEqual([t.f.stage(c), t.f.timeToRipe(c)], [1, 18 * MIN]);
  c.progress = 2.9999999999;
  assert.equal(t.f.stage(c), 3, 'a hair below the stage counts');
  c.progress = 3;
  assert.deepEqual([t.f.stage(c), t.f.timeToRipe(c)], [3, 0]);
  c.progress = 2; c.wet = true;
  assert.equal(t.f.timeToRipe(c), 6 * MIN);

  // the accessors Game forwards keep their identity until somebody swaps the map (load does)
  t.f.farm.set(26 * 40 + 11, c);
  assert.equal(t.f.crop(11, 26), c);
  same(t.f.crops(), [c]);
  same(t.f.ripe(), []);
  c.progress = 3;
  same(t.f.ripe(), [c]);
  const swapped = new Map();
  t.f.wetSoil = swapped;
  assert.equal(t.f.wetSoil, swapped);
}

function hoe() {
  const t = boot();
  t.world.set(11, 26, T.GRASS);
  t.f.till(11, 26, null, undefined, T.GRASS);
  same(t.flush(), ['sfx:till', 'fx:14', 'inv:ground', 'inv:veg', 'say:Tilled the earth.']);
  assert.deepEqual([t.world.get(11, 26), t.me.swung], [T.SOIL, 1]);
  t.f.till(11, 26, null, undefined, T.SOIL);
  same(t.flush(), ['say:Already tilled. Plant some seeds!']);
  t.f.till(5, 5, null, undefined, T.WATER);
  same(t.flush(), ["say:The hoe won't work here."]);
  t.f.till(12, 26, { type: 'crate' }, undefined, T.GRASS);
  same(t.flush(), ['say:Something is in the way.']);
  assert.equal(t.world.get(12, 26), T.GRASS);
  t.world.set(13, 26, T.SAND);
  t.f.till(13, 26, null, undefined, T.SAND);
  assert.equal(t.world.get(13, 26), T.SOIL, 'sand can be tilled');
  assert.equal(t.me.swung, 2);
}

function can() {
  const t = boot();
  const { x, z } = field(t);
  t.f.water(x, z, null, undefined, T.SOIL);
  same(t.flush(), ['sfx:water', 'fx:16', 'inv:ground', 'say:Watered the soil.']);
  assert.equal(t.f.wetSoil.get(z * 40 + x), T0 + 30 * MIN);
  t.f.water(x, z, { type: 'well' }, undefined, T.SOIL);
  same(t.flush(), ['say:Your watering can never runs dry here. ♪']);
  t.f.water(5, 5, null, undefined, T.WATER);
  same(t.flush(), ['say:Water tilled soil or crops.']);
  assert.equal(t.me.swung, 1);

  const crop = { type: 'rice', x, z, progress: 0, last: T0, wet: false };
  t.f.farm.set(z * 40 + x, crop);
  t.f.water(x, z, null, crop, T.SOIL);
  same(t.flush(), ['sfx:water', 'fx:16', 'inv:ground', 'say:Watered! It will grow twice as fast this stage.']);
  assert.equal(crop.wet, true);
  assert.equal(t.f.wetSoil.size, 1, 'a crop does not add soil moisture of its own');
  same([...t.f.wetTiles()].sort((a, b) => a - b), [z * 40 + x]);
}

function planting() {
  const t = boot();
  const { x, z } = field(t);
  t.core.inv.give('seed_rice', 2); t.flush();
  t.f.plant(x, z, null, undefined, T.SOIL, 'hoe');
  t.f.plant(x, z, null, undefined, T.SOIL, 'hand');
  same(t.flush(), [], 'only seeds plant');
  t.f.plant(x + 1, z, null, undefined, T.GRASS, 'seed_rice');
  same(t.flush(), ['say:Till the soil with the hoe first.']);
  const here = { type: 'rice' };
  t.f.plant(x, z, null, here, T.SOIL, 'seed_rice');
  same(t.flush(), ['say:Something is already growing here.']);
  t.f.plant(x, z, null, undefined, T.SOIL, 'seed_daikon');
  same(t.flush(), [`say:No ${ITEMS.seed_daikon.name.toLowerCase()} left. Buy more at the stall.`]);

  // the seed is taken (and the UI told) before the crop appears, then swing, sound, burst, redraws and the toast
  t.f.plant(x, z, null, undefined, T.SOIL, 'seed_rice');
  same(t.flush(), ['itemLoss:seed_rice', 'inv:ui', 'sfx:plant', 'fx:8', 'inv:crops', 'inv:ground', 'say:Planted rice.']);
  same(t.f.crop(x, z), { type: 'rice', x, z, progress: 0, last: T0, wet: false });
  assert.deepEqual([t.core.inv.count('seed_rice'), t.me.swung], [1, 1]);

  // watered soil passes its moisture on, once, and only while it is still wet
  const wetSpot = field(t, 12, 26), dry = field(t, 13, 26);
  t.f.water(wetSpot.x, wetSpot.z, null, undefined, T.SOIL);
  t.f.water(dry.x, dry.z, null, undefined, T.SOIL);
  t.clock.now = T0 + 31 * MIN;
  t.f.plant(wetSpot.x, wetSpot.z, null, undefined, T.SOIL, 'seed_rice');
  assert.equal(t.f.crop(12, 26).wet, false, 'the moisture ran out');
  t.core.inv.give('seed_rice', 1);
  t.clock.now = T0 + 5 * MIN;
  t.f.wetSoil.set(26 * 40 + 14, T0 + 20 * MIN);
  field(t, 14, 26);
  t.f.plant(14, 26, null, undefined, T.SOIL, 'seed_rice');
  assert.equal(t.f.crop(14, 26).wet, true);
  assert.equal(t.f.wetSoil.has(26 * 40 + 14), false);
}

function seeds() {
  const t = boot();
  const f = t.f;
  assert.equal(f.pickSeed('hand'), null, 'an empty bag');
  t.core.inv.give('seed_tea', 1);
  assert.equal(f.pickSeed('hand'), 'seed_tea', 'any seed, in the order the crops were added');
  t.core.inv.give('seed_daikon', 1);
  assert.equal(f.pickSeed('hoe'), 'seed_daikon');
  t.core.inv.give('seed_rice', 1);
  assert.equal(f.pickSeed('hoe'), 'seed_rice');
  assert.equal(f.pickSeed('seed_tea'), 'seed_tea', 'the seed in hand first');
  f.lastSeed = 'seed_daikon';
  assert.equal(f.pickSeed('hand'), 'seed_daikon', 'then the last one used');
  assert.equal(f.pickSeed('seed_tea'), 'seed_tea');
  t.core.inv.take('seed_tea');
  assert.equal(f.pickSeed('seed_tea'), 'seed_daikon', 'the one in hand ran out');
  t.core.inv.take('seed_daikon');
  assert.equal(f.pickSeed('seed_tea'), 'seed_rice');

  // a swipe may queue as many plantings as there are seeds
  t.core.inv.give('seed_rice', 1);
  assert.deepEqual([0, 1, 2].map((n) => f.canPlant('seed_rice', n)), [true, true, false]);
  assert.equal(f.canPlant('seed_rice'), true);
  assert.equal(f.canPlant('seed_tea'), false);
}

function harvesting() {
  const t = boot({ extra: [stats, daily, requests] });
  const { f, core } = t;
  const x = 11, z = 26;
  const seen = [];
  core.bus.on('harvest', (p, m) => seen.push([p, m.name]), { priority: PRIO.STATE });

  // yield follows the old hash of the tile and the second
  const rice = { type: 'rice', x, z, progress: 3.02, last: T0, wet: false };
  f.farm.set(z * 40 + x, rice);
  const want = CROPS.rice.yield[0] + Math.floor(hash2(x, z, Math.floor(T0 / 1000)) * (CROPS.rice.yield[1] - CROPS.rice.yield[0] + 1));
  f.harvest(rice);
  same(t.flush(), [`itemGain:rice${want > 1 ? `x${want}` : ''}`, 'inv:ui', 'sfx:harvest', 'haptic:12', 'fx:18', 'inv:crops', 'inv:ground', `say:Harvested ${want} rice!`, 'harvest']);
  same(seen, [[{ crop: 'rice', n: want, quality: 1, x, z, via: 'hand' }, 'harvest']]);
  assert.deepEqual([core.inv.count('rice'), f.crop(x, z), t.me.swung], [want, undefined, 1]);
  same(core.use('stats').data.harvested, { rice: want }, 'the stats count the event');

  // tea grows back from the second stage, dry; rice does not
  const tea = { type: 'tea', x: 12, z, progress: 3, last: T0 - 5, wet: true };
  f.farm.set(z * 40 + 12, tea);
  t.clock.now = T0 + 7000;
  f.harvest(tea, 'sweep');
  assert.equal(f.crop(12, z), tea);
  assert.deepEqual([tea.progress, tea.last, tea.wet], [2, T0 + 7000, false]);
  assert.equal(seen.at(-1)[0].via, 'sweep');
  same(core.use('stats').data.harvested, { rice: want, tea: seen.at(-1)[0].n });
  const teaN = seen.at(-1)[0].n;
  assert.ok(teaN >= CROPS.tea.yield[0] && teaN <= CROPS.tea.yield[1]);

  // a harvest request: the toast of the harvest comes first, then the request is announced (what requestsDone used to do)
  core.use('daily').ensure();
  const day = core.use('daily').state;
  day.requests = [{ kind: 'harvest', item: 'daikon', n: 2, have: 0, claimed: false, value: 20, reward: 40 }];
  const dk = { type: 'daikon', x: 13, z, progress: 3.02, last: T0, wet: false };
  f.farm.set(z * 40 + 13, dk);
  t.flush();
  t.clock.now = T0;
  f.harvest(dk);
  const out = t.flush();
  const n = seen.at(-1)[0].n;
  assert.equal(day.requests[0].have, Math.min(2, n));
  const tail = out.slice(out.indexOf('harvest'));
  if (n >= 2) same(tail, ['harvest', 'say:Request ready: Harvest 2 daikon', 'sfx:ready', 'inv:ui']);
  else same(tail, ['harvest']);
  assert.ok(out.indexOf(`say:Harvested ${n} daikon!`) < out.indexOf('harvest'), 'toast, then the fact');
}

function growth() {
  // the new tick equals the old one over random fields and random gaps, wet and dry, and says what changed
  const rnd = mulberry32(7);
  for (let round = 0; round < 40; round++) {
    const t = boot();
    const farm = new Map(), mirror = new Map();
    const types = ['rice', 'daikon', 'tea'];
    for (let k = 0; k < 12; k++) {
      const c = { type: types[Math.floor(rnd() * 3)], x: k, z: 3, progress: Math.floor(rnd() * 4 * 8) / 8 * 0.74, last: T0 - Math.floor(rnd() * 5 * MIN), wet: rnd() < 0.5 };
      farm.set(3 * 40 + k, c); mirror.set(3 * 40 + k, { ...c }); t.f.farm.set(3 * 40 + k, { ...c });
    }
    const soil = new Map([[100, T0 + 2 * MIN], [101, T0 + 90 * MIN]]);
    t.f.wetSoil = new Map(soil);
    t.clock.now = T0 + Math.floor(rnd() * (round % 2 ? 300 : 20) * MIN);
    const changed = oldTick(mirror, soil, t.clock.now);
    t.f.tick();
    same([...t.f.farm.values()], [...mirror.values()], `round ${round}`);
    same([...t.f.wetSoil], [...soil]);
    const inv = t.flush().filter((e) => e.startsWith('inv:'));
    same(inv, changed ? ['inv:crops', 'inv:ground'] : [], `round ${round}: redraw only on a change`);
  }

  // force redraws without a change
  const t = boot();
  t.f.tick(); same(t.flush(), []);
  t.f.tick(true); same(t.flush(), ['inv:crops', 'inv:ground']);
}

function ripening() {
  const t = boot();
  const f = t.f;
  const mk = (x, type, progress, wet = false) => { const c = { type, x, z: 5, progress, last: T0, wet }; f.farm.set(5 * 40 + x, c); return c; };
  const a = mk(1, 'daikon', 2.5), b = mk(2, 'daikon', 0.5), already = mk(3, 'daikon', 3.02), c = mk(4, 'rice', 2.9, true), nearly = mk(5, 'tea', 2.9999999999);
  const events = [];
  t.core.bus.on('cropRipe', (p, m) => events.push([p, m.away]));
  t.clock.now = T0 + 1 * MIN;
  f.tick();
  same(events, [[{ crop: 'daikon', x: 1, z: 5 }, false], [{ crop: 'rice', x: 4, z: 5 }, false]]);
  assert.deepEqual([f.stage(a), f.stage(b), f.stage(already), f.stage(c), f.stage(nearly)], [3, 1, 3, 3, 3]);
  same(t.flush().filter((e) => e.startsWith('ripe:') || e.startsWith('inv:')), ['ripe:daikon', 'ripe:rice', 'inv:crops', 'inv:ground'], 'the facts come before the redraw');

  // once only; a regrowing crop ripens again after a harvest
  t.clock.now = T0 + 90 * MIN;
  events.length = 0;
  f.tick();
  same(events.map(([p]) => p.x), [2], 'only the one that became ripe since');
  const tea = mk(7, 'tea', 2, false);
  tea.last = T0 + 90 * MIN;
  t.clock.now = T0 + 90 * MIN + 81 * MIN;
  events.length = 0;
  f.tick();
  same(events.map(([p]) => [p.crop, p.x]), [['tea', 7]]);

  // while catching up the event carries meta.away
  const x = boot();
  x.f.farm.set(5 * 40 + 1, { type: 'daikon', x: 1, z: 5, progress: 0, last: T0, wet: false });
  const away = [];
  x.core.bus.on('cropRipe', (p, m) => away.push(m.away));
  x.clock.now = T0 + 10 * MIN;
  x.core.bus.setAway(true);
  x.f.tick();
  x.core.bus.setAway(false);
  same(away, [true]);

  // watered empty soil dries
  const d = boot();
  d.f.wetSoil.set(100, T0 + MIN);
  d.f.wetSoil.set(101, T0 + 3 * MIN);
  d.clock.now = T0 + 2 * MIN;
  d.f.tick();
  same([...d.f.wetSoil.keys()], [101]);
  same(d.flush(), ['inv:crops', 'inv:ground']);
}

function building() {
  const t = boot();
  const { f, pr } = t;
  assert.equal(pr.canPlace('crate', 20, 20, 0), true);
  f.farm.set(20 * 40 + 20, { type: 'rice', x: 20, z: 20, progress: 0, last: T0, wet: false });
  assert.equal(pr.check('crate', 20, 20, 0), 'crop');
  assert.equal(pr.canPlace('crate', 21, 20, 0), true);
  assert.equal(t.core.guards.get('place')[0].owner, 'farming');
  f.farm.delete(20 * 40 + 20);
  // a big prop is vetoed by any crop under its footprint
  assert.equal(pr.canPlace('crate', 20, 20, 0), true);
  f.farm.set(21 * 40 + 23, { type: 'rice', x: 23, z: 21, progress: 0, last: T0, wet: false });
  assert.equal(pr.check('minka', 22, 20, 0), 'crop');

  // clearing a tile for a landmark: the crop goes, its seed comes back, tilled soil turns to grass
  const c = boot();
  const { x, z } = field(c, 11, 26);
  c.f.farm.set(z * 40 + x, { type: 'daikon', x, z, progress: 1, last: T0, wet: false });
  c.f.wetSoil.set(z * 40 + x, T0 + MIN);
  assert.equal(c.f.clearTile(x, z), 'seed_daikon');
  same(c.flush(), ['inv:crops', 'inv:ground']);
  assert.deepEqual([c.world.get(x, z), c.f.crop(x, z), c.f.wetSoil.size], [T.GRASS, undefined, 0]);
  assert.equal(c.f.clearTile(x, z), null);
  same(c.flush(), [], 'nothing to clear');
  field(c, 12, 26);
  assert.equal(c.f.clearTile(12, 26), null, 'empty soil: no seed');
  same(c.flush(), ['inv:crops', 'inv:ground']);
  assert.equal(c.world.get(12, 26), T.GRASS);
}

function facade() {
  const spec = farming;
  const names = Object.keys(spec.facade);
  for (const n of ['farm', 'wetSoil', 'lastSeed', 'crop', 'stage', 'timeToRipe', 'harvest', 'tickCrops', 'tillTile', 'waterTile', 'plantSeed', 'pickSeed']) assert.ok(names.includes(n), n);

  // the Game side: `this` is a game-like object that reads the api through its core
  const t = boot();
  const game = { core: t.core, tool: 'hand', daily: { forageAt: () => null }, pickForage() { throw new Error('no greens here'); } };
  for (const [name, entry] of Object.entries(spec.facade)) {
    if (typeof entry === 'function') game[name] = entry.bind(game);
    else Object.defineProperty(game, name, { get: entry.get, set: entry.set, configurable: true, enumerable: true });
  }
  assert.equal(game.farm, t.f.farm);
  game.farm = new Map(); game.lastSeed = 'seed_tea';
  assert.deepEqual([t.f.farm === game.farm, t.f.lastSeed], [true, 'seed_tea']);
  t.world.set(11, 26, T.SOIL);
  t.core.inv.give('seed_rice', 1);
  game.plantSeed(11, 26, null, undefined, T.SOIL, 'seed_rice');
  const c = game.crop(11, 26);
  assert.deepEqual([c.type, game.stage(c), game.timeToRipe(c)], ['rice', 0, 36 * MIN]);
  assert.equal(game.pickSeed(), null, 'the bag has no seeds left, whatever was used last');
  t.core.inv.give('seed_daikon', 1);
  assert.equal(game.pickSeed(), 'seed_daikon');

  // tilling picks the greens under the tile first (the forage system's job), unless something is in the way or it is not grass
  const order = [];
  game.daily.forageAt = (x, z) => (x === 12 && z === 26 ? { item: 'warabi' } : null);
  game.pickForage = (x, z) => order.push(`pick:${x},${z}`);
  t.world.set(12, 26, T.GRASS);
  t.core.bus.on('sfx', (p) => order.push(`sfx:${p.name}`));
  game.tillTile(12, 26, null, undefined, T.GRASS);
  same(order, ['pick:12,26', 'sfx:till']);
  assert.equal(t.world.get(12, 26), T.SOIL);
  order.length = 0;
  game.tillTile(12, 26, { type: 'crate' }, undefined, T.GRASS);
  game.tillTile(12, 26, null, undefined, T.SOIL);
  same(order, []);
  t.world.set(13, 26, T.GRASS);
  game.tillTile(13, 26, null, undefined, T.GRASS);
  same(order, ['sfx:till']);
}

export default function () {
  basics();
  hoe();
  can();
  planting();
  seeds();
  harvesting();
  growth();
  ripening();
  building();
  facade();
}

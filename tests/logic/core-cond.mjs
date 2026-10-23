// core/cond.js: one table per key, wrap-midnight hours, combinators, explain/describe, define, and today's fish pools.
import assert from 'node:assert/strict';
import { createCond, cond as shared, TERRAIN } from '../../src/core/cond.js';
import { FISH, BAIT_RARE, fishBiting } from '../../src/game/data.js';

// a tiny world: kind/height/water by tile, everything else default (grass, flat, dry)
function world(tiles = {}) {
  const t = (x, z) => tiles[`${x},${z}`] || {};
  return {
    kindAt: (x, z) => t(x, z).kind ?? TERRAIN.grass,
    heightAt: (x, z) => t(x, z).height ?? 0,
    waterKind: (x, z) => t(x, z).water ?? 0,
  };
}
const flags = (obj = {}) => ({ get: (n) => obj[n] });
const inv = (obj = {}) => ({ count: (id, o) => (o?.minQ ? (obj[id + '~' + o.minQ] || 0) : obj[id] || 0) });
const props = (list) => ({ within: (x, z, r) => list.filter((p) => Math.max(Math.abs(p.x - x), Math.abs(p.z - z)) <= r) });
const ctx = (o = {}) => ({ hour: 12, season: 'autumn', weather: { kind: 'clear' }, festival: null, quality: 1, at: { x: 5, z: 5 }, world: world(), props: props([]), inv: inv(), flags: flags(), ...o });

export default function () {
  const cond = createCond();
  const ev = (c, o) => cond.evaluate(c, ctx(o));

  // empty and constant conditions
  for (const c of [undefined, null, {}, true]) assert.equal(ev(c), true, JSON.stringify(c));
  assert.equal(ev(false), false);
  assert.equal(cond.describe({}), 'always');

  // hour: [from, to) local, wraps midnight
  const H = (c, h) => ev({ hour: c }, { hour: h });
  assert.deepEqual([4.99, 5, 8, 10.999, 11].map((h) => H([5, 11], h)), [false, true, true, true, false]);
  assert.deepEqual([18.99, 19, 23.5, 0, 3, 4.99, 5, 12].map((h) => H([19, 5], h)), [false, true, true, true, true, true, false, false]);
  assert.deepEqual([0, 12, 23.99].map((h) => H([0, 24], h)), [true, true, true]);
  assert.equal(H([6, 6], 6), false, 'an empty range matches nothing (as fishBiting did)');

  // season and weather: value, list, negation
  assert.deepEqual(['spring', 'summer', 'autumn', 'winter'].map((s) => ev({ season: ['spring', 'autumn'] }, { season: s })), [true, false, true, false]);
  assert.equal(ev({ season: 'autumn' }), true);
  assert.equal(ev({ season: '!autumn' }), false);
  assert.equal(ev({ season: ['!winter', '!summer'] }, { season: 'spring' }), true);
  assert.equal(ev({ season: ['!winter', '!summer'] }, { season: 'winter' }), false);
  assert.equal(ev({ weather: 'rain' }, { weather: { kind: 'rain' } }), true);
  assert.equal(ev({ weather: 'rain' }, { weather: 'rain' }), true);
  assert.equal(ev({ weather: 'rain' }), false);
  assert.equal(ev({ weather: '!rain' }), true);
  assert.equal(ev({ weather: '!rain' }, { weather: { kind: 'rain' } }), false);
  assert.equal(ev({ weather: ['rain', 'snow'] }, { weather: 'snow' }), true);
  assert.equal(ev({ weather: '!rain' }, { weather: undefined }), true, 'no weather reads as clear');
  assert.equal(ev({ festival: 'hanami' }), false);
  assert.equal(ev({ festival: 'hanami' }, { festival: 'hanami' }), true);
  assert.equal(ev({ festival: '!hanami' }, { festival: 'hanami' }), false);

  // terrain, height, water at `at`
  const w = world({ '1,1': { kind: TERRAIN.sand, height: 2 }, '2,1': { kind: TERRAIN.soil, height: 3 }, '3,1': { kind: TERRAIN.water, water: 2 }, '4,1': { kind: TERRAIN.water, water: 1 }, '5,1': { kind: TERRAIN.water, water: 3 }, '6,1': { kind: TERRAIN.water, water: 4 } });
  const AT = (x, z = 1) => ({ at: { x, z }, world: w });
  assert.equal(ev({ terrain: 'grass' }, AT(0)), true);
  assert.equal(ev({ terrain: 'grass' }, AT(1)), false);
  assert.equal(ev({ terrain: ['soil', 'sand'] }, AT(1)), true);
  assert.equal(ev({ terrain: ['soil', 'sand'] }, AT(2)), true);
  assert.equal(ev({ terrain: '!water' }, AT(3)), false);
  assert.equal(ev({ terrain: 'grass' }, { at: null }), false, 'no tile, no match');
  assert.equal(ev({ height: [1, 3] }, AT(1)), true);
  assert.equal(ev({ height: [1, 3] }, AT(2)), true);
  assert.equal(ev({ height: [1, 3] }, AT(0)), false);
  assert.equal(ev({ height: 2 }, AT(1)), true);
  assert.equal(ev({ height: 2 }, AT(2)), false);
  const WT = (c) => [0, 3, 4, 5, 6].map((x) => ev({ water: c }, AT(x)));
  assert.deepEqual(WT('fresh'), [false, true, false, true, false]);
  assert.deepEqual(WT('sea'), [false, false, true, false, false]);
  assert.deepEqual(WT('pond'), [false, true, false, false, false]);
  assert.deepEqual(WT('stream'), [false, false, false, true, false]);
  assert.deepEqual(WT('tide'), [false, false, false, false, true]);
  assert.deepEqual(WT(['sea', 'tide']), [false, false, true, false, true]);
  assert.deepEqual(WT('land'), [true, false, false, false, false]);
  // the legacy World (get / isWater / isFresh) works too
  const legacy = { get: (x) => (x === 9 ? 0 : 1), isWater: (x) => x === 9 || x === 8, isFresh: (x) => x === 8 };
  assert.equal(ev({ water: 'sea' }, { world: legacy, at: { x: 9, z: 0 } }), true);
  assert.equal(ev({ water: 'fresh' }, { world: legacy, at: { x: 8, z: 0 } }), true);
  assert.equal(ev({ water: 'fresh' }, { world: legacy, at: { x: 3, z: 0 } }), false);
  assert.equal(ev({ terrain: 'water' }, { world: legacy, at: { x: 9, z: 0 } }), true);

  // standing
  assert.equal(ev({ standing: 'pier' }, { standing: 'pier' }), true);
  assert.equal(ev({ standing: 'pier' }, { standing: ['bridge', 'pier'] }), true);
  assert.equal(ev({ standing: 'pier' }), false);
  assert.equal(ev({ standing: '!pier' }), true);
  assert.equal(ev({ standing: ['pier', 'bridge'] }, { standing: 'bridge' }), true);

  // near: props by type, count and radius; props by tag; water within r
  const ps = props([{ type: 'toro', x: 7, z: 5 }, { type: 'toro', x: 5, z: 8 }, { type: 'bamboo', x: 4, z: 4, tags: ['tree'] }, { type: 'plum', x: 5, z: 3 }]);
  const tagsOf = (t) => (t === 'plum' ? ['tree', 'fruit'] : []);
  assert.equal(ev({ near: { prop: 'toro', r: 2 } }, { props: ps }), true);
  assert.equal(ev({ near: { prop: 'toro', r: 1 } }, { props: ps }), false);
  assert.equal(ev({ near: { prop: 'toro', r: 3, n: 2 } }, { props: ps }), true);
  assert.equal(ev({ near: { prop: 'toro', r: 2, n: 2 } }, { props: ps }), false);
  assert.equal(ev({ near: { tag: 'tree', r: 1 } }, { props: ps }), true);
  assert.equal(ev({ near: { tag: 'tree', r: 2, n: 2 } }, { props: ps, tagsOf }), true);
  assert.equal(ev({ near: { tag: 'tree', r: 2, n: 2 } }, { props: ps }), false, 'plum has no tags without tagsOf');
  assert.equal(ev({ near: { prop: 'toro' } }, { props: null }), false);
  assert.equal(ev({ near: { prop: 'toro', r: 2 } }, { props: { list: [{ type: 'toro', x: 6, z: 6 }] } }), true, 'props.list fallback');
  const lake = world({ '6,5': { kind: TERRAIN.water, water: 2 }, '5,9': { kind: TERRAIN.water, water: 1 } });
  assert.equal(ev({ near: { water: 'fresh', r: 1 } }, { world: lake }), true);
  assert.equal(ev({ near: { water: 'sea', r: 1 } }, { world: lake }), false);
  assert.equal(ev({ near: { water: 'sea', r: 4 } }, { world: lake }), true);
  assert.equal(ev({ near: [{ prop: 'toro', r: 2 }, { water: 'fresh' }] }, { props: ps, world: lake }), true, 'a list is all-of');
  assert.equal(ev({ near: [{ prop: 'toro', r: 2 }, { water: 'sea' }] }, { props: ps, world: lake }), false);

  // quality, flag, has, friendship, project
  assert.equal(ev({ quality: { min: 2 } }, { quality: 2 }), true);
  assert.equal(ev({ quality: { min: 2 } }, { quality: 1 }), false);
  assert.equal(ev({ quality: { min: 2 } }, {}), false, 'default quality is 1');
  assert.equal(ev({ quality: { max: 1 } }, {}), true);
  assert.equal(ev({ quality: 3 }, { quality: 3 }), true);
  assert.equal(ev({ flag: 'shrine.ebisu' }, { flags: flags({ 'shrine.ebisu': true }) }), true);
  assert.equal(ev({ flag: 'shrine.ebisu' }), false);
  assert.equal(ev({ flag: '!shrine.ebisu' }), true);
  assert.equal(ev({ flag: ['a', 'b'] }, { flags: flags({ a: 1, b: 0 }) }), false);
  assert.equal(ev({ flag: ['a', '!b'] }, { flags: flags({ a: 1, b: 0 }) }), true);
  assert.equal(ev({ flag: 'a' }, { flags: new Set(['a']) }), true, 'a Set of flag names works');
  assert.equal(ev({ flag: 'a' }, { flags: null }), false);
  assert.equal(ev({ has: { item: 'bait' } }, { inv: inv({ bait: 1 }) }), true);
  assert.equal(ev({ has: { item: 'bait' } }), false);
  assert.equal(ev({ has: 'bait' }, { inv: inv({ bait: 1 }) }), true);
  assert.equal(ev({ has: { item: 'bait', n: 3 } }, { inv: inv({ bait: 2 }) }), false);
  assert.equal(ev({ has: { item: 'koi', minQ: 2 } }, { inv: inv({ 'koi~2': 1 }) }), true);
  assert.equal(ev({ has: [{ item: 'a' }, { item: 'b' }] }, { inv: inv({ a: 1 }) }), false);
  assert.equal(ev({ friendship: { who: 'ume', min: 4 } }, { friendship: (w) => (w === 'ume' ? 4 : 0) }), true);
  assert.equal(ev({ friendship: { who: 'ume', min: 4 } }, { friendship: { ume: 3 } }), false);
  assert.equal(ev({ friendship: { who: 'ume' } }, { friendship: { ume: 1 } }), true);
  assert.equal(ev({ friendship: { who: 'ume' } }), false);
  assert.equal(ev({ project: 'bamboo_grove' }), false);
  assert.equal(ev({ project: 'bamboo_grove' }, { flags: flags({ 'project.bamboo_grove': true }) }), true, 'default project test reads a flag');

  // combinators; keys at one level are ANDed
  const night = { hour: [19, 5] }, rain = { weather: 'rain' };
  assert.equal(ev({ all: [night, rain] }, { hour: 22, weather: 'rain' }), true);
  assert.equal(ev({ all: [night, rain] }, { hour: 22 }), false);
  assert.equal(ev({ any: [night, rain] }, { hour: 22 }), true);
  assert.equal(ev({ any: [night, rain] }), false);
  assert.equal(ev({ all: [] }), true);
  assert.equal(ev({ any: [] }), false);
  assert.equal(ev({ not: night }), true);
  assert.equal(ev({ not: night }, { hour: 23 }), false);
  assert.equal(ev({ not: { not: night } }, { hour: 23 }), true);
  assert.equal(ev({ season: 'autumn', hour: [19, 5] }, { hour: 22 }), true);
  assert.equal(ev({ season: 'autumn', hour: [19, 5] }, { hour: 12 }), false);
  assert.equal(ev({ season: 'winter', any: [night, rain] }, { hour: 22 }), false);
  assert.equal(ev({ all: [{ any: [night, { not: rain }] }, { season: 'autumn' }] }, { hour: 12, weather: 'rain' }), false);

  // compile: cached, same results; shares the parse for the same object
  const c = { water: 'fresh', hour: [5, 11] };
  const fn = cond.compile(c);
  assert.equal(cond.compile(c), fn);
  assert.equal(fn(ctx({ hour: 6, at: { x: 3, z: 1 }, world: w })), true);
  assert.equal(fn(ctx({ hour: 12, at: { x: 3, z: 1 }, world: w })), false);
  assert.equal(cond.compile(null)(ctx()), true);
  assert.equal(cond.compile(Object.freeze({ season: 'autumn' }))(ctx()), true);

  // explain
  assert.deepEqual(cond.explain({ hour: [19, 5] }, ctx({ hour: 22 })), { ok: true, why: [] });
  assert.deepEqual(cond.explain({ hour: [19, 5], near: { prop: 'stone_lantern', r: 2 }, season: 'winter' }, ctx()), { ok: false, why: ['at night', 'near a stone lantern', 'in winter'] });
  assert.deepEqual(cond.explain({ all: [night, { season: 'autumn' }] }, ctx()).why, ['at night']);
  assert.deepEqual(cond.explain({ any: [night, { season: 'winter' }] }, ctx()).why, ['one of at night or in winter']);
  assert.deepEqual(cond.explain({ not: { season: 'autumn' } }, ctx()).why, ['not in autumn']);
  assert.deepEqual(cond.explain({ not: { all: [{ season: 'autumn' }, { hour: [5, 20] }] } }, ctx()).why, ['not (in autumn, between 05:00 and 20:00)']);

  // describe
  const D = (c) => cond.describe(c);
  assert.equal(D({ hour: [19, 5], near: { prop: 'stone_lantern', r: 2 } }), 'at night, near a stone lantern');
  assert.equal(D({ hour: [5, 11] }), 'between 05:00 and 11:00');
  assert.equal(D({ hour: [16.5, 21] }), 'between 16:30 and 21:00');
  assert.equal(D({ season: ['spring', 'autumn'] }), 'in spring or autumn');
  assert.equal(D({ season: '!winter' }), 'not in winter');
  assert.equal(D({ weather: 'rain' }), 'in the rain');
  assert.equal(D({ weather: '!rain' }), 'not in the rain');
  assert.equal(D({ festival: 'hanami' }), 'during the hanami festival');
  assert.equal(D({ terrain: ['soil', 'sand'] }), 'on soil or sand');
  assert.equal(D({ height: [1, 3] }), 'at height 1 to 3');
  assert.equal(D({ water: 'fresh' }), 'in fresh water');
  assert.equal(D({ water: 'sea', standing: 'pier' }), 'in the sea, standing on a pier');
  assert.equal(D({ near: { water: 'fresh', r: 1 } }), 'next to fresh water');
  assert.equal(D({ near: { tag: 'tree', r: 2 } }), 'near a tree');
  assert.equal(D({ near: { prop: 'toro', r: 2, n: 2 } }), 'near at least 2 toro');
  assert.equal(D({ quality: { min: 2 } }), 'of quality 2 or better');
  assert.equal(D({ flag: 'shrine.ebisu' }), 'once "shrine.ebisu" is set');
  assert.equal(D({ has: { item: 'bait' } }), 'carrying bait');
  assert.equal(D({ friendship: { who: 'ume', min: 4 } }), 'friends with ume (level 4)');
  assert.equal(D({ project: 'bamboo_grove' }), 'once the bamboo grove project is finished');
  assert.equal(D({ any: [night, rain] }), 'either at night or in the rain');
  assert.equal(D({ all: [night, rain] }), 'at night, in the rain');
  assert.equal(D({ not: night }), 'not at night');

  // validation: every bad shape is reported, never silently true
  const bad = [
    [{ hour: [5] }, /hour/], [{ hour: [5, 25] }, /hour/], [{ hour: 'night' }, /hour/],
    [{ season: 'monsoon' }, /unknown season "monsoon"/], [{ season: ['!fall'] }, /unknown season "fall"/], [{ season: 3 }, /season/],
    [{ terrain: 'lava' }, /unknown terrain/], [{ water: 'ocean' }, /unknown water/], [{ height: [3, 1] }, /height/],
    [{ near: {} }, /exactly one/], [{ near: { prop: 'a', tag: 'b' } }, /exactly one/], [{ near: { water: 'lake' } }, /unknown water/], [{ near: { prop: 'a', r: -1 } }, /near.r/], [{ near: { prop: 'a', n: 0 } }, /near.n/],
    [{ quality: 'high' }, /quality/], [{ quality: { mid: 2 } }, /quality/], [{ has: {} }, /has/], [{ friendship: 'ume' }, /friendship/], [{ project: 4 }, /project/],
    [{ all: {} }, /all must be a list/], [{ any: 'x' }, /any must be a list/], [{ hours: [1, 2] }, /unknown key "hours"/], [[{ hour: [1, 2] }], /expected an object/],
    [{ all: [{ nope: 1 }] }, /unknown key "nope"/], [{ not: { season: 'x' } }, /season/],
  ];
  for (const [c, re] of bad) {
    assert.match(String(cond.validate(c)[0]), re, JSON.stringify(c));
    assert.throws(() => cond.evaluate(c, ctx()), re);
    assert.throws(() => cond.compile(c), re);
  }
  assert.deepEqual(cond.validate({ hour: [19, 5], season: ['!winter'], near: [{ prop: 'x' }] }), []);

  // define: new keys, soft defaults replaceable, builtins and combinators protected, isolated per instance
  cond.define('wp27.bait', {
    validate: (v) => (typeof v === 'boolean' ? null : 'must be a boolean'),
    test: (v, x) => !!x.baited === v,
    describe: (v) => (v ? 'with bait' : 'without bait'),
  });
  assert.equal(ev({ 'wp27.bait': true }, { baited: true }), true);
  assert.equal(ev({ 'wp27.bait': false }, { baited: true }), false);
  assert.equal(D({ 'wp27.bait': true, hour: [19, 5] }), 'with bait, at night');
  assert.match(cond.validate({ 'wp27.bait': 'yes' })[0], /wp27.bait: must be a boolean/);
  assert.throws(() => cond.define('wp27.bait', { test: () => true }), /already defined/);
  assert.throws(() => cond.define('hour', { test: () => true }), /already defined/);
  assert.throws(() => cond.define('all', { test: () => true }), /bad key/);
  assert.throws(() => cond.define('Bad Key', { test: () => true }), /bad key/);
  assert.throws(() => cond.define('nofn', {}), /test/);
  const stale = { project: 'grove' };
  assert.equal(cond.evaluate(stale, ctx()), false);
  cond.define('project', { test: (v, x) => x.done?.includes(v), describe: (v) => `after ${v} is built` });
  assert.equal(cond.evaluate(stale, ctx({ done: ['grove'] })), true, 'redefinition invalidates the parse cache');
  assert.equal(D(stale), 'after grove is built');
  assert.equal(shared.has('wp27.bait'), false, 'instances are isolated');
  assert.equal(shared.has('project') && shared.has('friendship') && shared.has('hour'), true);
  assert.ok(createCond().keys().includes('near'));

  // today's fish become data: the pools equal the old Game.fishPool for 24 hours x fresh / shore / pier x bait
  const when = (f) => ({ water: f.water, ...(f.deep ? { standing: 'pier' } : {}), ...(f.hours ? { hour: f.hours } : {}) });
  const OLD_FISH = Object.entries(FISH).filter(([, f]) => !f.when); // the fish from before conditions
  const oldPool = (fresh, onPier, h, bait) => OLD_FISH
    .filter(([, f]) => (fresh ? f.water === 'fresh' : f.water === 'sea' && (onPier || !f.deep)) && fishBiting(f, h))
    .map(([k, f]) => [k, f.weight * (bait && f.rare ? BAIT_RARE : 1)]);
  const newPool = (water, standing, h, bait) => {
    const x = ctx({ hour: h, at: { x: 1, z: 1 }, world: world({ '1,1': { kind: TERRAIN.water, water } }), standing, inv: inv(bait ? { bait: 1 } : {}) });
    return OLD_FISH.filter(([, f]) => cond.evaluate(when(f), x)).map(([k, f]) => [k, f.weight * (bait && f.rare ? BAIT_RARE : 1)]);
  };
  let compared = 0;
  for (let h = 0; h < 24; h += 0.5) for (const bait of [false, true]) {
    assert.deepEqual(newPool(2, undefined, h, bait), oldPool(true, false, h, bait), `fresh ${h}`);
    assert.deepEqual(newPool(1, undefined, h, bait), oldPool(false, false, h, bait), `shore ${h}`);
    assert.deepEqual(newPool(1, 'pier', h, bait), oldPool(false, true, h, bait), `pier ${h}`);
    compared += 3;
  }
  assert.ok(compared === 288 && newPool(1, 'pier', 12, false).length > newPool(1, undefined, 12, false).length);
}

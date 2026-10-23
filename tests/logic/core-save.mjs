// core/save.js, core/migrations/*, world/legacy40.js: slice registry, v1-v3 -> v4, load safety of the runner.
import assert from 'node:assert/strict';
import { createSave, SAVE_VERSION } from '../../src/core/save.js';
import { migrateRaw, CHAIN } from '../../src/core/migrations/index.js';
import { LEGACY_HOTBAR } from '../../src/core/migrations/v3-v4.js';
import { rleEncode, rleDecode } from '../../src/core/rle.js';
import { generateLegacy40, legacyArrays } from '../../src/world/legacy40.js';
import { migrate as oldMigrate, SAVE_VERSION as OLD_VERSION } from '../../src/game/save.js';
import { World, T } from '../../src/game/world.js';
import { HOTBAR } from '../../src/game/data.js';
import { readFixture, clone } from '../lib/fixtures.mjs';
import { makeSave, makeCtx, toV3, SLICE_ORDER } from '../lib/v4-slices.mjs';

const FIXTURES = ['save-v1.json', 'save-v2.json', 'save-v3-fresh.json', 'save-v3-mid.json', 'save-v3-ebisu.json'];

function legacyWorld() {
  assert.equal(SAVE_VERSION, 4);
  assert.equal(OLD_VERSION, 3);
  assert.deepEqual([...LEGACY_HOTBAR], HOTBAR, 'frozen hotbar order still matches the live one');
  const live = new World();
  const old = generateLegacy40();
  assert.deepEqual(old.kind, live.tiles, 'legacy40 generates the live island');
  assert.deepEqual(old.water.map((w) => (w >= 2 ? 1 : 0)), live.fresh, 'fresh water matches');
  for (let i = 0; i < 1600; i++) assert.equal(old.water[i] === 1, live.tiles[i] === T.WATER && !live.fresh[i], `sea at ${i}`);
  const count = (v) => old.water.filter((w) => w === v).length;
  assert.equal(count(2) + count(3), 64);
  assert.ok(count(2) > 20 && count(3) > 20, 'pond and stream are told apart');
  assert.equal(old.water[15 * 40 + 25], 3, 'the river at x=25 is a stream');
  assert.equal(old.water[13 * 40 + 13], 2, 'the pond centre is a pond');
  assert.deepEqual(legacyArrays([]).kind, live.tiles);
  assert.ok(legacyArrays([]).height.every((h) => h === 0));
  // a diff expands exactly like applyDiff
  const diffed = new World();
  const diff = [[1051, T.SOIL], [1052, T.SOIL], [820, T.PATH], [5, T.SAND]];
  diffed.applyDiff(diff);
  const arrays = legacyArrays(diff);
  assert.deepEqual(arrays.kind, diffed.tiles);
  assert.equal(arrays.water[5], 0, 'a diff turning sea into sand makes it land');
  assert.equal(legacyArrays([[0, 99], [-1, 1], [1600, 1], ['x', 1], null, [3, -2]]).kind[0], 99 & 255, 'junk entries are ignored, odd kinds kept');
  // the generator is frozen: the arrays are pinned
  const n = (t) => old.kind.filter((v) => v === t).length;
  assert.deepEqual([n(0), n(1), n(2), n(3), n(4)], [1027, 396, 115, 62, 0]);
}

function rle() {
  const a = Uint8Array.from([0, 0, 0, 1, 1, 4, 0, 0]);
  assert.deepEqual(rleEncode(a), [0, 3, 1, 2, 4, 1, 0, 2]);
  assert.deepEqual(rleDecode(rleEncode(a), 8), a);
  assert.deepEqual(rleEncode(new Uint8Array(0)), []);
  for (const [pairs, len] of [[[0, 3], 4], [[0, 5], 4], [[0], 1], [[256, 1], 1], [[0, 0], 0], ['x', 1]]) assert.throws(() => rleDecode(pairs, len), /RLE/);
  const big = legacyArrays([]);
  assert.ok(rleEncode(big.kind).length < 600, 'the island compresses');
}

function chain() {
  assert.deepEqual(CHAIN.map((m) => [m.from, m.to]), [[1, 2], [2, 3], [3, 4]]);
  for (const bad of [null, undefined, 0, 'x', [], {}, { v: 3 }, { v: 3, props: {} }, { v: 0, props: [] }, { v: 1.5, props: [] }, { v: 99, props: [] }]) {
    assert.throws(() => migrateRaw(bad), undefined, `refuses ${JSON.stringify(bad)?.slice(0, 40)}`);
  }
  const v3 = readFixture('save-v3-mid.json');
  for (const key of ['money', 'inv', 'player']) assert.throws(() => migrateRaw({ ...clone(v3), [key]: key === 'money' ? 'x' : null }), /no valid/, `needs ${key}`);
  assert.throws(() => migrateRaw({ ...clone(v3), farm: undefined }), /farm/);
}

function fixtures() {
  const save = makeSave();
  for (const name of FIXTURES) {
    const raw = readFixture(name);
    const frozen = clone(raw);
    const prep = save.prepare(clone(raw));
    assert.equal(prep.state, 'ok', name);
    assert.deepEqual(raw, frozen, 'the fixture itself is not touched');
    const { env } = prep;
    assert.equal(env.v, 4);
    assert.deepEqual(Object.keys(env.slices).sort(), Object.keys(SLICE_ORDER).sort(), `${name} has exactly the eight slices`);
    assert.deepEqual(prep.unknown, []);
    for (const s of Object.values(env.slices)) assert.equal(s.v, 1);
    assert.equal(env.savedAt, raw.savedAt);

    // every v3 key survives: the inverse of the migration is the old migrate() result
    const v3 = oldMigrate(clone(raw));
    assert.deepEqual(toV3(env), v3, `${name}: v4 -> v3 is the old save`);

    const c = env.slices.core.d;
    assert.equal(c.money, raw.money);
    assert.deepEqual(c.inv, raw.inv);
    assert.deepEqual(c.player, raw.player);
    assert.equal(c.tool, HOTBAR[raw.slot]);
    assert.deepEqual(c.time, { carry: raw.timeOffset || 0 });
    assert.equal(env.timeOffset, c.time.carry);
    assert.deepEqual(c.flags, {});
    assert.deepEqual(env.slices.props.d.list, raw.props);
    assert.deepEqual(env.slices.farming.d.crops, v3.farm);
    assert.deepEqual(env.slices.scheduler.d, { seq: 0, entries: [] });
    assert.deepEqual(env.slices.away.d, { pending: null });
    const w = env.slices.world.d;
    assert.deepEqual([w.w, w.h], [40, 40]);
    const kind = rleDecode(w.kind, 1600), height = rleDecode(w.height, 1600), water = rleDecode(w.water, 1600);
    assert.ok(height.every((h) => h === 0));
    for (const [i, t] of raw.tiles || []) assert.equal(kind[i], t, `${name} tile ${i}`);
    for (let i = 0; i < 1600; i++) assert.equal(water[i] > 0, kind[i] === T.WATER, 'water array agrees with kind');

    // idempotent: a v4 envelope passes through unchanged, whether as an object or as JSON text
    assert.deepEqual(save.prepare(env).env, env, `${name} idempotent`);
    assert.deepEqual(save.prepare(JSON.stringify(env)).env, env, `${name} idempotent through JSON`);

    // load, then serialize: the same envelope
    const ctx = makeCtx();
    const res = save.load(prep, ctx);
    assert.equal(res.state, 'ok');
    assert.deepEqual(ctx.loaded, Object.keys(SLICE_ORDER), 'slices load in order');
    assert.deepEqual(save.serialize(ctx, { savedAt: env.savedAt, timeOffset: env.timeOffset }), JSON.parse(JSON.stringify({ ...env, slices: { ...env.slices, ...(env.slices.daily.d === null ? { daily: { v: 1, d: { defaulted: 'daily' } } } : {}), ...(env.slices.shrine.d === null ? { shrine: { v: 1, d: { defaulted: 'shrine' } } } : {}) } })), `${name} round trip`);
  }

  const v1 = save.prepare(readFixture('save-v1.json')).env;
  assert.equal(v1.slices.daily.d, null, 'a v1 save has no daily yet');
  assert.deepEqual(v1.slices.core.d.stats, {});
  const ctx = makeCtx();
  save.load(save.prepare(readFixture('save-v1.json')), ctx);
  assert.deepEqual(ctx.mem.daily, { defaulted: 'daily' }, 'null data gets the slice defaults');

  const mid = save.prepare(readFixture('save-v3-mid.json')).env;
  assert.equal(mid.slices.core.d.tool, 'rod');
  assert.equal(mid.slices.core.d.time.carry, 600000);
  assert.ok(mid.slices.farming.d.crops.length >= 5);
  assert.equal(mid.slices.shrine.d.awake.length, 0);
  assert.deepEqual(save.prepare(readFixture('save-v3-ebisu.json')).env.slices.shrine.d.awake, ['ebisu']);
  assert.deepEqual(save.prepare(readFixture('save-v3-fresh.json')).env.slices.core.d.stats.requests, 0);

  // wetSoil moves from tile indices to coordinates; slots past the hotbar fall back to the hand
  const v3 = readFixture('save-v3-mid.json');
  v3.wetSoil = [[1051, 99000], [41, 5], [9999, 1]];
  v3.slot = 40;
  const wet = save.prepare(v3).env;
  assert.deepEqual(wet.slices.farming.d.wet, [[11, 26, 99000], [1, 1, 5]]);
  assert.equal(wet.slices.core.d.tool, 'hand');
  assert.equal(readFixture('save-v1.json').slot, 3);
}

function registry() {
  const save = createSave();
  const spec = (over = {}) => ({ name: 'a', version: 1, order: 5, defaults: () => ({ n: 0 }), serialize: (c) => c.a, load: (d, c) => { c.a = d; }, ...over });
  assert.throws(() => save.register(spec({ name: '' })), /name/);
  assert.throws(() => save.register(spec({ version: 0 })), /version/);
  assert.throws(() => save.register(spec({ order: 'x' })), /order/);
  assert.throws(() => save.register(spec({ serialize: null })), /serialize/);
  assert.throws(() => save.register(spec({ version: 3, migrate: { 1: (d) => d } })), /from v2/);
  save.register(spec());
  assert.throws(() => save.register(spec()), /already registered/);
  assert.throws(() => save.envMigration({ id: 'x' }), /needs/);
  save.envMigration({ id: 'x', when: () => false, run: (e) => e });
  assert.throws(() => save.envMigration({ id: 'x', when: () => false, run: (e) => e }), /already/);
}

function slicesMigrate() {
  const save = createSave();
  const log = [];
  save.register({
    name: 'a', version: 3, order: 2, defaults: () => ({ n: 0 }), serialize: (c) => c.a, load: (d, c) => { c.a = d; },
    migrate: { 1: (d, env) => { log.push(['1-2', env.slices.b.d]); return { ...d, two: true }; }, 2: (d) => { log.push('2-3'); return { ...d, three: true }; } },
  });
  save.register({ name: 'b', version: 1, order: 1, defaults: () => ({}), serialize: (c) => c.b, load: (d, c) => { c.b = d; c.order = (c.order || '') + 'b'; } });
  save.register({ name: 'c', version: 1, order: 3, defaults: () => ({ fresh: true }), serialize: (c) => c.c, load: (d, c) => { c.c = d; c.order += 'c'; } });
  const raw = { v: 4, savedAt: 7, timeOffset: 0, slices: { a: { v: 1, d: { n: 1 } }, b: { v: 1, d: { who: 'b' } } } };
  // an env migration runs before any slice migration and may rewrite another slice
  let order = [];
  save.envMigration({ id: 'e1', when: (env) => env.slices.b.d.who === 'b', run: (env) => { order.push('env'); env.slices.b.d = { who: 'b2' }; } });
  const prep = save.prepare(raw);
  assert.equal(prep.state, 'ok');
  assert.deepEqual(order, ['env']);
  assert.deepEqual(log, [['1-2', { who: 'b2' }], '2-3']);
  assert.deepEqual(prep.env.slices.a, { v: 3, d: { n: 1, two: true, three: true } });
  assert.deepEqual(raw.slices.a, { v: 1, d: { n: 1 } }, 'input object untouched');
  const ctx = {};
  save.load(prep, ctx);
  assert.equal(ctx.order, 'bc', 'b (order 1) before c (order 3)');
  assert.deepEqual(ctx.c, { fresh: true }, 'a missing slice gets defaults');
  assert.deepEqual(save.defaults().slices.c, { v: 1, d: { fresh: true } });
  // env migrations returning a new object work too, and are skipped when `when` is false
  const s2 = createSave();
  s2.register({ name: 'a', version: 1, order: 1, defaults: () => 0, serialize: () => 0, load() {} });
  s2.envMigration({ id: 'swap', when: () => true, run: (env) => ({ ...env, slices: { a: { v: 1, d: 'swapped' } } }) });
  assert.equal(s2.prepare({ v: 4, slices: {} }).env.slices.a.d, 'swapped');

  // shiftAll calls each slice's shift: returned values replace, mutations stay
  const s3 = createSave();
  s3.register({ name: 'p', version: 1, order: 1, defaults: () => ({}), serialize: () => ({}), load() {}, shift: (d, dx, dz) => ({ x: d.x + dx, z: d.z + dz }) });
  s3.register({ name: 'q', version: 1, order: 2, defaults: () => ({}), serialize: () => ({}), load() {}, shift: (d, dx, dz) => { d.list.forEach((p) => { p[0] += dx; p[1] += dz; }); } });
  s3.register({ name: 'r', version: 1, order: 3, defaults: () => ({}), serialize: () => ({}), load() {} });
  const env = { v: 4, slices: { p: { v: 1, d: { x: 1, z: 2 } }, q: { v: 1, d: { list: [[0, 0], [5, 5]] } }, r: { v: 1, d: 'same' }, zz: { v: 9, d: { x: 1 } } } };
  s3.shiftAll(env, 12, 12);
  assert.deepEqual(env.slices.p.d, { x: 13, z: 14 });
  assert.deepEqual(env.slices.q.d.list, [[12, 12], [17, 17]]);
  assert.equal(env.slices.r.d, 'same');
  assert.deepEqual(env.slices.zz.d, { x: 1 }, 'unknown slices are not shifted');
  const real = makeSave();
  const shifted = real.shiftAll(real.prepare(readFixture('save-v3-mid.json')).env, 12, 12);
  assert.equal(shifted.slices.props.d.list[0].x, readFixture('save-v3-mid.json').props[0].x + 12);
}

function loadSafety() {
  const save = makeSave();
  const good = readFixture('save-v3-mid.json');
  const unreadable = (input, reason) => { const p = save.prepare(input); assert.equal(p.state, 'unreadable', reason); assert.ok(p.reason, reason); return p; };
  assert.equal(unreadable('{not json', 'garbage').reason, 'json');
  assert.equal(unreadable('', 'empty').reason, 'json');
  unreadable('[]', 'array');
  unreadable('"x"', 'string');
  unreadable({ v: 0, props: [] }, 'v0');
  unreadable({ ...good, props: null }, 'props missing');
  unreadable({ ...good, inv: 5 }, 'inventory broken');
  unreadable({ v: 4, slices: 5 }, 'slices not an object');
  unreadable({ v: 4, slices: { core: 7 } }, 'slice not an object');
  unreadable({ v: 4, slices: { core: { v: 'x', d: {} } } }, 'slice version');
  unreadable({ v: 4 }, 'no slices');
  assert.equal(unreadable({ v: 'x' }, 'version').reason, 'version');

  // a throwing slice migration is unreadable, never silently defaulted
  const s2 = createSave();
  s2.register({ name: 'a', version: 2, order: 1, defaults: () => ({}), serialize: () => ({}), load() {}, migrate: { 1: () => { throw new Error('boom'); } } });
  const p = s2.prepare({ v: 4, slices: { a: { v: 1, d: {} } } });
  assert.deepEqual([p.state, p.reason, p.slice, p.error.message], ['unreadable', 'slice-migrate', 'a', 'boom']);
  s2.envMigration({ id: 'bad', when: () => true, run: () => { throw new Error('env boom'); } });
  assert.equal(s2.prepare({ v: 4, slices: {} }).reason, 'env-migrate');
  const s3 = createSave();
  s3.register({ name: 'a', version: 2, order: 1, defaults: () => ({}), serialize: () => ({}), load() {}, migrate: { 1: () => undefined } });
  assert.equal(s3.prepare({ v: 4, slices: { a: { v: 1, d: {} } } }).reason, 'slice-migrate');

  // a future envelope or slice is reported, not migrated, and load applies nothing
  const future = save.prepare({ v: 5, slices: {} });
  assert.deepEqual([future.state, future.reason, future.from], ['future', 'envelope', 5]);
  const env = save.prepare(good).env;
  env.slices.farming.v = 2;
  const sf = save.prepare(env);
  assert.deepEqual([sf.state, sf.reason, sf.newer], ['future', 'slice', ['farming']]);
  const ctx = makeCtx();
  assert.deepEqual(save.load(sf, ctx), { state: 'future', failed: [], unknown: [] });
  assert.deepEqual(ctx.mem, {}, 'nothing applied');
  assert.deepEqual(ctx.loaded, []);
  assert.equal(save.load({ state: 'unreadable' }, ctx).state, 'unreadable');

  // one failing slice load does not stop the others, and is reported
  const s4 = createSave();
  const got = [];
  s4.register({ name: 'a', version: 1, order: 1, defaults: () => ({}), serialize: () => ({ a: 1 }), load: () => { throw new Error('bad a'); } });
  s4.register({ name: 'b', version: 1, order: 2, defaults: () => ({}), serialize: () => ({ b: 1 }), load: (d) => got.push(d) });
  const res = s4.load(s4.prepare({ v: 4, slices: { a: { v: 1, d: {} }, b: { v: 1, d: { ok: 1 } } } }), {});
  assert.equal(res.state, 'unreadable');
  assert.deepEqual(res.failed.map((f) => [f.slice, f.error.message]), [['a', 'bad a']]);
  assert.deepEqual(got, [{ ok: 1 }]);
}

function serializing() {
  const save = createSave();
  let fail = false;
  save.register({ name: 'a', version: 1, order: 1, defaults: () => ({}), serialize: (c) => { if (fail) throw new Error('nope'); return { n: c.n }; }, load() {} });
  save.register({ name: 'b', version: 1, order: 2, defaults: () => ({}), serialize: (c) => ({ m: c.n * 2 }), load() {} });
  const ctx = { n: 1, now: () => 99 };
  const e1 = save.serialize(ctx);
  assert.deepEqual(e1, { v: 4, savedAt: 99, timeOffset: 0, slices: { a: { v: 1, d: { n: 1 } }, b: { v: 1, d: { m: 2 } } } });
  assert.deepEqual(save.errors, []);
  fail = true; ctx.n = 5;
  const e2 = save.serialize(ctx, { savedAt: 100, timeOffset: 3 });
  assert.deepEqual(e2.slices.a, { v: 1, d: { n: 1 } }, 'a throwing serialize keeps the previous slice');
  assert.deepEqual(e2.slices.b.d, { m: 10 });
  assert.equal(e2.savedAt, 100); assert.equal(e2.timeOffset, 3);
  assert.deepEqual(save.errors.map((e) => [e.slice, e.error.message]), [['a', 'nope']]);
  fail = false;
  assert.deepEqual(save.serialize(ctx).slices.a.d, { n: 5 });
  assert.deepEqual(save.errors, []);

  // no previous value: the slice is left out rather than invented
  const s2 = createSave();
  s2.register({ name: 'x', version: 1, order: 1, defaults: () => ({}), serialize: () => { throw new Error('first'); }, load() {} });
  s2.register({ name: 'y', version: 1, order: 2, defaults: () => ({}), serialize: () => undefined, load() {} });
  const e3 = s2.serialize({});
  assert.deepEqual(e3.slices, {});
  assert.equal(s2.errors.length, 2, 'undefined data counts as a failure');

  // data is snapshotted: later mutation of what serialize returned does not leak into the kept copy
  const s3 = createSave();
  const live = { list: [1] };
  let boom = false;
  s3.register({ name: 'z', version: 1, order: 1, defaults: () => ({}), serialize: () => { if (boom) throw new Error('x'); return live; }, load() {} });
  s3.serialize({});
  live.list.push(2); boom = true;
  assert.deepEqual(s3.serialize({}).slices.z.d, { list: [1] });
}

function unknownSlices() {
  const save = makeSave();
  const env = save.prepare(readFixture('save-v3-mid.json')).env;
  env.slices.wp99 = { v: 7, d: { secret: [1, 2, 3], nested: { a: null } } };
  env.slices.old_thing = { v: 1, d: 'text' };
  const prep = save.prepare(JSON.stringify(env));
  assert.deepEqual(prep.unknown.sort(), ['old_thing', 'wp99']);
  const ctx = makeCtx();
  const res = save.load(prep, ctx);
  assert.deepEqual(res.unknown.sort(), ['old_thing', 'wp99']);
  assert.ok(!('wp99' in ctx.mem), 'unknown slices are not handed to anyone');
  const out = save.serialize(ctx, { savedAt: env.savedAt, timeOffset: env.timeOffset });
  assert.equal(JSON.stringify(out.slices.wp99), JSON.stringify(env.slices.wp99), 'preserved byte for byte');
  assert.deepEqual(out.slices.old_thing, env.slices.old_thing);
  save.forget();
  assert.ok(!('wp99' in save.serialize(ctx).slices), 'a new village forgets them');
}

export default function () {
  legacyWorld();
  rle();
  chain();
  fixtures();
  registry();
  slicesMigrate();
  loadSafety();
  serializing();
  unknownSlices();
}

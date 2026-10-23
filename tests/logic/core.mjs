// core/system.js and core/core.js: boot order, the ctx.use gate, a fake system with a slice, events and scheduled entries
// caught up across a long absence, and a save round trip through the v4 envelope.
import assert from 'node:assert/strict';
import { createCore } from '../../src/core/core.js';
import { defineSystem, bootOrder } from '../../src/core/system.js';
import { createContent } from '../../src/core/content.js';
import { createMemoryStorage, SAVE_KEY, PRE_V4_KEY, DEV_KEY } from '../../src/core/save-storage.js';
import { dayNumber } from '../../src/core/time.js';
import { LEGACY_HOTBAR } from '../../src/core/migrations/v3-v4.js';
import { readFixture, clone } from '../lib/fixtures.mjs';
import { local, MIN, HOUR, DAY } from '../lib/schedkit.mjs';

const T0 = local(2026, 10, 23, 12);

// A crop system with a slice, a private event, a facade and a one-shot timer.
const farm = defineSystem({
  name: 'farm',
  events: { sprout: { id: 'int' } },
  slice: {
    version: 1, order: 30,
    defaults: () => ({ plots: [] }),
    serialize: (ctx) => ({ plots: ctx.state.plots }),
    load: (d, ctx) => { ctx.state.plots = d.plots.map((p) => ({ ...p })); },
    shift: (d, dx, dz) => ({ plots: d.plots.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz })) }),
  },
  facade: { plant: 'plant', plots: 'plots' },
  api(ctx) {
    ctx.state.plots = [];
    ctx.state.hooks = [];
    return {
      plots: () => ctx.state.plots,
      plant(crop, x, z, ms) {
        const id = ctx.state.plots.length + 1;
        ctx.state.plots.push({ id, crop, x, z, ripeAt: null });
        ctx.bus.emit('sprout', { id });
        return ctx.sched.schedule('ripen', ctx.now() + ms, { id }, { key: `ripen:${id}`, xz: [x, z] });
      },
    };
  },
  init(ctx) {
    ctx.state.hooks.push('init');
    ctx.sched.handler('ripen', (e) => {
      const p = ctx.state.plots.find((q) => q.id === e.data.id);
      p.ripeAt = ctx.now();
      ctx.bus.emit('cropRipe', { crop: p.crop, x: p.x, z: p.z });
      ctx.say(`${p.crop} is ripe`, 'rice');
    });
    ctx.away.describe('cropRipe', (items) => ({ icon: 'rice', text: `${items.length} ripened`, order: 20 }));
  },
  newGame(ctx) { ctx.state.hooks.push('newGame'); },
  start(ctx, { fresh }) { ctx.state.hooks.push(fresh ? 'start:fresh' : 'start'); },
  update(ctx, dt) { ctx.state.frames = (ctx.state.frames || 0) + 1; ctx.state.dt = dt; },
});

// Reads farm through ctx.use, owns a repeating entry, a letter and a project that finishes while away.
const village = defineSystem({
  name: 'village',
  needs: ['farm'],
  slice: {
    version: 1, order: 35,
    defaults: () => ({ forage: [], letters: [] }),
    serialize: (ctx) => ({ forage: ctx.state.forage, letters: ctx.state.letters }),
    load: (d, ctx) => { ctx.state.forage = [...d.forage]; ctx.state.letters = [...d.letters]; },
  },
  api(ctx) {
    ctx.state.forage = [];
    ctx.state.letters = [];
    return { letters: () => ctx.state.letters, forage: () => ctx.state.forage };
  },
  init(ctx) {
    ctx.state.farm = ctx.use('farm');
    ctx.sched.handler('forage', (e, c, info) => { ctx.state.forage.push([ctx.now(), info.missed, info.away]); });
    ctx.sched.handler('letter', (e) => { ctx.state.letters.push(ctx.now()); ctx.bus.emit('mail', { from: e.data.from, id: 'm1' }); });
    ctx.sched.handler('build', (e) => ctx.bus.emit('projectDone', { project: e.data.project, doneAt: ctx.now(), unlocks: [] }));
    ctx.tools.add('rake', { use() {} });
  },
});

function make({ start = T0, systems = [farm, village], strict = true, ...opts } = {}) {
  const clock = { t: start, m: 0 };
  const core = createCore({ now: () => clock.t, mono: () => clock.m, strict, content: createContent({ empty: true }), systems, ...opts });
  const seen = [];
  core.bus.onAny((payload, meta) => seen.push({ name: meta.name, away: meta.away, at: meta.at, payload }));
  return { core, clock, seen };
}

const names = (seen) => seen.map((s) => s.name);
const without = (env) => { const { savedAt, ...rest } = env; return rest; };

function definitions() {
  assert.throws(() => defineSystem(null), /expected an object/);
  assert.throws(() => defineSystem({}), /bad name/);
  assert.throws(() => defineSystem({ name: 'Bad_name' }), /bad name/);
  assert.throws(() => defineSystem({ name: 'a', onInit() {} }), /unknown field 'onInit'/);
  assert.throws(() => defineSystem({ name: 'a', needs: ['a'] }), /cannot need itself/);
  assert.throws(() => defineSystem({ name: 'a', needs: ['b', 'b'] }), /twice/);
  assert.throws(() => defineSystem({ name: 'a', needs: 'b' }), /needs must be a list/);
  assert.throws(() => defineSystem({ name: 'a', init: 3 }), /init must be a function/);
  assert.throws(() => defineSystem({ name: 'a', facade: { x: 'x' } }), /facade needs an api/);
  assert.throws(() => defineSystem({ name: 'a', facade: { x: 3 } }), /facade maps/);
  const legacy = defineSystem({ name: 'a', facade: { x() {}, y: { get() {}, set() {} } } });
  assert.deepEqual(Object.keys(legacy.facade), ['x', 'y'], 'legacy facade entries need no api');
  assert.deepEqual(Object.keys(make({ systems: [legacy] }).core.facade), [], 'and are left to systems/install.js');
  assert.throws(() => defineSystem({ name: 'a', slice: { version: 2, order: 1, defaults() {}, serialize() {}, load() {} } }), /no step from v1/);
  assert.throws(() => defineSystem({ name: 'a', slice: { version: 1, defaults() {}, serialize() {}, load() {} } }), /order/);
  assert.throws(() => defineSystem({ name: 'a', slice: { version: 1, order: 1, defaults() {}, serialize() {}, load() {}, extra: 1 } }), /unknown field 'extra'/);
  const s = defineSystem({ name: 'a', needs: ['b'] });
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.needs));
  assert.deepEqual(defineSystem({ name: 'b' }).needs, []);

  const mk = (name, ...needs) => defineSystem({ name, needs });
  assert.deepEqual(bootOrder([mk('c', 'a', 'b'), mk('b', 'a'), mk('a'), mk('d')]).map((x) => x.name), ['a', 'b', 'c', 'd'], 'needs first, list order for ties');
  assert.deepEqual(bootOrder([village, farm]).map((x) => x.name), ['farm', 'village']);
  assert.throws(() => bootOrder([mk('a', 'b'), mk('b', 'a')]), /cycle/);
  assert.throws(() => bootOrder([mk('a', 'nope')]), /needs 'nope'/);
  assert.throws(() => bootOrder([mk('a'), mk('a')]), /twice/);
}

function booting() {
  const { core } = make({ systems: [village, farm] });
  assert.deepEqual([...core.systems.keys()], ['farm', 'village'], 'booted in needs order');
  assert.deepEqual(core.systems.get('farm').state.hooks, ['init']);
  assert.equal(typeof core.facade.plant, 'function');
  assert.throws(() => core.boot([]), /already booted/);
  assert.deepEqual(core.save.names(), ['core', 'farm', 'village', 'scheduler', 'away'], 'slices registered by order');
  assert.equal(core.bus.has('sprout'), true, 'private events declared');

  // the use() gate
  const v = core.systems.get('village').ctx, f = core.systems.get('farm').ctx;
  assert.equal(v.use('farm'), core.use('farm'));
  assert.throws(() => v.use('village'), /does not list it in needs/);
  assert.throws(() => f.use('village'), /does not list it in needs/, 'farm did not list village');
  assert.throws(() => core.use('nope'), /no system 'nope'/);
  // a system that lists farm gets its api in init
  const c2 = createCore({ strict: true, content: createContent({ empty: true }) });
  let probe;
  c2.boot([defineSystem({ name: 'probe', needs: ['farm'], init(x) { probe = x; } }), farm]);
  assert.equal(probe.use('farm'), c2.use('farm'));

  // owner scoping and pass-through
  assert.equal(v.owner, 'village');
  assert.equal(core.tools.get('rake').owner, 'village', 'registry adds record the system');
  assert.equal(core.sched.pending().find((e) => e.kind === 'ripen'), undefined);
  assert.equal(typeof v.content.items.get, 'function', 'a scoped ctx still reads content');
  assert.equal(v.now(), core.now());
  assert.equal(v.state, core.systems.get('village').state);
  assert.notEqual(v.state, f.state);
  assert.equal(v.system, 'village');
  const wp = core.as('wp9');
  wp.sched.schedule('probe', T0 + HOUR, {}, { key: 'probe' });
  wp.content.add('items', 'wp9_item', { name: 'Item' });
  wp.hotbar.add({ id: 'wp9_slot', order: 900 });
  assert.deepEqual([core.sched.get('probe').owner, core.content.log.at(-1).owner, core.hotbar.get('wp9_slot').owner], ['wp9', 'wp9', 'wp9']);
  assert.equal(core.content.items.has('wp9_item'), true);
  core.sched.cancel('probe');

  // facade, duplicate names
  assert.equal(core.facade.plots(), core.use('farm').plots());
  const dup = defineSystem({ name: 'dup', slice: { version: 1, order: 31, name: 'farm', defaults: () => ({}), serialize: () => ({}), load() {} } });
  assert.throws(() => make({ systems: [farm, dup] }), /slice farm is already registered/);
  const clash = defineSystem({ name: 'clash', api: () => ({ plant() {} }), facade: { plant: 'plant' } });
  assert.throws(() => make({ systems: [farm, clash] }), /facade method 'plant' is already provided/);
  const bad = defineSystem({ name: 'bad', api: () => ({}), facade: { go: 'go' } });
  assert.throws(() => make({ systems: [bad] }), /api\.go is not a function/);
  const twice = defineSystem({ name: 'tw', events: { sprout: { id: 'string' } } });
  assert.throws(() => make({ systems: [farm, twice] }), /already declared/);
}

function lifecycle() {
  const { core, clock, seen } = make();
  const hooks = core.systems.get('farm').state.hooks;
  core.newGame();
  core.start({ fresh: true });
  assert.deepEqual(hooks, ['init', 'newGame', 'start:fresh']);
  core.start();
  assert.equal(hooks.at(-1), 'start');

  // update: system updates every frame, the time poll every 500 ms of mono time
  const st = core.systems.get('farm').state;
  core.update(16, 1);
  core.update(17, 2);
  assert.deepEqual([st.frames, st.dt], [2, 17]);
  clock.m += 100;
  clock.t += 3 * MIN;
  core.update(16, 3);
  assert.equal(core.lastTick, T0, 'no poll before 500 ms');
  clock.m += 500;
  core.update(16, 4);
  assert.equal(core.lastTick, T0 + 3 * MIN);

  // notifiers are events, with strict payloads
  seen.length = 0;
  core.say('Hello', 'icons:koku', 'good');
  core.say('Plain');
  core.sfx('coin');
  core.sfx('pop', { pitch: 2 });
  core.fx.burst(1, 0.5, 2);
  core.fx.burst(1, 0.5, 2, { color: 'red' });
  core.invalidate('veg');
  assert.deepEqual(seen.map((s) => [s.name, s.payload]), [
    ['say', { text: 'Hello', icon: 'icons:koku', tone: 'good' }], ['say', { text: 'Plain' }],
    ['sfx', { name: 'coin' }], ['sfx', { name: 'pop', opts: { pitch: 2 } }],
    ['fx', { kind: 'burst', x: 1, y: 0.5, z: 2 }], ['fx', { kind: 'burst', x: 1, y: 0.5, z: 2, opts: { color: 'red' } }],
    ['invalidate', { what: 'veg' }],
  ]);
  assert.throws(() => core.invalidate('sky'), /bad payload/);
  assert.throws(() => core.bus.emit('nobody-declared'), /unknown event/);

  // money and items speak, with state before view
  seen.length = 0;
  core.money.add(30, 'sale');
  core.inv.give('rice', 2, { reason: 'harvest' });
  assert.deepEqual(names(seen), ['moneyChange', 'itemGain']);

  // newGame wipes the village back to defaults and hooks run again
  core.facade.plant('rice', 2, 3, HOUR);
  core.flags.set('x');
  core.newGame();
  assert.deepEqual([core.money.get(), core.inv.entries(), core.facade.plots(), core.sched.pending(), core.flags.serialize()], [0, [], [], [], {}]);
  assert.equal(hooks.at(-1), 'newGame');

  // a throwing update is isolated outside strict mode
  const boom = defineSystem({ name: 'boom', update() { throw new Error('nope'); } });
  const ok = make({ systems: [boom], strict: false });
  const err = console.error;
  let logged = 0;
  console.error = () => { logged++; };
  try { ok.core.update(1, 0); ok.core.update(1, 0); } finally { console.error = err; }
  assert.equal(logged, 1, 'logged once, not every frame');
  assert.throws(() => make({ systems: [boom] }).core.update(1, 0), /nope/);
}

function roundTrip() {
  const store = createMemoryStorage();
  const a = make({ storage: store });
  a.core.newGame();
  a.core.start({ fresh: true });
  a.core.money.add(120, 'test');
  a.core.inv.give('seed_rice', 3);
  a.core.inv.give('rice', 2, { quality: 2 });
  a.core.flags.set('shrine.ebisu');
  a.core.facade.plant('rice', 2, 3, 6 * HOUR);
  a.core.sched.schedule('letter', T0 + 3 * DAY, { from: 'hana' }, { key: 'letter:1' });
  const wrote = a.core.saveNow({ backup: true });
  assert.deepEqual(wrote, { ok: true, backup: true });
  const env = JSON.parse(store.getItem(SAVE_KEY));
  assert.deepEqual([env.v, env.savedAt, env.timeOffset], [4, T0, 0]);
  assert.deepEqual(Object.keys(env.slices), ['core', 'farm', 'village', 'scheduler', 'away'], 'slices in load order');
  assert.deepEqual(env.slices.core, { v: 1, d: { money: 120, inv: [['seed_rice', 3], ['rice~2', 2]], time: { carry: 0 }, flags: { 'shrine.ebisu': true } } });
  assert.equal(env.slices.farm.d.plots[0].crop, 'rice');
  assert.deepEqual(env.slices.scheduler.d.entries.map((e) => [e.kind, e.owner, e.xz]), [['ripen', 'farm', [2, 3]], ['letter', undefined, undefined]]);

  // a second core loads the same village: same slices, nothing announced while loading
  const b = make({ storage: store });
  const res = b.core.loadSaved({ catchUp: false });
  assert.deepEqual([res.state, res.from, res.failed], ['ok', 4, []]);
  assert.deepEqual(without(b.core.serialize()), without(a.core.serialize()), 'serialize(load(x)) equals x');
  assert.deepEqual(names(b.seen), [], 'no moneyChange or itemGain while loading');
  assert.equal(b.core.money.get(), 120);
  assert.equal(b.core.inv.count('rice', { minQ: 2 }), 2);
  assert.equal(b.core.flags.has('shrine.ebisu'), true);
  assert.equal(b.core.facade.plots()[0].id, 1);

  // idempotent: loading the loaded again changes nothing
  const again = make({ storage: store });
  again.core.loadSaved({ catchUp: false });
  assert.deepEqual(without(again.core.serialize()), without(b.core.serialize()));

  // slices of systems this build does not boot travel through untouched
  const bare = make({ storage: store, systems: [] });
  assert.equal(bare.core.loadSaved({ catchUp: false }).state, 'ok');
  assert.deepEqual(without(bare.core.serialize()).slices.farm, env.slices.farm, 'unknown slice preserved');
  assert.deepEqual(without(bare.core.serialize()).slices.village, env.slices.village);
  assert.equal(bare.core.saveNow().ok, true);
  assert.deepEqual(JSON.parse(store.getItem(SAVE_KEY)).slices.farm, env.slices.farm, 'and written back');

  // an empty store is "none": nothing applied, the caller starts a new game
  const fresh = make();
  assert.equal(fresh.core.loadSaved().state, 'none');

  // shiftAll reaches the slices that declare shift
  const shifted = b.core.save.shiftAll(clone(env), 12, 12);
  assert.deepEqual([shifted.slices.farm.d.plots[0].x, shifted.slices.farm.d.plots[0].z], [14, 15]);
  assert.deepEqual(shifted.slices.scheduler.d.entries[0].xz, [14, 15]);
}

function absence() {
  const store = createMemoryStorage();
  const a = make({ storage: store });
  a.core.newGame();
  a.core.start({ fresh: true });
  a.core.money.add(50, 'test');
  a.core.flags.set('shrine.ebisu');
  a.core.facade.plant('rice', 2, 3, 6 * HOUR);
  const sched = a.core.sched;
  sched.schedule('forage', T0 + 5 * HOUR, {}, { repeat: { rule: 'day' }, key: 'forage' });
  sched.schedule('build', T0 + 2 * DAY, { project: 'pavilion' });
  sched.schedule('letter', T0 + 20 * DAY, { from: 'hana' });
  a.core.saveNow({ backup: true });

  // 40 days later, 3 h after a 05:00 boundary
  const back = local(2026, 12, 2, 8);
  const b = make({ storage: store, start: back });
  const out = b.core.loadSaved();
  assert.equal(out.state, 'ok');
  const res = out.catchUp, sum = res.summary;
  assert.deepEqual([res.from, res.to, res.noop, res.capped, res.errors], [T0, back, false, false, []]);

  const plot = b.core.facade.plots()[0];
  assert.equal(plot.ripeAt, T0 + 6 * HOUR, 'the timer ran at its own due time, not at "now"');
  assert.deepEqual(b.core.use('village').letters(), [T0 + 20 * DAY], 'a one-shot 20 days in is never dropped');
  const forage = b.core.use('village').forage();
  assert.equal(forage.length, 1, 'a repeat collapses into one call');
  assert.ok(forage[0][1] >= 39 && forage[0][1] <= 41 && forage[0][2] === true, `forage ran for ${forage[0][1]} days, away`);
  assert.deepEqual(b.core.sched.pending().map((e) => e.kind), ['forage'], 'one-shots are gone, the repeat is still scheduled');
  assert.ok(b.core.sched.next('forage').at > back, 'repeat rescheduled past now');
  assert.equal(b.core.now(), back, 'now() is back to the real clock');

  // events: stamped away, at the time they happened, in order
  const ev = (n) => b.seen.filter((s) => s.name === n);
  assert.deepEqual(ev('cropRipe').map((s) => [s.away, s.at]), [[true, T0 + 6 * HOUR]]);
  assert.deepEqual(ev('mail').map((s) => [s.away, s.at]), [[true, T0 + 20 * DAY]]);
  assert.deepEqual(ev('projectDone').map((s) => [s.away, s.at, s.payload.doneAt]), [[true, T0 + 2 * DAY, T0 + 2 * DAY]]);
  assert.deepEqual(ev('seasonChange').map((s) => [s.away, s.at, s.payload.season, s.payload.prev]), [[true, local(2026, 12, 1, 5), 'winter', 'autumn']]);
  const dc = ev('dayChange');
  assert.equal(dc.length, 1, 'one dayChange for the whole gap');
  assert.deepEqual([dc[0].payload.day, dc[0].payload.skipped], [dayNumber(b.core.time.dayKey(back)), dc[0].payload.day - dayNumber(a.core.time.dayKey(T0)) - 1]);
  assert.ok(dc[0].payload.skipped >= 38);
  const at = b.seen.filter((s) => s.away).map((s) => s.at);
  assert.deepEqual(at, [...at].sort((x, y) => x - y), 'catch-up events arrive in time order');
  assert.ok(b.seen.filter((s) => s.name === 'say').every((s) => s.away), 'a toast raised while away is marked away');

  // the away summary
  assert.equal(sum.awayMs, back - T0);
  assert.equal(sum.today, true);
  assert.deepEqual(sum.lines.map((l) => l.text), ['1 ripened']);
  assert.deepEqual(sum.reveals, [{ kind: 'project', id: 'pavilion' }]);
  assert.deepEqual(b.core.away.pending.reveals, sum.reveals);

  // conditions see the same core
  const cc = b.core.condCtx();
  assert.deepEqual([cc.season, cc.now, cc.day], ['winter', back, dayNumber(b.core.time.dayKey(back))]);
  assert.equal(b.core.cond.evaluate({ season: ['winter'], flag: 'shrine.ebisu', has: { item: 'nothing' } }, cc), false);
  assert.equal(b.core.cond.evaluate({ season: ['winter'], flag: 'shrine.ebisu' }, cc), true);

  // a reload before the reveal is acknowledged loses nothing
  b.core.saveNow();
  const c = make({ storage: store, start: back + MIN });
  const sum2 = c.core.loadSaved().catchUp.summary;
  assert.deepEqual(sum2.reveals, [{ kind: 'project', id: 'pavilion' }]);
  assert.equal(sum2.today, false, 'one minute is not worth a Today card');
  assert.equal(c.core.away.shouldShow(sum2), true, 'but a reveal bypasses the threshold');
  c.core.away.ack('project', 'pavilion');
  assert.equal(c.core.away.pending, null);

  // foreground: the next 05:00 arrives as a normal, not-away dayChange; a one-minute step fires nothing
  const f = b;
  f.seen.length = 0;
  f.clock.t += 5 * MIN;
  f.clock.m += 500;
  f.core.update(16, 0);
  assert.deepEqual(names(f.seen), []);
  f.clock.t = local(2026, 12, 3, 5, 1);
  f.clock.m += 500;
  f.core.update(16, 0);
  assert.deepEqual(f.seen.filter((s) => s.name === 'dayChange').map((s) => [s.away, s.payload.skipped]), [[false, 0]]);
  assert.equal(f.core.facade.plots()[0].ripeAt, T0 + 6 * HOUR);

  // the clock going backwards: nothing fires, nothing is lost, the next advance starts from the earlier time
  f.seen.length = 0;
  const hi = f.core.lastTick;
  f.clock.t = hi - 3 * HOUR;
  assert.equal(f.core.tick(), null);
  assert.equal(f.core.lastTick, hi - 3 * HOUR, 'lastTick clamps to the new now');
  assert.deepEqual(f.seen, []);
  const r = f.core.catchUp(hi, hi - HOUR);
  assert.deepEqual([r.noop, r.fired, r.savedAt, f.core.lastTick], [true, 0, hi - HOUR, hi - HOUR]);
  assert.equal(f.core.sched.pending('forage').length, 1);

  // a new village starts from nothing
  b.core.newGame();
  assert.deepEqual([b.core.money.get(), b.core.facade.plots(), b.core.sched.pending(), b.core.away.pending], [0, [], [], null]);
}

function skip() {
  const { core, clock, seen } = make();
  core.newGame();
  core.facade.plant('rice', 1, 1, 6 * HOUR);
  const res = core.skipTime(DAY);
  assert.deepEqual([core.time.devOffset, res.summary.lines.map((l) => l.text)], [DAY, ['1 ripened']]);
  assert.equal(seen.find((s) => s.name === 'cropRipe').away, true);
  assert.equal(core.lastTick, T0 + DAY);
  assert.equal(clock.t, T0, 'the wall clock itself did not move');
  assert.equal(core.readOnly, true, 'the real village is read-only while the dev clock is on');
  assert.throws(() => core.saveNow(), /readonly/);
}

function saving() {
  // a dev clock never reaches the real namespace
  const store = createMemoryStorage();
  const real = make({ storage: store, strict: false, devOffset: DAY });
  assert.deepEqual(real.core.saveNow(), { ok: false, reason: 'readonly' });
  assert.deepEqual(store.dump(), {});
  assert.deepEqual(names(real.seen).filter((n) => n === 'saveFailed'), [], 'refusing is not a failure');
  // the dev namespace saves normally, and never touches SAVE_KEY
  const dev = make({ storage: store, strict: false, devOffset: DAY, dev: true });
  assert.equal(dev.core.saveNow().ok, true);
  assert.deepEqual(Object.keys(store.dump()), [DEV_KEY]);
  // ?date and time.override switch saving off for the session
  const dated = make({ strict: false });
  assert.equal(dated.core.readOnly, false);
  assert.equal(dated.core.time.useDate('2026-12-25'), true);
  assert.equal(dated.core.readOnly, true);
  assert.equal(dated.core.saveNow().reason, 'readonly');
  const over = make({ strict: false });
  over.core.time.override = { season: 'spring' };
  assert.equal(over.core.saveNow().reason, 'readonly');
  over.core.time.override = null;
  assert.equal(over.core.saveNow().ok, true);

  // a full disk is a visible failure
  const quota = createMemoryStorage();
  quota.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
  const q = make({ storage: quota });
  assert.deepEqual(q.core.saveNow(), { ok: false, reason: 'quota' });
  assert.deepEqual(q.seen.filter((s) => s.name === 'saveFailed').map((s) => s.payload), [{ reason: 'quota' }]);

  // an unreadable save is never overwritten
  for (const raw of ['{not json', JSON.stringify({ v: 99, slices: {} }), JSON.stringify({ v: 4, savedAt: 1, slices: { core: { v: 7, d: {} } } })]) {
    const s = createMemoryStorage({ [SAVE_KEY]: raw });
    const u = make({ storage: s, strict: false });
    const r = u.core.loadSaved();
    assert.ok(['unreadable', 'future'].includes(r.state), r.state);
    assert.equal(u.core.readOnly, true);
    assert.deepEqual(u.core.saveNow(), { ok: false, reason: 'readonly' });
    assert.equal(s.getItem(SAVE_KEY), raw, 'main slot byte-identical');
    assert.ok(Object.keys(s.dump()).some((k) => k.includes('quarantine-')), 'raw copy quarantined');
    assert.equal(u.core.money.get(), 0, 'nothing applied');
  }
  const strictBad = make({ storage: createMemoryStorage({ [SAVE_KEY]: '{x' }) });
  assert.equal(strictBad.core.loadSaved().state, 'unreadable');
  assert.throws(() => strictBad.core.saveNow(), /save refused: readonly/);

  // a slice whose load throws: the others still load, the session is read-only, the raw slice is quarantined
  const good = make({ storage: createMemoryStorage() });
  good.core.newGame();
  good.core.saveNow();
  const raw = JSON.parse(good.core.storage.readRaw(SAVE_KEY));
  raw.slices.farm.d = { plots: 'broken' };
  const s2 = createMemoryStorage({ [SAVE_KEY]: JSON.stringify(raw) });
  const f = make({ storage: s2, strict: false });
  const r = f.core.loadSaved();
  assert.deepEqual([r.state, r.failed.map((x) => x.slice)], ['unreadable', ['farm']]);
  assert.ok(r.quarantineKey && s2.getItem(r.quarantineKey));
  assert.equal(f.core.readOnly, true);
  assert.equal(f.core.saveNow().reason, 'readonly');
}

function v3() {
  const fx = readFixture('save-v3-mid.json');
  const store = createMemoryStorage({ [SAVE_KEY]: JSON.stringify(fx) });
  const { core } = make({ storage: store, systems: [] });
  const res = core.loadSaved();
  assert.deepEqual([res.state, res.from], ['ok', 3]);
  assert.equal(store.getItem(PRE_V4_KEY), JSON.stringify(fx), 'the v3 original is copied once');
  assert.equal(core.money.get(), fx.money);
  assert.deepEqual(new Map(core.inv.serialize()), new Map(fx.inv));
  assert.equal(core.time.carry, fx.timeOffset || 0);
  const env = core.serialize();
  assert.equal(env.v, 4);
  const d = env.slices.core.d;
  assert.deepEqual([d.player, d.tool, d.stats], [fx.player, LEGACY_HOTBAR[fx.slot], fx.stats], 'keys nobody owns yet pass through');
  for (const name of ['world', 'props', 'farming', 'daily', 'shrine']) assert.ok(env.slices[name], `${name} kept`);

  // a part claims its key: it gets the loaded value at once, and serialises it from then on
  let player = null;
  core.part('player', { serialize: () => player, load: (v) => { player = v; } });
  assert.deepEqual(player, fx.player);
  player = [1, 2, 0];
  assert.deepEqual(core.serialize().slices.core.d.player, [1, 2, 0]);
  assert.throws(() => core.part('player', { serialize() {}, load() {} }), /bad or taken/);
  assert.throws(() => core.part('money', { serialize() {}, load() {} }), /bad or taken/);
  assert.deepEqual(core.save.shiftAll(core.serialize(), 5, 6).slices.core.d.player, [6, 8, 0]);
  core.newGame();
  assert.equal(player, undefined, 'a part without defaults() is loaded with nothing on a new game');
  assert.equal(core.saveNow().ok, true);
}

function groundY() {
  const { core } = make();
  assert.equal(core.groundY(3, 4), 0, 'no world: flat');
  core.provide('world', { groundY: (x, z) => x + z });
  assert.equal(core.groundY(3, 4), 7, 'world.groundY');
  core.provide('groundY', (x, z) => x * z);
  assert.equal(core.groundY(3, 4), 12, 'a provided groundY wins over the world');
}

export default function () {
  definitions();
  booting();
  lifecycle();
  roundTrip();
  absence();
  skip();
  saving();
  v3();
  groundY();
}

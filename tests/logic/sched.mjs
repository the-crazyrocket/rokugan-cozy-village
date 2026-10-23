// Scheduler: API, ordering, repeat rules, caps, boundaries, DST, clock regressions, determinism.
import assert from 'node:assert/strict';
import { createSched, catchUp, schedSlice, shiftSched, nextDayStart, lastDayStart, MAX_REPEATS } from '../../src/core/sched.js';
import { dayNumber } from '../../src/core/time.js';
import { makeCtx, local, MIN, HOUR, DAY } from '../lib/schedkit.mjs';

const fired = (ctx) => { const out = []; return { out, h: (kind) => ctx.sched.handler(kind, (e, c, i) => { out.push({ kind: e.kind, id: e.id, at: c.now(), data: e.data, ...i }); }) }; };

function api() {
  const ctx = makeCtx();
  const s = ctx.sched;
  const a = s.schedule('a', 3000, { n: 1 });
  const b = s.schedule('b', 1000, null, { key: 'k', owner: 'wp1', xz: [3, 4] });
  assert.deepEqual(s.pending().map((e) => e.kind), ['b', 'a'], 'sorted by time');
  assert.equal(s.next().kind, 'b');
  assert.equal(s.next('a').id, a);
  assert.equal(s.next('zzz'), null);
  assert.deepEqual(s.due(2000).map((e) => e.id), [b]);
  const b2 = s.schedule('b', 5000, { v: 2 }, { key: 'k' });
  assert.notEqual(b2, b);
  assert.equal(s.pending('b').length, 1, 'key replaces');
  assert.equal(s.get('k').at, 5000);
  assert.equal(s.cancel('k'), true);
  assert.equal(s.cancel('k'), false);
  assert.equal(s.cancel(a), true);
  assert.equal(s.pending().length, 0);
  assert.throws(() => s.schedule('@day', 1, {}), /bad kind/);
  assert.throws(() => s.schedule('x', NaN, {}), /bad time/);
  assert.throws(() => s.schedule('x', 1, {}, { repeat: { every: 0 } }), /bad repeat/);
  assert.throws(() => s.schedule('x', 1, {}, { catchUp: 'nope' }), /bad catchUp/);
  s.handler('x', () => {});
  assert.throws(() => s.handler('x', () => {}), /already registered/);
  const scoped = s.as('wp26');
  scoped.schedule('y', 1, {});
  assert.equal(s.pending('y')[0].owner, 'wp26');
}

function roundTrip() {
  const ctx = makeCtx();
  const s = ctx.sched;
  s.schedule('p', 100, { a: [1, 2] }, { key: 'one', repeat: { every: 50 }, catchUp: { max: 3 }, owner: 'wp2', xz: { x: 1, z: 2 } });
  s.schedule('q', 50, { b: 'x' });
  const d = JSON.parse(JSON.stringify(s.serialize()));
  assert.equal(d.seq, 2);
  assert.deepEqual(d.entries.map((e) => e.kind), ['q', 'p']);
  const t = makeCtx().sched;
  t.load(d);
  assert.deepEqual(t.serialize(), d);
  assert.equal(t.get('one').id, 1);
  assert.equal(t.schedule('r', 1, {}), 3, 'seq continues');
  t.load({ seq: 0, entries: [{ id: 7, kind: 'k', at: 1, data: {} }, { id: 7, kind: 'dup', at: 2 }, { kind: 'bad', at: 'x' }, null, { kind: 'rep', at: 1, repeat: { every: -1 } }] });
  assert.deepEqual(t.pending().map((e) => e.kind), ['k', 'dup'], 'bad rows dropped, duplicate id renumbered');
  assert.ok(t.schedule('z', 1, {}) > 8);
  t.load(undefined);
  assert.equal(t.pending().length, 0);
  assert.deepEqual(schedSlice.defaults(), { seq: 0, entries: [] });
  const sh = shiftSched({ seq: 2, entries: [{ id: 1, kind: 'a', at: 1, data: {}, xz: [3, 4] }, { id: 2, kind: 'b', at: 1, data: {}, xz: { x: 1, z: 1 } }, { id: 3, kind: 'c', at: 1, data: {}, xz: [[1, 1], [2, 2]] }, { id: 4, kind: 'd', at: 1, data: {} }] }, 12, 12);
  assert.deepEqual(sh.entries.map((e) => e.xz), [[15, 16], { x: 13, z: 13 }, [[13, 13], [14, 14]], undefined]);
}

function threeDays() {
  const ctx = makeCtx({ start: local(2026, 10, 23, 12) });
  const t0 = ctx.clock.t, s = ctx.sched;
  const { out, h } = fired(ctx);
  for (const k of ['grow', 'chain', 'late']) h(k);
  s.schedule('late', t0 + 70 * HOUR, {});
  s.schedule('grow', t0 + 5 * HOUR, { i: 0 });
  s.schedule('chain', t0 + 30 * HOUR, {});
  s.schedule('grow', t0 + 5 * HOUR, { i: 1 });
  s.schedule('grow', t0 + 100 * HOUR, { i: 'after the window' });
  s.handler('chainer', (e, c) => { out.push({ kind: 'chainer', at: c.now() }); c.sched.schedule('grow', c.now() + 2 * HOUR, { i: 'chained' }); });
  s.schedule('chainer', t0 + 10 * HOUR, {});
  const r = catchUp(ctx, t0, t0 + 72 * HOUR);
  assert.deepEqual(out.map((e) => [e.kind, (e.at - t0) / HOUR]), [['grow', 5], ['grow', 5], ['chainer', 10], ['grow', 12], ['chain', 30], ['late', 70]]);
  assert.deepEqual(out.filter((e) => e.kind === 'grow').map((e) => e.data.i), [0, 1, 'chained'], 'same time keeps schedule order');
  assert.ok(out.filter((e) => e.kind !== 'chainer').every((e) => e.away === true && e.missed === 1));
  assert.equal(out[0].late, 67 * HOUR);
  assert.equal(s.pending().length, 1, 'later entry kept');
  assert.equal(ctx.now(), t0, 'now() restored after the pass');
  assert.equal(s.sim, null);
  assert.equal(r.fired, 6);
}

function stampsTime() {
  const ctx = makeCtx({ start: local(2026, 10, 23, 12) });
  const s = ctx.sched;
  const t14 = local(2026, 10, 24, 14);
  s.handler('trap', (e, c) => {
    c.bus.emit('catch', { id: 'koi' });
    c.sched.schedule('trap', c.now() + 3 * HOUR, {});
  });
  s.schedule('trap', t14, {});
  catchUp(ctx, ctx.clock.t, local(2026, 10, 24, 19, 30));
  const c = ctx.log.filter((l) => l.name === 'catch');
  assert.deepEqual(c.map((l) => l.at), [t14, t14 + 3 * HOUR], 'a trap that fired at 14:00 stamps 14:00 and chains from there');
  assert.ok(c.every((l) => l.away));
  assert.equal(new Date(c[0].at).getHours(), 14);
  // foreground tick: away false, stamps still follow the entry
  const ctx2 = makeCtx();
  ctx2.sched.handler('t', (e, c2, i) => { ctx2.log.push({ at: c2.now(), away: i.away }); });
  ctx2.sched.schedule('t', 5000, {});
  catchUp(ctx2, 0, 9000, { away: false });
  assert.deepEqual(ctx2.log, [{ at: 5000, away: false }]);
}

function longAbsence() {
  const ctx = makeCtx({ start: local(2026, 10, 23, 12) });
  const t0 = ctx.clock.t, s = ctx.sched;
  const { out, h } = fired(ctx);
  h('project');
  s.schedule('project', t0 + 33 * DAY + 4 * HOUR, { project: 'pavilion' });
  const r = catchUp(ctx, t0, t0 + 40 * DAY);
  assert.deepEqual(out.map((e) => [e.kind, e.at]), [['project', t0 + 33 * DAY + 4 * HOUR]], 'a project finishing during a 40-day absence fires');
  assert.equal(r.capped, false);
  assert.equal(s.pending().length, 0);

  // far past both caps: repeats stop, one-shots still fire, in order, at their own times
  const c2 = makeCtx({ start: t0 });
  const o2 = [];
  c2.sched.handler('tick', (e, c) => { o2.push(c.now()); });
  c2.sched.handler('done', (e, c) => { o2.push(['done', c.now()]); });
  c2.sched.schedule('tick', t0 + MIN, {}, { repeat: { every: MIN }, catchUp: 'each' });
  for (const d of [10, 200, 500, 900]) c2.sched.schedule('done', t0 + d * DAY, {});
  const r2 = catchUp(c2, t0, t0 + 1000 * DAY);
  assert.equal(r2.capped, true);
  assert.equal(r2.repeats, MAX_REPEATS, 'repeat firings are capped');
  assert.equal(o2.filter((x) => typeof x === 'number').length, MAX_REPEATS);
  assert.deepEqual(o2.filter((x) => Array.isArray(x)).map((x) => (x[1] - t0) / DAY), [10, 200, 500, 900]);
  const tick = c2.sched.pending('tick')[0];
  assert.ok(tick.at > t0 + 1000 * DAY && tick.at <= t0 + 1000 * DAY + MIN, 'repeat jumped past the window, phase kept');
  assert.equal((tick.at - t0) % MIN, 0);
  const dc = c2.log.filter((l) => l.name === 'dayChange');
  assert.equal(dc.length, 1);
  assert.equal(dc[0].payload.skipped, 999, 'one dayChange carries the whole gap');

  // the 366-day cap alone: a daily repeat stops after a year, one-shots and the final dayChange are untouched
  const c3 = makeCtx({ start: t0 });
  const o3 = [];
  c3.sched.handler('daily', (e, c) => { o3.push(c.now()); });
  c3.sched.handler('done', (e, c) => { o3.push(-c.now()); });
  c3.sched.schedule('daily', t0 + HOUR, {}, { repeat: { rule: 'day' }, catchUp: 'each' });
  c3.sched.schedule('done', t0 + 700 * DAY, {});
  const r3 = catchUp(c3, t0, t0 + 800 * DAY);
  assert.equal(r3.capped, true);
  const days = o3.filter((x) => x > 0).length;
  assert.ok(days >= 365 && days <= 367, `daily fired ${days} times`);
  assert.deepEqual(o3.filter((x) => x < 0), [-(t0 + 700 * DAY)]);
  assert.equal(c3.log.filter((l) => l.name === 'dayChange').length, 1);
  assert.equal(c3.log.find((l) => l.name === 'dayChange').payload.day, dayNumber(c3.time.dayKey(t0 + 800 * DAY)));
}

function repeats() {
  const ctx = makeCtx({ start: local(2026, 10, 23, 12) });
  const t0 = ctx.clock.t, s = ctx.sched;
  const { out, h } = fired(ctx);
  for (const k of ['col', 'each', 'max', 'rule']) h(k);
  s.schedule('col', t0 + HOUR, {}, { repeat: { every: HOUR } });
  s.schedule('each', t0 + HOUR, {}, { repeat: { every: 6 * HOUR }, catchUp: 'each' });
  s.schedule('max', t0 + HOUR, {}, { repeat: { every: HOUR }, catchUp: { max: 3 } });
  s.schedule('rule', t0 + 2 * HOUR, {}, { repeat: { rule: 'day' }, catchUp: 'each' });
  catchUp(ctx, t0, t0 + 24 * HOUR);
  const by = (k) => out.filter((e) => e.kind === k);
  assert.equal(by('col').length, 1);
  assert.equal(by('col')[0].missed, 24);
  assert.equal(by('col')[0].at, t0 + 24 * HOUR, 'collapsed repeat reports state as of its last firing');
  assert.deepEqual(by('each').map((e) => (e.at - t0) / HOUR), [1, 7, 13, 19]);
  assert.deepEqual(by('max').map((e) => [(e.at - t0) / HOUR, e.missed]), [[22, 22], [23, 1], [24, 1]], 'last 3 firings, the first stands for the dropped ones');
  assert.deepEqual(by('rule').map((e) => ctx.time.dayKey(e.at)), ['2026-10-23', '2026-10-24'], 'rule fires at its time, then at the next day start');
}

function ruleDay() {
  const ctx = makeCtx({ start: local(2026, 10, 23, 12) });
  const t0 = ctx.clock.t, s = ctx.sched;
  const { out, h } = fired(ctx);
  h('r');
  s.schedule('r', t0 + 2 * HOUR, {}, { repeat: { rule: 'day' }, catchUp: 'each' });
  catchUp(ctx, t0, t0 + 3 * DAY);
  const hours = out.map((e) => [new Date(e.at).getDate(), new Date(e.at).getHours()]);
  assert.deepEqual(hours, [[23, 14], [24, 5], [25, 5], [26, 5]], 'first at its time, then every village-day start');
  assert.equal(s.pending('r')[0].at, local(2026, 10, 27, 5));
  const c2 = makeCtx({ start: t0 });
  c2.sched.handler('r', () => {});
  c2.sched.schedule('r', t0, {}, { repeat: { rule: 'day' } });
  const r = catchUp(c2, t0, t0 + 3 * DAY);
  assert.equal(r.fired, 1, 'collapse: one call');
}

function reschedule() {
  const ctx = makeCtx({ start: 0 });
  const o = [];
  ctx.sched.handler('r', (e, c, i) => { o.push(c.now()); return e.data.n++ < 3 ? { reschedule: c.now() + HOUR } : undefined; });
  ctx.sched.schedule('r', HOUR, { n: 0 });
  catchUp(ctx, 0, 10 * HOUR);
  assert.deepEqual(o, [1, 2, 3, 4].map((h) => h * HOUR), 'reschedule inside the window runs in the same pass');
  assert.equal(ctx.sched.pending().length, 0);
  ctx.sched.handler('far', () => ({ reschedule: 100 * HOUR }));
  ctx.sched.schedule('far', HOUR, {}, { key: 'f' });
  catchUp(ctx, 0, 10 * HOUR);
  assert.equal(ctx.sched.get('f').at, 100 * HOUR, 'reschedule keeps the entry and its key');
}

function boundaries() {
  const ctx = makeCtx({ start: local(2026, 11, 28, 12), festival: (ms) => (ms >= local(2026, 12, 2, 5) && ms < local(2026, 12, 4, 5) ? 'fest' : null) });
  const t0 = ctx.clock.t, s = ctx.sched;
  const b = [];
  s.handler('@day', (e, c) => b.push(['@day', e.at, e.data.day, e.data.prev, c.now()]));
  s.handler('@season', (e) => b.push(['@season', e.at, e.data.season, e.data.prev]));
  s.handler('@festival', (e) => b.push(['@festival', e.at, e.data.id, e.data.prev]));
  s.handler('x', (e, c) => b.push(['x', c.now()]));
  s.schedule('x', local(2026, 12, 1, 5), {});
  const r = catchUp(ctx, t0, local(2026, 12, 5, 12));
  const days = b.filter((x) => x[0] === '@day');
  assert.deepEqual(days.map((x) => x[2]), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
  assert.ok(days.every((x) => new Date(x[1]).getHours() === 5 && new Date(x[1]).getMinutes() === 0 && x[1] === x[4]), 'at 05:00 local, now() = boundary');
  assert.deepEqual(days[0].slice(2, 4), ['2026-11-29', '2026-11-28']);
  assert.deepEqual(b.filter((x) => x[0] === '@season'), [['@season', local(2026, 12, 1, 5), 'winter', 'autumn']]);
  assert.deepEqual(b.filter((x) => x[0] === '@festival').map((x) => [x[2], x[3]]), [['fest', null], [null, 'fest']]);
  // boundary sorts before an entry at the same instant
  const i = b.findIndex((x) => x[0] === 'x');
  assert.equal(b[i - 1][0], '@season');
  assert.equal(r.days, 7);
  const ev = ctx.log.map((l) => l.name);
  assert.deepEqual(ev, ['seasonChange', 'dayChange']);
  const sc = ctx.log[0];
  assert.deepEqual([sc.payload, sc.at, sc.away], [{ season: 'winter', prev: 'autumn', year: 2026 }, local(2026, 12, 1, 5), true]);
  const dc = ctx.log[1];
  assert.deepEqual(dc.payload, { day: dayNumber('2026-12-05'), prev: dayNumber('2026-11-28'), skipped: 6 });
  assert.equal(dc.at, local(2026, 12, 5, 5));

  // season boundary seen across a window that starts exactly on it, and no events for a window inside one day
  const c2 = makeCtx({ start: local(2026, 12, 1, 5) });
  catchUp(c2, local(2026, 12, 1, 5), local(2026, 12, 1, 20));
  assert.deepEqual(c2.log, [], '(from, to]: the boundary at `from` is not repeated');
  catchUp(c2, local(2026, 12, 1, 20), local(2026, 12, 2, 4, 59));
  assert.deepEqual(c2.log, []);
  catchUp(c2, local(2026, 12, 2, 4, 59), local(2026, 12, 2, 5));
  assert.deepEqual(c2.log.map((l) => l.name), ['dayChange'], '05:00 exactly is inside (4:59, 5:00]');
  assert.equal(c2.log[0].payload.skipped, 0);
}

function withTZ(tz, fn) {
  const old = process.env.TZ;
  process.env.TZ = tz;
  try { fn(); } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
}

function dst() {
  for (const [tz, y, mo, d] of [['America/New_York', 2026, 3, 8], ['America/New_York', 2026, 11, 1], ['Pacific/Auckland', 2026, 9, 27], ['Pacific/Auckland', 2026, 4, 5], ['Europe/London', 2026, 10, 25]]) {
    withTZ(tz, () => {
      const from = local(y, mo, d - 3, 12), to = local(y, mo, d + 3, 12);
      const ctx = makeCtx({ start: from });
      const b = [];
      ctx.sched.handler('@day', (e) => b.push(e.at));
      catchUp(ctx, from, to);
      assert.equal(b.length, 6, `${tz}: six day starts`);
      for (const t of b) { const dt = new Date(t); assert.equal(dt.getHours() + dt.getMinutes() / 60, 5, `${tz}: ${dt.toString()} is 05:00 local`); }
      const gaps = b.slice(1).map((t, i) => (t - b[i]) / HOUR).sort((p, q) => p - q);
      assert.ok(gaps[0] >= 23 && gaps[gaps.length - 1] <= 25, `${tz}: gaps ${gaps}`);
      assert.ok(gaps.some((g) => g !== 24), `${tz}: the DST day is not 24 h`);
      assert.equal(ctx.log.length, 1);
      // stepping the same span in 1 h ticks emits dayChange once per distinct dayKey
      const c2 = makeCtx({ start: from });
      let last = from;
      for (let t = from + HOUR; t <= to; t += HOUR) { catchUp(c2, last, t, { away: false }); last = t; }
      const keys = c2.log.filter((l) => l.name === 'dayChange').map((l) => l.payload.day);
      assert.equal(keys.length, 6, `${tz}: dayChange count`);
      assert.equal(new Set(keys).size, 6, `${tz}: distinct day keys`);
      assert.ok(c2.log.every((l) => l.payload.skipped === 0 && !l.away));
      // helpers agree
      assert.equal(nextDayStart(c2.time, from), b[0]);
      assert.equal(lastDayStart(c2.time, to), b[5]);
      assert.equal(lastDayStart(c2.time, b[3]), b[3]);
    });
  }
}

function regression() {
  const ctx = makeCtx({ start: 10 * HOUR });
  const o = [];
  ctx.sched.handler('a', (e, c) => o.push(c.now()));
  ctx.sched.schedule('a', 5 * HOUR, {});
  const r = catchUp(ctx, 10 * HOUR, 8 * HOUR);
  assert.deepEqual([r.noop, r.fired, r.savedAt], [true, 0, 8 * HOUR], 'from > to: nothing fires, savedAt clamps to `to`');
  assert.deepEqual(o, []);
  assert.equal(ctx.sched.pending().length, 1, 'nothing lost');
  assert.deepEqual(ctx.log, []);
  const r2 = catchUp(ctx, r.savedAt, 9 * HOUR);
  assert.deepEqual(o, [5 * HOUR], 'the next real advance starts from the clamped time');
  assert.equal(r2.noop, false);
  assert.equal(catchUp(ctx, NaN, 1).noop, true);
}

function robustness() {
  const ctx = makeCtx({ start: 0, strict: false });
  const o = [];
  ctx.sched.handler('boom', () => { throw new Error('x'); });
  ctx.sched.handler('ok', (e, c) => o.push(c.now()));
  ctx.sched.schedule('boom', 1, {});
  ctx.sched.schedule('ok', 2, {});
  ctx.sched.schedule('nobody', 1, {});
  const err = console.error; console.error = () => {};
  let r;
  try { r = catchUp(ctx, 0, 10); } finally { console.error = err; }
  assert.equal(r.errors.length, 1);
  assert.deepEqual(o, [2], 'a throwing handler does not stop the pass');
  assert.deepEqual(ctx.sched.pending().map((e) => e.kind), ['nobody'], 'an entry whose handler is not registered is kept');
  assert.equal(ctx.sched.sim, null);
  const s2 = makeCtx({ start: 0, strict: true });
  s2.sched.handler('boom', () => { throw new Error('x'); });
  s2.sched.schedule('boom', 1, {});
  assert.throws(() => catchUp(s2, 0, 10), /x/);
  assert.equal(s2.sched.sim, null, 'sim cleared after a strict throw');
  // cancel from inside a handler stops a repeat
  const c3 = makeCtx({ start: 0 });
  c3.sched.handler('r', (e, c) => { c.sched.cancel('rep'); });
  c3.sched.schedule('r', 1, {}, { key: 'rep', repeat: { every: 1 }, catchUp: 'each' });
  catchUp(c3, 0, 100);
  assert.equal(c3.sched.pending().length, 0);
  // not re-entrant
  const c4 = makeCtx({ start: 0 });
  c4.sched.handler('n', (e, c) => catchUp(c, 0, 1));
  c4.sched.schedule('n', 0, {});
  assert.throws(() => catchUp(c4, 0, 5), /re-entrant/);
}

function determinism() {
  const build = () => {
    const ctx = makeCtx({ start: local(2026, 10, 23, 12) });
    const t0 = ctx.clock.t, out = [];
    ctx.sched.handler('trap', (e, c) => { out.push(['trap', c.now(), e.id]); if (e.data.n < 5) c.sched.schedule('trap', c.now() + 7 * HOUR, { n: e.data.n + 1 }); });
    ctx.sched.handler('visit', (e, c, i) => out.push(['visit', c.now(), i.missed]));
    ctx.sched.handler('mail', (e, c) => out.push(['mail', c.now()]));
    ctx.sched.handler('@day', (e, c) => out.push(['@day', c.now()]));
    ctx.sched.schedule('trap', t0 + 3 * HOUR, { n: 0 });
    ctx.sched.schedule('mail', t0 + 20 * HOUR, {}, { repeat: { rule: 'day' }, catchUp: 'each' });
    ctx.sched.schedule('visit', t0 + HOUR, {}, { repeat: { every: HOUR }, catchUp: { max: 10 } });
    return { ctx, t0, out };
  };
  const a = build(), b = build(), c = build();
  catchUp(a.ctx, a.t0, a.t0 + 6 * DAY);
  catchUp(b.ctx, b.t0, b.t0 + 6 * DAY);
  assert.deepEqual(a.out, b.out, 'same inputs, same firings');
  assert.deepEqual(a.ctx.sched.serialize(), b.ctx.sched.serialize());
  assert.deepEqual(a.ctx.log, b.ctx.log);
  // the same span in several windows fires the same one-shots and boundaries at the same stamps
  for (let t = c.t0; t < c.t0 + 6 * DAY; t += 13 * HOUR) catchUp(c.ctx, t, Math.min(t + 13 * HOUR, c.t0 + 6 * DAY));
  const pick = (o) => o.filter((x) => x[0] !== 'visit');
  assert.deepEqual(pick(c.out), pick(a.out), 'chunked catch-up equals one pass');
  // a save in the middle and a load gives the same result
  const d = build();
  catchUp(d.ctx, d.t0, d.t0 + 2 * DAY);
  const saved = JSON.parse(JSON.stringify(d.ctx.sched.serialize()));
  d.ctx.sched.load(saved);
  catchUp(d.ctx, d.t0 + 2 * DAY, d.t0 + 6 * DAY);
  assert.deepEqual(pick(d.out), pick(a.out));
}

export default function () {
  api(); roundTrip(); threeDays(); stampsTime(); longAbsence(); repeats(); ruleDay(); reschedule(); boundaries(); dst(); regression(); robustness(); determinism();
}

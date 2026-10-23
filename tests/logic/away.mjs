// Away aggregator: describe, lines, reveals, threshold bypass, slice round trip, with the scheduler driving it.
import assert from 'node:assert/strict';
import { createAway, AWAY_MS, awaySlice } from '../../src/core/away.js';
import { catchUp } from '../../src/core/sched.js';
import { makeCtx, local, MIN, HOUR, DAY } from '../lib/schedkit.mjs';

/** ctx whose bus forwards to away, like core.js will wire it. */
function world(start = local(2026, 10, 23, 12)) {
  const ctx = makeCtx({ start });
  const away = createAway({ now: ctx.now });
  const emit = ctx.bus.emit;
  ctx.bus.emit = (name, payload = {}) => { emit(name, payload); away.record(name, payload, { name, at: ctx.now(), away: !!ctx.sched.sim?.away }); return payload; };
  ctx.away = away;
  return ctx;
}

function summary() {
  const ctx = world(), t0 = ctx.clock.t, { away, sched } = ctx;
  away.describe('cropRipe', (items) => ({ icon: 'rice', text: `${items.length} crops ripened`, order: 20 }));
  away.describe('catch', (items, { total }) => [{ icon: 'fish', text: `${total} fish in the trap`, order: 10 }, null]);
  away.describe('mail', () => ({ icon: 'mail', text: 'a letter', order: 5 }));
  sched.handler('trap', (e, c) => { c.bus.emit('catch', { id: 'koi' }); });
  sched.handler('ripen', (e, c) => { c.bus.emit('cropRipe', { crop: 'rice', x: 1, z: 2 }); c.bus.emit('cropRipe', { crop: 'tea', x: 2, z: 2 }); c.bus.emit('cropRipe', { crop: 'rice', x: 3, z: 2 }); });
  sched.schedule('trap', t0 + 2 * HOUR, {});
  sched.schedule('trap', t0 + 3 * HOUR, {});
  sched.schedule('ripen', t0 + 4 * HOUR, {});
  away.begin(t0);
  away.note('grew', 4);
  away.note('forage', 6);
  catchUp(ctx, t0, t0 + 3 * DAY);
  const s = away.end(t0 + 3 * DAY);
  assert.equal(s.awayMs, 3 * DAY);
  assert.equal(s.days, 3);
  assert.equal(s.newDay, true);
  assert.deepEqual(s.ripe, { rice: 2, tea: 1 });
  assert.equal(s.grew, 4);
  assert.equal(s.forage, 6);
  assert.deepEqual(s.lines.map((l) => l.text), ['2 fish in the trap', '3 crops ripened']);
  assert.deepEqual(s.reveals, []);
  assert.ok(s.today);
  assert.equal(away.shouldShow(s), true);
  assert.equal(away.pending.today, true);
  away.dismiss();
  assert.equal(away.pending, null);
  assert.equal(away.active, false);
}

function shortAway() {
  const away = createAway();
  away.begin(1000);
  const s = away.end(1000 + 5 * MIN);
  assert.deepEqual([s.awayMs, s.days, s.newDay, s.forage, s.lines, s.reveals], [5 * MIN, 0, false, 0, [], []]);
  assert.equal(away.shouldShow(s), false);
  assert.equal(away.needsToday(s), false);
  assert.equal(away.pending, null, 'nothing to show, nothing stored');
  assert.equal(AWAY_MS, 10 * MIN);
  assert.equal(away.end().awayMs, 0, 'end without begin is empty, not a throw');
}

function revealBypass() {
  const ctx = world(), t0 = ctx.clock.t, { away, sched } = ctx;
  sched.handler('project', (e, c) => { c.bus.emit('projectDone', { project: e.data.id, doneAt: c.now(), unlocks: [] }); });
  sched.schedule('project', t0 + 2 * MIN, { id: 'pavilion' });
  away.begin(t0);
  catchUp(ctx, t0, t0 + 5 * MIN);
  const s = away.end(t0 + 5 * MIN);
  assert.equal(s.awayMs < AWAY_MS && !s.newDay, true);
  assert.deepEqual(s.reveals, [{ kind: 'project', id: 'pavilion' }]);
  assert.equal(away.shouldShow(s), true, 'a project finishing in a 5-minute check-in bypasses the threshold');
  assert.equal(s.today, false, 'and opens straight to the reveal, without Today');
  // reload mid-reveal
  const saved = JSON.parse(JSON.stringify(away.serialize()));
  const b = createAway();
  b.load(saved);
  assert.deepEqual(b.pending.reveals, [{ kind: 'project', id: 'pavilion' }]);
  // a foreground completion queues the same reveal
  b.record('projectDone', { project: 'bridge2' }, { away: false, at: 1 });
  b.record('projectDone', { project: 'bridge2' }, { away: false, at: 1 });
  assert.deepEqual(b.pending.reveals.map((r) => r.id), ['pavilion', 'bridge2'], 'queued once');
  b.ack('project', 'pavilion');
  assert.deepEqual(b.pending.reveals.map((r) => r.id), ['bridge2']);
  b.ack('project', 'bridge2');
  assert.equal(b.pending, null, 'acknowledging the last reveal clears the slice');
  // a foreground completion alone
  const c = createAway();
  c.record('projectDone', { project: 'x' }, { away: false });
  assert.equal(c.pending.reveals.length, 1);
  assert.equal(c.pending.awayMs, 0);
  // dismissing Today keeps unseen reveals; reveals acked before Today keep the summary
  const d = createAway();
  d.begin(0);
  d.record('projectDone', { project: 'p' }, { away: true, at: 1 });
  d.record('dayChange', { day: 'b', prev: 'a', skipped: 1 }, { away: true, at: 2 });
  const sd = d.end(3 * DAY);
  assert.equal(sd.days, 2);
  d.ack('project', 'p');
  assert.ok(d.pending && d.pending.today, 'Today still due');
  d.dismiss();
  assert.equal(d.pending, null);
  const e = createAway();
  e.begin(0);
  e.record('projectDone', { project: 'p' }, { away: true, at: 1 });
  e.end(3 * DAY);
  e.dismiss();
  assert.deepEqual(e.pending.reveals, [{ kind: 'project', id: 'p' }], 'dismiss keeps reveals');
  assert.equal(e.pending.today, false);
}

function merges() {
  const a = createAway();
  a.begin(0);
  a.record('projectDone', { project: 'one' }, { away: true });
  a.end(20 * MIN);
  a.begin(20 * MIN);
  a.record('projectDone', { project: 'two' }, { away: true });
  a.record('projectDone', { project: 'one' }, { away: true });
  const s = a.end(40 * MIN);
  assert.deepEqual(s.reveals.map((r) => r.id), ['one', 'two'], 'an unacknowledged reveal survives the next window, deduped');
  assert.deepEqual(a.pending.reveals.map((r) => r.id), ['one', 'two']);
}

function robust() {
  const a = createAway();
  a.begin(0);
  a.record('say', { text: 'x' }, { away: true });
  a.record('catch', { id: 'a' }, { away: false });
  for (let i = 0; i < 500; i++) a.record('catch', { id: i }, { away: true, at: i });
  let seen;
  a.describe('catch', (items, info) => { seen = [items.length, info.total, info.at.length]; });
  a.describe('catch', () => { throw new Error('bad describer'); });
  const err = console.error; console.error = () => {};
  try { a.end(1); } finally { console.error = err; }
  assert.deepEqual(seen, [200, 500, 200], 'payloads capped, count kept; foreground and quiet events ignored; a throwing describer is skipped');
  // attach adapts both onAny shapes
  const calls = [];
  const mk = (shape) => { const b = createAway(); b.record = (...x) => calls.push(x); b.attach({ onAny: (fn) => { shape === 'name' ? fn('n', { p: 1 }, { name: 'n', away: true }) : fn({ p: 1 }, { name: 'n', away: true }); return () => {}; } }); };
  mk('name'); mk('payload');
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0][0], 'n');
  const l = createAway();
  l.load({ pending: { lines: [], reveals: 'junk' } });
  assert.deepEqual(l.pending.reveals, []);
  l.load(undefined);
  assert.equal(l.pending, null);
  assert.deepEqual(awaySlice.defaults(), { pending: null });
}

export default function () { summary(); shortAway(); revealBypass(); merges(); robust(); }

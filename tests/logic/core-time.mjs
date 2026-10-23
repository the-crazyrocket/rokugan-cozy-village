// core/time.js: dayKey and hour equal game/clock.js for every input, real-calendar seasons, dev clock rules.
import assert from 'node:assert/strict';
import { createTime, dayKey, hourOf, dayNumber, SEASONS, HOUR, DAY } from '../../src/core/time.js';
import * as clock from '../../src/game/clock.js';

const ZONES = ['UTC', 'Pacific/Auckland', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe', 'America/Sao_Paulo', 'Pacific/Apia'];
const at = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const mk = (ms, o = {}) => createTime({ realNow: () => ms, perf: () => 0, ...o });

function inZones(fn) {
  const saved = process.env.TZ;
  try { for (const z of ZONES) { process.env.TZ = z; fn(z); } } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
}

export default function () {
  assert.equal(clock.DAY_START_HOUR, 5);
  assert.deepEqual([HOUR, DAY], [clock.HOUR, clock.DAY]);

  inZones((zone) => {
    // many timestamps (deterministic LCG over 2019..2032), plus every half hour of 2026
    let s = 12345;
    const ts = [0, -1, 86400000 * 365 * 40];
    for (let i = 0; i < 1500; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; ts.push(1546300800000 + (s / 4294967296) * 13 * 365 * DAY); }
    for (let t = at(2026, 1, 1, 0); t < at(2027, 1, 1, 0); t += HOUR / 2) ts.push(t, t - 1);
    for (const ms of ts) {
      assert.equal(dayKey(ms), clock.dayKey(ms), `${zone} dayKey ${ms}`);
      assert.equal(hourOf(ms), clock.hourOf(ms), `${zone} hour ${ms}`);
      const t = mk(ms);
      assert.equal(t.dayKey(), clock.dayKey(ms));
      assert.equal(t.hour(), clock.hourOf(ms));
      assert.equal(t.dayKey(ms + 7 * HOUR), clock.dayKey(ms + 7 * HOUR));
      assert.equal(t.hour(ms + 7 * HOUR), clock.hourOf(ms + 7 * HOUR));
    }
    assert.ok(Object.is(dayKey(NaN), clock.dayKey(NaN)));

    // the 05:00 rollover on an ordinary day
    assert.equal(dayKey(at(2026, 6, 10, 4, 59)), '2026-06-09');
    assert.equal(dayKey(at(2026, 6, 10, 5, 0)), '2026-06-10');
    assert.equal(dayKey(at(2026, 6, 10, 23, 59)), '2026-06-10');
    assert.equal(dayKey(at(2026, 6, 11, 0, 30)), '2026-06-10');
    assert.equal(dayNumber('1970-01-02'), 1);
    assert.equal(mk(at(2026, 10, 23)).day() - mk(at(2026, 10, 22)).day(), 1);
  });

  // clock: now = real + carry + devOffset; skip is session-only; mono ignores it
  let real = 1_000_000, perf = 50;
  const t = createTime({ realNow: () => real, perf: () => perf, carry: 500, devOffset: 20 });
  assert.equal(t.now(), 1_000_520);
  real += 1000; perf += 16;
  assert.deepEqual([t.now(), t.mono()], [1_001_520, 66]);
  assert.equal(t.skip(HOUR), 1_001_520 + HOUR);
  assert.equal(t.mono(), 66);
  assert.deepEqual(t.serialize(), { carry: 500 }, 'devOffset is never serialised');
  t.load({ carry: 7 });
  assert.equal(t.carry, 7);
  assert.equal(typeof createTime().now(), 'number');
  assert.ok(createTime().mono() >= 0);

  // seasons: the village day's month, both hemispheres, 12 month edges
  inZones((zone) => {
    const N = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
    for (let m = 1; m <= 12; m++) {
      const north = mk(at(2026, m, 15));
      assert.equal(north.season(), N[m - 1], `${zone} month ${m}`);
      const south = mk(at(2026, m, 15), { hemisphere: 'south' });
      assert.equal(south.season(), N[(m + 5) % 12], `${zone} south month ${m}`);
      assert.equal(south.seasonInfo().season, south.season());
    }
    const flip = mk(at(2026, 10, 23));
    assert.equal(flip.season(), 'autumn');
    flip.hemisphere = 'south';
    assert.equal(flip.season(), 'spring');

    // a season starts with the village day: the instant before it is still the old season
    for (const [y, m, prev, next] of [[2026, 3, 'winter', 'spring'], [2026, 6, 'spring', 'summer'], [2026, 9, 'summer', 'autumn'], [2026, 12, 'autumn', 'winter']]) {
      const first = firstOfDay(y, m, 1);
      assert.equal(mk(first - 1).season(), prev, `${zone} before ${y}-${m}`);
      assert.equal(mk(first).season(), next, `${zone} at ${y}-${m}`);
    }

    // seasonInfo: counts, progress, next.at is exactly the first instant of the next season
    const info = mk(at(2026, 10, 23, 12)).seasonInfo();
    assert.deepEqual([info.season, info.year, info.dayOfSeason, info.daysInSeason, info.next.season], ['autumn', 2026, 53, 91, 'winter']);
    assert.ok(info.progress > 52 / 91 && info.progress < 53 / 91);
    assert.equal(dayKey(info.next.at), '2026-12-01');
    assert.equal(dayKey(info.next.at - 1), '2026-11-30');
    const win = mk(at(2027, 1, 20)).seasonInfo();
    assert.deepEqual([win.season, win.year, win.dayOfSeason, win.daysInSeason, win.next.season], ['winter', 2026, 51, 90, 'spring']);
    assert.equal(mk(at(2028, 2, 29)).seasonInfo().daysInSeason, 91, 'leap winter');
    assert.equal(mk(at(2028, 2, 29)).seasonInfo().dayOfSeason, 91);
    const start = mk(at(2026, 6, 1, 12)).seasonInfo();
    assert.deepEqual([start.season, start.dayOfSeason, start.daysInSeason], ['summer', 1, 92]);

    // walking every day for 2 years: info is continuous and next.at is a true boundary
    let prev = null;
    for (let d = new Date(2026, 0, 1, 12).getTime(), i = 0; i < 2 * 366; i++, d += DAY) {
      const tm = mk(d), si = tm.seasonInfo();
      assert.equal(si.season, tm.season());
      assert.ok(si.dayOfSeason >= 1 && si.dayOfSeason <= si.daysInSeason && si.progress >= 0 && si.progress < 1);
      assert.ok(si.next.at > d && si.next.at - d < 93 * DAY);
      assert.equal(mk(si.next.at).season(), si.next.season, `${zone} at ${new Date(si.next.at).toISOString()}`);
      assert.notEqual(mk(si.next.at - 1).season(), si.next.season);
      if (prev && prev.season === si.season) assert.equal(si.dayOfSeason, prev.dayOfSeason + 1, `${zone} day count ${dayKey(d)}`);
      prev = si;
    }
  });
  assert.deepEqual(SEASONS, ['spring', 'summer', 'autumn', 'winter']);

  // DST days (day length 23 or 25 h) keep exact dayKey monotonicity and never skip a village day
  inZones((zone) => {
    let lastKey = '', n = 0;
    for (let ms = at(2026, 1, 1, 0); ms < at(2027, 1, 1, 0); ms += HOUR / 2) {
      const k = dayKey(ms);
      if (k !== lastKey) { if (lastKey) assert.equal(dayNumber(k) - dayNumber(lastKey), 1, `${zone} ${lastKey} -> ${k}`); lastKey = k; n++; }
    }
    assert.ok(n >= 364 && n <= 366, `${zone} ${n} village days`);
  });

  // override: gallery and tests; saving off while set
  const o = mk(at(2026, 10, 23, 14));
  assert.equal(o.savingAllowed, true);
  assert.deepEqual(o.weather(), { kind: 'clear' });
  o.override = { season: 'spring', hour: 22.5, weather: 'rain' };
  assert.deepEqual([o.season(), o.hour(), o.weather().kind, o.seasonInfo().season, o.seasonInfo().next.season], ['spring', 22.5, 'rain', 'spring', 'summer']);
  assert.equal(o.dayKey(), clock.dayKey(at(2026, 10, 23, 14)), 'dayKey is never overridden');
  assert.equal(o.savingAllowed, false);
  assert.deepEqual(o.savingBlockers, ['override']);
  o.override = null;
  assert.equal(o.savingAllowed, true);
  assert.equal(o.season(), 'autumn');
  o.override = { weather: 'snow' };
  assert.equal(o.season(), 'autumn');
  assert.equal(o.hour(), clock.hourOf(at(2026, 10, 23, 14)));
  assert.equal(createTime({ realNow: () => 0, readOnly: true }).savingAllowed, false);

  // ?date moves the clock by days, keeps the time of day, and disables saving
  inZones((zone) => {
    const d = mk(at(2026, 10, 23, 14, 30));
    assert.equal(d.useDate('2027-03-02'), true, zone);
    assert.equal(clock.dayKey(d.now()), '2027-03-02');
    assert.equal(new Date(d.now()).getHours(), 14);
    assert.equal(d.season(), 'spring');
    assert.equal(d.savingAllowed, false);
    assert.deepEqual(d.savingBlockers, ['date']);
    assert.equal(d.devOffset, d.now() - at(2026, 10, 23, 14, 30));
    assert.equal(mk(0).useDate('2026-02-30'), false);
    assert.equal(mk(0).useDate('tomorrow'), false);
    const sk = mk(at(2026, 11, 28, 12));
    sk.skip(100 * DAY);
    assert.equal(sk.season(), 'spring', 'skipping 100 days crosses seasons');
    assert.equal(sk.savingAllowed, true, 'skip alone does not touch saving; the save namespace decides');
  });

  // tick emits dayChange / seasonChange once per change, with day numbers
  const events = [];
  let clockNow = at(2026, 11, 29, 20);
  const tk = createTime({ realNow: () => clockNow, emit: (n, p) => events.push([n, p]) });
  assert.deepEqual(tk.tick(), { dayChanged: false, seasonChanged: false, day: '2026-11-29', season: 'autumn', prevDay: '2026-11-29', prevSeason: 'autumn' });
  clockNow = at(2026, 11, 30, 3);
  tk.tick();
  assert.deepEqual(events, [], 'before 05:00 it is still the same village day');
  clockNow = at(2026, 11, 30, 6);
  tk.tick();
  tk.tick();
  assert.deepEqual(events, [['dayChange', { day: dayNumber('2026-11-30'), prev: dayNumber('2026-11-29'), skipped: 0 }]]);
  events.length = 0;
  tk.skip(3 * DAY);
  const r = tk.tick();
  assert.ok(r.dayChanged && r.seasonChanged);
  assert.deepEqual(events, [
    ['dayChange', { day: dayNumber('2026-12-03'), prev: dayNumber('2026-11-30'), skipped: 2 }],
    ['seasonChange', { season: 'winter', prev: 'autumn', year: 2026 }],
  ]);
  events.length = 0;
  tk.skip(DAY);
  tk.tick({ silent: true });
  assert.deepEqual(events, []);
  assert.equal(tk.tick().dayChanged, false);

  // weather and festival hooks
  const h = mk(at(2026, 10, 23, 9));
  h.weatherProvider = (key, hour) => (hour < 10 ? { kind: 'fog', key } : 'rain');
  assert.deepEqual(h.weather(), { kind: 'fog', key: '2026-10-23' });
  assert.deepEqual(h.weather(at(2026, 10, 23, 15)), { kind: 'rain' });
  const fests = [['hanami', { span: { month: 3, day: 28, days: 7 } }], ['tanabata', { span: { month: 7, day: 7, days: 1 } }], ['newyear', { span: { month: 12, day: 30, days: 5 } }]];
  const on = (y, m, d, hh = 12) => mk(at(y, m, d, hh), { festivals: () => fests }).festival();
  assert.equal(on(2026, 3, 27), null);
  assert.equal(on(2026, 3, 28), 'hanami');
  assert.equal(on(2026, 4, 3), 'hanami');
  assert.equal(on(2026, 4, 4), null);
  assert.equal(on(2026, 7, 7), 'tanabata');
  assert.equal(on(2026, 12, 31), 'newyear');
  assert.equal(on(2027, 1, 3), 'newyear', 'a span crosses the new year');
  assert.equal(on(2027, 1, 4), null);
  assert.equal(on(2026, 3, 28, 4), null, 'before 05:00 belongs to the previous village day');
  assert.equal(on(2026, 10, 23), null);
  assert.equal(mk(at(2026, 10, 23)).festival(), null, 'no festivals domain wired');
  const g = mk(at(2026, 3, 29), { festivals: () => fests });
  g.override = { festival: 'tanabata' };
  assert.equal(g.festival(), 'tanabata');
}

// first instant of a village day, found by scanning (independent of core/time.js)
function firstOfDay(y, m, d) {
  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let t = new Date(y, m - 1, d - 1, 12).getTime();
  while (clock.dayKey(t) < key) t += 60_000;
  return t;
}

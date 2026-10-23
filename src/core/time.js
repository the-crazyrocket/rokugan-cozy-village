// Village time: the player's local clock plus a persisted carry and a session-only dev offset.
// A village day rolls at 05:00 local (dayKey/hourOf are bit-identical to game/clock.js); seasons follow
// the real calendar of the village day (UTC day arithmetic, so DST never shifts a boundary).
// The only module in core that reads the wall clock.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const DAY_START_HOUR = 5;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const pad = (n) => String(n).padStart(2, '0');
const CLEAR = Object.freeze({ kind: 'clear' });

/** 'YYYY-MM-DD' of the village day containing ms (local time, day starts at 5:00). */
export function dayKey(ms) {
  const d = new Date(ms - DAY_START_HOUR * HOUR);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local hour of day as a fraction (0..24). */
export function hourOf(ms) {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** "45 s", "12 min", "3 h 20 min", "2 days" */
export function duration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return mm ? `${h} h ${mm} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

/** Whole days since 1970-01-01 of a dayKey ('YYYY-MM-DD'); the number dayChange and cctx.day carry. */
export const dayNumber = (key) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / DAY;

/** First instant (ms) of the village day y-m-d (m is 0-11), found by bisecting dayKey so DST days stay exact. */
function firstMsOfDay(y, m, d) {
  const target = `${y}-${pad(m + 1)}-${pad(d)}`;
  const guess = new Date(y, m, d, DAY_START_HOUR).getTime();
  let lo = guess - 6 * HOUR, hi = guess + 6 * HOUR;
  while (dayKey(lo) >= target) lo -= 6 * HOUR;
  while (dayKey(hi) < target) hi += 6 * HOUR;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (dayKey(mid) >= target) hi = mid; else lo = mid; }
  return hi;
}

export function createTime({ realNow = () => Date.now(), perf = () => performance.now(), carry = 0, devOffset = 0, hemisphere = 'north', festivals = null, readOnly = false, emit = null } = {}) {
  let override = null;
  let last = null;
  const blockers = new Set(readOnly ? ['readonly'] : []);

  const now = () => realNow() + carry + devOffset;
  const villageDate = (ms) => { const d = new Date(ms - DAY_START_HOUR * HOUR); return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; };
  const shift = () => (time.hemisphere === 'south' ? 6 : 0);
  const blockIndex = (m) => Math.floor(((((m + shift()) % 12) + 10) % 12) / 3);

  function seasonInfo(ms = now()) {
    const v = villageDate(ms);
    const idx = blockIndex(v.m);
    const next = SEASONS[(idx + 1) % 4];
    if (override?.season) {
      const i = SEASONS.indexOf(override.season);
      return { season: override.season, year: v.y, dayOfSeason: 1, daysInSeason: 90, progress: 0, next: { season: SEASONS[(i + 1) % 4], at: null } };
    }
    const into = ((((v.m + shift()) % 12) + 10) % 12) % 3;
    const start = Date.UTC(v.y, v.m - into, 1), end = Date.UTC(v.y, v.m - into + 3, 1);
    const days = (end - start) / DAY, dayOfSeason = (Date.UTC(v.y, v.m, v.d) - start) / DAY + 1;
    const t = new Date(ms - DAY_START_HOUR * HOUR);
    const frac = (t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds()) / 86400;
    const e = new Date(end);
    return {
      season: SEASONS[idx],
      year: new Date(start).getUTCFullYear(),
      dayOfSeason,
      daysInSeason: days,
      progress: Math.min(1, (dayOfSeason - 1 + frac) / days),
      next: { season: next, at: firstMsOfDay(e.getUTCFullYear(), e.getUTCMonth(), 1) },
    };
  }

  function festival(ms = now()) {
    if (override && 'festival' in override) return override.festival ?? null;
    if (time.festivalProvider) return time.festivalProvider(ms) ?? null;
    const entries = typeof festivals === 'function' ? festivals() : festivals;
    if (!entries) return null;
    const v = villageDate(ms), today = Date.UTC(v.y, v.m, v.d);
    for (const [id, def] of entries) {
      const { month, day, days = 1 } = def.span;
      for (const y of [v.y, v.y - 1]) {
        const start = Date.UTC(y, month - 1, day);
        if (today >= start && today < start + days * DAY) return id;
      }
    }
    return null;
  }

  const time = {
    now,
    /** Monotonic ms for animation timing; unaffected by skip. */
    mono: () => perf(),
    /** Session-only jump forward (dev panel, tests); returns the new now(). */
    skip(ms) { devOffset += ms; return now(); },
    dayKey: (ms = now()) => dayKey(ms),
    day: (ms = now()) => dayNumber(dayKey(ms)),
    hour: (ms = now()) => (typeof override?.hour === 'number' ? override.hour : hourOf(ms)),
    season: (ms = now()) => (override?.season ? override.season : SEASONS[blockIndex(villageDate(ms).m)]),
    seasonInfo,
    weather(ms = now()) {
      if (override?.weather) return { kind: override.weather };
      if (!time.weatherProvider) return CLEAR;
      const w = time.weatherProvider(dayKey(ms), time.hour(ms));
      return typeof w === 'string' ? { kind: w } : w || CLEAR;
    },
    festival,
    weatherProvider: null,
    festivalProvider: null,
    hemisphere,
    get override() { return override; },
    set override(o) { override = o ? { ...o } : null; },
    get savingAllowed() { return !override && !blockers.size; },
    /** Why saving is off: 'override', 'date', 'readonly' or caller-supplied reasons. */
    get savingBlockers() { return [...(override ? ['override'] : []), ...blockers]; },
    blockSaving: (reason) => blockers.add(reason),
    unblockSaving: (reason) => blockers.delete(reason),
    get carry() { return carry; },
    setCarry(n) { carry = n; },
    get devOffset() { return devOffset; },
    set devOffset(n) { devOffset = n; },
    /** ?date=YYYY-MM-DD: jump to that local date at the current time of day; disables saving for the session. */
    useDate(str) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
      if (!m) return false;
      const base = realNow() + carry, d = new Date(base);
      const t = new Date(+m[1], +m[2] - 1, +m[3], d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
      if (t.getMonth() !== +m[2] - 1 || t.getDate() !== +m[3]) return false;
      devOffset = t.getTime() - base;
      blockers.add('date');
      return true;
    },
    serialize: () => ({ carry }),
    load(d) { carry = d?.carry || 0; },
    emit,
    /** Compare with the last tick; emits dayChange {day, prev (day numbers), skipped} and seasonChange {season, prev, year}. */
    tick({ silent = false } = {}) {
      const key = dayKey(now()), season = time.season();
      const res = { dayChanged: false, seasonChanged: false, day: key, season, prevDay: last?.key ?? key, prevSeason: last?.season ?? season };
      if (last && key !== last.key) {
        res.dayChanged = true;
        const skipped = Math.max(0, dayNumber(key) - dayNumber(last.key) - 1);
        if (!silent) time.emit?.('dayChange', { day: dayNumber(key), prev: dayNumber(last.key), skipped });
      }
      if (last && season !== last.season) {
        res.seasonChanged = true;
        if (!silent) time.emit?.('seasonChange', { season, prev: last.season, year: seasonInfo().year });
      }
      last = { key, season };
      return res;
    },
  };
  last = { key: dayKey(now()), season: time.season() };
  return time;
}

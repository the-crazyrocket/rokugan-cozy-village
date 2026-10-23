// Persisted scheduler plus the one catch-up pass used by load, resume, skipTime and the foreground tick.
// Entries are plain JSON ({id, kind, at, data, key?, repeat?, catchUp?, owner?, xz?}); handlers are registered by kind.
// While a handler runs sched.sim = {at, away}: core.now() returns sim.at, and core.catchUp sets the bus away flag from opts.away.
import { dayNumber } from './time.js';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const MAX_REPEATS = 10_000;  // repeat firings per catch-up, then repeats and boundaries jump to `to`
export const MAX_DAYS = 366;        // simulated days per catch-up, same jump
const MAX_FIRINGS = 250_000;        // runaway guard for handlers that keep scheduling themselves inside the window

const clonej = (v) => JSON.parse(JSON.stringify(v));
const states = new WeakMap();
const getState = (s) => { for (let o = s; o; o = Object.getPrototypeOf(o)) if (states.has(o)) return states.get(o); throw new Error('sched: not a scheduler'); };

function normRepeat(r) {
  if (r && Number.isFinite(r.every) && r.every > 0) return { every: r.every };
  if (r && r.rule === 'day') return { rule: 'day' };
  throw new Error(`sched: bad repeat ${JSON.stringify(r)}`);
}

function normCatch(c) {
  if (c === 'collapse' || c === 'each') return c;
  if (c && Number.isInteger(c.max) && c.max >= 1) return { max: c.max };
  throw new Error(`sched: bad catchUp ${JSON.stringify(c)}`);
}

/** First instant after ms that belongs to a different village day (05:00 local), found through time.dayKey so DST needs no date maths here. */
export function nextDayStart(time, ms) {
  const k = time.dayKey(ms);
  let lo = ms, hi = ms + 26 * HOUR;
  for (let i = 0; time.dayKey(hi) === k && i < 64; i++) { lo = hi; hi += 26 * HOUR; }
  while (hi - lo > 1) { const mid = lo + Math.floor((hi - lo) / 2); if (time.dayKey(mid) === k) lo = mid; else hi = mid; }
  return hi;
}

/** Start of the village day that contains ms. */
export function lastDayStart(time, ms) {
  const k = time.dayKey(ms);
  let hi = ms, lo = ms - 26 * HOUR;
  for (let i = 0; time.dayKey(lo) === k && i < 64; i++) { hi = lo; lo -= 26 * HOUR; }
  while (hi - lo > 1) { const mid = lo + Math.floor((hi - lo) / 2); if (time.dayKey(mid) === k) hi = mid; else lo = mid; }
  return hi;
}

/** Whole days between two 'YYYY-MM-DD' day keys. */
export function dayDiff(a, b) {
  const p = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / DAY);
}

export function createSched({ time = null } = {}) {
  const st = { seq: 0, entries: [], byKey: new Map(), handlers: new Map(), sim: null, time };
  const sched = {
    get time() { return st.time; },
    set time(t) { st.time = t; },
    get sim() { return st.sim; },

    schedule(kind, at, data, o = {}) { return add(st, kind, at, data, o); },
    cancel(idOrKey) {
      const e = find(st, idOrKey);
      if (!e) return false;
      drop(st, e);
      return true;
    },
    get(idOrKey) { const e = find(st, idOrKey); return e ? copy(e) : null; },
    due(now) { return sorted(st.entries).filter((e) => e.at <= now).map(copy); },
    pending(kind) { return sorted(st.entries).filter((e) => !kind || e.kind === kind).map(copy); },
    next(kind) { const l = sorted(st.entries).filter((e) => !kind || e.kind === kind); return l.length ? copy(l[0]) : null; },
    handler(kind, fn) {
      if (typeof fn !== 'function') throw new Error(`sched: handler ${kind} is not a function`);
      if (st.handlers.has(kind)) throw new Error(`sched: handler ${kind} already registered`);
      st.handlers.set(kind, fn);
      return () => { if (st.handlers.get(kind) === fn) st.handlers.delete(kind); };
    },
    hasHandler(kind) { return st.handlers.has(kind); },
    serialize() { return { seq: st.seq, entries: sorted(st.entries).map(copy) }; },
    load(d) {
      st.entries = []; st.byKey.clear();
      const ids = new Set();
      let seq = Number(d && d.seq) || 0;
      const rows = (d && Array.isArray(d.entries) ? d.entries : []).filter((r) => r && typeof r.kind === 'string' && Number.isFinite(r.at));
      for (const r of rows) if (Number.isInteger(r.id) && r.id > seq) seq = r.id;
      for (const r of rows) {
        let e;
        try { e = build(Number.isInteger(r.id) && !ids.has(r.id) ? r.id : ++seq, r.kind, r.at, r.data, r); } catch { continue; }
        ids.add(e.id);
        if (e.key != null && st.byKey.has(e.key)) drop(st, st.byKey.get(e.key));
        st.entries.push(e);
        if (e.key != null) st.byKey.set(e.key, e);
      }
      st.seq = seq;
    },
    /** A view whose schedule() records `owner` by default (ctx.as('wpXY')). */
    as(owner) { const v = Object.create(sched); v.schedule = (kind, at, data, o = {}) => add(st, kind, at, data, { owner, ...o }); return v; },
  };
  states.set(sched, st);
  return sched;
}

function build(id, kind, at, data, o) {
  if (typeof kind !== 'string' || !kind || kind[0] === '@') throw new Error(`sched: bad kind ${kind}`);
  if (!Number.isFinite(at)) throw new Error(`sched: bad time for ${kind}`);
  const e = { id, kind, at, data: clonej(data ?? {}) };
  if (o.key != null) e.key = String(o.key);
  if (o.repeat) e.repeat = normRepeat(o.repeat);
  if (o.catchUp != null) e.catchUp = normCatch(o.catchUp);
  if (o.owner) e.owner = String(o.owner);
  if (o.xz) e.xz = clonej(o.xz);
  return e;
}

function add(st, kind, at, data, o) {
  const e = build(st.seq + 1, kind, at, data, o);
  st.seq++;
  if (e.key != null && st.byKey.has(e.key)) drop(st, st.byKey.get(e.key));
  st.entries.push(e);
  if (e.key != null) st.byKey.set(e.key, e);
  return e.id;
}

function drop(st, e) {
  const i = st.entries.indexOf(e);
  if (i >= 0) st.entries.splice(i, 1);
  if (e.key != null && st.byKey.get(e.key) === e) st.byKey.delete(e.key);
}

const find = (st, k) => (typeof k === 'number' ? st.entries.find((e) => e.id === k) : st.byKey.get(String(k)));
const copy = (e) => clonej(e);
const sorted = (list) => [...list].sort((a, b) => a.at - b.at || a.id - b.id);

/** Slice descriptor for core/save.js: core registers it, serialize/load go through ctx.sched. */
export const schedSlice = {
  name: 'scheduler', version: 1, order: 90,
  defaults: () => ({ seq: 0, entries: [] }),
  serialize: (ctx) => ctx.sched.serialize(),
  load: (d, ctx) => ctx.sched.load(d),
  migrate: {},
  shift: shiftSched,
};

/** Re-centre entries that carry coordinates in `xz` ([x,z], {x,z} or a list of either). Pure: returns a new slice value. */
export function shiftSched(d, dx, dz) {
  const sh = (p) => (Array.isArray(p) ? (p.length === 2 && p.every(Number.isFinite) ? [p[0] + dx, p[1] + dz] : p.map(sh)) : p && typeof p === 'object' ? { ...p, x: p.x + dx, z: p.z + dz } : p);
  return { ...d, entries: (d.entries || []).map((e) => (e.xz ? { ...e, xz: sh(e.xz) } : e)) };
}

/**
 * Run everything due in (from, to] in time order. ctx needs `sched`; `time`, `bus` and `strict` are optional.
 * opts.away (default true) is what handlers and the bus see; the foreground tick passes false.
 * Returns { from, to, away, noop, savedAt, fired, repeats, days, capped, aborted, errors }.
 */
export function catchUp(ctx, from, to, opts = {}) {
  const sched = ctx.sched, st = getState(sched);
  const time = ctx.time || st.time, bus = ctx.bus, strict = !!ctx.strict;
  const away = opts.away ?? true;
  const res = { from, to, away, noop: false, savedAt: to, fired: 0, repeats: 0, days: 0, capped: false, aborted: false, errors: [] };
  if (!(from <= to)) { res.noop = true; return res; }
  if (st.sim) throw new Error('sched: catchUp is not re-entrant');

  const limitAt = from + MAX_DAYS * DAY;
  const skip = new Set(), trimmed = new Set(), missedAt = new Map(), plans = new Map();
  const startKey = time ? time.dayKey(from) : null;
  let prevKey = startKey, prevSeason = time?.season?.(from), prevFest = time?.festival?.(from) ?? null;
  let nextB = time ? nextDayStart(time, from) : Infinity, finalB = false, repeatsOff = false;

  const stepAfter = (e, at) => (e.repeat.every ? at + e.repeat.every : time ? nextDayStart(time, at) : at + DAY);
  const jumpPast = (e) => (e.repeat.every ? e.at + (Math.floor((to - e.at) / e.repeat.every) + 1) * e.repeat.every : time ? nextDayStart(time, to) : to + 1);
  // the firings of a repeat that fall inside the window: count and last time
  const firings = (e) => {
    if (e.repeat.every) { const n = Math.floor((to - e.at) / e.repeat.every) + 1; return { n, last: e.at + (n - 1) * e.repeat.every }; }
    let n = 0, last = e.at;
    for (let t = e.at; t <= to && n < 4000; t = stepAfter(e, t)) { n++; last = t; }
    return { n, last };
  };
  const plan = (e) => { let p = plans.get(e.id); if (!p || p.at !== e.at) { p = { at: e.at, ...firings(e) }; plans.set(e.id, p); } return p; };
  const mode = (e) => e.catchUp || 'collapse';

  const run = (entry, at, missed) => {
    st.sim = { at, away };
    res.fired++;
    try {
      const out = st.handlers.get(entry.kind)(entry, ctx, { late: Math.max(0, to - at), away, missed });
      return out && Number.isFinite(out.reschedule) ? out.reschedule : null;
    } catch (error) {
      if (strict) throw error;
      res.errors.push({ kind: entry.kind, id: entry.id, error });
      console.error(`sched: handler ${entry.kind} failed`, error);
      return null;
    } finally { st.sim = null; }
  };

  const trip = () => {
    res.capped = repeatsOff = true;
    if (time && !finalB && nextB <= to) { nextB = lastDayStart(time, to); finalB = true; }
  };

  const emit = (name, at, payload) => {
    if (!bus) return;
    st.sim = { at, away };
    try { bus.emit(name, payload); } finally { st.sim = null; }
  };

  const boundary = (B, last) => {
    const key = time.dayKey(B);
    res.days++;
    const fire = (kind, data) => { if (st.handlers.has(kind)) run({ id: 0, kind, at: B, data }, B, 1); };
    fire('@day', { day: key, prev: prevKey });
    const season = time.season?.(B);
    if (season !== prevSeason) {
      fire('@season', { season, prev: prevSeason });
      const year = time.seasonInfo?.(B)?.year;
      emit('seasonChange', B, { season, prev: prevSeason, ...(year != null ? { year } : {}) });
      prevSeason = season;
    }
    const fest = time.festival?.(B) ?? null;
    if (fest !== prevFest) { fire('@festival', { id: fest, prev: prevFest }); prevFest = fest; }
    if (last) emit('dayChange', B, { day: dayNumber(key), prev: dayNumber(startKey), skipped: Math.max(0, dayDiff(startKey, key) - 1) });
    prevKey = key;
  };

  for (;;) {
    if (res.fired > MAX_FIRINGS) { res.aborted = true; if (strict) throw new Error('sched: catch-up runaway'); break; }
    // earliest due entry, (time, id); collapsed repeats sit at their last firing so their state is "as of now"
    let e = null, et = Infinity;
    for (const c of st.entries) {
      if (c.at > to || skip.has(c.id)) continue;
      if (c.repeat && !trimmed.has(c.id) && typeof mode(c) === 'object') {
        trimmed.add(c.id);
        const { n } = firings(c), cut = Math.max(0, n - mode(c).max);
        if (cut) { for (let i = 0; i < cut; i++) c.at = stepAfter(c, c.at); missedAt.set(c.id, 1 + cut); }
      }
      const t = c.repeat && mode(c) === 'collapse' ? plan(c).last : c.at;
      if (t < et || (t === et && c.id < e.id)) { e = c; et = t; }
    }
    if (!e && nextB > to) break;
    if (nextB <= et) {
      const B = nextB;
      let nb = Infinity;
      if (!finalB) {
        nb = nextDayStart(time, B);
        if (nb > to) nb = Infinity;
        else if (nb > limitAt) { res.capped = true; finalB = true; nb = lastDayStart(time, to); if (nb <= B) nb = Infinity; }
      }
      nextB = nb;
      const last = nb === Infinity;
      boundary(B, last);
      continue;
    }

    if (!st.handlers.has(e.kind)) { skip.add(e.id); continue; }
    if (!e.repeat) {
      drop(st, e);
      const r = run(e, e.at, 1);
      if (r != null) {
        e.at = Math.max(r, e.at + 1);
        if (e.key != null) { if (st.byKey.has(e.key)) delete e.key; else st.byKey.set(e.key, e); }
        st.entries.push(e);
      }
      continue;
    }
    if (mode(e) !== 'collapse' && (repeatsOff || e.at > limitAt)) { e.at = jumpPast(e); continue; }
    const live = () => st.entries.includes(e);
    if (mode(e) === 'collapse') {
      const p = plan(e);
      res.repeats++;
      const r = run(e, p.last, p.n);
      if (live()) e.at = r != null ? Math.max(r, p.last + 1) : stepAfter(e, p.last);
    } else {
      const at = e.at, missed = missedAt.get(e.id) || 1;
      missedAt.delete(e.id);
      res.repeats++;
      const r = run(e, at, missed);
      if (live()) e.at = r != null ? Math.max(r, at + 1) : stepAfter(e, at);
      if (res.repeats >= MAX_REPEATS) trip();
    }
  }
  return res;
}

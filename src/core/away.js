// "While you were away": collects the events that carry meta.away during a catch-up and turns them into the Today lines
// and the reveal queue. The last unacknowledged summary lives in the `away` slice, so a reload mid-reveal loses nothing.
export const AWAY_MS = 10 * 60_000; // Today card threshold; any reveal bypasses it

const KEEP = 200;                       // payloads kept per event name (the rest are only counted)
const QUIET = new Set(['say', 'sfx', 'fx', 'invalidate']);
const clonej = (v) => JSON.parse(JSON.stringify(v));
const empty = () => ({ awayMs: 0, days: 0, lines: [], reveals: [], ripe: {}, grew: 0, newDay: false, forage: 0, today: false });

export function createAway({ now = () => 0 } = {}) {
  const describers = new Map();
  let run = null;       // the open window
  let pending = null;   // unacknowledged summary

  const openRun = (from) => ({ from, events: new Map(), ripe: {}, grew: 0, forage: 0, days: 0, reveals: [] });
  const addReveal = (list, r) => { if (r.id != null && !list.some((x) => x.kind === r.kind && x.id === r.id)) list.push(r); };

  const needsToday = (s, threshold = AWAY_MS) => s.awayMs > threshold || !!s.newDay;
  const shouldShow = (s, threshold = AWAY_MS) => needsToday(s, threshold) || s.reveals.length > 0;

  const away = {
    AWAY_MS,
    needsToday, shouldShow,
    get active() { return !!run; },
    get pending() { return pending; },

    /** Subscribe to every bus event; accepts onAny callbacks of the form (name, payload, meta) or (payload, meta). */
    attach(bus) { return bus.onAny((a, b, c) => (typeof a === 'string' ? away.record(a, b, c) : away.record(b?.name, a, b))); },
    begin(from) { run = openRun(from); },
    record(name, payload = {}, meta = {}) {
      if (!name || QUIET.has(name)) return;
      if (name === 'projectDone') {
        const r = { kind: 'project', id: payload.project };
        if (meta.away && run) addReveal(run.reveals, r);
        else if (!meta.away) { pending ||= empty(); addReveal(pending.reveals, r); }
      }
      if (!meta.away || !run) return;
      if (name === 'cropRipe') run.ripe[payload.crop] = (run.ripe[payload.crop] || 0) + 1;
      else if (name === 'dayChange') run.days += (payload.skipped || 0) + 1;
      let ev = run.events.get(name);
      if (!ev) run.events.set(name, ev = { items: [], at: [], total: 0 });
      ev.total++;
      if (ev.items.length < KEEP) { ev.items.push({ ...payload }); ev.at.push(meta.at ?? null); }
    },
    /** Legacy counters that are not events: note('grew', n), note('forage', n). Ignored outside a window. */
    note(key, n = 1) { if (run) run[key] = (run[key] || 0) + n; },
    /** fn(items, {total, at}) -> {icon, text, order?} | [..] | null, once per event name that happened while away. */
    describe(event, fn) {
      if (!describers.has(event)) describers.set(event, []);
      describers.get(event).push(fn);
      return () => { const l = describers.get(event); const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    },
    end(to = now()) {
      const r = run || openRun(to);
      run = null;
      const lines = [];
      for (const [name, ev] of r.events) {
        for (const fn of describers.get(name) || []) {
          let out;
          try { out = fn(ev.items, { total: ev.total, at: ev.at }); } catch (e) { console.error(`away: describer for ${name} failed`, e); continue; }
          for (const l of [].concat(out || [])) if (l && l.text) lines.push({ icon: l.icon || '', text: l.text, order: l.order ?? 50 });
        }
      }
      lines.sort((a, b) => a.order - b.order);
      const reveals = [...(pending ? pending.reveals : [])];
      for (const x of r.reveals) addReveal(reveals, x);
      const summary = { awayMs: Math.max(0, to - r.from), days: r.days, lines, reveals, ripe: r.ripe, grew: r.grew, newDay: r.days > 0, forage: r.days > 0 ? r.forage : 0 };
      summary.today = needsToday(summary);
      pending = shouldShow(summary) ? clonej(summary) : null;
      return summary;
    },
    /** The Today card was shown: drop the summary but keep unseen reveals. */
    dismiss() {
      if (!pending) return;
      pending = pending.reveals.length ? { ...empty(), reveals: pending.reveals } : null;
    },
    /** A reveal card was shown. */
    ack(kind, id) {
      if (!pending) return;
      pending.reveals = pending.reveals.filter((x) => !(x.kind === kind && x.id === id));
      if (!pending.reveals.length && !pending.today) pending = null;
    },
    serialize() { return { pending: pending ? clonej(pending) : null }; },
    load(d) {
      const p = d && d.pending;
      pending = p && typeof p === 'object' ? { ...empty(), ...clonej(p), reveals: Array.isArray(p.reveals) ? clonej(p.reveals) : [] } : null;
      run = null;
    },
  };
  return away;
}

/** Slice descriptor for core/save.js. */
export const awaySlice = {
  name: 'away', version: 1, order: 95,
  defaults: () => ({ pending: null }),
  serialize: (ctx) => ctx.away.serialize(),
  load: (d, ctx) => ctx.away.load(d),
  migrate: {},
};

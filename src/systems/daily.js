// The daily roll: a new day is rolled when the date changes, seeded by the date, and kept as the day's state (the v3 `daily` save).
// The pieces are contributors (ctx.daily.contribute): requests 10, market 20 and forage 30 are `base` and share the one seeded stream,
// drawing in that order, so the roll stays bit-identical to the golden. Any other contributor gets a sub-stream of its own.
import { defineSystem } from '../core/system.js';
import { dayKey } from '../core/time.js';
import { mulberry32, hashString, createRng } from '../core/rng.js';

/** int(n), pick(list) and shuffle(list) over one stream: what a contributor's roll(rnd, ctx, draw) draws with. */
export function drawTools(rnd) {
  const int = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[int(a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return { int, pick, shuffle };
}

export default defineSystem({
  name: 'daily',
  needs: [],
  api(ctx) {
    const s = Object.assign(ctx.state, { day: null }); // the rolled day: { key, requests, demand, specials, forage, seen, gift, ext? } or null
    const api = {
      get state() { return s.day; },
      set state(v) { s.day = v; },
      get key() { return s.day?.key; },

      load(d) { s.day = d && d.key && Array.isArray(d.requests) ? d : null; },
      serialize() { return s.day; },

      /** Roll a new day when the date has changed. Returns true on a new day. */
      ensure(now = ctx.now()) {
        const key = dayKey(now);
        if (s.day?.key === key) return false;
        s.day = api.roll(key);
        return true;
      },

      /** The foreground check (twice a second): ensure(), and say so when the clock passed the day boundary while playing. */
      poll() {
        if (!api.ensure()) return false;
        ctx.invalidate('veg');
        ctx.say('A new day in the village. Hana has fresh requests.', 'icons:koku');
        ctx.sfx('ready');
        ctx.invalidate('ui');
        return true;
      },

      roll(key) {
        const rnd = mulberry32(hashString(key));
        const draw = drawTools(rnd);
        const out = { key };
        let ext = null;
        for (const c of ctx.daily.all()) {
          if (c.base) { Object.assign(out, c.roll(rnd, ctx, draw)); continue; }
          const sub = createRng(key)(c.id);
          (ext ||= {})[c.id] = c.roll(sub, ctx, drawTools(sub));
        }
        out.seen = false;
        out.gift = null;
        if (ext) out.ext = ext;
        return out;
      },
    };
    return api;
  },
});

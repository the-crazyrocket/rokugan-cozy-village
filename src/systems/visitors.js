// Visitors (content: visitors): once an hour each visitor who is not here rolls (rng of day, visitor and hour, so a catch-up after
// a long time away draws the same as having watched) and, when its time (`when`) holds and the island has a spot its arrangement
// (`arrive`) likes, comes and stays a while. Its gift goes straight into the bag; tapping it takes its photo for the scrapbook.
// Saved in ext.visitors: { here: [{ id, x, z, until }], last: hour index checked, seen: { id: visits }, photos: { id: n }, fresh: [ids] }.
import { defineSystem } from '../core/system.js';
import { createRng } from '../core/rng.js';
import { hourOf } from '../core/time.js';

const HOUR = 3600e3;
const MAX_CATCHUP = 48; // hours rolled at most after a long time away

export default defineSystem({
  name: 'visitors',
  needs: ['props', 'player'],
  api(ctx) {
    const s = Object.assign(ctx.state, { here: [], last: 0, seen: {}, photos: {}, fresh: [], poll: 0 });
    ctx.part('visitors', {
      serialize: () => ({ here: s.here, last: s.last, seen: s.seen, photos: s.photos, fresh: s.fresh }),
      load: (d) => { s.here = [...(d?.here || [])]; s.last = d?.last | 0; s.seen = { ...(d?.seen || {}) }; s.photos = { ...(d?.photos || {}) }; s.fresh = [...(d?.fresh || [])]; },
      defaults: () => ({ here: [], last: 0, seen: {}, photos: {}, fresh: [] }),
    });
    const def = (id) => ctx.content.visitors.get(id);
    const props = () => ctx.use('props');
    const items = () => ctx.content.itemMap();
    const taken = (x, z) => s.here.some((h) => h.x === x && h.z === z);

    const api = {
      get here() { return s.here; },
      seen: (id) => s.seen[id] || 0,
      photos: (id) => s.photos[id] || 0,
      takeFresh() { const f = s.fresh; s.fresh = []; return f; },

      /** A tile the visitor would stand on now: walkable, free, beside the first prop its arrangement names and liked by `arrive`. */
      spot(id, rnd = ctx.rng) {
        const d = def(id), first = [].concat(d.arrive.near || []).find((n) => n.prop);
        if (!first) return null;
        const cands = [];
        for (const p of props().list) {
          if (p.type !== first.prop) continue;
          const r = Math.ceil(first.r ?? 1);
          for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            const x = p.x + dx, z = p.z + dz;
            if (!ctx.use('player').walkable(x, z) || taken(x, z)) continue;
            if (ctx.cond.evaluate(d.arrive, ctx.condCtx({ at: { x, z } }))) cands.push({ x, z });
          }
        }
        return cands.length ? cands[Math.floor(rnd() * cands.length)] : null;
      },

      /** Rolls the hours from the last check to now: arrivals (gifts into the bag) and departures. */
      check(away = false) {
        const now = ctx.now(), hour = Math.floor(now / HOUR);
        const gone = s.here.filter((h) => h.until <= now);
        if (gone.length) { s.here = s.here.filter((h) => h.until > now); ctx.invalidate('veg'); }
        if (!s.last) { s.last = hour; return []; }
        const came = [], busy = new Map(s.here.map((v) => [v.id, v.until])); // a visit that came and went while away still took its time
        for (let h = Math.max(s.last + 1, hour - MAX_CATCHUP + 1); h <= hour; h++) {
          const at = h * HOUR, cc = ctx.condCtx({ now: at, hour: hourOf(at) });
          for (const [id, d] of ctx.content.visitors.all()) {
            if ((busy.get(id) ?? 0) > at) continue;
            const rng = createRng(`${id}|${h}`);
            if (rng() >= (d.chance ?? 0.35)) continue;
            if (d.when && !ctx.cond.evaluate(d.when, cc)) continue;
            const spot = api.spot(id, rng);
            if (!spot) continue;
            const stay = d.stayMs[0] + Math.floor(rng() * (d.stayMs[1] - d.stayMs[0]));
            busy.set(id, at + stay);
            if (at + stay <= now) { api.arrive(id, spot, at + stay, true); continue; } // came and went while you were away
            s.here.push({ id, x: spot.x, z: spot.z, until: at + stay });
            api.arrive(id, spot, at + stay, away || h < hour);
            came.push(id);
          }
        }
        s.last = hour;
        if (came.length || gone.length) ctx.invalidate('veg');
        return came;
      },

      arrive(id, spot, until, away) {
        const d = def(id), first = !s.seen[id];
        s.seen[id] = (s.seen[id] || 0) + 1;
        for (const g of d.gifts) ctx.inv.give(g, 1, { reason: 'gift' });
        if (away) { s.fresh.push(id); return; }
        const gifts = d.gifts.map((g) => items().get(g).name.toLowerCase()).join(' and ');
        ctx.say(first ? `A new visitor: ${d.name}! It left ${gifts}.` : `${d.name} is visiting, and left ${gifts}.`, d.icon);
        ctx.sfx(first ? 'fanfare' : 'ready');
        ctx.bus.emit('visit', { visitor: id, phase: 'arrive', x: spot.x, z: spot.z, gifts: Object.fromEntries(d.gifts.map((g) => [g, 1])) });
      },

      /** The visitor at tile x, z. */
      at: (x, z) => s.here.find((h) => h.x === x && h.z === z) || null,

      /** A photo for the scrapbook. */
      photo(id) {
        const d = def(id), h = s.here.find((v) => v.id === id);
        if (!h) return false;
        const first = !s.photos[id];
        s.photos[id] = (s.photos[id] || 0) + 1;
        ctx.sfx('pickup');
        ctx.bus.emit('haptic', { ms: 20 });
        ctx.sparkle(h.x + 0.5, 0.8, h.z + 0.5);
        ctx.say(first ? `Snap! ${d.name} goes into your scrapbook.` : `Another photo of ${d.name.split(' ')[0]}.`, 'icons:rod');
        ctx.bus.emit('visit', { visitor: id, phase: 'photo', x: h.x, z: h.z, gifts: {} });
        ctx.invalidate('ui');
        return true;
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) { ctx.state.api.check(true); },
  update(ctx, dt) {
    ctx.state.poll -= dt;
    if (ctx.state.poll > 0) return;
    ctx.state.poll = 5;
    ctx.state.api.check();
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'visitor', priority: 94, // just below a villager, above anything on the ground
      fn(t) {
        const v = api.at(t.x, t.z);
        if (!v) return null;
        const d = ctx.content.visitors.get(v.id);
        return { kind: 'photo', t, who: v.id, icon: d.icon, label: 'Photo' };
      },
    });
    ctx.actions.add('photo', { queueable: true, button: true, range: 3, perform: (a) => api.photo(a.who) });
  },
});

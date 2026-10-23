// Villagers (content: villagers): where each one is (a pure function of the hour, the day and the island: the first schedule entry
// whose hours and `when` hold and whose place exists), walking there along findPath, talking once a day and taking one gift a day
// for friendship. Friendship is points; every 10 is a heart (up to 10), and a heart's `unlock` gives items or sets a flag.
// Saved in ext.villagers: { pts: { id: n }, talked: { id: dayKey }, gifted: { id: dayKey }, said: [dialogue ids said once], met: [ids] }.
// Positions are not saved: on load everyone is simply where their schedule puts them.
import { defineSystem } from '../core/system.js';
import { findPath } from '../world/pathfind.js';
import { dayKey, hourOf } from '../core/time.js';
import { hashString } from '../core/rng.js';
import { HOME } from '../content/base/landmarks.js';
import { shapeOf } from '../content/base/projects.js';

const SPEED = 1.5; // tiles per second
const N8 = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const inHours = ([a, b], h) => (a <= b ? h >= a && h < b : h >= a || h < b);
export const heartsOf = (pts) => Math.max(0, Math.min(10, Math.floor(pts / 10)));
const TASTE_PTS = { love: 8, like: 5, neutral: 2, dislike: -3 };

export default defineSystem({
  name: 'villagers',
  needs: ['props', 'player', 'projects'],
  api(ctx) {
    const s = Object.assign(ctx.state, { pts: {}, talked: {}, gifted: {}, said: [], met: [], at: new Map(), poll: 0 });
    ctx.part('villagers', {
      serialize: () => ({ pts: s.pts, talked: s.talked, gifted: s.gifted, said: s.said, met: s.met }),
      load: (d) => { s.pts = { ...(d?.pts || {}) }; s.talked = { ...(d?.talked || {}) }; s.gifted = { ...(d?.gifted || {}) }; s.said = [...(d?.said || [])]; s.met = [...(d?.met || [])]; },
      defaults: () => ({ pts: {}, talked: {}, gifted: {}, said: [], met: [] }),
    });
    const props = () => ctx.use('props');
    const player = () => ctx.use('player');
    const def = (id) => ctx.content.villagers.get(id);
    const today = () => dayKey(ctx.now());
    const items = () => ctx.content.itemMap();

    /** The tiles a placed prop covers (props.at answers for every tile of its footprint). */
    const tilesOf = (p) => {
      const out = [];
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (props().at(p.x + dx, p.z + dz) === p) out.push({ x: p.x + dx, z: p.z + dz });
      return out;
    };
    /** A walkable tile beside the prop, the front (south-east, toward the camera) first; `k` picks among the others. */
    const beside = (p, k = 0, taken = null) => {
      const cover = tilesOf(p), seen = new Set(cover.map((t) => `${t.x},${t.z}`)), out = [];
      for (const t of cover) for (const [dx, dz] of N8) {
        const x = t.x + dx, z = t.z + dz, key = `${x},${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (player().walkable(x, z) && !taken?.has(key)) out.push({ x, z, front: (x - p.x) + (z - p.z) });
      }
      out.sort((a, b) => b.front - a.front || a.x - b.x || a.z - b.z);
      const t = out.length ? out[k % Math.min(out.length, 3)] : null;
      return t && { ...t, look: { x: p.x + 0.5, z: p.z + 0.5 } };
    };

    /** The minka someone lives in: the one their home project built, or (Kenji) the village's second house from home. */
    const house = (id) => {
      const minkas = props().list.filter((p) => p.type === 'minka');
      const d = def(id);
      if (d.home?.project) {
        const q = shapeOf(d.home.project)?.props.find((r) => r.type === 'minka');
        if (!q) return null;
        return minkas.sort((a, b) => Math.hypot(a.x - q.x, a.z - q.z) - Math.hypot(b.x - q.x, b.z - q.z))[0] || null;
      }
      return minkas.sort((a, b) => Math.hypot(a.x - HOME.x, a.z - HOME.z) - Math.hypot(b.x - HOME.x, b.z - HOME.z))[1] || minkas[0] || null;
    };

    /** Where a schedule entry's `at` is today: a tile, or null when the place does not exist (then the next entry applies). */
    const resolve = (id, at, taken) => {
      const salt = hashString(`${today()}|${id}`);
      if (at === 'home' || at === 'home.door') { const h = house(id); return h && beside(h, 0, taken); }
      if (at === 'site') {
        const a = ctx.use('projects').active;
        const sc = a && props().list.find((p) => p.id === a.scaffold[0]);
        return sc ? beside(sc, salt, taken) : null;
      }
      if (at?.near?.prop) {
        const all = props().list.filter((p) => p.type === at.near.prop);
        if (!all.length) return null;
        const h = house(id) || HOME;
        all.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
        return beside(all[salt % Math.min(all.length, 3)], salt >>> 3, taken);
      }
      return null;
    };

    const api = {
      /** The villagers living on the island now (Ume once her house is built). */
      present: () => [...ctx.content.villagers.all()].filter(([, d]) => !d.home?.project || ctx.use('projects').done.includes(d.home.project)).map(([id]) => id),

      /** { x, z, do, indoors } for `id` at time ms: the first entry whose hours and `when` hold and whose place exists. */
      plan(id, ms = ctx.now(), taken = null) {
        const d = def(id), h = hourOf(ms), cc = ctx.condCtx();
        for (const e of d.schedule || []) {
          if (!inHours(e.hours, h) || (e.when && !ctx.cond.evaluate(e.when, cc))) continue;
          const t = resolve(id, e.at, taken);
          if (t) return { x: t.x, z: t.z, look: t.look, do: e.do, indoors: e.do === 'sleep' };
        }
        const t = resolve(id, 'home', taken) || HOME;
        return { x: t.x, z: t.z, do: 'idle', indoors: false };
      },

      /** The live state of a villager on the map: { x, z (floats), do, indoors, moving, facing } (undefined when not present). */
      where: (id) => s.at.get(id),
      /** The villager standing on (or next to the centre of) tile x, z. */
      at(x, z) {
        for (const [id, v] of s.at) if (!v.indoors && Math.abs(v.x - (x + 0.5)) < 0.75 && Math.abs(v.z - (z + 0.5)) < 0.75) return id;
        return null;
      },

      points: (id) => s.pts[id] || 0,
      hearts: (id) => heartsOf(s.pts[id] || 0),
      talkedToday: (id) => s.talked[id] === today(),
      giftedToday: (id) => s.gifted[id] === today(),

      /** How a villager feels about an item: 'love' | 'like' | 'neutral' | 'dislike'. */
      taste(id, item) {
        const d = def(id), it = items().get(item);
        if (d.dislikes?.items?.includes(item)) return 'dislike';
        if (d.likes?.items?.includes(item)) return 'love';
        if (it && d.likes?.tags?.includes(it.kind)) return 'like';
        return 'neutral';
      },

      /** Adds friendship and pays out the hearts crossed. */
      befriend(id, n) {
        const before = api.hearts(id);
        s.pts[id] = Math.max(0, (s.pts[id] || 0) + n);
        const after = api.hearts(id);
        for (const h of def(id).hearts || []) {
          if (h.n <= before || h.n > after) continue;
          for (const [item, k] of Object.entries(h.unlock.items || {})) ctx.inv.give(item, k, { reason: 'gift' });
          if (h.unlock.flag) ctx.flags.set(h.unlock.flag);
          const what = Object.entries(h.unlock.items || {}).map(([item, k]) => `${k} × ${items().get(item).name.toLowerCase()}`).join(', ');
          ctx.say(`${def(id).name} likes you more (${'♥'.repeat(h.n)})${what ? `: ${what}` : ''}`, def(id).icon);
          ctx.sfx('fanfare');
        }
        if (after > before && !(def(id).hearts || []).some((h) => h.n > before && h.n <= after)) ctx.say(`${def(id).name} likes you more (${'♥'.repeat(after)})`, def(id).icon);
        return after;
      },

      /** Today's line: a once line not said yet, else one of the entries whose `when` holds, picked by the day. */
      line(id) {
        const v = s.at.get(id), d = def(id), ok = (e) => !e.when || ctx.cond.evaluate(e.when, cc);
        const cc = ctx.condCtx(v ? { at: { x: Math.floor(v.x), z: Math.floor(v.z) } } : {}); // what is around them
        const once = (d.dialogue || []).find((e) => e.once && ok(e) && !s.said.includes(`${id}.${e.id}`));
        if (once) return { key: `${id}.${once.id}`, text: once.lines[0], once: true };
        const pool = (d.dialogue || []).filter((e) => !e.once && ok(e)).flatMap((e) => e.lines);
        if (!pool.length) return { key: null, text: '…' };
        // conditional lines first: the most specific thing to say today
        const special = (d.dialogue || []).filter((e) => !e.once && e.when && ok(e)).flatMap((e) => e.lines);
        const from = special.length && hashString(`${today()}|${id}|special`) % 2 === 0 ? special : pool;
        return { key: null, text: from[hashString(`${today()}|${id}|line`) % from.length] };
      },

      /** Talking: today's line; the first chat of the day is a little friendship. */
      talk(id) {
        const l = api.line(id);
        if (l.once) s.said.push(l.key);
        if (!s.met.includes(id)) s.met.push(id);
        if (!api.talkedToday(id)) { s.talked[id] = today(); api.befriend(id, 2); }
        ctx.bus.emit('talk', { who: id, hearts: api.hearts(id) });
        ctx.invalidate('ui');
        return l.text;
      },

      /** One gift a day: friendship by taste; returns the reaction text or null when refused. */
      give(id, item) {
        const d = def(id);
        if (api.giftedToday(id)) { ctx.say(`${d.name} already had a present from you today.`, d.icon); return null; }
        if (!ctx.inv.take(item, 1)) return null;
        const taste = api.taste(id, item), name = items().get(item).name.toLowerCase();
        s.gifted[id] = today();
        const hearts = api.befriend(id, TASTE_PTS[taste]);
        ctx.bus.emit('gift', { to: id, item, reaction: taste, hearts });
        ctx.sfx(taste === 'dislike' ? 'miss' : 'coin');
        const text = { love: `Oh! ${name[0].toUpperCase() + name.slice(1)}! You remembered. Thank you!`, like: `How kind. I will enjoy this ${name}.`, neutral: `A ${name}? Thank you.`, dislike: `Ah… ${name}. Thank you, I suppose.` }[taste];
        ctx.invalidate('ui');
        return text;
      },

      /** Moves everyone toward where they should be (dt seconds); `snap` places them there at once. */
      step(dt, snap = false) {
        const here = new Set(api.present());
        for (const id of [...s.at.keys()]) if (!here.has(id)) s.at.delete(id);
        const taken = new Set();
        for (const id of here) {
          let v = s.at.get(id);
          const goal = api.plan(id, ctx.now(), taken);
          taken.add(`${goal.x},${goal.z}`);
          if (!v || snap) { v = { x: goal.x + 0.5, z: goal.z + 0.5, do: goal.do, indoors: goal.indoors, moving: false, facing: 0, path: null, goal }; s.at.set(id, v); continue; }
          if (v.goal.x !== goal.x || v.goal.z !== goal.z) {
            v.goal = goal;
            const from = { x: Math.floor(v.x), z: Math.floor(v.z) };
            v.path = v.indoors ? null : findPath(from, goal, (x, z) => player().walkable(x, z), ctx.world.w, ctx.world.h, 4000, player().step);
            if (!v.path || v.indoors) { v.x = goal.x + 0.5; v.z = goal.z + 0.5; v.path = null; } // no way there (or coming out of the house): just be there
          }
          v.do = goal.do;
          v.indoors = goal.indoors && !v.path?.length;
          v.moving = false;
          if (v.path?.length) {
            let left = SPEED * dt;
            while (left > 0 && v.path.length) {
              const n = v.path[0], tx = n.x + 0.5, tz = n.z + 0.5, dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
              if (d <= left) { v.x = tx; v.z = tz; v.path.shift(); left -= d; continue; }
              v.x += (dx / d) * left; v.z += (dz / d) * left; v.facing = Math.atan2(dx, dz); left = 0;
            }
            v.moving = v.path.length > 0;
          }
          if (!v.moving && goal.look && goal.do !== 'idle') v.facing = Math.atan2(goal.look.x - v.x, goal.look.z - v.z); // facing the work
        }
      },
    };
    ctx.state.api = api;
    ctx.provide('friendship', (who) => api.hearts(who));
    return api;
  },
  start(ctx) { ctx.state.api.step(0, true); },
  update(ctx, dt) { ctx.state.api.step(Math.min(dt, 0.25)); },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'villager', priority: 95, // a person in the way is talked to before anything under their feet
      fn(t) {
        const id = api.at(t.x, t.z);
        if (!id) return null;
        const d = ctx.content.villagers.get(id);
        return { kind: 'talk', t, who: id, icon: d.icon, label: `Talk to ${d.name}` };
      },
    });
    ctx.actions.add('talk', {
      queueable: true, button: true,
      perform: (a) => {
        ctx.bus.emit('openSheet', { name: 'villager', args: { who: a.who, line: api.talk(a.who) } });
      },
    });
  },
});

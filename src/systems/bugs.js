// Bugs and the net (content: bugs). Each hour a few bugs are out (rng of the hour, so nothing to save but what was caught): each
// picks a bug whose `when` holds now and a tile of its habitat (meadow: open grass; water: the bank of fresh water; tree: beside a
// tree; field: tilled soil). With the net, tapping one catches it. A village gets its net once, in the bag.
// Saved in ext.bugs: { hour, taken: [slot indexes caught this hour] }; fishing's catch counter keeps the book.
import { defineSystem } from '../core/system.js';
import { createRng } from '../core/rng.js';
import { T } from '../world/kinds.js';

const HOUR = 3600e3;
const OUT = 7; // bugs out at a time
const TREES = new Set(['sakura', 'pine', 'bamboo']);

export default defineSystem({
  name: 'bugs',
  needs: ['props', 'player', 'fishing'],
  api(ctx) {
    const s = Object.assign(ctx.state, { hour: 0, taken: [], cache: null });
    ctx.part('bugs', {
      serialize: () => ({ hour: s.hour, taken: s.taken }),
      load: (d) => { s.hour = d?.hour | 0; s.taken = [...(d?.taken || [])]; },
      defaults: () => ({ hour: 0, taken: [] }),
    });
    const props = () => ctx.use('props');

    /** Habitat tiles: { meadow, water, tree, field } -> [{ x, z }]. */
    const habitats = () => {
      const w = ctx.world, out = { meadow: [], water: [], tree: [], field: [] };
      const walk = (x, z) => ctx.use('player').walkable(x, z);
      for (let z = 0; z < w.h; z++) for (let x = 0; x < w.w; x++) {
        const k = w.kindAt(x, z);
        if (k === T.SOIL) { out.field.push({ x, z }); continue; }
        if (!walk(x, z)) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.isFresh(x + dx, z + dz))) out.water.push({ x, z });
        else if (k === T.GRASS) out.meadow.push({ x, z });
      }
      for (const p of props().list) if (TREES.has(p.type)) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (walk(p.x + dx, p.z + dz)) out.tree.push({ x: p.x + dx, z: p.z + dz });
      return out;
    };

    const api = {
      /** The bugs out now: [{ slot, id, x, z }] (caught ones gone). */
      out() {
        const h = Math.floor(ctx.now() / HOUR);
        if (s.hour !== h) { s.hour = h; s.taken = []; s.cache = null; }
        if (s.cache) return s.cache.filter((b) => !s.taken.includes(b.slot));
        const rng = createRng(`bugs|${h}`), cc = ctx.condCtx(), hab = habitats();
        const now = [...ctx.content.bugs.all()].filter(([, b]) => ctx.cond.evaluate(b.when, cc));
        const list = [];
        for (let slot = 0; slot < OUT && now.length; slot++) {
          const open = now.filter(([id]) => list.filter((b) => b.id === id).length < 2); // two of a kind at most: some variety
          if (!open.length) break;
          let r = rng() * open.reduce((a, [, b]) => a + b.weight, 0), pick = open[0];
          for (const e of open) { r -= e[1].weight; if (r <= 0) { pick = e; break; } }
          const tiles = hab[pick[1].tags[0]] || [];
          if (!tiles.length) continue;
          const t = tiles[Math.floor(rng() * tiles.length)];
          if (!list.some((b) => b.x === t.x && b.z === t.z)) list.push({ slot, id: pick[0], x: t.x, z: t.z });
        }
        s.cache = list;
        return list.filter((b) => !s.taken.includes(b.slot));
      },
      at: (x, z) => api.out().find((b) => Math.abs(b.x - x) <= 0 && Math.abs(b.z - z) <= 0) || null,

      catch(x, z) {
        const b = api.at(x, z);
        ctx.use('player').swing();
        if (!b) { ctx.sfx('miss'); return false; }
        s.taken.push(b.slot);
        const def = ctx.content.bugs.get(b.id), fishing = ctx.use('fishing'), first = !fishing.caught[b.id];
        fishing.caught[b.id] = (fishing.caught[b.id] || 0) + 1; // the collection book counts fish and bugs together
        ctx.inv.give(b.id, 1, { reason: 'catch' });
        ctx.sparkle(x + 0.5, 0.6, z + 0.5);
        ctx.sfx(first ? 'fanfare' : 'catch');
        ctx.bus.emit('haptic', { ms: 24 });
        ctx.say(first ? `Your first ${def.name.toLowerCase()}!` : `Caught a ${def.name.toLowerCase()}!`, def.icon);
        ctx.bus.emit('catch', { kind: 'bug', id: b.id, size: 0, water: null, spot: { x, z }, bait: null, first, via: 'net' });
        ctx.invalidate('ui'); ctx.invalidate('veg');
        return true;
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) {
    if (ctx.flags.once('gift_net')) ctx.inv.give('net', 1, { reason: 'gift' });
  },
  update(ctx) {
    // a new hour brings new bugs: redraw them
    const h = Math.floor(ctx.now() / HOUR);
    if (h !== ctx.state.hour) { ctx.state.api.out(); ctx.invalidate('veg'); }
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.tools.add('net', { use: (t) => api.catch(t.x, t.z) });
    ctx.resolvers.add({
      id: 'bug', priority: 93, // with a net in the bag, a bug is caught before anything under it is looked at
      fn(t) {
        if (!ctx.inv.count('net')) return null;
        const b = api.at(t.x, t.z);
        return b ? { kind: 'net', t, icon: ctx.content.bugs.get(b.id).icon, label: 'Catch' } : null;
      },
    });
    ctx.actions.add('net', { queueable: true, button: true, range: 1, perform: (a) => api.catch(a.t.x, a.t.z) });
  },
});

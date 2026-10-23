// Growing the island a plot at a time. With the basket of earth in hand, a tap on the sea beside the shore marks out a square plot
// (3x3 to 6x6; of the squares of that size over the tapped tile, the one taking in the most sea). Paid for in koku, stone and wood,
// the village fills it in over an hour or two, finished even while the game is closed. The new land is sand; a day later whatever
// is no longer beside the sea (the old beach behind it too) has grown over into grass. Every second plot turns up a rock outcrop
// for the quarry. The price per tile rises gently with each plot. Sea Kenji has plans for (a project not built yet) stays sea.
// Tiles change through world/edit.js applyEdit (kind 'reclaim' by 'project'; the grass is a 'patch' by 'system'), so the terrain
// rules hold; a tile a rule refuses is simply left. Little pockets of sea a plot shuts in, and notches it leaves against the shore,
// are filled with it.
// Saved in ext.reclaim: { n (tiles filled one at a time, before plots), plots, size, active: { tiles, doneAt, ms } | null, young }.
import { defineSystem } from '../core/system.js';
import { applyEdit } from '../world/edit.js';
import { T, WK } from '../world/kinds.js';
import { HOUR } from '../core/time.js';
import { shapeOf } from '../content/base/projects.js';

export const SIZES = [3, 4, 5, 6];
export const GRASS_MS = 20 * HOUR; // sand to grass
const MIN = 60e3;
const MARGIN = 2; // open sea kept around the edge of the world
const POCKET = 10; // a shut-in pool of sea this small is filled too
const POLL_S = 2;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const round5 = (v) => 5 * Math.round(v / 5);

/** What a plot of `tiles` sea tiles costs as the island's plot number `plots` (from 0): koku per tile rises 10 -> 30. */
export const plotCost = (tiles, plots) => ({
  koku: round5(tiles * Math.min(30, 10 + 1.5 * plots)),
  stone: Math.ceil(tiles * 0.4),
  wood: Math.ceil(tiles * 0.2),
});
/** How long the village takes over it. */
export const plotMs = (tiles) => (30 + 3 * tiles) * MIN;

export default defineSystem({
  name: 'reclaim',
  needs: ['props', 'player', 'farming', 'daily', 'terrainrules', 'shrine'], // world/edit.js EDIT_NEEDS and the rules; shrine: the camera tour
  api(ctx) {
    const s = Object.assign(ctx.state, { n: 0, plots: 0, size: 5, active: null, young: [], poll: 0, reserved: null });
    ctx.part('reclaim', {
      serialize: () => ({ n: s.n, plots: s.plots, size: s.size, active: s.active, young: s.young }),
      load: (d) => {
        s.n = Math.max(0, d?.n | 0); s.plots = Math.max(0, d?.plots | 0); s.size = SIZES.includes(d?.size) ? d.size : 5;
        s.active = d?.active?.tiles ? d.active : null; s.young = Array.isArray(d?.young) ? d.young : [];
      },
      defaults: () => ({ n: 0, plots: 0, size: 5, active: null, young: [] }),
    });
    const w = () => ctx.world;
    const props = () => ctx.use('props');
    const key = (x, z) => `${x},${z}`;
    const isSea = (x, z) => w().inBounds(x, z) && w().isWater(x, z) && w().waterKind(x, z) === WK.SEA;

    /** Sea that Kenji's projects not built yet will take, and a ring around it (so a channel to an islet stays open). */
    const reserved = () => {
      const done = [...ctx.content.projects.all()].map(([id]) => id).filter((id) => ctx.flags.has(`project_${id}`));
      const sig = done.join(',');
      if (s.reserved?.sig === sig) return s.reserved.set;
      const set = new Set();
      for (const [id] of ctx.content.projects.all()) {
        if (done.includes(id)) continue;
        for (const t of shapeOf(id)?.tiles ?? []) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) set.add(key(t.x + dx, t.z + dz));
      }
      s.reserved = { sig, set };
      return set;
    };

    const api = {
      get plots() { return s.plots; },
      get active() { return s.active; },
      get size() { return s.size; },
      set size(v) { if (SIZES.includes(v)) { s.size = v; ctx.invalidate('ui'); } },
      /** ms until the plot being filled is land (0 when there is none). */
      left: () => (s.active ? Math.max(0, s.active.doneAt - ctx.now()) : 0),
      /** Plots so far, counting the tiles filled one at a time before plots existed. */
      count: () => s.plots + Math.floor(s.n / 20),
      cost: (tiles) => plotCost(tiles, api.count()),

      /** Sea at sea level that a plot may take in: inside the margin, nothing on it, not a deck, not in Kenji's plans. */
      fillable(x, z) {
        const W = w();
        if (x < MARGIN || z < MARGIN || x >= W.w - MARGIN || z >= W.h - MARGIN) return false;
        if (!isSea(x, z) || W.heightAt(x, z) !== 0 || props().at(x, z) || props().isBridge(x, z)) return false;
        if (s.active?.tiles.some((t) => t.x === x && t.z === z)) return false;
        return !reserved().has(key(x, z));
      },
      /** Fillable and beside the land: where a plot can be started. */
      shore(x, z) { return api.fillable(x, z) && SIDES.some(([dx, dz]) => w().isLand(x + dx, z + dz)); },

      /**
       * The plot of side `size` over (x, z): of the squares that contain the tile, the one whose fillable sea, joined to the tile and
       * to the land, is largest (ties: the square centred nearest the tile). -> { x0, z0, size, tiles: [{ x, z }] } | null
       */
      plotAt(x, z, size = s.size) {
        if (!api.fillable(x, z)) return null;
        let best = null;
        for (let z0 = z - size + 1; z0 <= z; z0++) for (let x0 = x - size + 1; x0 <= x; x0++) {
          const inSq = (a, b) => a >= x0 && b >= z0 && a < x0 + size && b < z0 + size;
          const seen = new Set([key(x, z)]), tiles = [{ x, z }];
          let shore = false;
          for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            for (const [dx, dz] of SIDES) {
              const a = t.x + dx, b = t.z + dz;
              if (w().isLand(a, b)) shore = true;
              if (!inSq(a, b) || seen.has(key(a, b)) || !api.fillable(a, b)) continue;
              seen.add(key(a, b)); tiles.push({ x: a, z: b });
            }
          }
          if (!shore) continue;
          const d = Math.hypot(x0 + (size - 1) / 2 - x, z0 + (size - 1) / 2 - z);
          if (!best || tiles.length > best.tiles.length || (tiles.length === best.tiles.length && d < best.d)) best = { x0, z0, size, tiles, d };
        }
        if (!best) return null;
        best.tiles.sort((a, b) => a.z - b.z || a.x - b.x);
        return { x0: best.x0, z0: best.z0, size, tiles: best.tiles };
      },

      /** What is short for a plot: [{ item, need, have }] (item 'koku' for money). */
      missing(plot) {
        const c = api.cost(plot.tiles.length), out = [];
        if (ctx.money.get() < c.koku) out.push({ item: 'koku', need: c.koku, have: ctx.money.get() });
        for (const item of ['stone', 'wood']) if (ctx.inv.count(item) < c[item]) out.push({ item, need: c[item], have: ctx.inv.count(item) });
        return out;
      },
      why(plot) {
        if (s.active) return 'The village is still filling in the last plot.';
        if (!plot?.tiles.length) return 'Only the sea right beside the shore can be filled in.';
        const miss = api.missing(plot);
        if (miss.length) return `Still needed: ${miss.map((m) => `${m.need - m.have} ${m.item === 'koku' ? 'koku' : m.item}`).join(', ')}.`;
        return null;
      },

      /** Pay and set the village to work on the plot. */
      start(plot) {
        const why = api.why(plot);
        if (why) { ctx.say(why, 'icons3:earth'); return false; }
        const c = api.cost(plot.tiles.length), ms = plotMs(plot.tiles.length);
        ctx.money.spend(c.koku, 'reclaim');
        ctx.inv.take('stone', c.stone); ctx.inv.take('wood', c.wood);
        s.active = { tiles: plot.tiles.map((t) => ({ x: t.x, z: t.z })), doneAt: ctx.now() + ms, ms };
        ctx.sfx('fanfare');
        ctx.say(`The village starts filling in the plot: ${plot.tiles.length} tiles of new land.`, 'icons3:earth');
        api.tour(s.active.tiles);
        ctx.invalidate('ui');
        return true;
      },

      /** The plot is land: sand on every tile a rule allows, the pockets it shut in, maybe an outcrop; the beach behind it goes to grass in time. */
      finish() {
        const a = s.active;
        if (!a) return false;
        s.active = null;
        const filled = [];
        const fill = (t) => {
          if (!isSea(t.x, t.z) || w().heightAt(t.x, t.z) !== 0) return;
          const res = applyEdit(ctx, { kind: 'reclaim', x: t.x, z: t.z, from: { kind: T.WATER, height: 0 }, to: { kind: T.SAND, water: WK.NONE }, by: 'project', project: 'plot' });
          if (res.ok) filled.push({ x: t.x, z: t.z });
        };
        for (const t of a.tiles) fill(t);
        for (const t of api.pockets()) fill(t);
        for (const t of api.inlets(a.tiles)) fill(t);
        s.plots++;
        const at = a.doneAt, young = new Map(s.young.map((y) => [key(y.x, y.z), y]));
        for (const t of filled) for (const [dx, dz] of [[0, 0], ...AROUND]) {
          const x = t.x + dx, z = t.z + dz;
          if (w().get(x, z) === T.SAND && !young.has(key(x, z))) young.set(key(x, z), { x, z, at });
        }
        s.young = [...young.values()];
        if (s.plots % 2 === 0) api.outcrop(filled);
        ctx.sfx('fanfare');
        ctx.say(`The new plot is land! ${filled.length} tiles of sand, grass by tomorrow.`, 'icons3:earth');
        ctx.bus.emit('haptic', { ms: 30 });
        api.tour(filled.length ? filled : a.tiles, true);
        ctx.invalidate('ui'); ctx.invalidate('veg'); ctx.invalidate('terrain');
        return true;
      },

      /** Sea the open sea cannot reach (a flood from the edge of the world), in pools of at most POCKET tiles. */
      pockets() {
        const W = w(), open = new Set(), q = [];
        for (let x = 0; x < W.w; x++) for (const z of [0, W.h - 1]) q.push([x, z]);
        for (let z = 0; z < W.h; z++) for (const x of [0, W.w - 1]) q.push([x, z]);
        for (const [x, z] of q) open.add(key(x, z));
        for (let i = 0; i < q.length; i++) {
          const [x, z] = q[i];
          for (const [dx, dz] of SIDES) {
            const a = x + dx, b = z + dz;
            if (!isSea(a, b) || open.has(key(a, b))) continue;
            open.add(key(a, b)); q.push([a, b]);
          }
        }
        const out = [], seen = new Set();
        for (let z = 0; z < W.h; z++) for (let x = 0; x < W.w; x++) {
          if (!isSea(x, z) || open.has(key(x, z)) || seen.has(key(x, z))) continue;
          const pool = [{ x, z }];
          seen.add(key(x, z));
          for (let i = 0; i < pool.length; i++) for (const [dx, dz] of SIDES) {
            const a = pool[i].x + dx, b = pool[i].z + dz;
            if (!isSea(a, b) || seen.has(key(a, b))) continue;
            seen.add(key(a, b)); pool.push({ x: a, z: b });
          }
          if (pool.length <= POCKET && pool.every((t) => !props().isBridge(t.x, t.z))) out.push(...pool);
        }
        return out;
      },

      /** Notches of sea the plot left against the shore: a tile around it with land on three sides (and so on, as filling one can make another). */
      inlets(tiles) {
        const out = [], near = new Set();
        for (const t of tiles) for (const [dx, dz] of [[0, 0], ...AROUND]) near.add(key(t.x + dx, t.z + dz));
        const land = (x, z) => w().isLand(x, z) || out.some((o) => o.x === x && o.z === z) || tiles.some((o) => o.x === x && o.z === z);
        for (let pass = 0, more = true; pass < 4 && more; pass++) {
          more = false;
          for (const k of near) {
            const [x, z] = k.split(',').map(Number);
            if (land(x, z) || !api.fillable(x, z)) continue;
            if (SIDES.filter(([dx, dz]) => land(x + dx, z + dz)).length >= 3) { out.push({ x, z }); more = true; }
          }
        }
        return out;
      },

      /** A rock outcrop on the new land, on the tile furthest in from the sea (nearest the middle on a tie). */
      outcrop(tiles) {
        if (!tiles.length) return null;
        const cx = tiles.reduce((a, t) => a + t.x, 0) / tiles.length, cz = tiles.reduce((a, t) => a + t.z, 0) / tiles.length;
        const inland = (t) => { let d = 0; while (d < 4 && !AROUND.some(([dx, dz]) => isSea(t.x + dx * (d + 1), t.z + dz * (d + 1)))) d++; return d; };
        const spots = tiles.map((t) => ({ ...t, in: inland(t), d: Math.hypot(t.x - cx, t.z - cz) })).filter((t) => t.in >= 1).sort((a, b) => b.in - a.in || a.d - b.d);
        for (const t of spots) if (props().canPlace('outcrop', t.x, t.z, 0, { via: 'project' })) return props().add('outcrop', t.x, t.z, (t.x * 7 + t.z) & 3, 0, { via: 'project' });
        return null;
      },

      /** Sand a day old and no longer beside the sea grows over; what is still by the sea stays a beach. */
      grow() {
        const now = ctx.now(), keep = [];
        let n = 0;
        for (const y of s.young) {
          if (now - y.at < GRASS_MS) { keep.push(y); continue; }
          if (w().get(y.x, y.z) !== T.SAND || w().heightAt(y.x, y.z) !== 0) continue;
          if (AROUND.some(([dx, dz]) => isSea(y.x + dx, y.z + dz))) continue; // the beach
          if (props().at(y.x, y.z)) { keep.push(y); continue; } // something stands on it: later
          const res = applyEdit(ctx, { kind: 'patch', x: y.x, z: y.z, from: { kind: T.SAND }, to: { kind: T.GRASS }, by: 'system', via: 'grass' });
          if (res.ok) n++;
        }
        s.young = keep;
        if (n) { ctx.invalidate('terrain'); ctx.invalidate('veg'); }
        return n;
      },

      /** The camera flies over the plot and back. */
      tour(tiles, burst = false) {
        const n = tiles.length, cx = tiles.reduce((a, t) => a + t.x, 0) / n + 0.5, cz = tiles.reduce((a, t) => a + t.z, 0) / n + 0.5;
        const sh = ctx.use('shrine');
        sh.focusQ = [...sh.focusQ, { x: cx, z: cz, until: ctx.mono() + 3600, burst }];
      },

      /** Due? (every couple of seconds, and on start) */
      check() {
        if (s.active && ctx.now() >= s.active.doneAt) api.finish();
        if (s.young.length) api.grow();
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) { ctx.state.api.check(); },
  update(ctx, dt) {
    ctx.state.poll -= dt;
    if (ctx.state.poll > 0) return;
    ctx.state.poll = POLL_S;
    ctx.state.api.check();
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'reclaim', priority: 64, // the basket over the sea (terraform, just above, only answers on land and fresh water)
      fn(t, ix) {
        if (ix.tool() !== 'earth' || !api.shore(t.x, t.z)) return null;
        return { kind: 'plot', t, icon: 'icons3:earth', label: api.active ? 'Plot…' : 'New plot' };
      },
    });
    // marking a plot out needs no walk: the sheet opens on the tile
    ctx.actions.add('plot', { queueable: false, button: true, perform: (a) => ctx.bus.emit('openSheet', { name: 'plot', args: { x: a.t.x, z: a.t.z } }) });
    const left = (ms) => { const m = Math.ceil(ms / MIN); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`; };
    ctx.todo.add({
      id: 'plot', priority: 48,
      when() {
        if (api.active) return { icon: 'icons3:earth', text: `The village is filling in a plot · ${left(api.left())}` };
        // the first plot, once a 5x5 one could be paid for: how to start
        if (api.plots || api.why({ tiles: Array(25) })) return null;
        return {
          icon: 'icons3:earth', text: 'You could grow the island: a plot of new land', cta: 'How?',
          onTap: () => ctx.say('Open Dig, take the earth basket and tap the sea right beside the shore.', 'icons3:earth'),
        };
      },
    });
  },
});

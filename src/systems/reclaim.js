// Shore reclaiming: with the basket of earth in hand, a tile of sea beside the shore is filled in with stone and earth and becomes
// sand. Each tile costs more than the last (koku from 20 rising to 300, and a little more stone every dozen tiles), so the island
// grows a few tiles at a time. The edit goes through world/edit.js applyEdit (kind 'reclaim'), so the terrain rules hold: the pier
// and the bridges keep their water, and some shore to fish the sea from stays. The count travels in the save (ext.reclaim).
import { defineSystem } from '../core/system.js';
import { applyEdit } from '../world/edit.js';
import { T, WK } from '../world/kinds.js';

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const round5 = (v) => 5 * Math.round(v / 5);

/** What the n-th reclaimed tile (from 0) costs. */
export const reclaimCost = (n) => ({ koku: Math.min(300, round5(20 + 280 * Math.pow(n / 50, 1.2))), stone: Math.min(4, 1 + Math.floor(n / 12)) });

export default defineSystem({
  name: 'reclaim',
  needs: ['props', 'player', 'farming', 'daily', 'terrainrules'], // world/edit.js EDIT_NEEDS, and the rules
  api(ctx) {
    const s = Object.assign(ctx.state, { n: 0 });
    ctx.part('reclaim', { serialize: () => ({ n: s.n }), load: (d) => { s.n = Math.max(0, d?.n | 0); }, defaults: () => ({ n: 0 }) });

    const api = {
      get count() { return s.n; },
      cost: () => reclaimCost(s.n),

      /** Sea at sea level beside dry land at sea level, not under a bridge or the pier. */
      can(x, z) {
        const w = ctx.world;
        if (!w.inBounds(x, z) || !w.isWater(x, z) || w.waterKind(x, z) !== WK.SEA || w.heightAt(x, z) !== 0) return false;
        if (ctx.use('props').at(x, z)) return false;
        return SIDES.some(([dx, dz]) => w.isLand(x + dx, z + dz) && w.heightAt(x + dx, z + dz) === 0);
      },

      /** Why it cannot be done now, or null. */
      why(x, z) {
        if (!api.can(x, z)) return 'Only the sea right beside the shore can be filled in.';
        const c = api.cost();
        if (ctx.money.get() < c.koku) return `Filling this in costs ${c.koku} koku.`;
        if (ctx.inv.count('stone') < c.stone) return `Filling this in takes ${c.stone} stone: break some rocks.`;
        return null;
      },

      reclaim(x, z) {
        const why = api.why(x, z);
        if (why) { ctx.say(why, 'icons3:stone'); return false; }
        const c = api.cost();
        const res = applyEdit(ctx, { kind: 'reclaim', x, z, from: { kind: T.WATER, height: 0 }, to: { kind: T.SAND, water: WK.NONE }, by: 'player' });
        if (!res.ok) { ctx.say(res.reason); return false; }
        ctx.money.spend(c.koku, 'reclaim');
        ctx.inv.take('stone', c.stone);
        s.n++;
        ctx.use('player').swing();
        ctx.sfx('till');
        ctx.bus.emit('haptic', { ms: 18 });
        ctx.fx.burst(x + 0.5, 0.05, z + 0.5, { color: '#e8f4f0', n: 22, up: 0.9 });
        ctx.fx.burst(x + 0.5, 0.1, z + 0.5, { color: '#d8c08a', n: 14, up: 0.6 });
        const next = api.cost();
        ctx.say(`The island grows! The next tile: ${next.koku} koku and ${next.stone} stone.`, 'icons3:earth');
        ctx.invalidate('ui');
        return true;
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'reclaim', priority: 64, // the basket over the sea (terraform, just above, only answers on land and fresh water)
      fn(t, ix) {
        if (ix.tool() !== 'earth' || !api.can(t.x, t.z)) return null;
        const c = api.cost();
        return { kind: 'reclaim', t, icon: 'icons3:earth', label: `Fill · ${c.koku}` };
      },
    });
    ctx.actions.add('reclaim', { queueable: true, button: true, perform: (a) => api.reclaim(a.t.x, a.t.z) });
  },
});

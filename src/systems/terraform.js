// Shaping the land: the shovel cuts a raised edge down one level, or opens flat ground into a pond (on a hill too); the earth goes
// to the bag. A basket of earth piles one level onto a tile, or fills a pond or stream back in; the earth comes out of the bag. Both go through world/edit.js applyEdit, so the terrain rules hold (landmarks, decks and
// stairs keep their ground, the way home stays open, the last soil and fishing water stay in reach) and whatever stood on the tile
// goes back to the bag. Dragging across tiles with either tool queues one action per tile (a sweep), so a level can be painted.
import { defineSystem } from '../core/system.js';
import { applyEdit } from '../world/edit.js';
import { MAX_HEIGHT, LEVEL_Y } from '../world/coords.js';
import { T, WK } from '../world/kinds.js';
import { hotbarEntry } from './shared.js';

export const EARTH = 'earth';
export const START_EARTH = 12;

export default defineSystem({
  name: 'terraform',
  needs: ['props', 'player', 'farming', 'daily', 'terrainrules'], // world/edit.js EDIT_NEEDS, and the rules
  api(ctx) {
    const world = () => ctx.world;
    const dirt = (x, z, h) => {
      ctx.fx.burst(x + 0.5, h * LEVEL_Y + 0.1, z + 0.5, { color: '#7a5636', n: 14, up: 0.8 });
      ctx.sfx('till');
      ctx.bus.emit('haptic', { ms: 12 });
    };
    const edit = (kind, x, z, from, to) => {
      const res = applyEdit(ctx, { kind, x, z, from, to, by: 'player' });
      // standing off-centre, the body may now overlap a step it cannot be on: back to the middle of its own tile
      const pl = ctx.use('player');
      if (res.ok && !pl.canStand()) { const c = pl.cell(); pl.warp(c.x + 0.5, c.z + 0.5); }
      return res;
    };

    const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    /**
     * What digging at (x, z) does: beside water at its own level it widens the water ('pond'; at a hill's edge over water one level
     * down that makes a waterfall), at a raised edge it 'cut's the ground down a level, in flat ground it opens a 'pond'.
     */
    const digKind = (x, z) => {
      const w = world(), h = w.heightAt(x, z);
      const side = (f) => SIDES.some(([dx, dz]) => f(x + dx, z + dz));
      if (side((nx, nz) => w.isWater(nx, nz) && w.heightAt(nx, nz) === h && w.inBounds(nx, nz))) return 'pond';
      return side((nx, nz) => w.isLand(nx, nz) && w.heightAt(nx, nz) < h) ? 'cut' : 'pond';
    };
    /** The water a new hole fills with: the sea's at the shore, a stream's beside a stream, else a pond. */
    const waterFor = (x, z) => {
      const w = world(), h = w.heightAt(x, z);
      const near = SIDES.filter(([dx, dz]) => w.isWater(x + dx, z + dz) && w.heightAt(x + dx, z + dz) === h).map(([dx, dz]) => w.waterKind(x + dx, z + dz));
      return near.includes(WK.SEA) ? WK.SEA : near.includes(WK.STREAM) ? WK.STREAM : WK.POND;
    };
    const fresh = (x, z) => world().isWater(x, z) && world().waterKind(x, z) !== WK.SEA;

    const api = {
      digKind,

      /** Why the shovel (dir -1) or the earth (dir +1) does nothing at (x, z), or null. */
      why(dir, x, z) {
        const w = world();
        if (!w.inBounds(x, z)) return 'That is beyond the island.';
        if (dir < 0 && w.isWater(x, z)) return 'That is water already.';
        if (dir > 0 && w.isWater(x, z) && !fresh(x, z)) return 'The sea is too deep to fill with a basket.';
        if (dir > 0 && w.heightAt(x, z) >= MAX_HEIGHT && w.isLand(x, z)) return 'It will not pile any higher.';
        if (dir > 0 && ctx.inv.count(EARTH) < 1) return 'No earth left: dig some up with the shovel.';
        return null;
      },

      /** Earth onto (x, z): a pond or stream tile is filled in, land rises one level. -> true when it changed. */
      raise(x, z) {
        const why = api.why(1, x, z);
        if (why) { ctx.say(why); return false; }
        const w = world(), h = w.heightAt(x, z), filling = w.isWater(x, z);
        const res = filling
          ? applyEdit(ctx, { kind: 'fill', x, z, from: { kind: T.WATER, height: h }, to: { kind: T.GRASS, water: WK.NONE }, by: 'player' })
          : edit('raise', x, z, { height: h }, { height: h + 1 });
        if (!res.ok) { ctx.say(res.reason); return false; }
        ctx.inv.take(EARTH, 1);
        ctx.invalidate('ui');
        dirt(x, z, filling ? h : h + 1);
        return true;
      },

      /** The shovel at (x, z): a raised edge comes down a level, flat ground opens into water; the earth goes in the bag. */
      lower(x, z) {
        const why = api.why(-1, x, z);
        if (why) { ctx.say(why); return false; }
        const w = world(), h = w.heightAt(x, z), pond = digKind(x, z) === 'pond';
        const res = pond
          ? edit('dig', x, z, { kind: w.kindAt(x, z), height: h }, { kind: T.WATER, water: waterFor(x, z) })
          : edit('lower', x, z, { height: h }, { height: h - 1 });
        if (!res.ok) { ctx.say(res.reason); return false; }
        ctx.inv.give(EARTH, 1);
        ctx.invalidate('ui');
        dirt(x, z, pond ? h - 0.6 : h - 1);
        if (pond) ctx.fx.burst(x + 0.5, w.waterY(x + 0.5, z + 0.5) + 0.05, z + 0.5, { color: '#e8f4f0', n: 12, up: 0.5 });
        return true;
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) {
    // a village from before the shovel existed gets one, with a little earth to start shaping
    if (!ctx.inv.count('shovel')) { ctx.inv.give('shovel', 1, { reason: 'gift' }); ctx.inv.give(EARTH, START_EARTH, { reason: 'gift' }); }
  },
  init(ctx) {
    const { api } = ctx.state;
    const ACTIONS = { shovel: ['dig', 'icons3:shovel', 'Dig'], earth: ['pile', 'icons3:earth', 'Raise'] };
    ctx.resolvers.add({
      id: 'terraform', priority: 65, // with a land tool in hand: above soil and fishing, below crops and forage; props are looked at
      fn(t, ix) {
        const a = ACTIONS[ix.tool()];
        if (!a || ctx.use('props').at(t.x, t.z)) return null;
        const w = ctx.world, freshWater = w.isWater(t.x, t.z) && w.waterKind(t.x, t.z) !== WK.SEA && !ctx.use('props').isBridge(t.x, t.z);
        return w.isLand(t.x, t.z) || (a[0] === 'pile' && freshWater) ? { kind: a[0], t, icon: a[1], label: a[0] === 'pile' && freshWater ? 'Fill' : a[2] } : null;
      },
    });
    ctx.actions.add('dig', { queueable: true, sweep: true, button: true, perform: (a, ix) => ix.useTool(a.t, 'shovel') });
    ctx.actions.add('pile', { queueable: true, sweep: true, button: true, perform: (a, ix) => ix.useTool(a.t, 'earth') });
    ctx.tools.add('shovel', { use: (t, ix) => { ctx.use('player').swing(); api.lower(t.x, t.z); } });
    ctx.tools.add('earth', { use: (t) => { ctx.use('player').swing(); api.raise(t.x, t.z); } });
    // the dig kit, with the hoe
    ctx.hotbar.add({ ...hotbarEntry(ctx, 'shovel', 46), kit: 'dig' });
    ctx.hotbar.add({ ...hotbarEntry(ctx, 'earth', 47), kit: 'dig', hint: 'Pile the ground up a level, or fill a pond back in' });
  },
});

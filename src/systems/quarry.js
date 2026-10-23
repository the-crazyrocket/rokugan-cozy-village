// The quarry: a rock outcrop gives STRIKES blows a day, STONE stone each (a tap, with whatever is in hand: the island's steady
// source of stone, beside the loose rocks that turn up each morning). The island starts with one; every second plot of new land
// turns up another (systems/reclaim.js). The day's blows live in the daily state: day.ext.quarry = { [prop id]: blows }.
import { defineSystem } from '../core/system.js';
import { HOME } from '../content/base/landmarks.js';
import { placeNear } from './shared.js';

export const STRIKES = 3;
export const STONE = 2;

export default defineSystem({
  name: 'quarry',
  needs: ['props', 'player', 'daily'],
  api(ctx) {
    const props = () => ctx.use('props');
    const used = () => {
      const d = ctx.use('daily').state;
      return d ? ((d.ext ||= {}).quarry ||= {}) : null;
    };
    const api = {
      /** The outcrop at (x, z), or null. */
      at(x, z) { const p = props().at(x, z); return p?.type === 'outcrop' ? p : null; },
      /** Blows left today on outcrop `id`. */
      left: (id) => Math.max(0, STRIKES - (used()?.[id] ?? 0)),
      /** Stone still to be had from every outcrop today. */
      today: () => props().list.filter((p) => p.type === 'outcrop').reduce((n, p) => n + api.left(p.id) * STONE, 0),

      strike(x, z) {
        const p = api.at(x, z), u = used();
        if (!p || !u) return false;
        if (!api.left(p.id)) { ctx.say('Quarried out for today: more stone tomorrow.', 'icons3:stone'); return false; }
        u[p.id] = (u[p.id] ?? 0) + 1;
        ctx.inv.give('stone', STONE, { reason: 'gather' });
        const pl = ctx.use('player');
        pl.face({ x, z }); pl.swing();
        ctx.sfx('chop');
        ctx.bus.emit('haptic', { ms: 14 });
        const y = ctx.world.levelY(x + 0.5, z + 0.5);
        ctx.fx.burst(x + 0.5, y + 0.45, z + 0.5, { color: '#b9b5a8', n: 16, up: 0.9 });
        ctx.fx.burst(x + 0.5, y + 0.2, z + 0.5, { color: '#d8d2c2', n: 8, up: 0.4 });
        const left = api.left(p.id);
        ctx.say(`+${STONE} stone${left ? '' : ' · that is all for today'}`, 'icons3:stone');
        ctx.bus.emit('gather', { item: 'stone', n: STONE, x, z, kind: 'quarry' });
        ctx.invalidate('ui');
        return true;
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) {
    // every island has an outcrop; a village from before the quarry gets one in the open east of home
    const pr = ctx.use('props');
    if (!pr.list.some((p) => p.type === 'outcrop')) placeNear(pr, 'outcrop', HOME.x + 10, HOME.z + 3, { r: 8, rots: [1] });
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'quarry', priority: 66, // any kit: above the shovel, which would otherwise answer on the ground beside it
      fn(t) {
        const p = api.at(t.x, t.z);
        if (!p) return null;
        return { kind: 'quarry', t, prop: p, icon: 'icons3:stone', label: api.left(p.id) ? `Quarry · ${api.left(p.id)}` : 'Spent' };
      },
    });
    ctx.actions.add('quarry', { queueable: true, button: true, perform: (a) => api.strike(a.t.x, a.t.z) });
  },
});

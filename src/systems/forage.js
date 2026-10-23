// Wild greens: where they spawn each day (the forage contributor of the daily roll), which are still there, picking them.
// Picking one is a `forage` event, emitted last (Hana's requests and the stats count it).
// The greens live in the day's state (systems/daily.js): [{ x, z, item, taken }].
import { defineSystem } from '../core/system.js';
import { T } from '../world/kinds.js';

const FORAGE_PER_DAY = 6;

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'forage';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };

export default defineSystem({
  name: NAME,
  needs: ['daily', 'props', 'farming', 'player', 'market', 'stats'],
  facade: {
    pickForage: call('pick'),
  },
  api(ctx) {
    const day = () => ctx.use('daily').state;
    const give = (id, n = 1) => { ctx.inv.give(id, n, { reason: 'forage' }); ctx.invalidate('ui'); };

    const api = {
      canGrow(x, z) {
        return ctx.world.get(x, z) === T.GRASS && !ctx.use('props').at(x, z) && !ctx.use('farming').crop(x, z) && !ctx.use('market').isMerchant(x, z)
          && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => ctx.use('player').walkable(x + dx, z + dz));
      },

      /** Wildflowers on open grass, warabi near trees and bamboo. */
      spawn(rnd) {
        const world = ctx.world, props = ctx.use('props'), out = [];
        const open = [], shady = [];
        const nearTree = (x, z) => {
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
            const p = props.at(x + dx, z + dz);
            const def = p && ctx.content.props.get(p.type);
            if (def && (def.canopy || def.sprite)) return true;
          }
          return false;
        };
        for (let z = 1; z < world.h - 1; z++) for (let x = 1; x < world.w - 1; x++) {
          if (!api.canGrow(x, z)) continue;
          (nearTree(x, z) ? shady : open).push({ x, z });
        }
        const take = (list) => { if (!list.length) return null; const i = Math.floor(rnd() * list.length); return list.splice(i, 1)[0]; };
        for (let k = 0; k < FORAGE_PER_DAY; k++) {
          const item = k % 2 ? 'warabi' : 'wildflower';
          const t = ctx.content.forage.get(item).where === 'trees' ? take(shady) || take(open) : take(open) || take(shady);
          if (!t) break;
          // keep them apart so they read as separate finds
          for (const list of [open, shady]) for (let i = list.length - 1; i >= 0; i--) if (Math.max(Math.abs(list[i].x - t.x), Math.abs(list[i].z - t.z)) < 3) list.splice(i, 1);
          out.push({ ...t, item, taken: false });
        }
        return out;
      },

      /** Forage still waiting at (x,z) (hidden if something was built or dug there). */
      at(x, z) {
        const f = day()?.forage.find((f) => !f.taken && f.x === x && f.z === z);
        return f && ctx.world.get(x, z) === T.GRASS && !ctx.use('props').at(x, z) ? f : null;
      },
      visible: () => (day()?.forage || []).filter((f) => api.at(f.x, f.z)),
      left: () => api.visible().length,

      pick(x, z) {
        const f = api.at(x, z);
        if (!f) return;
        const first = !ctx.use('stats').get('foraged', f.item);
        f.taken = true;
        give(f.item);
        ctx.use('player').swing();
        ctx.sfx('forage');
        ctx.bus.emit('haptic', { ms: 10 });
        ctx.fx.burst(x + 0.5, 0.4, z + 0.5, { color: f.item === 'warabi' ? '#b8d67a' : '#f6c3cf', n: 14, up: 0.9 });
        ctx.invalidate('veg');
        const it = ctx.content.itemMap().get(f.item);
        ctx.say(`Found ${it.name.toLowerCase()}!`, it.icon);
        ctx.bus.emit('forage', { item: f.item, n: 1, x, z, first });
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'forage', priority: 80,
      fn(t) { const f = api.at(t.x, t.z); return f ? { kind: 'forage', t, icon: ctx.content.itemMap().get(f.item).icon, label: 'Pick' } : null; },
    });
    ctx.actions.add('forage', { queueable: true, sweep: true, perform: (a) => api.pick(a.t.x, a.t.z) });
    ctx.daily.contribute({ id: 'forage', order: 30, base: true, roll: (rnd) => ({ forage: ctx.state.api.spawn(rnd) }) });
  },
});

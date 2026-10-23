// Gathering: the raw materials of the island. Each day rocks, fallen branches, clay on the stream banks and shells on the beaches
// turn up (a contributor of the daily roll, so they come back every morning), and every tree can be shaken once a day for a branch
// (bamboo gives a cane). Gathering is a `gather` event, so the stats count it; Hana's wild-greens requests stay with forage.
// The day's part lives in the daily state: day.ext.gather = { spots: [{ x, z, kind, taken }], shaken: ['x,z', ...] }.
import { defineSystem } from '../core/system.js';
import { createRng } from '../core/rng.js';
import { T, WK } from '../world/kinds.js';

/** What turns up, where, and what it gives. `where`: open grass, grass near trees, a fresh-water bank, a beach by the sea.
 *  `per` a day, or with `perLand` one for every that many tiles of land when that is more (a bigger island, more rocks). */
export const NODES = {
  rock: { sprites: ['rock_a', 'rock_b'], height: 1.0, where: 'open', gives: 'stone', n: 2, per: 4, perLand: 140, verb: 'Break', color: '#a8a49a', sfx: 'till' },
  branch: { sprites: ['branch_a', 'branch_b'], height: 0.85, where: 'trees', gives: 'wood', n: 2, per: 3, verb: 'Pick up', color: '#8a6440', sfx: 'forage' },
  clay: { sprites: ['clay'], height: 0.8, where: 'bank', gives: 'clay', n: 1, per: 2, verb: 'Dig', color: '#c06a3e', sfx: 'till' },
  shells: { sprites: ['shells', 'driftwood'], height: 0.75, where: 'beach', gives: 'shell', n: 1, per: 3, verb: 'Pick up', color: '#f2dccb', sfx: 'forage' },
};
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export default defineSystem({
  name: 'gather',
  needs: ['daily', 'props', 'farming', 'player', 'market'],
  api(ctx) {
    const props = () => ctx.use('props');
    const def = (p) => p && ctx.content.props.get(p.type);
    const isTree = (p) => !!(def(p)?.canopy || p?.type === 'bamboo');

    /** The day's gathering, rolled for a day that was rolled before gathering existed. */
    const day = () => {
      const d = ctx.use('daily').state;
      if (!d) return null;
      if (!d.ext?.gather) { (d.ext ||= {}).gather = api.spawn(createRng(d.key)('gather')); }
      return d.ext.gather;
    };
    const give = (id, n) => { ctx.inv.give(id, n, { reason: 'gather' }); ctx.invalidate('ui'); };

    const api = {
      /** Where things may turn up today, by kind of place. */
      places() {
        const w = ctx.world, out = { open: [], trees: [], bank: [], beach: [] };
        const near = (x, z, r, f) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if ((dx || dz) && f(x + dx, z + dz)) return true; return false; };
        for (let z = 1; z < w.h - 1; z++) for (let x = 1; x < w.w - 1; x++) {
          const t = w.get(x, z);
          if ((t !== T.GRASS && t !== T.SAND) || props().at(x, z) || ctx.use('farming').crop(x, z) || ctx.use('market').isMerchant(x, z)) continue;
          if (!SIDES.some(([dx, dz]) => ctx.use('player').walkable(x + dx, z + dz))) continue;
          const by = (f) => SIDES.some(([dx, dz]) => f(x + dx, z + dz));
          if (t === T.SAND && by((nx, nz) => w.isWater(nx, nz) && w.waterKind(nx, nz) === WK.SEA)) out.beach.push({ x, z });
          else if (by((nx, nz) => w.isWater(nx, nz) && w.waterKind(nx, nz) !== WK.SEA)) out.bank.push({ x, z });
          else if (t === T.GRASS && near(x, z, 2, (nx, nz) => isTree(props().at(nx, nz)))) out.trees.push({ x, z });
          else if (t === T.GRASS) out.open.push({ x, z });
        }
        return out;
      },

      /** Tiles of land on the island. */
      land() { const w = ctx.world; let n = 0; for (let z = 0; z < w.h; z++) for (let x = 0; x < w.w; x++) if (w.isLand(x, z)) n++; return n; },

      /** The roll: `per` of each kind, kept a few tiles apart so they read as separate finds. */
      spawn(rnd) {
        const places = api.places(), spots = [], int = (n) => Math.floor(rnd() * n), land = api.land();
        for (const [kind, n] of Object.entries(NODES)) {
          const list = n.where === 'trees' && !places.trees.length ? places.open : places[n.where]; // an island without trees still has branches
          const per = n.perLand ? Math.max(n.per, Math.round(land / n.perLand)) : n.per;
          for (let k = 0; k < per && list.length; k++) {
            const t = list.splice(int(list.length), 1)[0];
            for (const l of Object.values(places)) for (let i = l.length - 1; i >= 0; i--) if (Math.max(Math.abs(l[i].x - t.x), Math.abs(l[i].z - t.z)) < 3) l.splice(i, 1);
            spots.push({ x: t.x, z: t.z, kind, v: int(n.sprites.length), taken: false });
          }
        }
        return { spots, shaken: [] };
      },

      /** A find still waiting at (x, z) (gone if something was built, dug or tilled there). */
      at(x, z) {
        const s = day()?.spots.find((s) => !s.taken && s.x === x && s.z === z);
        const t = s && ctx.world.get(x, z);
        return s && (t === T.GRASS || t === T.SAND) && !props().at(x, z) ? s : null;
      },
      visible: () => (day()?.spots || []).filter((s) => api.at(s.x, s.z)),

      take(x, z) {
        const s = api.at(x, z);
        if (!s) return false;
        const n = NODES[s.kind];
        s.taken = true;
        give(n.gives, n.n);
        api.feedback(x, z, n.color, n.sfx);
        ctx.invalidate('veg');
        const it = ctx.content.itemMap().get(n.gives);
        ctx.say(`+${n.n} ${it.name.toLowerCase()}`, it.icon);
        ctx.bus.emit('gather', { item: n.gives, n: n.n, x, z, kind: s.kind });
        return true;
      },

      /** A tree not yet shaken today, at (x, z). */
      shakable(x, z) {
        const p = props().at(x, z);
        return isTree(p) && !(day()?.shaken || []).includes(`${p.x},${p.z}`) ? p : null;
      },
      shake(x, z) {
        const p = api.shakable(x, z);
        if (!p) return false;
        day().shaken.push(`${p.x},${p.z}`);
        const item = p.type === 'bamboo' ? 'bamboo' : 'wood';
        give(item, 1);
        ctx.fx.burst(x + 0.5, ctx.world.levelY(x + 0.5, z + 0.5) + 1.4, z + 0.5, { color: p.type === 'sakura' ? '#f6c3cf' : '#7fa35a', n: 18, up: 0.3 });
        api.feedback(x, z, '#8a6440', 'forage');
        const it = ctx.content.itemMap().get(item);
        ctx.say(`The ${def(p).name.toLowerCase()} drops ${item === 'bamboo' ? 'a cane' : 'a branch'}: +1 ${it.name.toLowerCase()}`, it.icon);
        ctx.bus.emit('gather', { item, n: 1, x, z, kind: 'tree' });
        return true;
      },

      feedback(x, z, color, sfx) {
        ctx.use('player').swing();
        ctx.sfx(sfx);
        ctx.bus.emit('haptic', { ms: 10 });
        ctx.fx.burst(x + 0.5, ctx.world.levelY(x + 0.5, z + 0.5) + 0.3, z + 0.5, { color, n: 14, up: 0.8 });
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'gather', priority: 75, // above crops, below wild greens
      fn(t) { const s = api.at(t.x, t.z); return s ? { kind: 'gather', t, icon: ctx.content.itemMap().get(NODES[s.kind].gives).icon, label: NODES[s.kind].verb } : null; },
    });
    ctx.resolvers.add({
      id: 'shake', priority: 42, // with the hand, before a tree is looked at
      fn(t) { return api.shakable(t.x, t.z) ? { kind: 'shake', t, icon: 'icons3:wood', label: 'Shake' } : null; },
    });
    ctx.actions.add('gather', { queueable: true, sweep: true, perform: (a) => api.take(a.t.x, a.t.z) });
    ctx.actions.add('shake', { queueable: true, perform: (a) => api.shake(a.t.x, a.t.z) });
    ctx.daily.contribute({ id: 'gather', order: 40, roll: (rnd) => api.spawn(rnd) });
  },
});

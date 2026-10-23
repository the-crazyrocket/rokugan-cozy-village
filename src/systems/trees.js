// Trees: a sapling (from Hana, or sometimes from a felled tree) is planted from the seed slot on open ground and grows in real
// time, sapling -> young -> grown, finished even while the game is closed. The axe (dig kit) fells a grown tree for wood and
// leaves a stump that sprouts again after a while, or is dug out with the shovel; on a young tree it lifts the sapling back out.
// A tree's growth is its own: a sapling is the tree prop drawn small (the scale is read by the props view).
// Felling takes a moment: HITS strokes of the axe (`chopHit`), then the tree comes down away from the player (`treeFell`, after which
// the stump and the wood are there); walking off stops it (`chopStop`). The view animates the tree from those events.
// Saved in ext.trees: { young: { propId: plantedAt }, stumps: { propId: { tree, cutAt } } }.
import { defineSystem } from '../core/system.js';
import { PRIO } from '../core/bus.js';
import { HOUR } from '../core/time.js';
import { T } from '../world/kinds.js';
import { hotbarEntry } from './shared.js';

export const STAGE_MS = 12 * HOUR; // per stage: sapling, young, then grown a day after planting
export const REGROW_MS = 36 * HOUR; // a stump sprouts again
export const SCALES = [0.38, 0.68, 1]; // the tree drawn at each stage
const GROWN = 2;
const WOOD = 3; // a felled tree's wood
const SAPLING_CHANCE = 0.5; // and sometimes a sapling of its kind
const POLL_S = 3;
export const HITS = 3; // strokes to fell a tree
export const HIT_S = 0.42; // between strokes; the tree falls one stroke after the last
const dir = { x: 'number', z: 'number' };

export default defineSystem({
  name: 'trees',
  needs: ['props', 'player'],
  events: {
    chopHit: { id: 'int', x: 'int', z: 'int', hit: 'int', dir: { fields: dir } },
    treeFell: { id: 'int', prop: 'id', x: 'int', z: 'int', dir: { fields: dir } },
    chopStop: { id: 'int' },
  },
  api(ctx) {
    // shown: propId -> the stage drawn; felling: the tree being chopped { id, x, z, at (player cell), hits, t, dir }
    const s = Object.assign(ctx.state, { young: {}, stumps: {}, shown: {}, poll: 0, felling: null });
    ctx.part('trees', {
      serialize: () => ({ young: s.young, stumps: s.stumps }),
      load: (d) => { s.young = { ...(d?.young || {}) }; s.stumps = { ...(d?.stumps || {}) }; s.shown = {}; },
      defaults: () => ({ young: {}, stumps: {} }),
    });
    const props = () => ctx.use('props');
    const items = () => ctx.content.itemMap();
    const isTree = (p) => !!p && !!ctx.content.props.get(p.type)?.canopy;
    const saplingOf = (tree) => [...items()].find(([, it]) => it.kind === 'sapling' && it.prop === tree)?.[0] ?? null;
    const name = (type) => ctx.content.props.get(type).name.toLowerCase();
    const chips = (x, z, color = '#b07f4f') => ctx.fx.burst(x + 0.5, ctx.world.levelY(x + 0.5, z + 0.5) + 0.4, z + 0.5, { color, n: 16, up: 0.9 });

    const api = {
      /** 0 sapling, 1 young, 2 grown (a tree nobody planted is grown). */
      stage(id) { const at = s.young[id]; return at === undefined ? GROWN : Math.min(GROWN, Math.floor((ctx.now() - at) / STAGE_MS)); },
      /** How big tree `id` is drawn. */
      scale: (id) => SCALES[api.stage(id)],
      /** Time until tree `id` grows a stage (0 when grown). */
      left(id) { const at = s.young[id]; return at === undefined ? 0 : Math.max(0, at + (api.stage(id) + 1) * STAGE_MS - ctx.now()); },
      isStump: (id) => !!s.stumps[id],
      saplingOf,

      /** Can sapling `item` go on tile x, z: open grass, sand or soil with nothing on it. */
      canPlant(item, x, z) {
        const it = items().get(item);
        if (it?.kind !== 'sapling' || !ctx.inv.count(item)) return false;
        const tile = ctx.world.get(x, z);
        if (![T.GRASS, T.SAND, T.SOIL].includes(tile) || props().at(x, z)) return false;
        return props().canPlace(it.prop, x, z, 0, { via: 'plant' });
      },
      plant(item, x, z) {
        if (!api.canPlant(item, x, z)) { ctx.say('A sapling needs open ground.'); return false; }
        const it = items().get(item);
        ctx.inv.take(item, 1);
        const p = props().add(it.prop, x, z, Math.floor(ctx.rng() * 4), 0, { via: 'plant' });
        s.young[p.id] = ctx.now();
        s.shown[p.id] = 0;
        ctx.use('player').swing();
        ctx.sfx('plant');
        chips(x, z, '#7a5636');
        ctx.say(`Planted a ${it.name.toLowerCase()}: a tree by tomorrow.`, it.icon);
        ctx.invalidate('veg');
        ctx.invalidate('ui');
        return true;
      },

      /** The axe: starts felling a grown tree (wood, maybe a sapling and a stump once it is down), or lifts a young one back into the bag. */
      chop(x, z) {
        const p = props().at(x, z);
        if (!isTree(p) || s.felling) return false;
        if (api.stage(p.id) >= GROWN) {
          const pl = ctx.use('player'), c = pl.cell(), d = Math.hypot(x - c.x, z - c.z) || 1;
          s.felling = { id: p.id, x, z, at: c, hits: 0, t: 0, dir: { x: (x - c.x) / d, z: (z - c.z) / d } };
          api.hit();
          return true;
        }
        const sap = saplingOf(p.type);
        ctx.use('player').swing();
        props().remove(p, { to: 'gone' });
        delete s.young[p.id]; delete s.shown[p.id];
        if (sap) ctx.inv.give(sap, 1, { reason: 'gather' });
        ctx.sfx('pickup');
        ctx.say(`You lifted the young ${name(p.type)}.`, sap ? items().get(sap).icon : 'icons6:axe');
        chips(p.x, p.z, '#7a5636');
        ctx.invalidate('veg');
        ctx.invalidate('ui');
        return true;
      },
      /** Is a tree being felled (the player is busy). */
      get felling() { return s.felling; },

      /** One stroke of the axe on the tree being felled. */
      hit() {
        const f = s.felling, pl = ctx.use('player');
        pl.face({ x: f.x, z: f.z });
        pl.swing();
        f.hits++;
        ctx.sfx('chop');
        ctx.bus.emit('haptic', { ms: 12 });
        const y = ctx.world.levelY(f.x + 0.5, f.z + 0.5) + 0.35;
        ctx.fx.burst(f.x + 0.5 - f.dir.x * 0.25, y, f.z + 0.5 - f.dir.z * 0.25, { color: '#c89a64', n: 9, up: 0.7 });
        ctx.bus.emit('chopHit', { id: f.id, x: f.x, z: f.z, hit: f.hits, dir: { ...f.dir } });
      },

      /** The tree comes down: a stump in its place, the wood (and maybe a sapling) in the bag. */
      fell() {
        const f = s.felling;
        s.felling = null;
        const p = props().get(f.id);
        if (!p) return false;
        const sap = saplingOf(p.type);
        ctx.bus.emit('treeFell', { id: p.id, prop: p.type, x: p.x, z: p.z, dir: { ...f.dir } });
        props().remove(p, { to: 'gone' });
        delete s.young[p.id]; delete s.shown[p.id];
        const st = props().add('stump', p.x, p.z, p.rot, 0, { via: 'grow' });
        s.stumps[st.id] = { tree: p.type, cutAt: ctx.now() };
        ctx.inv.give('wood', WOOD, { reason: 'gather' });
        const seedling = sap && ctx.rng() < SAPLING_CHANCE;
        if (seedling) ctx.inv.give(sap, 1, { reason: 'gather' });
        ctx.sfx('timber');
        ctx.bus.emit('haptic', { ms: 30 });
        ctx.bus.emit('gather', { item: 'wood', n: WOOD, x: p.x, z: p.z, kind: 'chop' });
        ctx.say(`Timber! ${WOOD} wood${seedling ? ', and a sapling' : ''}.`, 'icons3:wood');
        ctx.invalidate('veg');
        ctx.invalidate('ui');
        return true;
      },

      /** Felling stops (the player walked off): the tree stands. */
      stopFelling() {
        const f = s.felling;
        if (!f) return;
        s.felling = null;
        ctx.bus.emit('chopStop', { id: f.id });
      },

      /** The felling's clock: strokes every HIT_S, the fall one stroke after the last. */
      fellStep(dt) {
        const f = s.felling;
        if (!f) return;
        const c = ctx.use('player').cell();
        if (c.x !== f.at.x || c.z !== f.at.z || !props().get(f.id)) { api.stopFelling(); return; }
        f.t += dt;
        if (f.t < HIT_S) return;
        f.t -= HIT_S;
        if (f.hits < HITS) api.hit(); else api.fell();
      },

      /** The shovel on a stump: dug out, the ground free again (a last piece of wood). */
      unstump(x, z) {
        const p = props().at(x, z);
        if (p?.type !== 'stump') return false;
        ctx.use('player').swing();
        props().remove(p, { to: 'gone' });
        delete s.stumps[p.id];
        ctx.inv.give('wood', 1, { reason: 'gather' });
        ctx.sfx('till');
        chips(x, z, '#7a5636');
        ctx.say('Dug out the stump.', 'icons3:wood');
        ctx.invalidate('veg');
        return true;
      },

      /** Growth and sprouting stumps up to now (also the catch-up after time away). */
      tick() {
        const now = ctx.now();
        let changed = false;
        for (const [id, st] of Object.entries(s.stumps)) {
          const p = props().get(+id);
          if (!p) { delete s.stumps[id]; continue; }
          if (now < st.cutAt + REGROW_MS) continue;
          props().remove(p, { to: 'gone' });
          delete s.stumps[id];
          const t = props().add(st.tree, p.x, p.z, p.rot, 0, { via: 'grow' });
          s.young[t.id] = st.cutAt + REGROW_MS; // it sprouted then, and may have grown on since
          changed = true;
        }
        for (const id of Object.keys(s.young)) {
          if (!props().get(+id)) { delete s.young[id]; delete s.shown[id]; continue; }
          const st = api.stage(+id);
          if (s.shown[id] !== st) { s.shown[id] = st; changed = true; }
          if (st >= GROWN) { delete s.young[id]; delete s.shown[id]; }
        }
        if (changed) ctx.invalidate('veg');
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) {
    // a village from before forestry gets the axe
    if (!ctx.inv.count('axe')) ctx.inv.give('axe', 1, { reason: 'gift' });
    ctx.state.api.tick();
  },
  update(ctx, dt) {
    ctx.state.api.fellStep(dt);
    ctx.state.poll -= dt;
    if (ctx.state.poll > 0) return;
    ctx.state.poll = POLL_S;
    ctx.state.api.tick();
  },
  init(ctx) {
    const { api } = ctx.state;
    const props = () => ctx.use('props');
    ctx.resolvers.add({
      id: 'forestry', priority: 67, // the dig kit's axe on a tree, its shovel on a stump: above the land tools and the shake
      fn(t, ix) {
        if (ix.kit !== 'dig') return null;
        const p = props().at(t.x, t.z);
        if (!p) return null;
        if (ix.tool() === 'axe' && ctx.content.props.get(p.type)?.canopy) return { kind: 'chop', t, icon: 'icons6:axe', label: api.stage(p.id) >= GROWN ? 'Chop' : 'Lift' };
        if (ix.tool() === 'shovel' && p.type === 'stump') return { kind: 'unstump', t, icon: 'icons3:shovel', label: 'Dig out' };
        return null;
      },
    });
    ctx.resolvers.add({
      id: 'sapling', priority: 61, // a sapling in hand: above the soil's seeds
      fn(t, ix) {
        const it = ctx.content.itemMap().get(ix.tool());
        return it?.kind === 'sapling' && api.canPlant(ix.tool(), t.x, t.z) ? { kind: 'plantTree', t, item: ix.tool(), icon: it.icon, label: 'Plant' } : null;
      },
    });
    ctx.actions.add('chop', { queueable: true, button: true, perform: (a) => api.chop(a.t.x, a.t.z) });
    ctx.actions.add('unstump', { queueable: true, button: true, perform: (a) => api.unstump(a.t.x, a.t.z) });
    ctx.actions.add('plantTree', { queueable: true, button: true, perform: (a) => api.plant(a.item, a.t.x, a.t.z) });
    ctx.tools.add('axe', { use: (t) => api.chop(t.x, t.z) });
    ctx.hotbar.add({ ...hotbarEntry(ctx, 'axe', 25), kit: 'dig' });
    [...ctx.content.itemMap()].filter(([, it]) => it.kind === 'sapling').forEach(([id], i) => {
      ctx.hotbar.add({ ...hotbarEntry(ctx, id, 70 + i, 'seeds'), when: { has: id } });
    });
    // a young tree picked up in build mode goes back to the bag as its sapling, not as a grown tree
    // the player is busy while felling (the queue waits)
    ctx.bus.filter('interact.busy', (busy) => busy || !!ctx.state.felling);
    ctx.bus.filter('build.pickupItem', (it, p) => (api.stage(p.id) < GROWN && api.saplingOf(p.prop)) || it);
    ctx.bus.on('remove', (p) => { if (p.to === 'bag') { delete ctx.state.young[p.id]; delete ctx.state.shown[p.id]; } }, { priority: PRIO.GAME });
  },
});

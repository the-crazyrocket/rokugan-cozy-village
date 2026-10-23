// Farming: the crops and the watered soil, their growth from timestamps, and the hoe / watering can / seed branches of useTool. [T]
// Owns the farm (tile index -> crop) and the wet soil (tile index -> wet until). Harvesting emits `harvest` last, so whoever counts it
// (the stats, Hana's requests) runs after our toast; a crop turning ripe emits `cropRipe` (also while catching up). Toasts, sounds, particles
// and haptics are events. A crop vetoes building on its tile through a place guard, so props need no farm reference.
// The player api supplies the swing. Digging up greens under the hoe is the forage system's (Game's tillTile wrapper does it first).
import { defineSystem } from '../core/system.js';
import { hash2 } from '../core/rng.js';
import { MIN } from '../core/time.js';
import { T, WK } from '../world/kinds.js';
import { hotbarEntry } from './shared.js';

export const RIPE = 3; // stages: 0 planted seed, 1 sprout, 2 growing, 3 ripe (the same number as game/data.js)
const WET_MS = 30 * MIN; // how long watered empty soil stays wet

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'farming';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };
const field = (name) => ({ get() { return this.core.use(NAME)[name]; }, set(v) { this.core.use(NAME)[name] = v; } });

export default defineSystem({
  name: NAME,
  needs: ['player', 'props'],
  facade: {
    farm: field('farm'),
    wetSoil: field('wetSoil'),
    lastSeed: field('lastSeed'),
    crop: call('crop'),
    stage: call('stage'),
    timeToRipe: call('timeToRipe'),
    harvest: call('harvest'),
    tickCrops: call('tick'),
    waterTile: call('water'),
    plantSeed: call('plant'),
    pickSeed() { return this.core.use(NAME).pickSeed(this.tool); },
    /** The 'hoe' branch of useTool. Wild greens under the tile are picked first, as they always were. */
    tillTile(x, z, p, c, tile) {
      if (!p && (tile === T.GRASS || tile === T.SAND) && this.daily.forageAt(x, z)) this.pickForage(x, z);
      this.core.use(NAME).till(x, z, p, c, tile);
    },
  },
  api(ctx) {
    // farm: tile index -> { type, x, z, progress (in stages), last (ms of the last growth tick), wet }; wetSoil: tile index -> wet until (ms)
    const s = Object.assign(ctx.state, { farm: new Map(), wetSoil: new Map(), lastSeed: null });
    const player = () => ctx.use('player');
    const idx = (x, z) => z * ctx.world.w + x;
    const def = (type) => ctx.content.crops.get(type);
    const item = (id) => ctx.content.itemMap().get(id);
    const seedOf = (id) => def(id).seed || `seed_${id}`; // a crop without one names its derived seed item
    const seeds = () => ctx.content.crops.all().map(([id]) => seedOf(id));
    const give = (id, n) => { ctx.inv.give(id, n, { reason: 'harvest' }); ctx.invalidate('ui'); };

    const api = {
      get farm() { return s.farm; }, set farm(v) { s.farm = v; },
      get wetSoil() { return s.wetSoil; }, set wetSoil(v) { s.wetSoil = v; },
      get lastSeed() { return s.lastSeed; }, set lastSeed(v) { s.lastSeed = v; },

      crop(x, z) { return s.farm.get(idx(x, z)); },
      crops: () => [...s.farm.values()],
      stage(c) { return Math.min(RIPE, Math.floor(c.progress + 1e-9)); },
      ripe: () => [...s.farm.values()].filter((c) => api.stage(c) >= RIPE),

      /** Real time until the crop is ripe (watering speeds up only the current stage). */
      timeToRipe(c) {
        const sp = def(c.type).stageMs, st = api.stage(c);
        if (st >= RIPE) return 0;
        const cur = (st + 1 - c.progress) * sp;
        return (c.wet ? cur / 2 : cur) + (RIPE - st - 1) * sp;
      },

      /** First seed we can plant: the one in hand (`tool`), the last used one, then any. */
      pickSeed(tool) {
        if (item(tool)?.kind === 'seed' && ctx.inv.count(tool) > 0) return tool;
        if (item(s.lastSeed)?.kind === 'seed' && ctx.inv.count(s.lastSeed) > 0) return s.lastSeed; // (the seed slot also holds saplings)
        return seeds().find((id) => ctx.inv.count(id) > 0) || null;
      },

      /** Does a swipe that has queued `planned` plantings of `seed` still have seeds for one more? */
      canPlant: (seed, planned = 0) => planned < ctx.inv.count(seed),

      /** Tile indices the ground draws as wet: crops that are watered, and watered empty soil. */
      wetTiles: () => new Set([...[...s.farm.values()].filter((c) => c.wet).map((c) => idx(c.x, c.z)), ...s.wetSoil.keys()]),

      /** A pond tile with nothing growing in it (where a pond crop is planted). */
      isPond: (x, z) => ctx.world.isWater(x, z) && ctx.world.waterKind(x, z) === WK.POND && !ctx.use('props').at(x, z),
      /** One more at harvest: in season, and for tea grown on raised ground. */
      bonus(c) {
        const d = def(c.type);
        return (d.seasons?.includes(ctx.condCtx().season) ? 1 : 0) + (c.type === 'tea' && ctx.world.heightAt(c.x, c.z) > 0 ? 1 : 0)
          + (api.near(c.x, c.z, 'scarecrow', 2) ? 1 : 0);
      },
      /** A prop of `type` within r tiles of (x, z). */
      near(x, z, type, r) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (ctx.use('props').at(x + dx, z + dz)?.type === type) return true;
        return false;
      },

      /** The 'hoe' branch of useTool. */
      till(x, z, p, c, tile) {
        if (p) { ctx.say('Something is in the way.'); return; }
        if (tile === T.GRASS || tile === T.SAND) {
          ctx.world.set(x, z, T.SOIL);
          player().swing();
          ctx.sfx('till');
          ctx.fx.burst(x + 0.5, 0.1, z + 0.5, { color: '#7a5537', n: 14 });
          ctx.invalidate('ground');
          ctx.invalidate('veg');
          ctx.say('Tilled the earth.');
        } else if (tile === T.SOIL) ctx.say('Already tilled. Plant some seeds!');
        else ctx.say("The hoe won't work here.");
      },

      /** The 'can' branch of useTool. */
      water(x, z, p, c, tile) {
        if (p && p.type === 'well') { ctx.say('Your watering can never runs dry here. ♪'); return; }
        if (tile === T.SOIL) {
          if (c) c.wet = true; else s.wetSoil.set(idx(x, z), ctx.now() + WET_MS);
          player().swing();
          ctx.sfx('water');
          ctx.fx.burst(x + 0.5, 0.5, z + 0.5, { color: '#9fd3e6', n: 16, up: 0.5 });
          ctx.invalidate('ground');
          ctx.say(c ? 'Watered! It will grow twice as fast this stage.' : 'Watered the soil.');
        } else ctx.say('Water tilled soil or crops.');
      },

      /** The seed branch of useTool. */
      plant(x, z, p, c, tile, tool) {
        const it = item(tool);
        if (it?.kind !== 'seed') return;
        const d = def(it.crop), pond = d.kind === 'pond';
        if (pond && !api.isPond(x, z)) { ctx.say(`${d.name} is planted straight into a pond.`); return; }
        if (!pond && tile !== T.SOIL) { ctx.say('Till the soil with the hoe first.'); return; }
        if (c) { ctx.say('Something is already growing here.'); return; }
        if (d.niche && !ctx.cond.evaluate(d.niche, ctx.condCtx({ at: { x, z } }))) { ctx.say(`${d.name} only grows ${ctx.cond.describe?.(d.niche) || 'in its own spot'}.`); return; }
        if (!ctx.inv.take(tool)) { ctx.say(`No ${it.name.toLowerCase()} left. Buy more at the stall.`); return; }
        ctx.invalidate('ui');
        const i = idx(x, z), now = ctx.now();
        const wet = pond || (s.wetSoil.get(i) || 0) > now;
        s.wetSoil.delete(i);
        s.farm.set(i, { type: it.crop, x, z, progress: 0, last: now, wet });
        player().swing();
        ctx.sfx('plant');
        ctx.fx.burst(x + 0.5, 0.1, z + 0.5, { color: '#c9a45c', n: 8 });
        ctx.invalidate('crops');
        ctx.invalidate('ground');
        ctx.say(`Planted ${def(it.crop).name.toLowerCase()}.`);
      },

      harvest(c, via = 'hand') {
        const d = def(c.type), it = item(c.type);
        const n = d.yield[0] + Math.floor(hash2(c.x, c.z, Math.floor(ctx.now() / 1000)) * (d.yield[1] - d.yield[0] + 1)) + api.bonus(c);
        give(c.type, n);
        if (d.regrow) { c.progress = 2; c.last = ctx.now(); c.wet = d.kind === 'pond'; }
        else s.farm.delete(idx(c.x, c.z));
        player().swing();
        ctx.sfx('harvest');
        ctx.bus.emit('haptic', { ms: 12 });
        ctx.fx.burst(c.x + 0.5, 0.5, c.z + 0.5, { color: '#ffe08a', n: 18, up: 1.2 });
        ctx.invalidate('crops');
        ctx.invalidate('ground');
        ctx.say(`Harvested ${n} ${it.name.toLowerCase()}!`, it.icon);
        ctx.bus.emit('harvest', { crop: c.type, n, quality: 1, x: c.x, z: c.z, via });
      },

      /** Real-time growth from timestamps (also catches up after the tab was closed). */
      tick(force = false) {
        const now = ctx.now();
        let changed = false;
        const ripe = [];
        for (const c of s.farm.values()) {
          const sp = def(c.type).stageMs;
          let dt = Math.max(0, now - c.last);
          c.last = now;
          if (c.progress >= RIPE) continue;
          if (def(c.type).kind === 'pond' || api.near(c.x, c.z, 'kakei', 1)) c.wet = true; // in the water, or beside a kakei: always watered
          const before = api.stage(c);
          if (c.wet) {
            // watered: the current stage runs at double speed, then the soil dries
            const wetMs = ((before + 1 - c.progress) * sp) / 2;
            if (dt >= wetMs) { c.progress = before + 1; dt -= wetMs; c.wet = false; changed = true; } else { c.progress += (dt * 2) / sp; dt = 0; }
          }
          c.progress = Math.min(RIPE, c.progress + dt / sp);
          const after = api.stage(c);
          if (after !== before) changed = true;
          if (before < RIPE && after >= RIPE) ripe.push(c);
        }
        for (const [i, until] of s.wetSoil) if (until < now) { s.wetSoil.delete(i); changed = true; }
        for (const c of ripe) ctx.bus.emit('cropRipe', { crop: c.type, x: c.x, z: c.z });
        if (changed || force) { ctx.invalidate('crops'); ctx.invalidate('ground'); }
      },

      /** Takes what grows or is watered off a tile, leaving the ground as it is (a tile edit changes the ground itself). -> the seed id or null */
      uproot(x, z) {
        const i = idx(x, z), crop = s.farm.get(i), wet = s.wetSoil.has(i);
        if (crop) s.farm.delete(i);
        s.wetSoil.delete(i);
        if (crop || wet) { ctx.invalidate('crops'); ctx.invalidate('ground'); }
        return crop ? seedOf(crop.type) : null;
      },

      /** Makes room for something else on a tile: the crop goes (its seed is handed back), tilled soil returns to grass. -> the seed id or null */
      clearTile(x, z) {
        const i = idx(x, z), soil = ctx.world.get(x, z) === T.SOIL, grew = s.farm.has(i) || s.wetSoil.has(i);
        if (soil) ctx.world.set(x, z, T.GRASS);
        const seed = api.uproot(x, z);
        if (soil && !grew) { ctx.invalidate('crops'); ctx.invalidate('ground'); }
        return seed;
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const { api } = ctx.state;
    const item = (id) => ctx.content.itemMap().get(id);
    const def = (type) => ctx.content.crops.get(type);
    const props = () => ctx.use('props');
    // nothing is built on a crop
    ctx.guards.add('place', (p) => (p.cells.some((q) => api.crop(q.x, q.z)) ? 'crop' : null));

    // what a tile is for: ripe crops are harvested, thirsty ones watered, soil planted with the seed in hand, grass tilled with the hoe (dig kit)
    ctx.resolvers.add({
      id: 'crop', priority: 70,
      fn(t) {
        const c = api.crop(t.x, t.z);
        if (!c) return null;
        if (api.stage(c) >= RIPE) return { kind: 'harvest', t, icon: item(c.type).icon, label: 'Harvest' };
        if (!c.wet) return { kind: 'water', t, icon: 'icons:can', label: 'Water' };
        return { kind: 'inspect', t, crop: c };
      },
    });
    ctx.resolvers.add({
      id: 'soil', priority: 60,
      fn(t, ix) {
        if (ctx.world.get(t.x, t.z) !== T.SOIL || ix.kit === 'dig') return null;
        const seed = api.pickSeed(ix.tool());
        if (seed) return { kind: 'plant', t, seed, icon: item(seed).icon, label: 'Plant' };
        return { kind: 'noseed', t };
      },
    });
    ctx.resolvers.add({
      id: 'pond-plant', priority: 55, // a pond seed in hand over open pond water: before the rod's fishing
      fn(t, ix) {
        const seed = ix.tool();
        if (item(seed)?.kind !== 'seed' || def(item(seed).crop).kind !== 'pond' || api.crop(t.x, t.z) || !api.isPond(t.x, t.z)) return null;
        return { kind: 'plant', t, seed, icon: item(seed).icon, label: 'Plant' };
      },
    });
    ctx.resolvers.add({
      id: 'till', priority: 30,
      fn(t, ix) {
        const tile = ctx.world.get(t.x, t.z);
        return (tile === T.GRASS || tile === T.SAND) && ix.tool() === 'hoe' ? { kind: 'till', t, icon: 'icons:hoe', label: 'Till' } : null;
      },
    });

    // the tool actions go through ix.useTool, which checks the shop, the well and ripe crops first, as a tap always did
    ctx.actions.add('harvest', { queueable: true, sweep: true, button: true, perform: (a) => { const c = api.crop(a.t.x, a.t.z); if (c && api.stage(c) >= RIPE) api.harvest(c); } });
    ctx.actions.add('water', { queueable: true, sweep: true, button: true, perform: (a, ix) => ix.useTool(a.t, 'can') });
    ctx.actions.add('plant', { queueable: true, sweep: true, button: true, perform: (a, ix) => { api.lastSeed = a.seed; ix.useTool(a.t, a.seed); } });
    ctx.actions.add('till', { queueable: true, sweep: true, button: true, perform: (a, ix) => ix.useTool(a.t, 'hoe') });

    const at = (t) => [t.x, t.z, props().at(t.x, t.z), api.crop(t.x, t.z), ctx.world.get(t.x, t.z)];
    ctx.tools.add('can', { use: (t) => api.water(...at(t)) }); // no slot: a thirsty crop is watered by tapping it
    ctx.content.crops.all().forEach(([id, def], i) => {
      const seed = def.seed || `seed_${id}`;
      ctx.tools.add(seed, { use: (t) => api.plant(...at(t), seed) });
      // the first three seeds always have their slot; the later ones only while there are some in the bag
      ctx.hotbar.add({ ...hotbarEntry(ctx, seed, 50 + i, 'seeds'), ...(i >= 3 && { when: { has: seed } }) });
    });
  },
});

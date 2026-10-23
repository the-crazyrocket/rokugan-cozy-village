// Fishing: casting, the bite wait, the bite pool, reeling in and giving up. [T]
// The pool is a condition per fish (core/cond): `when` if the content has one, else the old water / deep / hours fields turned into one.
// A cast needs the player (tile, facing, turning, stopping, the swing) and props (bridges and the pier). Toasts, sounds, particles, haptics
// and the "!" bubble are events; the catch is the `catch` event, emitted last so whoever counts it (Hana's requests) toasts after ours.
// The bobber, line and ripple are a view (render/views/fishing-view.js) that calls tick() every frame and draws what it finds.
import { defineSystem } from '../core/system.js';
import { PRIO } from '../core/bus.js';
import { T } from '../world/kinds.js';
import { cheb, hotbarEntry } from './shared.js';

export const BAIT_RARE = 3; // rare fish weight multiplier while you carry bait

/** The condition a fish bites under: its `when`, or water (+ the pier for deep fish, + the hours) from the older fields. */
export function fishWhen(def) {
  if (def.when) return def.when;
  return { ...(def.water && { water: def.water }), ...(def.deep && { standing: 'pier' }), ...(def.hours && { hour: def.hours }) };
}

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'fishing';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };
const field = (name) => ({ get() { return this.core.use(NAME)[name]; }, set(v) { this.core.use(NAME)[name] = v; } });

export default defineSystem({
  name: NAME,
  needs: ['props', 'player'],
  facade: {
    fishing: field('cast'),
    lastCatch: field('lastCatch'),
    startFishing: call('start'),
    fishPool: call('pool'),
    rollFish: call('roll'),
    reel: call('reel'),
    cancelFishing: call('cancel'),
  },
  api(ctx) {
    // cast: null or { phase: 'wait' | 'bite', t0, biteAt, fish, spot, bait, x, z, window?, biteEnd? }; caught: fish id -> how many
    const s = Object.assign(ctx.state, { cast: null, lastCatch: null, caught: {}, tests: new Map() });
    const props = () => ctx.use('props');
    const player = () => ctx.use('player');
    const fishDef = (id) => ctx.content.fish.get(id);
    const baited = () => ctx.inv.count('bait') > 0;
    const test = (def) => { let fn = s.tests.get(def); if (!fn) s.tests.set(def, fn = ctx.cond.compile(fishWhen(def))); return fn; };
    const poolAt = (cctx, bait) => ctx.content.fish.all()
      .filter(([, def]) => test(def)(cctx))
      .map(([id, def]) => [id, def.weight * (bait && def.rare ? BAIT_RARE : 1)]);
    const pick = (pool) => {
      let r = ctx.rng() * pool.reduce((sum, [, w]) => sum + w, 0);
      for (const [id, w] of pool) { r -= w; if (r <= 0) return id; }
      return pool[0][0];
    };

    const api = {
      get cast() { return s.cast; }, set cast(v) { s.cast = v; },
      get lastCatch() { return s.lastCatch; }, set lastCatch(v) { s.lastCatch = v; },
      get caught() { return s.caught; }, set caught(v) { s.caught = v; },

      /** Which fish bite: by water, the pier, the hour and bait (rare fish x BAIT_RARE), as [id, weight]. Hour and bait default to now. */
      pool(fresh, onPier, h, bait = baited()) {
        const world = { waterKind: () => (fresh ? 2 : 1) };
        return poolAt(ctx.condCtx({ at: { x: 0, z: 0 }, world, standing: onPier ? 'pier' : undefined, ...(h != null && { hour: h }) }), bait);
      },
      roll(fresh, onPier) { return pick(api.pool(fresh, onPier)); },

      /** Cast towards tile t: the water in front of the player (up to 3 tiles), not a bridge. */
      start(t) {
        const d = player().facing();
        let spot = null;
        const pc = player().cell();
        const dx = Math.sign(t.x - pc.x), dz = Math.sign(t.z - pc.z);
        const open = (x, z) => ctx.world.isWater(x, z) && !props().isBridge(x, z);
        if (open(t.x, t.z) && cheb(pc, t) <= 3) spot = { x: t.x, z: t.z };
        for (let k = 1; k <= 3 && !spot; k++) {
          const x = pc.x + dx * k, z = pc.z + dz * k;
          if (open(x, z)) spot = { x, z };
        }
        if (!spot) { ctx.say('Face the water to cast your line.'); return; }
        const fresh = ctx.world.isFresh(spot.x, spot.z);
        const onPier = !fresh && props().at(pc.x, pc.z)?.type === 'pier';
        const fish = pick(poolAt(ctx.condCtx({ at: spot, standing: onPier ? 'pier' : undefined }), baited()));
        const bait = baited();
        const wait = (2000 + ctx.rng() * 4000) * (bait ? 0.7 : 1);
        s.cast = { phase: 'wait', t0: ctx.mono(), biteAt: ctx.mono() + wait, fish, spot, bait, x: spot.x + 0.5 + d.x * 0.1, z: spot.z + 0.5 + d.z * 0.1 };
        player().face(spot);
        player().stop();
        player().swing();
        ctx.sfx('cast');
        ctx.fx.burst(s.cast.x, ctx.world.waterY(s.cast.x, s.cast.z) + 0.05, s.cast.z, { color: '#e8f4f0', n: 10, up: 0.6 });
        ctx.say(fresh ? 'Cast into fresh water... wait for a bite!' : onPier ? 'Cast from the pier into deep water...' : 'Cast into the sea... wait for a bite!');
      },

      /**
       * Every frame while a line is out: the wait turns into a bite, a bite nobody answered gets away. Returns the monotonic
       * time it used, or null when there is no line any more. `grace` ms are added to the bite window (touch screens).
       */
      tick(grace = 0) {
        const f = s.cast;
        if (!f) return null;
        const now = ctx.mono();
        if (f.phase === 'wait' && now >= f.biteAt) {
          f.phase = 'bite'; f.window = fishDef(f.fish).window + grace; f.biteEnd = now + f.window;
          ctx.bus.emit('bubble', { text: '!' });
          ctx.sfx('bite');
          ctx.bus.emit('haptic', { ms: 40 });
          ctx.fx.burst(f.x, ctx.world.waterY(f.x, f.z) + 0.05, f.z, { color: '#ffffff', n: 8, up: 0.5 });
        }
        if (f.phase === 'bite' && now > f.biteEnd) {
          ctx.say('It got away...');
          ctx.sfx('miss');
          api.cancel();
          return null;
        }
        return now;
      },

      /** Called when the player presses action / clicks during fishing. */
      reel() {
        const f = s.cast;
        if (!f) return;
        if (f.phase === 'bite') {
          const def = fishDef(f.fish), item = ctx.content.itemMap().get(f.fish);
          ctx.inv.give(f.fish);
          ctx.invalidate('ui');
          ctx.fx.burst(f.x, ctx.world.waterY(f.x, f.z) + 0.1, f.z, { color: '#bfe6ff', n: 22, up: 1.4 });
          const first = !s.caught[f.fish];
          const used = f.bait && ctx.inv.take('bait');
          if (used) ctx.invalidate('ui');
          ctx.say((first ? `Your first ${def.name}!` : `You caught a ${def.name}!`) + (used ? ' (1 bait used)' : ''), item.icon);
          ctx.sfx(first ? 'fanfare' : 'catch');
          ctx.bus.emit('haptic', { ms: 30 });
          s.lastCatch = f.fish;
          s.caught[f.fish] = (s.caught[f.fish] || 0) + 1;
          api.cancel();
          ctx.bus.emit('catch', {
            kind: 'fish', id: f.fish, size: def.size ? Math.round((def.size[0] + def.size[1]) / 2) : 0,
            water: ctx.world.isFresh(f.spot.x, f.spot.z) ? 'fresh' : 'sea', spot: { x: f.spot.x, z: f.spot.z },
            bait: used ? 'bait' : null, first, via: 'rod',
          });
          return;
        }
        ctx.say('Too early — the fish swam away.');
        ctx.sfx('miss');
        api.cancel();
      },

      cancel() {
        if (!s.cast) return;
        s.cast = null;
        ctx.bus.emit('bubble', { text: null });
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'fish', priority: 50,
      fn(t) { return ctx.world.get(t.x, t.z) === T.WATER && !ctx.use('props').isBridge(t.x, t.z) ? { kind: 'fish', t, icon: 'icons:rod', label: 'Fish' } : null; },
    });
    // fishing can be done from a little further away; the rod is taken up first
    ctx.actions.add('fish', { range: 2, queueable: true, button: true, perform: (a, ix) => { ix.equip('rod'); api.start(a.t); } });
    ctx.tools.add('rod', { use: (t) => api.start(t) });
    ctx.hotbar.add(hotbarEntry(ctx, 'rod', 40));
    // building (and leaving build mode) drops a cast line
    ctx.bus.on('buildMode', () => ctx.state.api.cancel(), { priority: PRIO.STATE });
  },
});

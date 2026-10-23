// The quiet shrine and the story landmarks: offerings, waking a Fortune, the landmark props and the camera tour. [T]
// Offerings are made a little at a time; whatever has been given stays given. Making room for a landmark sends decorations back to the
// bag (props api, `remove` with to:'bag'), takes crops up (their seed is handed back) and turns tilled soil to grass: world/edit.js clearTiles.
// The player api says whether the player is standing somewhere walkable and moves them if not. Toasts, sounds, particles, haptics and
// UI refreshes are events; `offer` and `wake` are the facts (whoever saves listens to them, the wake card and the modal close are the
// feedback listener's). The camera tour is read by the main loop through cameraFocus().
import { defineSystem } from '../core/system.js';
import { LANDMARKS } from '../content/base/landmarks.js';
import { FORTUNE_ORDER } from '../content/index.js';
import { clearTiles } from '../world/edit.js';

const STORY = ['shrine_old', 'shrine', 'pier'];
const SHRINES = new Set(['shrine_old', 'shrine']);
const SPARKLE_MS = 4.5; // seconds of glitter over the new shrine
const TOUR = { shrine: 2400, pier: 4600 }; // ms from the wake: the camera leaves the shrine, then the pier, then comes home

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'shrine';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };
const field = (name) => ({ get() { return this.core.use(NAME)[name]; }, set(v) { this.core.use(NAME)[name] = v; } });

export default defineSystem({
  name: NAME,
  needs: ['props', 'player', 'farming', 'daily'], // farming and daily: clearSpot is the tile edit's cleanup (world/edit.js)
  facade: {
    shrine: { get() { return this.core.use(NAME); } },
    focusQ: field('focusQ'),
    celebrateT: field('celebrateT'),
    ensureLandmarks: call('ensureLandmarks'),
    clearSpot: call('clearSpot'),
    offer: call('offer'),
    wakeFortune: call('wake'),
    cameraFocus: call('cameraFocus'),
  },
  api(ctx) {
    // given: "fortune.offering" -> { item: n }; awake: fortune ids; focusQ: camera moments [{ x, z, until, burst? }]; celebrateT: seconds of glitter left
    const s = Object.assign(ctx.state, { given: {}, awake: [], focusQ: [], celebrateT: 0 });
    const props = () => ctx.use('props');
    const player = () => ctx.use('player');
    const fortune = (f) => ctx.content.fortunes.get(f);
    const give = (id, n = 1) => { ctx.inv.give(id, n); ctx.invalidate('ui'); };
    const take = (id, n) => { ctx.inv.take(id, n); ctx.invalidate('ui'); };
    const find = (type) => props().list.find((p) => p.type === type);

    /** Hand in everything the player has towards one offering. Returns what was given. */
    const hand = (f, id) => {
      const o = fortune(f).offerings.find((x) => x.id === id);
      if (!o || api.isAwake(f)) return null;
      const gave = {};
      const slot = (s.given[`${f}.${o.id}`] ||= {});
      for (const it of Object.keys(o.items)) {
        const n = api.canGive(f, o, it);
        if (n <= 0) continue;
        take(it, n);
        slot[it] = (slot[it] || 0) + n;
        gave[it] = n;
      }
      return Object.keys(gave).length ? { gave, done: api.done(f, o) } : null;
    };

    const api = {
      get given() { return s.given; },
      get awake() { return s.awake; },
      get focusQ() { return s.focusQ; }, set focusQ(v) { s.focusQ = v; },
      get celebrateT() { return s.celebrateT; }, set celebrateT(v) { s.celebrateT = v; },

      load(d) {
        s.given = d?.given && typeof d.given === 'object' ? d.given : {};
        s.awake = Array.isArray(d?.awake) ? d.awake.filter((f) => ctx.content.fortunes.has(f)) : [];
      },
      serialize: () => ({ given: s.given, awake: s.awake }),

      isAwake: (f) => s.awake.includes(f),
      /** The Fortune currently being worked towards (null when all are awake). */
      current: () => FORTUNE_ORDER.find((f) => !api.isAwake(f)) || null,

      slot: (f, o) => s.given[`${f}.${o.id}`] || {},
      givenOf: (f, o, item) => Math.min(o.items[item], api.slot(f, o)[item] || 0),
      done: (f, o) => Object.keys(o.items).every((it) => api.givenOf(f, o, it) >= o.items[it]),
      doneCount: (f) => fortune(f).offerings.filter((o) => api.done(f, o)).length,
      ready: (f) => !api.isAwake(f) && fortune(f).offerings.every((o) => api.done(f, o)),

      /** How many of `item` the player could hand in to offering `o` right now. */
      canGive: (f, o, item) => Math.min(ctx.inv.count(item), o.items[item] - api.givenOf(f, o, item)),
      canOffer: (f, o) => !api.done(f, o) && Object.keys(o.items).some((it) => api.canGive(f, o, it) > 0),
      /** Any offering the player could add to right now (for HUD hints). */
      offerable() {
        const f = api.current();
        return !!f && (api.ready(f) || fortune(f).offerings.some((o) => api.canOffer(f, o)));
      },

      /** What is still missing for an offering, as text ("2 rice, 1 koi"). */
      missing(f, o) {
        const items = ctx.content.itemMap();
        return Object.keys(o.items).map((it) => [it, o.items[it] - api.givenOf(f, o, it)]).filter(([, n]) => n > 0)
          .map(([it, n]) => `${n} ${items.get(it).name.toLowerCase()}`).join(', ');
      },

      /** Put the story landmarks where they belong for the current chapter. */
      ensureLandmarks() {
        const L = LANDMARKS, ebisu = api.isAwake('ebisu');
        const want = new Map([['stone', L.stone], [ebisu ? 'shrine' : 'shrine_old', L.shrine]]);
        if (ebisu) want.set('pier', L.pier);
        for (const p of [...props().list]) if (STORY.includes(p.type) && !want.has(p.type)) props().remove(p);
        for (const [type, at] of want) {
          if (props().list.some((p) => p.type === type)) continue;
          api.clearSpot(type, at.x, at.z);
          props().add(type, at.x, at.z, 0, 0, { via: 'load' });
        }
        // an old save may have the player standing where the shrine now is
        if (!player().canStand()) player().warp(L.shrine.x + 1, L.shrine.z + 2.5);
      },

      /** Make room for a landmark: decorations go back to the bag, crops give their seed back, tilled soil turns to grass (the cleanup of a tile edit). */
      clearSpot(type, x, z) {
        clearTiles(ctx, props().cells(type, x, z, 0).cells, { soilToGrass: true });
      },

      /** Hand in what we have towards one offering. */
      offer(id, f = api.current()) {
        const res = f && hand(f, id);
        if (!res) { ctx.say('Nothing to offer for that yet.'); return null; }
        const def = fortune(f), o = def.offerings.find((x) => x.id === id);
        ctx.bus.emit('offer', { fortune: f, offering: id, gave: res.gave });
        ctx.sfx(res.done ? 'claim' : 'coin');
        ctx.bus.emit('haptic', { ms: res.done ? 25 : 12 });
        const sh = props().list.find((p) => SHRINES.has(p.type));
        if (sh) ctx.fx.burst(sh.cx, 0.7, sh.cz + 0.6, { color: '#ffe08a', n: res.done ? 26 : 12, up: 1.1 });
        ctx.say(res.done ? `Offering complete: ${o.name}!` : `Offered. Still needed: ${api.missing(f, o)}.`, def.icon);
        if (api.ready(f)) ctx.say(`Every offering is made. Ring the bell to wake ${def.name}!`, 'icons2:bell');
        ctx.invalidate('ui');
        return res;
      },

      /** Ring the bell: the Fortune wakes and the island changes for good. */
      wake(f = api.current()) {
        if (!f || !api.ready(f)) return false;
        s.awake.push(f);
        const def = fortune(f);
        api.ensureLandmarks();
        for (const [it, n] of Object.entries(def.gift || {})) give(it, n);
        ctx.sfx('fanfare');
        ctx.bus.emit('haptic', { ms: 60 });
        const sh = find('shrine'), pier = find('pier');
        ['#ffe08a', '#fff1c4', '#f6c3cf', '#ffd27a'].forEach((color, k) => ctx.fx.burst(sh.cx, 0.6 + k * 0.35, sh.cz, { color, n: 30, up: 1.6 + k * 0.2 }));
        s.celebrateT = SPARKLE_MS;
        // the camera visits the shrine, then the new pier, then comes home
        const t0 = ctx.mono();
        s.focusQ = [{ x: sh.cx, z: sh.cz, until: t0 + TOUR.shrine }];
        if (pier) s.focusQ.push({ x: pier.cx, z: pier.cz, until: t0 + TOUR.pier, burst: true });
        ctx.say(`${def.name} wakes!`, def.icon);
        ctx.invalidate('ui');
        ctx.bus.emit('wake', { fortune: f });
        return true;
      },

      /** Every frame: glitter over the shrine while the celebration lasts. */
      tick(dt) {
        if (!(s.celebrateT > 0)) return;
        s.celebrateT -= dt;
        const sh = find('shrine');
        if (sh) for (let k = 0; k < 2; k++) ctx.sparkle(sh.cx + (ctx.rng() - 0.5) * 2.2, 0.3 + ctx.rng() * 1.6, sh.cz + (ctx.rng() - 0.5) * 2.2);
      },

      /** Where the camera should look instead of the player (null = follow the player). */
      cameraFocus() {
        const now = ctx.mono();
        while (s.focusQ.length && now > s.focusQ[0].until) s.focusQ.shift();
        const f = s.focusQ[0];
        if (f?.burst) {
          f.burst = false;
          for (let k = 0; k < 3; k++) ctx.fx.burst(f.x, 0.3 + k * 0.3, f.z + (k - 1) * 1.2, { color: '#bfe6ff', n: 22, up: 1.2 });
        }
        return f || null;
      },
    };
    return api;
  },
  init(ctx) {
    // the shrine is always approached from the front
    ctx.resolvers.add({
      id: 'shrine', priority: 90,
      fn(t) { const p = ctx.use('props').at(t.x, t.z); return p && SHRINES.has(p.type) ? { kind: 'shrine', t: { x: p.x, z: p.z + 1 }, icon: 'icons2:bell', label: 'Shrine' } : null; },
    });
    ctx.actions.add('shrine', { queueable: true, button: true, perform: () => ctx.bus.emit('openSheet', { name: 'shrine' }) });
  },
});

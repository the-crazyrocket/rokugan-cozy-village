// Interaction: what a tap or the action key does on a tile, the action queue, walking over to act, the selected tool and using it. [T]
// Owns the hotbar slot, the queue of smart-tap actions, the cooldown between actions and the pointer's hover tile. Everything it acts on is
// another system's api (needs): the player walks, build takes the taps in build mode. What a tile is for (resolvers), what each kind of action
// does (actions) and how each tool is used (tools) are registered by the system that owns them; the resolvers and the actions get this api as
// their second argument (tool(), equip(), useTool(), inspect()). This system keeps the walk fallback, the hand and the hoe (which picks greens
// first), the hand's look at things, the number keys and the hotbar of the tools nobody else owns. Taking the controls (`playerMove { manual }`) or entering build mode empties the queue; reaching the end
// of a walk (`arrive { action }`) performs the action that was waiting. The shop and shrine cards, floating labels, the queue chips and
// the build bar's selection are events for the UI (`openSheet`, `floatLabel`, `queueChange`, `buildSelect`); whether a card is open is
// asked with the `ui.modalOpen` filter. The frame step (the queue pump) is tick(dt), called by Game.update.
import { defineSystem } from '../core/system.js';
import { PRIO } from '../core/bus.js';
import { duration } from '../core/time.js';
import { T } from '../world/kinds.js';
import { cheb, SHRINE_TYPES, hotbarEntry } from './shared.js';

const QUEUE_MAX = 24; // a swipe across a whole field queues one action per tile
const COOLDOWN = 0.3; // seconds between one action and the next queued one
const RIPE = 3; // the stage of a ripe crop (farming's RIPE)

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'interact';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };
const field = (name) => ({ get() { return this.core.use(NAME)[name]; }, set(v) { this.core.use(NAME)[name] = v; } });

export default defineSystem({
  name: NAME,
  needs: ['props', 'player', 'build', 'farming', 'fishing', 'forage', 'market', 'shrine'],
  facade: {
    slot: field('slot'),
    queue: field('queue'),
    actionCooldown: field('cooldown'),
    hoverTile: field('hover'),
    tool: { get() { return this.core.use(NAME).tool(); } },
    selectSlot: call('selectSlot'),
    resolve: call('resolve'),
    isBusy: call('isBusy'),
    action: call('action'),
    clickTile: call('tap'),
    tap: call('tap'),
    enqueue: call('enqueue'),
    sweepTile: call('sweep'),
    inspect: call('inspect'),
    standTiles: call('standTiles'),
    startAction: call('startAction'),
    perform: call('perform'),
    goAndAct: call('goAndAct'),
    useTool: call('useTool'),
  },
  api(ctx) {
    // slot: index into the hotbar registry; queue: actions waiting their turn; cooldown: seconds left before the next one; hover: the tile under the pointer
    const s = Object.assign(ctx.state, { slot: 0, held: null, queue: [], cooldown: 0, hover: null }); // held: the id in hand, so the slot follows it
    const props = () => ctx.use('props');
    const player = () => ctx.use('player');
    const build = () => ctx.use('build');
    const farming = () => ctx.use('farming');
    const fishing = () => ctx.use('fishing');
    const forage = () => ctx.use('forage');
    const item = (id) => ctx.content.itemMap().get(id);
    const prop = (type) => ctx.content.props.get(type);
    const crop = (type) => ctx.content.crops.get(type);
    const modal = () => !!ctx.bus.apply('ui.modalOpen', false);
    const label = (text, x, z) => { if (text) ctx.bus.emit('floatLabel', { text, x, z }); };

    const api = {
      get slot() { return s.slot; }, set slot(v) { s.slot = v; },
      get queue() { return s.queue; }, set queue(v) { s.queue = v; },
      get cooldown() { return s.cooldown; }, set cooldown(v) { s.cooldown = v; },
      get hover() { return s.hover; }, set hover(v) { s.hover = v; },

      /** The hotbar entries in order (those whose `when` holds), the tools of the toolbar. */
      hotbar() {
        const all = ctx.hotbar.all();
        return all.some((e) => e.when) ? all.filter((e) => !e.when || ctx.cond.evaluate(e.when, ctx.condCtx())) : all;
      },

      /** The id of the tool in hand. */
      tool: () => api.hotbar()[s.slot]?.id,

      /** Takes the tool `id` in hand. */
      equip(id) {
        const i = api.hotbar().findIndex((e) => e.id === id);
        if (i < 0 || i === s.slot) return;
        s.slot = i;
        s.held = id;
        ctx.invalidate('ui');
      },

      selectSlot(i) {
        if (build().mode === 'build') { ctx.bus.emit('buildSelect', { index: i }); return; }
        if (i < 0 || i >= api.hotbar().length) return;
        s.slot = i;
        s.held = api.hotbar()[i].id;
        fishing().cancel();
        ctx.invalidate('ui');
      },

      /**
       * What tapping / using tile t should do, by context: the highest resolver that has an answer (shop 100, shrine 90, forage 80, crop 70,
       * soil 60, fish 50, prop-inspect 40, till 30), else walk. The selected tool only matters where it clearly applies
       * (hoe on grass, can on soil, a chosen seed).
       */
      resolve(t) { return ctx.resolvers.resolve(t, api) || { kind: 'walk', t }; },

      isBusy() { return !!player().state.pending || !!fishing().cast || s.cooldown > 0 || s.queue.length > 0; },

      /** Space / action button: smart action on the tile in front of the player. */
      action() {
        if (modal()) return;
        if (fishing().cast) { fishing().reel(); return; }
        const b = build();
        if (b.mode === 'build') {
          if (b.cursor && b.sel !== 'pickup') { b.confirm(); return; }
          const t = s.hover || player().target(); b.buildAt(t.x, t.z); return;
        }
        const t = player().target();
        const a = api.resolve(t);
        const def = ctx.actions.get(a.kind);
        if (def?.queueable) { s.queue.length = 0; player().stop(); player().face(t); api.perform(a); return; }
        if (def) { def.perform(a, api); return; }
        api.useTool(t);
      },

      /** Click / tap on a tile: do the obvious thing there (walking over first). */
      tap(t) {
        if (modal()) return null;
        if (fishing().cast) { fishing().reel(); return null; }
        if (build().mode === 'build') { build().buildAt(t.x, t.z); return null; }
        const a = api.resolve(t);
        if (a.kind === 'walk') {
          s.queue.length = 0;
          player().state.pending = null;
          if (player().walkable(t.x, t.z)) player().walkTo(t); else player().walkNear(t);
        } else if (ctx.actions.get(a.kind)?.queueable === false) ctx.actions.get(a.kind).perform(a, api);
        else api.enqueue(a);
        ctx.bus.emit('queueChange');
        return a;
      },

      enqueue(a) {
        if (!api.isBusy()) { api.startAction(a); return true; }
        const same = (b) => b.t.x === a.t.x && b.t.z === a.t.z;
        if ((player().state.pending && same(player().state.pending)) || s.queue.some(same)) return false;
        if (s.queue.length >= QUEUE_MAX) { ctx.say('That’s plenty to do for now!'); return false; }
        s.queue.push(a);
        return true;
      },

      /** Swipe across the field: queue the obvious farm action on each tile passed over. */
      sweep(t) {
        if (build().mode !== 'play' || fishing().cast || modal()) return null;
        const a = api.resolve(t);
        if (!ctx.sweeps.has(a.kind)) return null;
        if (a.kind === 'plant') {
          // don't queue more plantings than there are seeds
          const planned = [player().state.pending, ...s.queue].filter((q) => q?.kind === 'plant' && q.seed === a.seed).length;
          if (!farming().canPlant(a.seed, planned)) return null;
        }
        return api.enqueue(a) ? a : null;
      },

      inspect(a) {
        const { x, z } = a.t;
        if (a.kind === 'noseed') { label('No seeds — Hana sells them', x, z); return; }
        const c = a.crop || farming().crop(x, z);
        if (c) {
          const def = crop(c.type);
          if (farming().stage(c) >= RIPE) { label(`${def.name} · ready!`, x, z); return; }
          label(`${def.name} · ready in ${duration(farming().timeToRipe(c))}${c.wet ? ' · watered' : ' · thirsty'}`, x, z);
          return;
        }
        const f = forage().at(x, z);
        if (f) { label(`${item(f.item).name} · tap to pick`, x, z); return; }
        const p = a.prop || props().at(x, z);
        if (p) {
          const msg = p.type === 'well' ? 'The well water is cool and clear.'
            : p.type === 'stone' ? (ctx.use('shrine').isAwake('ebisu') ? 'A warm hum comes from the stone… Daikoku is stirring.' : 'A mossy stone, bound with rope. Something sleeps inside.')
              : prop(p.type).name;
          label(msg, x, z);
          return;
        }
        const names = { [T.GRASS]: 'Soft grass', [T.SAND]: 'Warm sand', [T.PATH]: 'Village path', [T.SOIL]: 'Tilled soil', [T.WATER]: ctx.world.isFresh(x, z) ? 'Fresh water' : 'The sea' };
        label(names[ctx.world.get(x, z)] || '', x, z);
      },

      /** Tile to stand on for an action (fishing can be done from a little further away). */
      standTiles(a) {
        const pc = player().cell(), t = a.t;
        const r = ctx.actions.get(a.kind)?.range ?? 1;
        const out = [];
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (!dx && !dz) continue;
          const x = t.x + dx, z = t.z + dz;
          if (!player().walkable(x, z)) continue;
          const d = cheb({ x, z }, t) * 2 + Math.hypot(x - pc.x, z - pc.z) * 0.15 + (dx && dz ? 0.3 : 0);
          out.push({ x, z, d });
        }
        return out.sort((p, q) => p.d - q.d);
      },

      startAction(a) {
        const pc = player().cell();
        const range = ctx.actions.get(a.kind)?.range ?? 1;
        const d = cheb(pc, a.t);
        if (d <= range && d > 0) { player().stop(); player().face(a.t); api.perform(a); return; }
        for (const st of api.standTiles(a).slice(0, 10)) {
          if (player().walkTo(st, a, { quiet: true })) return;
        }
        ctx.say("Can't reach that spot.");
      },

      perform(a) {
        ctx.actions.get(a.kind)?.perform(a, api);
        s.cooldown = COOLDOWN;
      },

      goAndAct(t) { api.startAction(api.resolve(t)); },

      useTool(t, tool = api.tool()) {
        const { x, z } = t;
        const p = props().at(x, z);
        const c = farming().crop(x, z);
        if ((p && p.type === 'stall') || ctx.use('market').isMerchant(x, z)) { ctx.bus.emit('openSheet', { name: 'shop' }); return; }
        if (p && p.type === 'well' && tool !== 'can') { ctx.say('The well water is cool and clear.'); return; }
        if (c && farming().stage(c) >= RIPE && tool !== 'can') { farming().harvest(c); return; }
        ctx.tools.get(tool)?.use(t, api);
      },

      /** Every frame: the cooldown runs down, then the next queued action starts once the player is free. */
      tick(dt) {
        s.cooldown = Math.max(0, s.cooldown - dt);
        const pl = player().state;
        if (!pl.pending && !pl.path && !fishing().cast && s.cooldown <= 0 && s.queue.length && !modal()) api.startAction(s.queue.shift());
      },
    };
    // the tools this system owns: the hand looks at things, the hoe digs up greens under the tile before it tills
    ctx.state.tools = {
      hand(t) {
        const { x, z } = t;
        const p = props().at(x, z), c = farming().crop(x, z);
        if (c) {
          const def = crop(c.type);
          ctx.say(`${def.name}: ready in ${duration(farming().timeToRipe(c))}${c.wet ? ' · watered' : ' · water me!'}`);
        } else if (forage().at(x, z)) forage().pick(x, z);
        else if (p && SHRINE_TYPES.has(p.type)) ctx.bus.emit('openSheet', { name: 'shrine' });
        else if (p) ctx.say(prop(p.type).fixed ? prop(p.type).name : `${prop(p.type).name}. Use build mode (B) to move it.`);
      },
      hoe(t) {
        const { x, z } = t;
        const p = props().at(x, z), c = farming().crop(x, z), tile = ctx.world.get(x, z);
        if (!p && (tile === T.GRASS || tile === T.SAND) && forage().at(x, z)) forage().pick(x, z);
        farming().till(x, z, p, c, tile);
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const { state: s } = ctx;
    const { api } = s;
    const build = () => ctx.use('build');
    // looking at a tile, or at a tile with no seeds to plant, happens at once instead of joining the queue
    ctx.actions.add('inspect', { queueable: false, perform: (a) => api.inspect(a) });
    ctx.actions.add('noseed', { queueable: false, perform: (a) => api.inspect(a) });
    ctx.tools.add('hand', { use: s.tools.hand });
    ctx.tools.add('hoe', { use: s.tools.hoe });
    ctx.hotbar.add(hotbarEntry(ctx, 'hand', 10));
    ctx.hotbar.add(hotbarEntry(ctx, 'hoe', 20));
    for (const code of ['Space', 'KeyE', 'Enter']) ctx.keys.bind(code, () => api.action());
    // 1-9 pick a tool (or a prop in build mode); building and the bag have their letters (B, I)
    for (let n = 1; n <= 9; n++) ctx.keys.bind(`Digit${n}`, () => api.selectSlot(n - 1));
    // a slot that appears or goes (seeds in the bag, a gift from a visitor) shifts the others: the tool in hand stays in hand
    const follow = () => { const i = s.held ? ctx.state.api.hotbar().findIndex((e) => e.id === s.held) : -1; if (i >= 0) s.slot = i; };
    ctx.bus.on('itemGain', follow, { priority: PRIO.STATE });
    ctx.bus.on('itemLoss', follow, { priority: PRIO.STATE });
    // the controls taken by hand drop whatever was queued; so does build mode
    ctx.bus.on('playerMove', (p) => { if (p.manual) s.queue.length = 0; }, { priority: PRIO.STATE });
    ctx.bus.on('buildMode', () => { s.queue.length = 0; }, { priority: PRIO.STATE });
    // the end of a walk with an action waiting
    ctx.bus.on('arrive', (p) => api.perform(p.action), { priority: PRIO.GAME });
  },
});

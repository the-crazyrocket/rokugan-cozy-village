// Build mode: the mode, the selected item, the rotation, the touch preview cursor and the prop being moved, plus placing, storing,
// rotating and moving props. [T]
// Props go through the props api (it emits `place` and `remove`, with `via` and `to` from here) and the player's tile comes from the
// player api (`cell()`). Toasts, sounds, particles, haptics and UI refreshes are events; a mode change is the `buildMode` event, which
// whoever holds a cast, a walk or queued taps drops. The ghost mesh is a view (render/views/ghost-view.js) that asks preview(tile).
import { defineSystem } from '../core/system.js';

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'build';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };
const field = (name) => ({ get() { return this.core.use(NAME)[name]; }, set(v) { this.core.use(NAME)[name] = v; } });

export default defineSystem({
  name: NAME,
  needs: ['props', 'player'],
  facade: {
    mode: field('mode'),
    buildSel: field('sel'),
    buildRot: field('rot'),
    buildCursor: field('cursor'),
    moving: field('moving'),
    toggleBuild: call('toggle'),
    rotate: call('rotate'),
    pickUp: call('pickUp'),
    rotateProp: call('rotateProp'),
    moveProp: call('moveProp'),
    cancelBuildPreview: call('cancelPreview'),
    confirmBuild: call('confirm'),
    buildAt: call('buildAt'),
  },
  api(ctx) {
    const s = Object.assign(ctx.state, { mode: 'play', sel: 'pickup', rot: 0, cursor: null, moving: null });
    const props = () => ctx.use('props');
    const def = (type) => ctx.content.props.get(type);
    const item = (id) => ctx.content.itemMap().get(id);
    const via = () => (s.moving ? 'move' : 'build');
    const give = (id) => { ctx.inv.give(id); ctx.invalidate('ui'); };
    const take = (id) => { if (!ctx.inv.take(id)) return false; ctx.invalidate('ui'); return true; };

    const api = {
      get mode() { return s.mode; }, set mode(v) { s.mode = v; },
      get sel() { return s.sel; }, set sel(v) { s.sel = v; },
      get rot() { return s.rot; }, set rot(v) { s.rot = v; },
      get cursor() { return s.cursor; }, set cursor(v) { s.cursor = v; },
      get moving() { return s.moving; }, set moving(v) { s.moving = v; },

      toggle(on = s.mode !== 'build') {
        if (!on) api.cancelPreview();
        s.mode = on ? 'build' : 'play';
        s.cursor = null;
        ctx.bus.emit('buildMode', { on });
        ctx.invalidate('ui');
      },

      rotate() {
        if (s.mode !== 'build') return;
        s.rot = (s.rot + 1) % 4;
        ctx.say(`Rotated ${s.rot * 90}°`);
      },

      /** Store a placed prop back into the inventory. */
      pickUp(p, { quiet = false } = {}) {
        if (def(p.type).fixed) { ctx.say('The merchant would miss their stall!'); return false; }
        const pc = ctx.use('player').cell();
        if (p.type === 'bridge' && p.cells.some((c) => c.x === pc.x && c.z === pc.z)) { ctx.say('Step off the bridge first.'); return false; }
        props().remove(p, { to: 'bag' });
        give(`prop_${p.type}`);
        ctx.sfx('pickup');
        ctx.fx.burst(p.cx, 0.4, p.cz, { color: '#f4ead2', n: 14, up: 0.8 });
        if (!quiet) ctx.say(`Picked up ${def(p.type).name.toLowerCase()}.`, item(`prop_${p.type}`).icon);
        return true;
      },

      /** Rotate a placed prop in place (if it still fits). */
      rotateProp(p) {
        if (def(p.type).fixed) { ctx.say('Hana likes her stall just where it is.'); return false; }
        const rot = (p.rot + 1) % 4;
        if (!props().canPlace(p.type, p.x, p.z, rot, { ignoreId: p.id, via: 'move' })) { ctx.say('No room to rotate it here.'); return false; }
        const { type, x, z, id } = p;
        props().remove(p, { to: 'gone' });
        return props().add(type, x, z, rot, id, { via: 'move' });
      },

      /** Pick a prop up and keep previewing it where it was, ready to be dragged (touch). */
      moveProp(p) {
        const orig = { type: p.type, x: p.x, z: p.z, rot: p.rot, id: p.id };
        if (!api.pickUp(p, { quiet: true })) return false;
        s.moving = orig;
        s.sel = `prop_${p.type}`;
        s.rot = p.rot;
        s.cursor = { x: p.x, z: p.z };
        ctx.invalidate('ui');
        return true;
      },

      /** The cross on the touch build bar: drop the preview (and put a moved prop back). */
      cancelPreview() {
        const m = s.moving;
        s.moving = null;
        s.cursor = null;
        if (m && ctx.inv.count(`prop_${m.type}`) > 0 && props().canPlace(m.type, m.x, m.z, m.rot, { via: 'move' })) {
          take(`prop_${m.type}`);
          props().add(m.type, m.x, m.z, m.rot, m.id, { via: 'move' });
        }
        ctx.invalidate('ui');
      },

      /** The tick on the touch build bar / tapping the preview again. */
      confirm() {
        const c = s.cursor;
        if (!c) return false;
        const ok = api.buildAt(c.x, c.z);
        if (ok) { s.moving = null; s.cursor = null; ctx.invalidate('ui'); }
        return ok;
      },

      buildAt(x, z) {
        if (s.sel === 'pickup') {
          const p = props().at(x, z);
          if (!p) { ctx.say('Nothing to pick up here.'); return false; }
          return api.pickUp(p);
        }
        const id = s.sel;
        const type = item(id)?.prop;
        if (!type || ctx.inv.count(id) <= 0) { ctx.say('You have none left. Buy more at the stall.'); return false; }
        const why = props().check(type, x, z, s.rot, { via: via() });
        if (why) { ctx.say(/ /.test(why) ? why : "Can't place that here."); return false; } // a guard's sentence, or a footprint code
        take(id);
        const p = props().add(type, x, z, s.rot, 0, { via: via() });
        ctx.sfx('place');
        ctx.bus.emit('haptic', { ms: 12 });
        ctx.fx.burst(p.cx, 0.2, p.cz, { color: '#fff1c4', n: 16, up: 0.7 });
        ctx.say(`Placed ${def(type).name.toLowerCase()}.`);
        if (ctx.inv.count(id) <= 0) { s.sel = 'pickup'; ctx.invalidate('ui'); }
        return true;
      },

      /**
       * What the ghost view shows over tile t: { pickup: true, ok } while storing (ok: there is a prop to take),
       * { type, rot, ok } for the selected prop, null when the selection is not a prop.
       */
      preview(t) {
        if (s.sel === 'pickup') {
          const p = props().at(t.x, t.z);
          return { pickup: true, ok: !!p && !def(p.type).fixed };
        }
        const type = item(s.sel)?.prop;
        if (!type) return null;
        return { type, rot: s.rot, ok: props().canPlace(type, t.x, t.z, s.rot, { via: via() }) };
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    ctx.keys.bind('KeyR', () => ctx.state.api.rotate());
  },
});

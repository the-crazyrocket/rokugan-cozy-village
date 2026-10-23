// Village projects (content: projects; their shapes in content/base/projects.js): paid for at the project board, built in real time
// by Kenji, finished even while the game is closed. Starting one lays a sand foundation out in the sea with scaffolding on it;
// finishing it raises the shape (tiles through world/edit.js applyEdit, kind 'patch', by 'project'), plants its props, takes the
// scaffolding down, sets the flag `project_<id>` (what the next project requires) and tours the camera over it.
// Saved in ext.projects: { active: { id, doneAt, scaffold: [prop ids] } | null, done: [ids], fresh: [ids not yet seen in a card] }.
import { defineSystem } from '../core/system.js';
import { applyEdit } from '../world/edit.js';
import { T, WK } from '../world/kinds.js';
import { HOME } from '../content/base/landmarks.js';
import { shapeOf } from '../content/base/projects.js';
import { placeNear } from './shared.js';

const TOUR_MS = 4200;
const left = (ms) => { const m = Math.ceil(ms / 60e3); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`; };

export default defineSystem({
  name: 'projects',
  needs: ['props', 'player', 'farming', 'daily', 'terrainrules', 'shrine'], // world/edit.js EDIT_NEEDS and the rules; shrine: the camera tour
  api(ctx) {
    const s = Object.assign(ctx.state, { active: null, done: [], fresh: [], poll: 0 });
    ctx.part('projects', {
      serialize: () => ({ active: s.active, done: s.done, fresh: s.fresh }),
      load: (d) => { s.active = d?.active ?? null; s.done = d?.done ?? []; s.fresh = d?.fresh ?? []; },
      defaults: () => ({ active: null, done: [], fresh: [] }),
    });
    const props = () => ctx.use('props');
    const items = () => ctx.content.itemMap();
    const def = (id) => ctx.content.projects.get(id);

    /** Sets one tile to { kind, height } (water cleared) through the edit contract; false when a rule refused it. */
    const patch = (id, x, z, kind, height) => {
      const w = ctx.world;
      if (w.kindAt(x, z) === kind && w.heightAt(x, z) === height) return true;
      const res = applyEdit(ctx, { kind: 'patch', x, z, from: {}, to: { kind, height, water: kind === T.WATER ? WK.SEA : WK.NONE }, by: 'project', project: id });
      return res.ok;
    };

    const api = {
      get active() { return s.active; },
      get done() { return s.done; },
      /** Finished projects the player has not seen in a card yet (the Today card reads and clears them). */
      takeFresh() { const f = s.fresh; s.fresh = []; return f; },
      peekFresh: () => s.fresh,

      /** 'done' | 'building' | 'open' | 'locked' */
      status(id) {
        if (s.done.includes(id)) return 'done';
        if (s.active?.id === id) return 'building';
        return ctx.cond.evaluate(def(id).requires, ctx.condCtx()) ? 'open' : 'locked';
      },
      list: () => [...ctx.content.projects.all()].map(([id, p]) => ({ id, ...p, status: api.status(id) })),
      /** ms until the active project is done (0 when there is none). */
      left: () => (s.active ? Math.max(0, s.active.doneAt - ctx.now()) : 0),

      /** What is short for the project: [{ item, need, have }] (item 'koku' for money). */
      missing(id) {
        const c = def(id).cost, out = [];
        if (c.koku && ctx.money.get() < c.koku) out.push({ item: 'koku', need: c.koku, have: ctx.money.get() });
        for (const [item, need] of Object.entries(c.items || {})) if (ctx.inv.count(item) < need) out.push({ item, need, have: ctx.inv.count(item) });
        return out;
      },
      why(id) {
        const st = api.status(id);
        if (st === 'done') return 'Already built.';
        if (st === 'building') return 'Kenji is building it.';
        if (st === 'locked') return 'Finish the project before it first.';
        if (s.active) return `Kenji is busy with ${def(s.active.id).name.toLowerCase()}.`;
        const miss = api.missing(id);
        if (miss.length) return `Still needed: ${miss.map((m) => (m.item === 'koku' ? `${m.need - m.have} koku` : `${m.need - m.have} ${items().get(m.item).name.toLowerCase()}`)).join(', ')}.`;
        return null;
      },

      /** Pay, lay the foundation, put the scaffolding up. */
      start(id) {
        const why = api.why(id);
        if (why) { ctx.say(why); return false; }
        const p = def(id), shape = shapeOf(id);
        if (p.cost.koku) ctx.money.spend(p.cost.koku, 'project');
        for (const [item, n] of Object.entries(p.cost.items || {})) ctx.inv.take(item, n);
        for (const t of shape.tiles) if (ctx.world.isWater(t.x, t.z)) patch(id, t.x, t.z, T.SAND, 0);
        const scaffold = shape.scaffold.map((c) => placeNear(props(), 'scaffold', c.x, c.z, { r: 1, rots: [0], via: 'project' })?.id).filter(Boolean);
        // Kenji works a quarter faster for a friend (his second heart)
        s.active = { id, doneAt: ctx.now() + Math.round(p.buildMs * (ctx.flags.has('kenji_quick') ? 0.75 : 1)), scaffold };
        ctx.flags.set('building');
        ctx.sfx('fanfare');
        ctx.say(`Kenji starts on ${p.name.toLowerCase()}!`, p.icon);
        api.tour(shape);
        ctx.invalidate('ui'); ctx.invalidate('veg');
        return true;
      },

      /** Raise the shape, plant its props, take the scaffolding down. Runs when the time is up (now or on load). */
      finish() {
        const a = s.active;
        if (!a) return false;
        const p = def(a.id), shape = shapeOf(a.id);
        for (const pid of a.scaffold) { const sc = props().list.find((q) => q.id === pid); if (sc) props().remove(sc, { to: 'gone' }); }
        // land first, then each level up in turn, so every step is a small one
        for (const t of shape.tiles) patch(a.id, t.x, t.z, t.kind, 0);
        for (let h = 1; h <= 4; h++) for (const t of shape.tiles) if (t.height >= h) patch(a.id, t.x, t.z, t.kind, h);
        for (const q of shape.props) {
          if (props().canPlace(q.type, q.x, q.z, q.rot, { via: 'project' })) props().add(q.type, q.x, q.z, q.rot, 0, { via: 'project' });
          else if (q.anchors || q.near) placeNear(props(), q.type, q.x, q.z, { r: q.near ? 5 : 2, rots: [q.rot, (q.rot + 2) & 3], via: 'project' });
        }
        s.active = null;
        ctx.flags.clear('building');
        s.done.push(a.id);
        s.fresh.push(a.id);
        ctx.flags.set(`project_${a.id}`);
        ctx.bus.emit('projectDone', { project: a.id, doneAt: a.doneAt, unlocks: p.unlocks || [] });
        ctx.sfx('fanfare');
        ctx.say(`Kenji finished ${p.name.toLowerCase()}!`, p.icon);
        api.tour(shape, true);
        ctx.invalidate('ui'); ctx.invalidate('veg'); ctx.invalidate('terrain');
        return true;
      },

      /** The camera flies over the site and back. */
      tour(shape, burst = false) {
        const pts = shape.tiles.length ? shape.tiles : shape.props, n = pts.length;
        const cx = pts.reduce((a, t) => a + t.x, 0) / n + 0.5, cz = pts.reduce((a, t) => a + t.z, 0) / n + 0.5;
        const sh = ctx.use('shrine');
        sh.focusQ = [...sh.focusQ, { x: cx, z: cz, until: ctx.mono() + TOUR_MS, burst }];
      },

      /** Due? (twice a second, and once on start) */
      check() { if (s.active && ctx.now() >= s.active.doneAt) api.finish(); },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) {
    // the board stands by the plaza; Kenji's projects start there
    const pr = ctx.use('props');
    if (!pr.list.some((p) => p.type === 'noticeboard')) placeNear(pr, 'noticeboard', HOME.x + 2, HOME.z - 3, { r: 6 });
    ctx.state.api.check();
  },
  update(ctx, dt) {
    ctx.state.poll -= dt;
    if (ctx.state.poll > 0) return;
    ctx.state.poll = 0.5;
    ctx.state.api.check();
  },
  init(ctx) {
    ctx.resolvers.add({
      id: 'projects', priority: 46, // the board: before the prop is merely looked at
      fn(t) { return ctx.use('props').at(t.x, t.z)?.type === 'noticeboard' ? { kind: 'projects', t, icon: 'asset:noticeboard', label: 'Projects' } : null; },
    });
    ctx.actions.add('projects', { queueable: true, button: true, perform: () => ctx.bus.emit('openSheet', { name: 'projects' }) });
    // the ribbon: what Kenji is building and how long it has left; or, with nothing building, a project that can be paid for now
    const open = () => ctx.bus.emit('openSheet', { name: 'projects' });
    ctx.todo.add({
      id: 'project', priority: 50,
      when() {
        const { api } = ctx.state, a = api.active;
        if (a) { const p = ctx.content.projects.get(a.id); return { icon: p.icon, text: `Kenji is building ${p.name.toLowerCase()} · ${left(api.left())}`, onTap: open }; }
        const ready = api.list().find((p) => p.status === 'open' && !api.why(p.id));
        return ready ? { icon: 'asset:noticeboard', text: `You can afford ${ready.name.toLowerCase()}: see the board`, onTap: open } : null;
      },
    });
  },
});

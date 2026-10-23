// Daikoku's benches (content: recipes of kind 'process' at the 'mill', 'dish' at the 'kitchen'). A mill works one batch at a time
// in real time (finished even while the game is closed) and is collected by tapping it. The kitchen cooks at once: exactly a
// dish's ingredients make that dish (discovered the first time), anything else becomes a village stew.
// Saved in ext.kitchen: { jobs: { propId: { recipe, doneAt } }, known: [dish ids] }.
import { defineSystem } from '../core/system.js';

const FALLBACK = 'zosui';
const left = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`; };

export default defineSystem({
  name: 'kitchen',
  needs: ['props'],
  api(ctx) {
    const s = Object.assign(ctx.state, { jobs: {}, known: [], poll: 0 });
    ctx.part('kitchen', {
      serialize: () => ({ jobs: s.jobs, known: s.known }),
      load: (d) => { s.jobs = { ...(d?.jobs || {}) }; s.known = [...(d?.known || [])]; },
      defaults: () => ({ jobs: {}, known: [] }),
    });
    const recipe = (id) => ctx.content.recipes.get(id);
    const items = () => ctx.content.itemMap();
    const of = (kind, bench) => [...ctx.content.recipes.all()].filter(([, r]) => r.kind === kind && r.bench === bench).map(([id, r]) => ({ id, ...r }));
    const hasAll = (inputs) => Object.entries(inputs).every(([it, n]) => ctx.inv.count(it) >= n);
    const name = (id) => items().get(id)?.name.toLowerCase() ?? id;

    const api = {
      // ---- the mill
      processes: () => of('process', 'mill'),
      job: (pid) => s.jobs[pid] || null,
      /** 'idle' | 'working' | 'done' */
      state(pid) { const j = s.jobs[pid]; return !j ? 'idle' : ctx.now() >= j.doneAt ? 'done' : 'working'; },
      left: (pid) => Math.max(0, (s.jobs[pid]?.doneAt ?? 0) - ctx.now()),
      canMill: (id) => hasAll(recipe(id).inputs),
      startMill(pid, id) {
        const r = recipe(id);
        if (s.jobs[pid]) { ctx.say('The mill is busy.'); return false; }
        if (!hasAll(r.inputs)) { ctx.say(`Not enough ${Object.keys(r.inputs).map(name).join(' or ')}.`); return false; }
        for (const [it, n] of Object.entries(r.inputs)) ctx.inv.take(it, n);
        s.jobs[pid] = { recipe: id, doneAt: ctx.now() + r.timeMs };
        ctx.sfx('till');
        ctx.say(`The millstones turn: ${r.name.toLowerCase()} in ${left(r.timeMs)}.`, 'asset:mill');
        ctx.invalidate('ui');
        return true;
      },
      collect(pid) {
        const j = s.jobs[pid];
        if (!j || ctx.now() < j.doneAt) return false;
        const r = recipe(j.recipe);
        delete s.jobs[pid];
        for (const [it, n] of Object.entries(r.out)) ctx.inv.give(it, n, { reason: 'craft' });
        ctx.sfx('harvest');
        const [first, n] = Object.entries(r.out)[0];
        ctx.say(`Collected ${n} × ${name(first)}.`, items().get(first).icon);
        ctx.bus.emit('craft', { recipe: j.recipe, bench: 'mill', made: { ...r.out }, used: { ...r.inputs } });
        ctx.invalidate('ui');
        return true;
      },

      // ---- the kitchen
      dishes: () => of('dish', 'kitchen').map((r) => ({ ...r, known: s.known.includes(r.id) || r.discover === false })),
      known: (id) => s.known.includes(id),
      /** The dish exactly these ingredients make ({ id: n }), or null. */
      match(pot) {
        const keys = Object.keys(pot).filter((k) => pot[k] > 0);
        return api.dishes().find((r) => { const ins = Object.keys(r.inputs); return ins.length === keys.length && ins.every((k) => pot[k] === r.inputs[k]); }) || null;
      },
      /** Cook what is in the pot: the matching dish, or the stew. Returns { dish, discovered } or null. */
      cook(pot) {
        const keys = Object.keys(pot).filter((k) => pot[k] > 0);
        if (!keys.length) return null;
        if (!keys.every((k) => ctx.inv.count(k) >= pot[k])) { ctx.say('You do not have all of that.'); return null; }
        const hit = api.match(pot), dish = hit ? hit.id : FALLBACK;
        for (const k of keys) ctx.inv.take(k, pot[k]);
        ctx.inv.give(dish, 1, { reason: 'craft' });
        const discovered = !!hit && hit.discover !== false && !s.known.includes(dish);
        if (discovered) s.known.push(dish);
        ctx.flags.set('cooked');
        ctx.sfx(discovered ? 'fanfare' : 'harvest');
        ctx.bus.emit('haptic', { ms: discovered ? 40 : 14 });
        const it = items().get(dish);
        ctx.say(discovered ? `A new recipe: ${it.name}!` : hit ? `${it.name}, done.` : 'It turned into a humble village stew.', it.icon);
        ctx.bus.emit('cook', { dish, ingredients: keys, discovered, quality: 1 });
        ctx.invalidate('ui');
        return { dish, discovered };
      },
    };
    ctx.state.api = api;
    return api;
  },
  update(ctx, dt) {
    // a finished batch glints so it is noticed
    ctx.state.poll -= dt;
    if (ctx.state.poll > 0) return;
    ctx.state.poll = 0.6;
    const { api } = ctx.state;
    for (const p of ctx.use('props').list) if (p.type === 'mill' && api.state(p.id) === 'done') ctx.sparkle(p.x + 0.3 + ctx.rng() * 0.4, 0.7 + ctx.rng() * 0.3, p.z + 0.3 + ctx.rng() * 0.4);
  },
  init(ctx) {
    const { api } = ctx.state;
    ctx.resolvers.add({
      id: 'mill', priority: 43, // before the prop is merely looked at
      fn(t) {
        const p = ctx.use('props').at(t.x, t.z);
        if (p?.type !== 'mill') return null;
        const st = api.state(p.id);
        return { kind: st === 'done' ? 'collect' : 'mill', t, prop: p.id, icon: 'asset:mill', label: st === 'done' ? 'Collect' : 'Mill' };
      },
    });
    ctx.resolvers.add({
      id: 'kitchen', priority: 41,
      fn(t) { return ctx.use('props').at(t.x, t.z)?.type === 'kitchen' ? { kind: 'cook', t, icon: 'asset:kitchen', label: 'Cook' } : null; },
    });
    ctx.actions.add('mill', { queueable: true, button: true, perform: (a) => ctx.bus.emit('openSheet', { name: 'mill', args: { prop: a.prop } }) });
    ctx.actions.add('collect', { queueable: true, button: true, perform: (a) => api.collect(a.prop) });
    ctx.actions.add('cook', { queueable: true, button: true, perform: () => ctx.bus.emit('openSheet', { name: 'kitchen' }) });
    ctx.todo.add({
      id: 'mill', priority: 60,
      when() {
        const done = ctx.use('props').list.find((p) => p.type === 'mill' && api.state(p.id) === 'done');
        if (!done) return null;
        const r = ctx.content.recipes.get(api.job(done.id).recipe);
        return { icon: 'asset:mill', text: `The mill is done: ${r.name.toLowerCase()} to collect`, onTap: null };
      },
    });
  },
});

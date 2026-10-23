// The workbench: the island's raw materials become things (content: recipes of kind 'craft' at the 'workbench' bench). Tapping a
// placed workbench opens its sheet; making something takes the inputs from the bag and puts the outputs in it, and emits `craft`.
// A village gets its first workbench once: placed beside home in a new game, put in the bag of an older one.
import { defineSystem } from '../core/system.js';
import { HOME } from '../content/base/landmarks.js';
import { placeNear } from './shared.js';

export default defineSystem({
  name: 'craft',
  needs: ['props'],
  api(ctx) {
    const items = () => ctx.content.itemMap();
    const api = {
      /** The recipes the workbench knows right now: [{ id, name, inputs, out, hint }]. */
      recipes() {
        const out = [];
        for (const [id, r] of ctx.content.recipes.all()) {
          if (r.kind !== 'craft' || r.bench !== 'workbench') continue;
          if (r.unlock && !ctx.cond.evaluate(r.unlock, ctx.condCtx())) continue;
          out.push({ id, ...r });
        }
        return out;
      },
      /** What is still missing for one go of the recipe: [{ item, need, have }]. */
      missing(id) {
        const r = ctx.content.recipes.get(id);
        return Object.entries(r.inputs).map(([item, need]) => ({ item, need, have: ctx.inv.count(item) })).filter((m) => m.have < m.need);
      },
      can: (id) => api.missing(id).length === 0,

      make(id) {
        const r = ctx.content.recipes.get(id);
        if (!r) return false;
        const miss = api.missing(id);
        if (miss.length) { ctx.say(`Not enough ${miss.map((m) => items().get(m.item).name.toLowerCase()).join(' or ')}.`); return false; }
        for (const [item, n] of Object.entries(r.inputs)) ctx.inv.take(item, n);
        for (const [item, n] of Object.entries(r.out)) ctx.inv.give(item, n, { reason: 'craft' });
        ctx.sfx('till');
        ctx.bus.emit('haptic', { ms: 14 });
        const [first, n] = Object.entries(r.out)[0];
        ctx.say(`Made ${n > 1 ? `${n} × ` : ''}${items().get(first).name.toLowerCase()}`, items().get(first).icon);
        ctx.bus.emit('craft', { recipe: id, bench: 'workbench', made: { ...r.out }, used: { ...r.inputs } });
        ctx.invalidate('ui');
        return true;
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx, { fresh } = {}) {
    if (ctx.flags.has('gift_workbench')) return;
    ctx.flags.set('gift_workbench');
    if (fresh && placeNear(ctx.use('props'), 'workbench', HOME.x + 3, HOME.z - 1, { r: 4 })) return;
    ctx.inv.give('prop_workbench', 1, { reason: 'gift' });
  },
  init(ctx) {
    ctx.resolvers.add({
      id: 'workbench', priority: 44, // before the prop is merely looked at
      fn(t) { return ctx.use('props').at(t.x, t.z)?.type === 'workbench' ? { kind: 'craft', t, icon: 'asset:workbench', label: 'Make' } : null; },
    });
    ctx.actions.add('craft', { queueable: true, button: true, perform: () => ctx.bus.emit('openSheet', { name: 'workbench' }) });
  },
});

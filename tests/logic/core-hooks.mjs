// core/hooks.js: registries, validation, ordering, owner scoping, ctx.as, hooks.define.
import assert from 'node:assert/strict';
import { createHooks, scopeCtx, REGISTRIES } from '../../src/core/hooks.js';
import { createBus } from '../../src/core/bus.js';
import { createSchema } from '../../src/core/schema.js';

export default function () {
  const ctx = { name: 'ctx', bus: createBus({ strict: true }), schema: createSchema(), world: { w: 40 } };
  const hooks = createHooks({ target: ctx });
  assert.deepEqual(hooks.names(), Object.keys(REGISTRIES));
  assert.deepEqual(hooks.names(), ['tools', 'hotbar', 'resolvers', 'actions', 'guards', 'keys', 'todo', 'today', 'sheets', 'views', 'hud', 'daily']);
  assert.equal(ctx.hooks, hooks);
  assert.equal(ctx.tools, hooks.tools);
  for (const n of hooks.names()) assert.equal(ctx[n], hooks[n], n);

  // tools (arg-keyed) with owner scoping
  const hoe = { use() {} };
  const e = ctx.tools.add('hoe', hoe);
  assert.equal(e.id, 'hoe'); assert.equal(e.owner, null); assert.equal(e.use, hoe.use); assert.equal(hoe.id, undefined, 'input is not mutated');
  assert.throws(() => ctx.tools.add('hoe', hoe), /'hoe' is already registered/);
  assert.throws(() => ctx.tools.add('x', {}), /tools\.x\.use: required/);
  assert.throws(() => ctx.tools.add('', hoe), /missing id/);
  const wp = ctx.as('wp26');
  assert.equal(wp.owner, 'wp26');
  assert.equal(wp.tools.add('compost', { use() {}, group: 'more' }).owner, 'wp26');
  assert.throws(() => wp.tools.add('hoe', hoe), /already registered/);
  assert.deepEqual(ctx.tools.owned('wp26').map((t) => t.id), ['compost']);
  assert.deepEqual(ctx.tools.ids(), ['hoe', 'compost']);
  assert.equal(wp.tools.get('compost'), ctx.tools.get('compost'));
  assert.equal(wp.name, 'ctx'); assert.equal(wp.world, ctx.world);
  const { add } = wp.tools; assert.equal(add('rake', { use() {} }).owner, 'wp26', 'destructured add keeps its owner');
  assert.equal(ctx.tools.remove('rake'), true); assert.equal(ctx.tools.remove('rake'), false);

  // scoped bus comes along through ctx.as
  const seen = [];
  wp.bus.declare('wp26.compost', { n: 'int' });
  wp.bus.on('wp26.compost', (p) => seen.push(p.n));
  ctx.bus.emit('wp26.compost', { n: 2 });
  assert.deepEqual(seen, [2]);
  assert.deepEqual(ctx.bus.list().map((x) => x.owner), ['wp26']);
  assert.equal(wp.as('wp27').owner, 'wp27'); assert.equal(wp.as('wp27').tools.add('t27', { use() {} }).owner, 'wp27');

  // writes through the scoped ctx reach the real ctx
  wp.late = 5; assert.equal(ctx.late, 5);

  // hotbar and today sort ascending by order, ties by registration
  ctx.hotbar.add({ id: 'b', order: 20 }); ctx.hotbar.add({ id: 'a', order: 10 }); ctx.hotbar.add({ id: 'c', order: 20 });
  assert.deepEqual(ctx.hotbar.all().map((h) => h.id), ['a', 'b', 'c']);
  assert.ok(Object.isFrozen(ctx.hotbar.all()));
  assert.throws(() => ctx.hotbar.add({ id: 'd' }), /hotbar\.d\.order: required/);
  const v = ctx.hotbar.version; ctx.hotbar.remove('c'); assert.ok(ctx.hotbar.version > v); assert.equal(ctx.hotbar.size, 2);
  ctx.today.addSection({ id: 's2', order: 2, render() {} }); ctx.today.addSection({ id: 's1', order: 1, render() {} });
  assert.deepEqual(ctx.today.all().map((s) => s.id), ['s1', 's2']);

  // resolvers: highest priority non-null wins, else null
  ctx.resolvers.add({ id: 'low', priority: 10, fn: () => ({ kind: 'low' }) });
  ctx.resolvers.add({ id: 'high', priority: 90, fn: (t) => (t.x === 1 ? { kind: 'high' } : null) });
  ctx.resolvers.add({ id: 'mid', priority: 50, fn: (t) => (t.x === 2 ? { kind: 'mid' } : null) });
  assert.deepEqual(ctx.resolvers.all().map((r) => r.id), ['high', 'mid', 'low']);
  assert.equal(ctx.resolvers.resolve({ x: 1 }, ctx).kind, 'high');
  assert.equal(ctx.resolvers.resolve({ x: 2 }, ctx).kind, 'mid');
  assert.equal(ctx.resolvers.resolve({ x: 3 }, ctx).kind, 'low');
  ctx.resolvers.remove('low');
  assert.equal(ctx.resolvers.resolve({ x: 3 }, ctx), null);

  // actions and the derived sweeps view
  ctx.actions.add('till', { perform() {}, sweep: true, queueable: true });
  ctx.actions.add('talk', { perform() {} });
  assert.deepEqual(ctx.sweeps.kinds(), ['till']);
  assert.equal(ctx.sweeps.has('talk'), false); assert.equal(ctx.sweeps.get('till').kind, 'till');
  assert.equal(ctx.as('x').sweeps.has('till'), true);
  assert.throws(() => ctx.actions.add('bad', {}), /perform: required/);

  // guards: many per kind, first reason wins, priority order, unknown kinds rejected
  const order = [];
  ctx.guards.add('place', (p) => { order.push('late'); return p.x < 0 ? 'out of bounds' : null; });
  const g = ctx.as('wp21').guards.add('place', () => { order.push('first'); return null; }, { priority: 80 });
  assert.equal(g.owner, 'wp21'); assert.equal(g.kind, 'place');
  assert.equal(ctx.guards.check('place', { x: 1 }, ctx), null);
  assert.deepEqual(order, ['first', 'late']);
  assert.equal(ctx.guards.check('place', { x: -1 }, ctx), 'out of bounds');
  assert.equal(ctx.guards.check('dig', {}, ctx), null);
  assert.throws(() => ctx.guards.add('fly', () => null), /unknown kind 'fly'/);
  ctx.guards.declare('fly'); ctx.guards.add('fly', () => 'no');
  assert.equal(ctx.guards.check('fly', {}, ctx), 'no');
  assert.equal(ctx.guards.remove(g), true); assert.equal(ctx.guards.get('place').length, 1);
  assert.equal(ctx.guards.remove(g), false);
  ctx.as('wp21').guards.add('place', () => null);
  assert.throws(() => ctx.guards.add('place', 'nope'), /fn: expected a function/);

  // keys: duplicates rejected, press runs the handler
  let pressed = 0;
  ctx.keys.bind('KeyJ', () => pressed++);
  assert.throws(() => ctx.keys.bind('KeyJ', () => {}), /'KeyJ' is already registered/);
  assert.equal(ctx.keys.press('KeyJ', ctx), true); assert.equal(ctx.keys.press('KeyK', ctx), false); assert.equal(pressed, 1);
  assert.equal(ctx.keys.add, ctx.keys.bind);

  // todo: priority desc, collect skips nulls and merges results
  ctx.todo.add({ id: 'a', priority: 10, when: () => ({ icon: 'i', text: 'a' }) });
  ctx.todo.add({ id: 'b', priority: 90, when: () => null });
  ctx.todo.add({ id: 'c', priority: 50, when: () => ({ icon: 'i', text: 'c' }) });
  assert.deepEqual(ctx.todo.collect(ctx).map((t) => `${t.id}:${t.text}`), ['c:c', 'a:a']);

  // hud slots, sheets, views, daily contributors
  assert.throws(() => ctx.hud.add({ id: 'h', slot: 'nowhere', order: 1, render() {} }), /hud\.h\.slot/);
  ctx.hud.add({ id: 'h2', slot: 'toolbar', order: 2, render() {} }); ctx.hud.add({ id: 'h1', slot: 'toolbar', order: 1, render() {} }); ctx.hud.add({ id: 'p', slot: 'preview', order: 1, render() {} });
  assert.deepEqual(ctx.hud.slot('toolbar').map((h) => h.id), ['h1', 'h2']);
  ctx.sheets.add('shop', { render() {} });
  assert.throws(() => ctx.sheets.add('shop', { render() {} }), /already registered/);
  ctx.views.add({ name: 'crops', update() {} });
  assert.throws(() => ctx.views.add({ name: 'bad', update: 3 }), /update/);
  ctx.daily.contribute({ id: 'market', order: 20, base: true, roll() {} });
  ctx.daily.contribute({ id: 'requests', order: 10, base: true, roll() {} });
  ctx.as('wp31').daily.contribute({ id: 'mail', order: 40, roll() {} });
  assert.deepEqual(ctx.daily.all().map((d) => d.id), ['requests', 'market', 'mail']);

  // enumeration for lints
  const entries = ctx.hooks.entries();
  assert.ok(entries.some((x) => x.registry === 'guards' && x.key === 'place' && x.owner === 'wp21'));
  assert.ok(entries.some((x) => x.registry === 'daily' && x.key === 'mail' && x.owner === 'wp31'));
  assert.deepEqual([...ctx.hooks.owners()].sort((a, b) => String(a).localeCompare(String(b))), [null, 'wp21', 'wp26', 'wp27', 'wp31']);
  ctx.tools.removeOwner('wp26'); assert.equal(ctx.tools.has('compost'), false);

  // hooks.define: a WP adds a registry; it is installed on ctx and scoped like the rest
  const photoFilters = wp.hooks.define('filters', { sort: ['order', 1], spec: { fields: { id: 'string', order: 'number', apply: 'function' }, open: true } });
  assert.equal(ctx.filters.name, 'filters'); assert.ok(hooks.has('filters'));
  assert.equal(photoFilters.add({ id: 'sepia', order: 2, apply() {} }).owner, 'wp26');
  ctx.filters.add({ id: 'mono', order: 1, apply() {} });
  assert.deepEqual(ctx.filters.all().map((f) => f.id), ['mono', 'sepia']);
  assert.equal(ctx.as('wp26').filters.get('sepia').owner, 'wp26');
  assert.ok(hooks.entries().some((x) => x.registry === 'filters' && x.owner === 'wp26'));
  assert.throws(() => hooks.define('filters'), /bad or taken/);
  assert.throws(() => hooks.define('tools'), /bad or taken/);
  assert.throws(() => hooks.define('as'), /bad or taken/);
  assert.throws(() => hooks.define('Bad name'), /bad or taken/);
  const named = hooks.define('stickers', { field: 'name', arg: true, verb: 'register' });
  named.register('star', { shiny: true });
  assert.equal(ctx.stickers.get('star').name, 'star');

  // a registry made without a target, and scopeCtx used directly
  const lone = createHooks();
  lone.tools.add('t', { use() {} });
  assert.equal(lone.as('wp9').tools.get('t').owner, null);
  const bare = { hooks: lone, z: 1 };
  assert.equal(scopeCtx(bare, 'wp9').hooks.tools.add('u', { use() {} }).owner, 'wp9');
  assert.equal(scopeCtx(bare, 'wp9').z, 1);
}

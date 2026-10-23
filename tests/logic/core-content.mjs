// core/content.js: registries, add/override/freeze, base-only instances, the validator hook.
import assert from 'node:assert/strict';
import { createContent, DOMAINS } from '../../src/core/content.js';

export default async function () {
  const c = createContent({ empty: true });
  assert.deepEqual(c.domains, DOMAINS);
  assert.equal(DOMAINS.length, 16);
  assert.equal(c.fish.size, 0);
  assert.deepEqual(c.fish.all(), []);
  assert.equal(c.fish.get('ayu'), undefined);
  assert.equal(c.fish.has('ayu'), false);

  c.add('fish', 'ayu', { name: 'Ayu', sell: 30, tags: ['river'] });
  c.add('fish', 'koi', { name: 'Koi', sell: 65, tags: ['river', 'rare'] });
  c.add('fish', 'tai', { name: 'Tai', sell: 75 });
  c.add('items', 'bait', { name: 'Bait', kind: 'tool' });
  assert.deepEqual(c.fish.ids(), ['ayu', 'koi', 'tai']);
  assert.equal(c.fish.get('koi').sell, 65);
  assert.equal(c.fish.has('tai'), true);
  assert.deepEqual(c.fish.all().map(([id]) => id), ['ayu', 'koi', 'tai']);
  assert.deepEqual(c.fish.entries(), c.fish.all());
  assert.deepEqual(c.fish.filter((f) => f.sell > 50).map(([id]) => id), ['koi', 'tai']);
  assert.deepEqual(c.fish.filter((f, id) => id === 'ayu').map(([, f]) => f.name), ['Ayu']);
  assert.deepEqual(c.fish.byTag('river').map(([id]) => id), ['ayu', 'koi']);
  assert.deepEqual(c.fish.byTag('rare').map(([id]) => id), ['koi']);
  assert.deepEqual(c.fish.byTag('none'), []);
  assert.deepEqual(Object.keys(c.fish.view()), ['ayu', 'koi', 'tai']);
  assert.equal(c.registry('items').get('bait').kind, 'tool');
  assert.deepEqual(c.items.ids(), ['bait'], 'domains are separate');

  // errors name the domain and id
  assert.throws(() => c.add('fish', 'ayu', { name: 'again' }), /duplicate fish "ayu"/);
  assert.throws(() => c.add('nope', 'x', {}), /unknown domain "nope"/);
  assert.throws(() => c.add('fish', 'Bad-Id', {}), /bad id/);
  assert.throws(() => c.add('fish', 'seed~2', {}), /bad id/);
  assert.throws(() => c.add('fish', '', {}), /bad id/);
  assert.throws(() => c.add('fish', 'ok', null), /needs an object/);
  assert.throws(() => c.override('fish', 'ghost', { sell: 1 }), /override of missing fish "ghost"/);
  assert.throws(() => c.override('fish', 'ayu', null), /patch/);
  assert.equal(c.fish.size, 3, 'a failed add leaves no trace');
  assert.equal(c.log.length, 4);

  // override: shallow merge, position kept, listed with owner
  c.as('wp27').override('fish', 'ayu', { sell: 33, icon: 'fish2:ayu' });
  assert.deepEqual(c.fish.get('ayu'), { name: 'Ayu', sell: 33, tags: ['river'], icon: 'fish2:ayu' });
  assert.deepEqual(c.fish.ids(), ['ayu', 'koi', 'tai']);
  assert.deepEqual(c.fish.byTag('river').map(([id]) => id), ['ayu', 'koi'], 'tag index follows overrides');
  c.override('fish', 'ayu', { tags: [] });
  assert.deepEqual(c.fish.byTag('river').map(([id]) => id), ['koi']);
  assert.deepEqual(c.overrides(), [
    { domain: 'fish', id: 'ayu', fields: ['sell', 'icon'], owner: 'wp27' },
    { domain: 'fish', id: 'ayu', fields: ['tags'], owner: null },
  ]);
  c.as('wp26').add('crops', 'rice', { name: 'Rice' });
  assert.equal(c.log.at(-1).owner, 'wp26');

  // custom domain, validator hook
  c.defineDomain('moods');
  c.add('moods', 'calm', { name: 'Calm' });
  assert.deepEqual(c.domains.at(-1), 'moods');
  assert.throws(() => c.defineDomain('moods'), /already exists/);
  assert.throws(() => c.defineDomain('add'), /reserved/);
  assert.throws(() => c.validateAll({}), /no validator/);
  c.setValidator((cc, opts) => [`saw ${cc.fish.size} fish in ${opts.mode}`]);
  assert.deepEqual(c.validateAll({ mode: 'merged' }), ['saw 3 fish in merged']);

  // freeze: once, deep, views frozen, no more writes
  assert.equal(c.frozen, false);
  const view = c.fish.view();
  assert.equal(Object.isFrozen(view), false);
  assert.equal(c.freeze(), c);
  assert.equal(c.frozen, true);
  assert.equal(c.freeze(), c, 'freeze is idempotent');
  assert.ok(Object.isFrozen(c.fish.get('koi')) && Object.isFrozen(c.fish.get('koi').tags));
  assert.ok(Object.isFrozen(c.fish.view()));
  assert.equal(c.fish.view(), c.fish.view());
  assert.throws(() => { 'use strict'; c.fish.get('koi').sell = 1; }, TypeError);
  assert.throws(() => c.add('fish', 'late', {}), /after freeze/);
  assert.throws(() => c.override('fish', 'koi', { sell: 1 }), /after freeze/);
  assert.throws(() => c.defineDomain('later'), /after freeze/);
  const typed = createContent({ empty: true });
  typed.add('props', 'blob', { data: new Float32Array(2), list: [1, { a: 2 }] });
  typed.freeze();
  assert.ok(Object.isFrozen(typed.props.get('blob').list[1]), 'plain objects and arrays freeze deep, typed arrays are left alone');

  // module singleton (a private copy of the module, so the real one stays clean): add/override/addBase feed
  // it; createContent replays it (base only or everything)
  const fresh = await import('../../src/core/content.js?isolated');
  const { content: singleton, add, override, addBase, createContent: create } = fresh;
  assert.notEqual(singleton, (await import('../../src/core/content.js')).content);
  assert.equal(singleton.frozen, false);
  const before = singleton.log.length;
  const logIds = () => singleton.log.slice(before).map((o) => `${o.layer}:${o.op}:${o.domain}.${o.id}`);
  addBase('stamps', 'zz_base', { name: 'Base', tags: ['t'] });
  add('stamps', 'zz_pack', { name: 'Pack' });
  override('stamps', 'zz_base', { name: 'Base!' });
  assert.deepEqual(logIds(), ['base:add:stamps.zz_base', 'pack:add:stamps.zz_pack', 'pack:override:stamps.zz_base']);
  assert.equal(singleton.stamps.get('zz_base').name, 'Base!');
  const full = create({ packs: true }), baseOnly = create({ packs: false });
  assert.deepEqual(full.stamps.ids().slice(-2), ['zz_base', 'zz_pack']);
  assert.equal(full.stamps.get('zz_base').name, 'Base!');
  assert.deepEqual(baseOnly.stamps.ids().filter((i) => i.startsWith('zz_')), ['zz_base']);
  assert.equal(baseOnly.stamps.get('zz_base').name, 'Base', 'pack overrides are not in the base-only instance');
  assert.equal(baseOnly.overrides().length, 0);
  baseOnly.freeze();
  assert.equal(singleton.frozen, false, 'instances freeze independently');
  assert.throws(() => addBase('stamps', 'zz_base', {}), /duplicate/);
}

// Flags and counters.
import assert from 'node:assert/strict';
import { createFlags } from '../../src/core/flags.js';

export default function () {
  const f = createFlags();
  assert.equal(f.has('shrine.ebisu'), false);
  assert.equal(f.get('x', 7), 7);
  assert.equal(f.set('shrine.ebisu'), true);
  assert.equal(f.has('shrine.ebisu'), true);
  assert.equal(f.once('shrine.ebisu'), false);
  assert.equal(f.once('first.koi'), true);
  assert.equal(f.once('first.koi'), false);
  assert.equal(f.inc('caught.koi'), 1);
  assert.equal(f.inc('caught.koi', 2), 3);
  assert.equal(f.count('caught.koi'), 3);
  assert.equal(f.count('nothing'), 0);
  f.set('off', false); f.set('zero', 0); f.set('mood', 'calm');
  assert.deepEqual([f.has('off'), f.has('zero'), f.has('mood')], [false, false, true]);
  assert.throws(() => f.set('bad', { a: 1 }), /boolean, number or string/);
  assert.throws(() => f.set('bad', NaN));
  assert.deepEqual(f.keys('shrine.'), ['shrine.ebisu']);
  const d = JSON.parse(JSON.stringify(f.serialize()));
  assert.deepEqual(Object.keys(d), [...Object.keys(d)].sort(), 'stable key order');
  const g = createFlags();
  g.load({ ...d, junk: { a: 1 }, nan: null });
  assert.deepEqual(g.serialize(), d, 'unserialisable values dropped, the rest round-trips');
  assert.equal(f.clear('mood'), true);
  assert.equal(f.has('mood'), false);
  g.load(null);
  assert.deepEqual(g.serialize(), {});
}

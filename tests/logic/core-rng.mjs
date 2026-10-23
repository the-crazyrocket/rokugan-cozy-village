// core/rng.js: the copied hashes stay bit-identical to world.js and clock.js; streams are independent.
import assert from 'node:assert/strict';
import * as core from '../../src/core/rng.js';
import { mulberry32, hash2 } from '../../src/game/world.js';
import { hashString } from '../../src/game/clock.js';

const draw = (f, n) => Array.from({ length: n }, () => f());

export default function () {
  for (const seed of [0, 1, 42, 1337, 2 ** 31, -5, 0xdeadbeef, 1.5e9]) {
    assert.deepEqual(draw(core.mulberry32(seed), 64), draw(mulberry32(seed), 64), `mulberry32(${seed})`);
  }
  for (let x = -3; x < 45; x += 4) for (let z = -2; z < 45; z += 5) for (const s of [0, 1, 7, 30]) assert.equal(core.hash2(x, z, s), hash2(x, z, s));
  assert.equal(core.hash2(3, 4), hash2(3, 4));
  for (const s of ['', 'a', '2026-10-23', '2026-10-23gift', 'Ünï€ode', 'x'.repeat(300)]) assert.equal(core.hashString(s), hashString(s), s);

  // root stream is deterministic and in [0,1)
  const a = core.createRng(7), b = core.createRng(7);
  assert.deepEqual(draw(a, 20), draw(b, 20));
  assert.notDeepEqual(draw(core.createRng(8), 5), draw(core.createRng(7), 5));
  assert.deepEqual(draw(core.createRng('day'), 5), draw(core.createRng('day'), 5));
  assert.ok(draw(core.createRng(3), 500).every((v) => v >= 0 && v < 1));

  // sub-streams depend only on (seed, keys), never on draws made elsewhere
  const fresh = core.createRng(11)('2026-10-23', 'mail');
  const busy = core.createRng(11);
  draw(busy, 100); draw(busy('2026-10-23', 'other'), 100);
  assert.deepEqual(draw(busy('2026-10-23', 'mail'), 10), draw(fresh, 10));
  assert.deepEqual(draw(core.createRng(11)('a', 'b'), 6), draw(core.createRng(11)('a')('b'), 6), 'nesting equals joined keys');
  assert.notDeepEqual(draw(core.createRng(11)('a', 'b'), 6), draw(core.createRng(11)('a', 'c'), 6));
  assert.notDeepEqual(draw(core.createRng(11)('a'), 6), draw(core.createRng(12)('a'), 6));
  assert.notDeepEqual(draw(core.createRng(11)(1, 12), 4), draw(core.createRng(11)(11, 2), 4), 'keys do not run together');
  assert.deepEqual(draw(core.createRng(11)(5), 4), draw(core.createRng(11)('5'), 4), 'keys are stringified');

  // helpers
  const r = core.createRng(5);
  const ints = draw(() => r.int(2, 4), 300);
  assert.ok(ints.every((v) => v >= 2 && v <= 4) && new Set(ints).size === 3);
  assert.ok(draw(() => r.pick(['x', 'y']), 50).every((v) => v === 'x' || v === 'y'));
  const heads = draw(() => r.chance(0.5), 400).filter(Boolean).length;
  assert.ok(heads > 140 && heads < 260);
  assert.equal(r.chance(0), false);
  const w = draw(() => r.weighted([['a', 1], ['b', 0], ['c', 9]]), 400);
  assert.ok(!w.includes('b') && w.filter((v) => v === 'c').length > 300);
  assert.equal(r.weighted([]), null);
  assert.equal(core.rngWeighted(() => 0.999999, [['a', 1], ['b', 1]]), 'b');
  const sub = r('k');
  assert.equal(typeof sub.int(1, 6), 'number');

  // the old Game.rollFish loop and rngWeighted agree
  const pool = [['ayu', 6], ['koi', 4]];
  const old = (rnd) => { let x = rnd() * 10; for (const [k, wt] of pool) { x -= wt; if (x <= 0) return k; } return pool[0][0]; };
  assert.deepEqual(draw(() => core.rngWeighted(mulberry32(9), pool), 1), draw(() => old(mulberry32(9)), 1));

  // wrapRng: delegates to the source, sub-streams are seeded once from it
  let n = 0;
  const wrapped = core.wrapRng(() => ((n += 0.137) % 1));
  assert.equal(wrapped(), 0.137);
  const s1 = draw(wrapped('x'), 3);
  assert.deepEqual(draw(wrapped('x'), 3), s1);
  assert.notDeepEqual(draw(wrapped('y'), 3), s1);
  assert.equal(typeof wrapped.int(1, 3), 'number');
  assert.deepEqual(draw(core.wrapRng(Math.random, 5)('x'), 3), draw(core.wrapRng(Math.random, 5)('x'), 3));
}

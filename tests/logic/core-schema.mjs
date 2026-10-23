// core/schema.js: spec forms, error paths, strict unknown fields, schema.extend.
import assert from 'node:assert/strict';
import { validate, validateFields, assertValid, createSchema } from '../../src/core/schema.js';

export default function () {
  const ok = (spec, v) => assert.deepEqual(validate(spec, v, 'p'), [], JSON.stringify(v));
  const bad = (spec, v, re) => { const e = validate(spec, v, 'p'); assert.ok(e.length && e.every((m) => m.startsWith('p')), `${JSON.stringify(v)} should fail`); if (re) assert.match(e.join('|'), re); };

  // scalars
  ok('string', 'a'); bad('string', ''); bad('string', 3);
  ok('number', 1.5); bad('number', NaN); bad('number', '1');
  ok('int', 3); bad('int', 3.5);
  ok('bool', false); bad('bool', 0);
  ok('id', 'seed_rice'); bad('id', 'Seed'); bad('id', '9a');
  ok('function', () => {}); bad('function', {});
  ok('any', 0); ok('null', null);
  ok({ type: 'int', min: 1, max: 3 }, 2); bad({ type: 'int', min: 1, max: 3 }, 4, /above 3/); bad({ type: 'int', min: 1 }, 0, /below 1/);
  ok({ type: 'string', pattern: '^a' }, 'abc'); bad({ type: 'string', pattern: '^a' }, 'xbc');
  bad('nope', 1, /unknown type/);

  // optional, nullable, undefined
  ok('int?', undefined); bad('int', undefined, /required/); bad('int?', null);
  ok({ type: 'int', nullable: true }, null);

  // enum, any
  ok({ enum: ['a', 'b'] }, 'a'); bad({ enum: ['a', 'b'] }, 'c', /one of "a", "b"/);
  ok({ any: ['string', 'int'] }, 4); bad({ any: ['string', 'int'] }, true);

  // arrays and tuples
  ok({ array: 'int' }, [1, 2]); bad({ array: 'int' }, [1, 'x'], /^p\[1\]/); bad({ array: 'int' }, 'x');
  bad({ array: 'int', minLen: 2 }, [1]); bad({ array: 'int', maxLen: 1 }, [1, 2]); bad({ array: 'int', len: 2 }, [1]);
  ok({ tuple: ['int', 'int'] }, [1, 2]); bad({ tuple: ['int', 'int'] }, [1]); bad({ tuple: ['int', 'int'] }, [1, 'x'], /^p\[1\]/);
  ok({ tuple: ['int', 'int'], ordered: true }, [1, 1]); bad({ tuple: ['int', 'int'], ordered: true }, [2, 1], /ascending/);

  // objects and maps
  const spec = { fields: { a: 'int', b: 'string?', c: { fields: { d: 'bool' } } } };
  ok(spec, { a: 1, c: { d: true } });
  bad(spec, { a: 1 }, /p\.c: required/);
  bad(spec, { a: 1, c: { d: 1 }, z: 1 }, /p\.c\.d.*p\.z: unknown field/);
  ok({ ...spec, open: true }, { a: 1, c: { d: true }, z: 1 });
  bad(spec, [], /expected an object/);
  ok({ map: 'int', keys: 'id' }, { a: 1, b: 2 }); bad({ map: 'int', keys: 'id' }, { A: 1 }, /\(key\)/); bad({ map: 'int' }, { a: 'x' }, /^p\.a/);

  // refs
  const refs = [];
  assert.deepEqual(validate({ ref: 'item' }, 'rice', 'p', { onRef: (d, id, path) => refs.push([d, id, path]) }), []);
  assert.deepEqual(refs, [['item', 'rice', 'p']]);
  assert.deepEqual(validate({ ref: 'item' }, 'rice', 'p', { ref: (d, id) => id === 'rice' }), []);
  assert.match(validate({ ref: 'item' }, 'xx', 'p', { ref: () => false })[0], /unknown item "xx"/);
  assert.deepEqual(validate({ ref: 'item' }, 'xx'), []);

  // custom type through env, assertValid
  assert.deepEqual(validate('icon', 'a:b', 'p', { types: { icon: (v) => /^\w+:\w+$/.test(v) || 'expected sheet:cell' } }), []);
  assert.throws(() => assertValid('int', 'x', 'p'), /p: expected an integer/);
  assert.deepEqual(validateFields({ a: 'int' }, { a: 1, b: 2 }, 'e', {}, true), []);
  assert.throws(() => validate(5, 1), /bad spec/);

  // schema instances
  const s = createSchema();
  s.define('fish', { name: 'string', sell: { type: 'int', min: 0 }, size: { tuple: ['int', 'int'], ordered: true }, rare: 'bool?' });
  assert.throws(() => s.define('fish', {}), /already defined/);
  assert.deepEqual(s.validate('fish', 'ayu', { name: 'Ayu', sell: 5, size: [10, 20] }), []);
  const errs = s.validate('fish', 'ayu', { name: 'Ayu', sell: -1, size: [20, 10], extra: 1 });
  assert.equal(errs.length, 3);
  assert.ok(errs.every((m) => m.startsWith('fish.ayu.')), errs.join('\n'));
  assert.match(s.validate('nope', 'x', {})[0], /unknown domain/);
  assert.ok(Object.isFrozen(s.baseFields('fish')) && Object.isFrozen(s.baseFields('fish').name));

  // extend: namespaced, optional, owner recorded, base untouched
  s.as('wp27').extend('fish', 'x_wp27_bait', 'string');
  assert.deepEqual(s.validate('fish', 'ayu', { name: 'Ayu', sell: 5, size: [10, 20] }), [], 'extension is optional');
  assert.deepEqual(s.validate('fish', 'ayu', { name: 'Ayu', sell: 5, size: [10, 20], x_wp27_bait: 'worm' }), []);
  assert.match(s.validate('fish', 'ayu', { name: 'Ayu', sell: 5, size: [10, 20], x_wp27_bait: 3 })[0], /x_wp27_bait/);
  assert.deepEqual(s.extensions('fish'), [{ domain: 'fish', field: 'x_wp27_bait', owner: 'wp27' }]);
  assert.throws(() => s.extend('fish', 'bait', 'string'), /must look like/);
  assert.throws(() => s.extend('fish', 'x_wp27_bait', 'string'), /already exists/);
  assert.throws(() => s.extend('fish', 'name', 'string'), /must look like/);
  assert.throws(() => s.extend('nope', 'x_wp1_a', 'int'), /unknown domain/);
  assert.deepEqual(Object.keys(s.fields('fish')), ['name', 'sell', 'size', 'rare', 'x_wp27_bait']);

  // custom type and open domains per instance
  s.type('icon', (v) => /^\w+:\w+$/.test(v) || 'expected sheet:cell');
  s.define('props', { icon: 'icon' }, { open: true });
  assert.deepEqual(s.validate('props', 'a', { icon: 'x:y', anything: 1 }), []);
  assert.match(s.validate('props', 'a', { icon: 'xy' })[0], /sheet:cell/);
  assert.throws(() => s.type('int', () => true), /already exists/);
}

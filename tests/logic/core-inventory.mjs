// core/inventory.js: quality keys, atomic takes, events, money; core/blobs.js: the memory blob store.
import assert from 'node:assert/strict';
import { createInventory, createMoney, itemKey, parseKey, MAX_QUALITY } from '../../src/core/inventory.js';
import { createMemoryBlobs, assertBlobStore, BLOB_METHODS } from '../../src/core/blobs.js';
import { readFixture } from '../lib/fixtures.mjs';

const bus = () => { const log = []; return { log, emit: (name, payload) => log.push([name, payload]) }; };

function keys() {
  assert.equal(itemKey('ayu'), 'ayu');
  assert.equal(itemKey('ayu', 1), 'ayu');
  assert.equal(itemKey('ayu', 2), 'ayu~2');
  assert.equal(itemKey('ayu', 3), 'ayu~3');
  assert.deepEqual(parseKey('ayu'), { id: 'ayu', quality: 1 });
  assert.deepEqual(parseKey('ayu~3'), { id: 'ayu', quality: 3 });
  assert.deepEqual(parseKey('seed_rice'), { id: 'seed_rice', quality: 1 });
  for (const odd of ['a~', 'a~x', 'a~1', 'a~0', 'a~2.5', '~2']) assert.deepEqual(parseKey(odd), { id: odd, quality: 1 }, odd);
  for (const q of [1, 2, 3, 4, MAX_QUALITY]) assert.deepEqual(parseKey(itemKey('prop_toro', q)), { id: 'prop_toro', quality: q });
}

function stock() {
  const b = bus();
  const inv = createInventory({ bus: b, keep: (id) => id === 'hoe' });
  inv.give('rice', 3);
  inv.give('rice', 2, { quality: 2, reason: 'harvest' });
  inv.give('rice', 1, { quality: 3 });
  assert.deepEqual(inv.serialize(), [['rice', 3], ['rice~2', 2], ['rice~3', 1]]);
  assert.equal(inv.count('rice'), 6);
  assert.equal(inv.count('rice', { minQ: 2 }), 3);
  assert.equal(inv.count('rice', { minQ: 3 }), 1);
  assert.equal(inv.count('tea'), 0);
  assert.deepEqual(b.log[0], ['itemGain', { item: 'rice', n: 3, reason: 'misc' }]);
  assert.deepEqual(b.log[1], ['itemGain', { item: 'rice', n: 2, reason: 'harvest' }]);

  // lowest star first, all or nothing
  b.log.length = 0;
  assert.equal(inv.take('rice', 4, { reason: 'sell' }), true);
  assert.deepEqual(inv.serialize(), [['rice~2', 1], ['rice~3', 1]]);
  assert.deepEqual(b.log, [['itemLoss', { item: 'rice', n: 4, reason: 'sell' }]]);
  b.log.length = 0;
  assert.equal(inv.take('rice', 3), false);
  assert.equal(inv.take('rice', 2, { minQ: 3 }), false);
  assert.equal(inv.take('tea'), false);
  assert.deepEqual(inv.serialize(), [['rice~2', 1], ['rice~3', 1]], 'a failed take changes nothing');
  assert.deepEqual(b.log, [], 'and emits nothing');
  assert.equal(inv.take('rice', 1, { minQ: 3 }), true);
  assert.deepEqual(inv.serialize(), [['rice~2', 1]]);
  assert.equal(inv.take('rice', 1), true);
  assert.deepEqual(inv.entries(), [], 'empty keys leave the map');

  // tools stay at zero, only at star 1
  inv.give('hoe');
  assert.equal(inv.take('hoe'), true);
  assert.deepEqual(inv.entries(), [['hoe', 0]]);
  assert.equal(inv.take('hoe'), false);
  assert.equal(inv.count('hoe'), 0);

  // bad amounts
  b.log.length = 0;
  assert.equal(inv.give('x', 0), 0);
  assert.equal(inv.give('x', -2), 0);
  assert.equal(inv.give('x', NaN), 0);
  assert.equal(inv.give('x', 2.9), 2);
  assert.equal(inv.take('x', 0), true);
  assert.equal(inv.take('x', -1), false);
  assert.equal(inv.count('x'), 2);
  assert.equal(inv.give('y', 1, { quality: 99 }), 1);
  assert.equal(inv.count('y', { minQ: MAX_QUALITY }), 1, 'quality is clamped');
  assert.equal(inv.give('y', 1, { quality: 0 }), 1);
  assert.equal(inv.count('y'), 2);
  assert.deepEqual(b.log.map((e) => e[0]), ['itemGain', 'itemGain', 'itemGain']);
}

function bulk() {
  const b = bus();
  const inv = createInventory({ bus: b });
  inv.giveAll({ wood: 4, rope: 1 }, 'gather');
  inv.give('wood', 2, { quality: 2 });
  assert.deepEqual(b.log.map((e) => e[1].reason), ['gather', 'gather', 'misc']);
  assert.equal(inv.has({ wood: 6, rope: 1 }), true);
  assert.equal(inv.has({ wood: 7 }), false);
  assert.equal(inv.has({ wood: 3 }, { minQ: 2 }), false);
  assert.equal(inv.has({}), true);
  b.log.length = 0;
  assert.equal(inv.takeAll({ wood: 7, rope: 1 }), false);
  assert.equal(inv.count('rope'), 1, 'takeAll is atomic');
  assert.deepEqual(b.log, []);
  assert.equal(inv.takeAll({ wood: 5, rope: 1 }, { reason: 'craft' }), true);
  assert.deepEqual(inv.serialize(), [['wood~2', 1]]);
  assert.deepEqual(b.log.map((e) => [e[0], e[1].item, e[1].n, e[1].reason]), [['itemLoss', 'wood', 5, 'craft'], ['itemLoss', 'rope', 1, 'craft']]);
  // without a bus nothing is emitted and nothing breaks
  const quiet = createInventory();
  quiet.give('a', 2); assert.equal(quiet.take('a', 2), true);
}

function persistence() {
  for (const f of ['save-v3-fresh.json', 'save-v3-mid.json', 'save-v3-ebisu.json']) {
    const saved = readFixture(f).inv;
    const inv = createInventory({ keep: (id) => ['hand', 'hoe', 'can', 'rod'].includes(id) });
    inv.load(saved);
    assert.deepEqual(inv.serialize(), saved, `${f}: old inventories load unchanged`);
    assert.equal(inv.count('hoe'), 1);
  }
  const inv = createInventory();
  inv.load([['a', 1], ['b', 0], ['c', -1], ['d', 1.5], [5, 1], ['e~2', 3]]);
  assert.deepEqual(inv.serialize(), [['a', 1], ['e~2', 3]]);
  inv.load(null);
  assert.deepEqual(inv.serialize(), []);
  // the Map is shared: game.inv can alias it, and outside writes are seen
  const m = new Map([['rice', 2]]);
  const shared = createInventory({ map: m });
  assert.equal(shared.map, m);
  m.set('rice~3', 1);
  assert.equal(shared.count('rice'), 3);
  shared.take('rice', 3);
  assert.equal(m.size, 0);
}

function money() {
  const b = bus();
  const m = createMoney({ bus: b, value: 120 });
  assert.equal(m.get(), 120);
  assert.equal(m.add(30, 'sell'), 150);
  assert.equal(m.spend(50, 'buy'), true);
  assert.equal(m.get(), 100);
  assert.equal(m.spend(101), false);
  assert.equal(m.get(), 100);
  assert.equal(m.spend(100), true);
  assert.equal(m.get(), 0);
  assert.deepEqual(b.log, [['moneyChange', { delta: 30, reason: 'sell' }], ['moneyChange', { delta: -50, reason: 'buy' }], ['moneyChange', { delta: -100, reason: 'misc' }]]);
  b.log.length = 0;
  m.add(0); m.spend(0);
  assert.deepEqual(b.log, [], 'no change, no event');
  assert.equal(m.add(5, { reason: 'r' }), 5);
  assert.equal(b.log[0][1].reason, 'r');
  assert.equal(m.set(77, 'load'), 77);
  assert.deepEqual(b.log[1], ['moneyChange', { delta: 72, reason: 'load' }]);
  for (const bad of [-1, NaN, Infinity, 'x']) {
    assert.throws(() => m.add(bad), RangeError);
    assert.throws(() => m.spend(bad), RangeError);
    assert.throws(() => m.set(bad), RangeError);
  }
  assert.equal(m.get(), 77);
  assert.equal(createMoney().get(), 0);
}

async function blobs() {
  let t = 100;
  const store = assertBlobStore(createMemoryBlobs({ now: () => t++ }));
  assert.deepEqual([...BLOB_METHODS], ['put', 'get', 'has', 'delete', 'list']);
  assert.throws(() => assertBlobStore({ put() {} }), /get/);
  assert.equal(await store.get('nope'), null, 'a missing blob is null, not an error');
  assert.equal(await store.has('nope'), false);
  assert.equal(await store.delete('nope'), false);
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await store.put('photo-b', bytes, { w: 4 });
  await store.put('photo-a', 'hello', { w: 5 });
  await store.put('photo-c', new Blob(['abc']));
  const got = await store.get('photo-b');
  assert.deepEqual([got.id, got.size, got.meta, got.at], ['photo-b', 4, { w: 4 }, 100]);
  assert.equal(got.data, bytes);
  got.meta.w = 99;
  assert.deepEqual((await store.get('photo-b')).meta, { w: 4 }, 'metadata is copied');
  assert.deepEqual((await store.list()).map((b) => [b.id, b.size]), [['photo-b', 4], ['photo-a', 5], ['photo-c', 3]], 'oldest first');
  assert.ok(!('data' in (await store.list())[0]), 'listing carries no payload');
  await store.put('photo-b', new Uint8Array(9));
  assert.equal((await store.get('photo-b')).size, 9, 'put replaces');
  assert.equal(await store.delete('photo-a'), true);
  assert.equal(await store.has('photo-a'), false);
  assert.deepEqual((await store.list()).map((b) => b.id), ['photo-c', 'photo-b']);
  await assert.rejects(store.put('', 'x'), /id/);
  // same instant: ties by id
  const tie = createMemoryBlobs();
  await tie.put('b', 'x'); await tie.put('a', 'y');
  assert.deepEqual((await tie.list()).map((b) => b.id), ['a', 'b']);
}

export default async function () {
  keys();
  stock();
  bulk();
  persistence();
  money();
  await blobs();
}

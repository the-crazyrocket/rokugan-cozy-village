// core/bus.js and core/events.js: ordering, isolation, strict mode, away, filters, scoping.
import assert from 'node:assert/strict';
import { createBus, PRIO } from '../../src/core/bus.js';
import { EVENTS } from '../../src/core/events.js';
import { validateFields } from '../../src/core/schema.js';

const SAMPLES = {
  harvest: { crop: 'rice', n: 2, quality: 1, x: 3, z: 4, via: 'hand' },
  cropRipe: { crop: 'rice', x: 1, z: 2 },
  catch: { kind: 'fish', id: 'ayu', size: 20, water: 'fresh', spot: { x: 1, z: 2 }, bait: null, first: true, via: 'rod' },
  forage: { item: 'warabi', n: 1, x: 1, z: 2, first: false },
  place: { prop: 'crate', id: 4, x: 1, z: 2, rot: 0, via: 'build' },
  remove: { prop: 'crate', id: 4, x: 1, z: 2, to: 'bag' },
  craft: { recipe: 'plank', bench: null, made: { plank: 2 }, used: { wood: 1 } },
  cook: { dish: 'onigiri', ingredients: ['rice'], discovered: true, quality: 2 },
  visit: { visitor: 'crane', phase: 'arrive', x: 1, z: 2, gifts: { rice: 1 } },
  gift: { to: 'hana', item: 'tea', reaction: 'love', hearts: 2 },
  wake: { fortune: 'ebisu' },
  projectDone: { project: 'bamboo_grove', doneAt: 5, unlocks: [{ type: 'prop', id: 'bamboo' }] },
  dayChange: { day: 20000, prev: 19999, skipped: 0 },
  seasonChange: { season: 'spring', prev: 'winter', year: 2026 },
  itemGain: { item: 'rice', n: 1 },
  itemLoss: { item: 'rice', n: 1, reason: 'sell' },
  moneyChange: { delta: -5, reason: 'buy' },
  sell: { item: 'rice', n: 1, total: 8 },
  buy: { item: 'seed_rice', n: 1, total: 8 },
  requestClaimed: { index: 0, kind: 'harvest', reward: 45, gift: null },
  offer: { fortune: 'ebisu', offering: 'first', gave: { rice: 2 } },
  terraform: { x: 1, z: 2, from: { kind: 1, height: 0, water: 0 }, to: { kind: 1, height: 1, water: 0 }, kind: 'raise', by: 'player' },
  waterChange: { rect: { x: 1, z: 2, w: 3, h: 4 } },
  mail: { from: 'hana', id: 'm1' },
  trapReady: { id: 3 },
  saveFailed: { reason: 'quota' },
  projectWaiting: { project: 'bamboo_grove', why: 'needs wood' },
  say: { text: 'hi' },
  sfx: { name: 'pop' },
  fx: { kind: 'burst', x: 1, y: 0, z: 2 },
  invalidate: { what: 'veg' },
  buildMode: { on: true },
  haptic: { ms: 12 },
  bubble: { text: '!' },
  playerMove: { manual: false },
  arrive: { action: { kind: 'harvest', t: { x: 1, z: 2 } } },
  openSheet: { name: 'shop' },
  floatLabel: { text: 'Soft grass', x: 1, z: 2 },
  queueChange: {},
  buildSelect: { index: 2 },
};

export default function () {
  // every declared event has a valid sample, every sample names a declared event, and a bad field is caught
  assert.deepEqual(Object.keys(EVENTS).sort(), Object.keys(SAMPLES).sort());
  for (const [name, p] of Object.entries(SAMPLES)) {
    assert.deepEqual(validateFields(EVENTS[name], p, name), [], name);
    assert.ok(validateFields(EVENTS[name], { ...p, bogus: 1 }, name).length, `${name} rejects unknown fields`);
  }
  assert.ok(Object.isFrozen(EVENTS));

  // ordering: priority desc, then registration; bands settle state before view
  const bus = createBus({ strict: true, now: () => 42 });
  const log = [];
  bus.on('wake', () => log.push('view'), { priority: PRIO.VIEW });
  bus.on('wake', () => log.push('game-a'));
  bus.on('wake', () => log.push('state'), { priority: PRIO.STATE });
  bus.on('wake', () => log.push('game-b'));
  bus.onAny(() => log.push('any'), { priority: PRIO.GAME });
  const payload = { fortune: 'ebisu' };
  assert.equal(bus.emit('wake', payload), payload);
  assert.deepEqual(log, ['state', 'game-a', 'game-b', 'any', 'view']);

  // meta, once, off, handlers added or removed mid-emit
  const b = createBus({ strict: true, now: () => 7 });
  const metas = [];
  const off = b.on('wake', (p, m) => metas.push(m));
  b.once('wake', () => metas.push('once'));
  b.emit('wake', { fortune: 'a' }); b.emit('wake', { fortune: 'b' });
  assert.deepEqual(metas.map((m) => (m === 'once' ? m : [m.name, m.at, m.away, m.seq])), [['wake', 7, false, 1], 'once', ['wake', 7, false, 2]]);
  off(); b.emit('wake', { fortune: 'c' }); assert.equal(metas.length, 3);
  const seen = [];
  let killB;
  b.on('wake', () => { seen.push('a'); killB(); b.on('wake', () => seen.push('late')); }, { priority: 80 });
  killB = b.on('wake', () => seen.push('b'));
  b.emit('wake', { fortune: 'd' });
  assert.deepEqual(seen, ['a']);
  b.emit('wake', { fortune: 'e' });
  assert.deepEqual(seen, ['a', 'a', 'late']);

  // away flag reaches meta
  const a = createBus({ strict: true });
  const flags = [];
  a.on('wake', (p, m) => flags.push(m.away));
  a.emit('wake', { fortune: 'x' }); a.setAway(true); a.emit('wake', { fortune: 'x' }); a.setAway(false); a.emit('wake', { fortune: 'x' });
  assert.deepEqual(flags, [false, true, false]);

  // strict: unknown event, bad payload, handler error all throw and the bus recovers
  const s = createBus({ strict: true });
  assert.throws(() => s.emit('nope'), /unknown event 'nope'/);
  assert.throws(() => s.emit('wake', { fortune: 3 }), /bad payload for 'wake'.*event\.wake\.fortune/);
  assert.throws(() => s.emit('wake', {}), /fortune: required/);
  s.on('wake', () => { throw new Error('boom'); });
  assert.throws(() => s.emit('wake', { fortune: 'x' }), /boom/);
  const s2 = createBus({ strict: true });
  s2.on('wake', () => {});
  s2.emit('wake', { fortune: 'x' });

  // non-strict: handler errors are isolated and reported, unknown events pass, no validation
  const errors = [];
  const n = createBus({ onError: (e, entry, meta) => errors.push([e.message, entry.owner, meta.name]) });
  const got = [];
  n.as('wpA').on('wake', () => { throw new Error('boom'); });
  n.on('wake', () => got.push('after'), { priority: 1 });
  n.emit('wake', { fortune: 5 });
  assert.deepEqual(got, ['after']);
  assert.deepEqual(errors, [['boom', 'wpA', 'wake']]);
  n.emit('anything'); 

  // re-entrancy cap at 8
  const r = createBus({ strict: true });
  let depth = 0;
  r.on('wake', () => { depth++; r.emit('wake', { fortune: 'x' }); });
  assert.throws(() => r.emit('wake', { fortune: 'x' }), /8 levels deep/);
  assert.equal(depth, 8);
  r.on('wake', () => {}, { priority: 1 });
  const soft = createBus({ onError: (e) => errors.push(e.message) });
  let d2 = 0;
  soft.on('wake', () => { d2++; soft.emit('wake', {}); });
  soft.emit('wake', {});
  assert.equal(d2, 8);
  assert.match(errors.at(-1), /levels deep/);
  const ok = createBus({ strict: true });
  ok.on('wake', () => {});
  ok.emit('wake', { fortune: 'again' });

  // private events: declare, duplicates, owners
  const p = createBus({ strict: true });
  const wp = p.as('wp27');
  wp.declare('wp27.bite', { fish: 'id' });
  wp.declare('wp27.bite', { fish: 'id' });
  assert.throws(() => p.declare('wp27.bite', { fish: 'string' }), /already declared by wp27/);
  assert.throws(() => p.declare('wake', {}), /already declared/);
  const bites = [];
  wp.on('wp27.bite', (x) => bites.push(x.fish));
  p.emit('wp27.bite', { fish: 'ayu' });
  assert.deepEqual(bites, ['ayu']);
  assert.throws(() => p.emit('wp27.bite', { fish: 'ayu', extra: 1 }), /unknown field/);
  p.on('wp27.typo', () => {});
  assert.deepEqual(p.undeclared(), ['wp27.typo']);
  assert.deepEqual(p.list().filter((e) => e.owner === 'wp27'), [{ name: 'wp27.bite', priority: 50, owner: 'wp27', kind: 'on' }]);
  p.removeOwner('wp27');
  p.emit('wp27.bite', { fish: 'ayu' });
  assert.deepEqual(bites, ['ayu']);

  // filters: ordered, return undefined keeps the value, errors isolated
  const f = createBus();
  f.filter('fish.window', (v) => v * 2, { priority: 60 });
  f.filter('fish.window', (v, pl) => v + pl.bonus);
  f.filter('fish.window', () => undefined, { priority: 10 });
  assert.equal(f.apply('fish.window', 10, { bonus: 5 }), 25);
  assert.equal(f.apply('other', 3), 3);
  const offF = f.as('wpZ').filter('fish.window', () => 0, { priority: 99 });
  assert.equal(f.apply('fish.window', 10, { bonus: 5 }), 5);
  offF();
  assert.equal(f.apply('fish.window', 10, { bonus: 5 }), 25);
}

// The daily-group systems (daily, requests, market, forage, stats) on a strict core: the roll and its contributors, requests from events,
// handing in, selling and buying, picking wild greens, the counters, and the order of everything they emit.
import assert from 'node:assert/strict';
import { stubCore } from '../lib/stub.mjs';
import { dayKeys } from '../lib/golden-data.mjs';
import { defineSystem } from '../../src/core/system.js';
import { PRIO } from '../../src/core/bus.js';
import { hashString, mulberry32 } from '../../src/core/rng.js';
import { dailyView } from '../../src/game/daily.js';
import { drawTools } from '../../src/systems/daily.js';
import { DEMAND_BONUS, SPECIAL_DISCOUNT, SELLABLE_KINDS } from '../../src/systems/market.js';
import { ITEMS } from '../../src/game/data.js';

const same = (a, b, msg = 'same') => assert.deepEqual(a, b, msg);

function boot(opts) {
  const core = stubCore(opts);
  const log = [];
  core.bus.onAny((payload, m) => log.push([m.name, payload]), { priority: PRIO.STATE + 5 });
  const flush = () => log.splice(0).map(([n, p]) => (n === 'say' ? `say:${p.text}` : n === 'sfx' ? `sfx:${p.name}` : n === 'haptic' ? `haptic:${p.ms}` : n === 'invalidate' ? `inv:${p.what}` : n === 'itemGain' || n === 'itemLoss' ? `${n}:${p.item}x${p.n}` : n === 'moneyChange' ? `money:${p.delta}` : n === 'fx' ? `fx:${p.opts.n}` : n === 'sell' || n === 'buy' ? `${n}:${p.item}x${p.n}=${p.total}` : n));
  const day = core.use('daily');
  day.ensure();
  flush();
  return { core, stub: core.stub, log, flush, day, req: core.use('requests'), mk: core.use('market'), fg: core.use('forage'), st: core.use('stats'), view: dailyView(core) };
}

/** Three known requests on today's state: a harvest, a delivery and a forage, nothing claimed. */
function fixed(t, extra = {}) {
  const base = { have: 0, claimed: false };
  t.day.state.requests = [
    { ...base, kind: 'harvest', item: 'rice', n: 2, value: 40, reward: 70, ...extra },
    { ...base, kind: 'deliver', item: 'rice', n: 1, value: 20, reward: 45, bonus: { item: 'seed_tea', n: 2 } },
    { ...base, kind: 'forage', item: 'forage', n: 1, value: 18, reward: 40 },
  ];
  t.day.state.gift = null;
  return t.day.state.requests;
}

function roll() {
  const t = boot();
  const s = t.day.state;
  same(Object.keys(s), ['key', 'requests', 'demand', 'specials', 'forage', 'seen', 'gift'], 'the v3 shape, in order');
  assert.equal(s.requests.length, 3);
  assert.ok(s.forage.length > 0 && s.forage.every((f) => f.taken === false));
  same(t.day.roll(s.key), s, 'a roll is a function of the date');
  assert.equal(t.day.ensure(), false, 'the same day does not roll again');
  assert.equal(t.view.key, s.key);

  // the demand is something sellable and unlocked, the specials are two decorations
  assert.ok(SELLABLE_KINDS.has(ITEMS[s.demand].kind) && !ITEMS[s.demand].unlock);
  assert.ok(s.specials.length === 2 && s.specials.every((id) => ITEMS[id].kind === 'prop'));
  // a Fortune that is awake adds its items to what can be in demand over the 30 golden days
  const asleep = new Set(), awake = new Set();
  for (const k of dayKeys()) { asleep.add(boot().day.roll(k).demand); awake.add(boot({ awake: ['ebisu'] }).day.roll(k).demand); }
  assert.ok([...asleep].every((id) => !ITEMS[id].unlock), 'asleep: nothing locked in demand');
  assert.ok([...awake].some((id) => ITEMS[id].unlock === 'ebisu'), 'awake: Ebisu\'s fish can be in demand');

  // load and serialize keep the state, a damaged one is dropped
  const a = boot();
  a.day.load(null); assert.equal(a.day.state, null);
  a.day.load({ key: 'x' }); assert.equal(a.day.state, null);
  a.day.load(s); assert.equal(a.day.serialize(), s);

  // the day changes with the clock
  let ms = Date.UTC(2026, 0, 1, 12);
  const b = boot({ now: () => ms });
  const k0 = b.day.key;
  assert.equal(b.day.poll(), false);
  assert.deepEqual(b.flush(), []);
  ms += 24 * 3600e3;
  assert.equal(b.day.poll(), true);
  assert.notEqual(b.day.key, k0);
  same(b.flush(), ['inv:veg', 'say:A new day in the village. Hana has fresh requests.', 'sfx:ready', 'inv:ui']);
}

function contributors() {
  // a base contributor draws from the shared stream after the three base ones; a plain one gets a stream of its own
  const seen = [];
  const extra = (id, order, base) => defineSystem({
    name: id, init(ctx) { ctx.daily.contribute({ id, order, base, roll(rnd, c, draw) { seen.push([id, typeof draw.shuffle]); return { [id]: rnd() }; } }); },
  });
  const plain = boot({ systems: [extra('mail', 40, false)] });
  const s = plain.day.state;
  same(Object.keys(s).slice(-3), ['seen', 'gift', 'ext'], 'ext comes last');
  assert.equal(typeof s.ext.mail.mail, 'number');
  same(seen, [['mail', 'function']]);
  const bare = boot();
  for (const k of ['requests', 'demand', 'specials', 'forage']) same(s[k], bare.day.state[k], `a contributor with its own stream does not move ${k}`);
  assert.equal('ext' in bare.day.state, false, 'no contributors, no ext');
  same(plain.day.roll(s.key).ext, s.ext, 'its stream depends on the day only');
  const other = plain.day.roll('2030-01-01').ext;
  assert.notDeepEqual(other, s.ext);

  // a base contributor after forage shares the stream and so moves nothing before it
  const late = boot({ systems: [extra('lateral', 50, true)] });
  same(late.day.state.requests, bare.day.state.requests);
  assert.equal(typeof late.day.state.lateral, 'number');

  // the draw tools are the old int / pick / shuffle
  const d = drawTools(mulberry32(7)), r = mulberry32(7);
  assert.equal(d.int(10), Math.floor(r() * 10));
  assert.equal(d.pick(['a', 'b', 'c']), ['a', 'b', 'c'][Math.floor(r() * 3)]);
  const list = [1, 2, 3, 4];
  const out = d.shuffle(list);
  assert.deepEqual(list, [1, 2, 3, 4], 'shuffle copies');
  const q = list.slice();
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  same(out, q);

  // the registry lists base contributors in today's order
  same(bare.core.daily.all().map((c) => [c.id, c.order, !!c.base]), [['requests', 10, true], ['market', 20, true], ['forage', 30, true]]);
}

function requestsFromEvents() {
  const t = boot();
  const rs = fixed(t);
  const emit = (name, p) => t.core.bus.emit(name, p);
  const harvest = (n, crop = 'rice') => emit('harvest', { crop, n, quality: 1, x: 1, z: 1, via: 'hand' });

  harvest(1, 'daikon');
  assert.equal(rs[0].have, 0, 'another crop does not count');
  same(t.flush(), ['harvest']);
  harvest(1);
  assert.equal(rs[0].have, 1);
  same(t.flush(), ['harvest']);
  harvest(5);
  assert.equal(rs[0].have, 2, 'capped at the request');
  same(t.flush(), ['harvest', 'say:Request ready: Harvest 2 rice', 'sfx:ready', 'inv:ui']);
  harvest(1);
  assert.equal(rs[0].have, 2);
  same(t.flush(), ['harvest'], 'a finished request is not announced twice');

  // catches: only fish, and only the ones the request asks for
  const fish = (id, kind = 'fish') => emit('catch', { kind, id, size: 20, water: 'fresh', spot: { x: 1, z: 1 }, bait: null, first: false, via: 'rod' });
  rs[0] = { kind: 'catch', item: 'sea', n: 1, have: 0, claimed: false, value: 90, reward: 150 };
  fish('ayu'); assert.equal(rs[0].have, 0, 'a river fish is not a sea fish');
  fish('tai', 'bug'); assert.equal(rs[0].have, 0, 'a bug is not a fish');
  t.flush();
  fish('tai');
  assert.equal(rs[0].have, 1);
  same(t.flush(), ['catch', 'say:Request ready: Catch 1 sea fish', 'sfx:ready', 'inv:ui']);
  rs[0] = { kind: 'catch', item: 'koi', n: 1, have: 0, claimed: false, value: 65, reward: 100 };
  fish('tai'); assert.equal(rs[0].have, 0); fish('koi'); assert.equal(rs[0].have, 1);
  t.flush();

  // forage; deliveries are counted from the bag, not from events
  emit('forage', { item: 'warabi', n: 1, x: 2, z: 2, first: true });
  assert.equal(rs[2].have, 1);
  same(t.flush(), ['forage', 'say:Request ready: Find 1 wild greens', 'sfx:ready', 'inv:ui']);
  assert.equal(rs[1].have, 0);
  assert.deepEqual([t.req.progress(rs[1]), t.req.ready(rs[1])], [0, false]);
  t.core.inv.give('rice', 3);
  assert.deepEqual([t.req.progress(rs[1]), t.req.ready(rs[1])], [1, true], 'progress is capped at n');
  assert.equal(t.req.claimable(), 3, 'the koi, the delivery and the forage');
  t.flush();

  // two at once read as a plural
  const t2 = boot();
  fixed(t2);
  t2.day.state.requests[0] = { kind: 'forage', item: 'forage', n: 1, have: 0, claimed: false, value: 18, reward: 40 };
  t2.flush();
  t2.core.bus.emit('forage', { item: 'warabi', n: 1, x: 2, z: 2, first: true });
  same(t2.flush(), ['forage', 'say:Requests ready to hand in!', 'sfx:ready', 'inv:ui']);

  // descriptions
  const d = (r) => t.req.describe(r);
  same(d({ kind: 'harvest', item: 'daikon', n: 5 }), { text: 'Harvest 5 daikon', icon: ITEMS.daikon.icon });
  same(d({ kind: 'catch', item: 'fresh', n: 3 }), { text: 'Catch 3 river or pond fish', icon: 'icons:ayu' });
  same(d({ kind: 'catch', item: 'any', n: 1 }).text, 'Catch a fish');
  same(d({ kind: 'deliver', item: 'ayu', n: 1 }).text, 'Bring Hana an ayu'.replace('an ayu', `a ${ITEMS.ayu.name.toLowerCase()}`));
  same(d({ kind: 'deliver', item: 'rice', n: 3 }).text, 'Bring Hana 3 rice');
  same(d({ kind: 'deliver', item: 'rice', n: 1 }).text, 'Bring Hana rice', 'produce has no article');
  same(d({ kind: 'forage', item: 'forage', n: 3 }), { text: 'Find 3 wild greens', icon: 'vegetation:fern' });
}

function claiming() {
  const t = boot();
  const rs = fixed(t);
  t.core.inv.give('rice', 1);
  t.core.money.set(100);
  t.flush();
  assert.equal(t.req.claim(0), null, 'not ready');
  assert.equal(t.req.claim(7), null, 'no such request');
  same(t.flush(), []);

  const res = t.req.claim(1);
  same(res, { reward: 45, bonus: { item: 'seed_tea', n: 2 }, gift: null });
  same(t.flush(), ['itemLoss:ricex1', 'inv:ui', 'money:45', 'itemGain:seed_teax2', 'inv:ui', 'sfx:claim', 'haptic:25', 'say:Hana thanks you: 45 koku + 2 tea seeds!', 'requestClaimed', 'inv:ui']);
  assert.deepEqual([t.core.money.get(), t.core.inv.count('rice'), t.core.inv.count('seed_tea'), rs[1].claimed], [145, 0, 2, true]);
  assert.deepEqual([t.st.data.requests, t.st.data.earned], [1, 45], 'the stats count the claim');
  assert.equal(t.req.claim(1), null, 'only once');

  // the last one hands out the gift
  rs[0].have = 2; rs[2].have = 1;
  t.req.claim(0); t.flush();
  const last = t.req.claim(2);
  const gift = ['prop_toro', 'prop_sakura', 'prop_pine', 'prop_bamboo', 'prop_well'][hashString(t.day.state.key + 'gift') % 5];
  assert.equal(last.gift, gift);
  assert.equal(t.day.state.gift, gift);
  assert.equal(t.core.inv.count(gift), 1);
  same(t.flush(), ['money:40', `itemGain:${gift}x1`, 'inv:ui', 'sfx:fanfare', 'haptic:25', 'say:Hana thanks you: 40 koku!', `say:All done for today! Hana gives you a ${ITEMS[gift].name.toLowerCase()}.`, 'requestClaimed', 'inv:ui']);
  assert.deepEqual([t.st.data.requests, t.st.data.earned], [3, 155]);
  const ev = t.core.bus.on('requestClaimed', () => {}); ev();
  assert.equal(t.day.state.requests.every((r) => r.claimed), true);

  // the facade names: requestsDone is announce, claimRequest is claim
  same(Object.keys(t.core.systems.get('requests').spec.facade), ['requestsDone', 'claimRequest']);
}

function market() {
  const t = boot();
  const s = t.day.state;
  const plain = Object.keys(ITEMS).find((id) => ITEMS[id].sell && id !== s.demand && SELLABLE_KINDS.has(ITEMS[id].kind));
  assert.equal(t.mk.sellPrice(plain), ITEMS[plain].sell);
  assert.equal(t.mk.sellPrice(s.demand), Math.round(ITEMS[s.demand].sell * DEMAND_BONUS));
  const [sp] = s.specials, full = Object.keys(ITEMS).find((id) => ITEMS[id].kind === 'prop' && !s.specials.includes(id));
  assert.equal(t.mk.buyPrice(sp), Math.round(ITEMS[sp].buy * SPECIAL_DISCOUNT));
  assert.equal(t.mk.buyPrice(full), ITEMS[full].buy);
  assert.equal(t.view.sellPrice(plain), t.mk.sellPrice(plain));

  // selling one kind
  t.core.inv.give(plain, 3); t.core.money.set(10); t.flush();
  t.mk.sell(plain, 2);
  const total = ITEMS[plain].sell * 2;
  same(t.flush(), [`itemLoss:${plain}x2`, 'inv:ui', `money:${total}`, `sell:${plain}x2=${total}`, 'sfx:coin', `say:Sold 2 ${ITEMS[plain].name.toLowerCase()} for ${total} koku.`]);
  assert.deepEqual([t.core.money.get(), t.core.inv.count(plain), t.st.data.earned], [10 + total, 1, total]);
  t.mk.sell(plain);
  assert.equal(t.core.inv.count(plain), 0, 'everything by default');
  t.flush();
  t.mk.sell(plain);
  t.mk.sell('hand', 1);
  same(t.flush(), [], 'nothing to sell');

  // sell all: sellables only, one coin, one toast, each kind a `sell`
  t.core.inv.give(s.demand, 2); t.core.inv.give(plain, 1); t.core.inv.give('prop_toro', 1); t.core.inv.give('hoe', 0);
  t.core.money.set(0); t.st.data.earned = 0; t.flush();
  t.mk.sellAll();
  const sum = t.mk.sellPrice(s.demand) * 2 + ITEMS[plain].sell;
  assert.equal(t.core.money.get(), sum);
  assert.equal(t.st.data.earned, sum);
  assert.equal(t.core.inv.count('prop_toro'), 1, 'decor stays');
  const out = t.flush();
  assert.equal(out.at(-1), `say:Sold the harvest for ${sum} koku!`);
  assert.equal(out.at(-2), 'sfx:coin');
  assert.equal(out.filter((e) => e.startsWith('sell:')).length, 2);
  t.mk.sellAll();
  same(t.flush(), ['say:Nothing to sell yet.']);

  // buying
  t.core.money.set(5); t.flush();
  t.mk.buy(full);
  same(t.flush(), ['say:Not enough koku.']);
  assert.deepEqual([t.core.money.get(), t.core.inv.count(full)], [5, 0]);
  t.core.money.set(1000); t.flush();
  const price = t.mk.buyPrice(full);
  t.mk.buy(full);
  same(t.flush(), [`money:${-price}`, `itemGain:${full}x1`, 'inv:ui', `buy:${full}x1=${price}`, 'sfx:coin', `say:Bought ${ITEMS[full].name.toLowerCase()}.`]);
  assert.equal(t.core.money.get(), 1000 - price);

  // Hana's tile
  assert.equal(t.mk.isMerchant(3, 4), false);
  t.mk.cell = { x: 3, z: 4 };
  assert.deepEqual([t.mk.isMerchant(3, 4), t.mk.isMerchant(4, 3)], [true, false]);
  assert.equal(t.mk.cell.z, 4);
}

function forage() {
  const t = boot();
  const f = t.day.state.forage, w = t.stub.world;
  assert.ok(f.length <= 6 && f.length >= 4);
  assert.ok(f.every((g) => w.isLand(g.x, g.z) && g.x > 0 && g.z > 0 && g.x < w.w - 1 && g.z < w.h - 1));
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) assert.ok(Math.max(Math.abs(f[i].x - f[j].x), Math.abs(f[i].z - f[j].z)) >= 3, 'kept apart');
  same(f.map((g) => g.item), f.map((_, k) => (k % 2 ? 'warabi' : 'wildflower')));
  assert.equal(t.fg.left(), f.length);
  assert.equal(t.view.forageLeft(), f.length);

  // something built or dug on the spot hides it; a crop or Hana or a blocked neighbourhood keeps greens from spawning there
  const g = f[0];
  assert.equal(t.fg.at(g.x, g.z), g);
  w.set(g.x, g.z, 2); // soil
  assert.equal(t.fg.at(g.x, g.z), null);
  assert.equal(t.fg.left(), f.length - 1);
  w.set(g.x, g.z, 1);
  assert.equal(t.fg.at(g.x, g.z), g);
  assert.equal(t.fg.at(g.x + 20, g.z), null);
  assert.equal(t.fg.canGrow(g.x, g.z), true);
  t.mk.cell = { x: g.x, z: g.z };
  assert.equal(t.fg.canGrow(g.x, g.z), false, 'not where Hana stands');
  t.mk.cell = null;
  const crop = boot({ crops: new Set([g.z * w.w + g.x]) });
  assert.equal(crop.fg.canGrow(g.x, g.z), false, 'not on a crop');
  const boxed = boot({ walkable: () => false });
  assert.equal(boxed.fg.canGrow(g.x, g.z), false, 'needs somewhere to stand next to it');
  assert.equal(boxed.day.state.forage.length, 0);

  // picking
  const first = t.fg.at(f[1].x, f[1].z) === f[1] ? f[1] : null;
  assert.ok(first);
  const events = [];
  t.core.bus.on('forage', (p) => events.push(p));
  t.fg.pick(first.x, first.z);
  same(t.flush(), ['itemGain:warabix1', 'inv:ui', 'sfx:forage', 'haptic:10', 'fx:14', 'inv:veg', `say:Found ${ITEMS.warabi.name.toLowerCase()}!`, 'forage']);
  same(events, [{ item: 'warabi', n: 1, x: first.x, z: first.z, first: true }]);
  assert.deepEqual([first.taken, t.core.inv.count('warabi'), t.stub.swings.n], [true, 1, 1]);
  assert.deepEqual([t.st.data.foraged, t.fg.left()], [{ warabi: 1 }, f.length - 1]);
  t.fg.pick(first.x, first.z);
  same(t.flush(), [], 'taken is taken');

  // the second warabi is not a first, and it is the one that completes the request (announced after "Found")
  const rs = fixed(t);
  const other = f.find((x) => x.item === 'warabi' && !x.taken);
  assert.ok(other);
  t.flush();
  t.fg.pick(other.x, other.z);
  assert.equal(events.at(-1).first, false);
  assert.equal(rs[2].have, 1);
  assert.deepEqual(t.flush().slice(-5), [`say:Found ${ITEMS.warabi.name.toLowerCase()}!`, 'forage', 'say:Request ready: Find 1 wild greens', 'sfx:ready', 'inv:ui']);
  const wf = f.find((x) => x.item === 'wildflower' && !x.taken);
  t.fg.pick(wf.x, wf.z);
  assert.equal(events.at(-1).first, true);
  assert.deepEqual(t.flush().slice(-2), [`say:Found ${ITEMS.wildflower.name.toLowerCase()}!`, 'forage'], 'the request was already done');
}

function stats() {
  const t = boot();
  const d = t.st.data;
  same(d, { harvested: {}, caught: {}, foraged: {}, requests: 0, earned: 0 });
  t.core.bus.emit('harvest', { crop: 'rice', n: 3, quality: 1, x: 1, z: 1, via: 'hand' });
  t.core.bus.emit('harvest', { crop: 'rice', n: 2, quality: 1, x: 1, z: 1, via: 'sweep' });
  t.core.bus.emit('harvest', { crop: 'tea', n: 1, quality: 2, x: 1, z: 1, via: 'hand', giant: true });
  t.core.bus.emit('forage', { item: 'warabi', n: 1, x: 1, z: 1, first: true });
  same(t.st.data.harvested, { rice: 5, tea: 1 });
  same(t.st.data.foraged, { warabi: 1 });
  t.st.bump('caught', 'ayu'); t.st.bump('caught', 'ayu', 2);
  assert.equal(t.st.get('caught', 'ayu'), 3);
  assert.equal(t.st.get('caught', 'koi'), 0);

  // Game swaps the whole object on load and keeps a table of its own inside it
  const shared = { koi: 2 };
  t.st.data = { ...t.st.data, caught: shared };
  t.st.bump('caught', 'koi');
  assert.equal(shared.koi, 3);
  t.core.bus.emit('sell', { item: 'rice', n: 1, total: 30 });
  t.core.bus.emit('buy', { item: 'rice', n: 1, total: 30 });
  assert.equal(t.st.data.earned, 30, 'buying is not earning');
  // a catch is counted by the fishing system, not here
  t.core.bus.emit('catch', { kind: 'fish', id: 'ayu', size: 1, water: 'fresh', spot: { x: 1, z: 1 }, bait: null, first: true, via: 'rod' });
  assert.equal(t.st.get('caught', 'ayu'), 0);
}

function view() {
  // the old Daily surface over the systems
  const t = boot();
  assert.equal(t.view.state, t.day.state);
  const s = t.day.state;
  t.view.state = null;
  assert.equal(t.day.state, null);
  t.view.state = s;
  const rs = fixed(t);
  assert.equal(t.view.note('harvest', 'rice', 2).length, 1);
  assert.equal(rs[0].have, 2);
  assert.equal(t.view.ready(rs[0]), true);
  assert.equal(t.view.progress(rs[0]), 2);
  assert.equal(t.view.claimable(), 1);
  assert.equal(t.view.describe(rs[0]).text, 'Harvest 2 rice');
  assert.equal(t.view.forageAt(s.forage[0].x, s.forage[0].z), s.forage[0]);
  assert.equal(t.view.visibleForage().length, s.forage.length);
  assert.equal(t.view.ensure(), false);
  same(t.view.serialize(), s);
  t.view.load(s);
  assert.equal(typeof t.view.poll, 'function');
}

export default function () {
  roll();
  contributors();
  requestsFromEvents();
  claiming();
  market();
  forage();
  stats();
  view();
}

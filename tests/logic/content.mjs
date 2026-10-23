// Content contracts: the 16 schemas, the base content moved out of data.js, shared ids, validateAll in both modes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { content, schema, LANDMARKS, FORTUNE_ORDER } from '../../src/content/index.js';
import { createContent, DOMAINS } from '../../src/core/content.js';
import { deriveItems } from '../../src/core/content-check.js';
import { BLOCKOUTS } from '../../src/assets/blockouts.js';
import { SHEETS } from '../../src/assets/sheets.js';
import { TREE_CANOPIES } from '../../src/assets/blockouts/base/canopies.js';
import { readGolden } from '../lib/fixtures.mjs';

const IDS = JSON.parse(fs.readFileSync(new URL('../../docs/IDS.json', import.meta.url), 'utf8'));
const OPTS = { blockouts: BLOCKOUTS, sheets: SHEETS, canopies: TREE_CANOPIES, ids: IDS };

/** Same keys in the same order at every depth, plus equal values. */
function verbatim(actual, golden, where) {
  assert.deepEqual(actual, golden, `${where} differs from the golden`);
  (function order(a, b, at) {
    if (!a || !b || typeof a !== 'object' || Array.isArray(a)) return;
    assert.deepEqual(Object.keys(a), Object.keys(b), `key order of ${at}`);
    for (const k of Object.keys(a)) order(a[k], b[k], `${at}.${k}`);
  })(JSON.parse(JSON.stringify(actual)), golden, where);
}

/** A mutable base-only instance with `extra(c)` applied, validated; returns the problems. */
function problems(extra, opts = {}) {
  const c = createContent({ packs: false });
  extra(c);
  return c.validateAll({ ...OPTS, ...opts });
}
const has = (errs, re) => assert.ok(errs.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errs.join('\n') || '(none)'}`);

export default function () {
  assert.ok(content.frozen, 'content/index.js freezes the singleton');
  assert.deepEqual(schema.domains(), DOMAINS, 'one schema per domain, in domain order');
  for (const d of DOMAINS) assert.ok(Object.keys(schema.baseFields(d)).length >= 3, `${d} has real fields`);

  // base content is today's data, moved: same values in the same key order as the S0 goldens
  const base = createContent({ packs: false });
  verbatim(base.props.view(), readGolden('props'), 'props');
  verbatim(base.crops.view(), readGolden('crops'), 'crops');
  verbatim(base.fish.view(), readGolden('fish'), 'fish');
  verbatim(base.forage.view(), readGolden('forage'), 'forage');
  verbatim(base.fortunes.view(), readGolden('fortunes').FORTUNES, 'fortunes');
  assert.deepEqual(FORTUNE_ORDER, readGolden('fortunes').FORTUNE_ORDER);
  const itemMap = [...base.itemMap()];
  verbatim(Object.fromEntries(itemMap.slice(0, 33)), readGolden('items'), 'items (explicit plus derived)');
  assert.equal(itemMap.length, 33 + 13, 'after today\'s items come only the placeholder materials');
  assert.ok(itemMap.slice(33).every(([, it]) => it.kind === 'material'));
  assert.deepEqual(base.items.ids().slice(0, 4), ['hand', 'hoe', 'can', 'rod']);
  assert.equal(base.items.size, 13, 'items.js holds tools, seeds, produce, forage and bait only');
  assert.equal(base.materials.size, 13);
  assert.ok(base.materials.all().every(([, m]) => m.placeholder === true), 'every base material is a placeholder');
  for (const d of ['bugs', 'recipes', 'blueprints', 'projects', 'regions', 'villagers', 'visitors', 'festivals', 'stamps']) assert.equal(base[d].size, 0, `${d} starts empty`);

  // every base entry validates (types, references, icons in SHEETS, assets in BLOCKOUTS, every when parses)
  assert.deepEqual(base.validateAll({ ...OPTS, mode: 'fork' }), []);
  assert.deepEqual(content.validateAll({ ...OPTS, mode: 'fork' }), []);
  assert.deepEqual(content.validateAll({ ...OPTS, mode: 'fork', owner: 'wp24' }), [], 'wp24 materials exist as placeholders');
  assert.deepEqual(content.validateAll({ ...OPTS, mode: 'fork', owner: 'wp21' }), []);
  assert.deepEqual(content.validateAll({ blockouts: BLOCKOUTS, sheets: SHEETS }), [], 'ids and canopies are optional');
  assert.deepEqual(createContent({ packs: false }).validateAll({}), [], 'without art maps the art checks are skipped');

  // merged mode: the only gaps are the ids Waves 1-3 promise (they disappear as packs land)
  const merged = content.validateAll({ ...OPTS, mode: 'merged' });
  assert.deepEqual(merged.filter((e) => !/: listed in IDS\.json for wp\d\d but not registered$/.test(e)), []);
  const promised = Object.entries(IDS).filter(([id, e]) => !content.registry(e.domain).has(id));
  assert.equal(merged.length, promised.length, 'one error per promised id');
  assert.ok(promised.every(([, e]) => ['crops', 'fish', 'props'].includes(e.domain)), 'materials are never promised, only placeholders');
  assert.deepEqual(content.validateAll({ ...OPTS, mode: 'fork', owner: 'wp27' }).length, promised.filter(([, e]) => e.owner === 'wp27').length, 'a fork must add its own promised ids');
  assert.throws(() => content.validateAll({ mode: 'later' }), /mode must be/);

  // IDS.json
  for (const [id, e] of Object.entries(IDS)) {
    assert.match(id, /^[a-z][a-z0-9_]*$/, id);
    assert.ok(DOMAINS.includes(e.domain), `${id} domain`);
    assert.match(e.owner, /^wp\d\d$/, `${id} owner`);
    assert.deepEqual(Object.keys(e), ['domain', 'owner'], id);
  }
  for (const [id, m] of content.materials.all()) assert.deepEqual(IDS[id], { domain: 'materials', owner: IDS[id]?.owner }, `${id} is listed in IDS.json`);
  for (const [id, e] of Object.entries(IDS)) if (e.domain === 'materials') assert.equal(content.materials.get(id)?.placeholder, true, `${id} is a placeholder until ${e.owner} overrides it`);
  assert.ok(!Object.keys(IDS).some((id) => content.items.has(id) && IDS[id].domain !== 'items'), 'no shared id clashes with an explicit item');

  // derived items follow the old rules
  const { conflicts } = deriveItems(content);
  assert.deepEqual(conflicts, []);
  const items = content.itemMap();
  assert.deepEqual(items.get('aji'), { name: 'Aji', kind: 'fish', icon: 'icons2:aji', sell: 32, unlock: 'ebisu' });
  assert.deepEqual(items.get('ayu'), { name: 'Ayu', kind: 'fish', icon: 'icons:ayu', sell: 30 });
  assert.deepEqual(items.get('prop_toro'), { name: 'Stone lantern', kind: 'prop', prop: 'toro', icon: 'asset:toro', buy: 60, sell: 30 });
  assert.ok(items.has('earth') && items.get('earth').kind === 'material' && !items.has('prop_stall'), 'materials give items, fixed props none');

  // landmarks: fixed props inside the 40x40 island
  assert.deepEqual(Object.keys(LANDMARKS), ['shrine', 'stone', 'pier']);
  for (const [id, p] of Object.entries(LANDMARKS)) {
    assert.ok(content.props.get(id)?.fixed, `${id} is a fixed prop`);
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.z) && p.x >= 0 && p.x < 40 && p.z >= 0 && p.z < 40, `${id} position`);
  }

  // a new crop, fish and dish that carry their own data derive their items and pass
  assert.deepEqual(problems((c) => {
    c.add('crops', 'nasu', { name: 'Nasu', stageMs: 60_000, yield: [1, 2], sprite: 'tea', height: [0.4, 0.6, 0.8], sell: 40, seedPrice: 20, icon: 'icons:tea', seedIcon: 'icons:seed_tea', kind: 'field', seasons: ['summer'], niche: { terrain: 'soil' } });
    c.add('fish', 'iwana', { name: 'Iwana', sell: 50, weight: 3, window: 800, size: [20, 40], shadow: 'm', when: { water: 'fresh', season: ['spring'], hour: [5, 10] }, icon: 'icons:ayu' });
    c.add('bugs', 'hotaru', { name: 'Firefly', sell: 30, weight: 2, when: { season: 'summer', hour: [19, 23] }, icon: 'icons:basket' });
    c.add('recipes', 'nasu_dengaku', { name: 'Nasu dengaku', kind: 'dish', inputs: { nasu: 2, iwana: 1 }, out: { nasu_dengaku: 1 }, bench: 'kitchen', item: { icon: 'icons:rice', sell: 120 }, discover: true });
    c.add('blueprints', 'tea_garden', { name: 'Tea garden', set: 'tea_garden', recipes: ['nasu_dengaku'], unlock: { flag: 'shrine.ebisu' } });
    c.add('regions', 'grove', { name: 'Bamboo grove', rect: { x: 2, z: 10, w: 8, h: 8 }, lockedUntil: { project: 'clear_grove' } });
    c.add('projects', 'clear_grove', { name: 'Clear the grove', region: 'grove', cost: { koku: 300, items: { wood: 4 } }, buildMs: 3_600_000, requires: {}, unlocks: [{ type: 'region', id: 'grove' }, { type: 'prop', id: 'toro' }] });
    c.add('stamps', 'first_fish', { name: 'First fish', icon: 'icons:rod', when: { has: { item: 'ayu' } } });
    c.add('fortunes', 'daikoku', { name: 'Daikoku', title: 'Fortune of harvest', icon: 'icons2:bell', order: 2, sleeping: 'zzz', awake: 'hello', offerings: [{ id: 'a', name: 'A', items: { nasu: 1 } }], unlocks: [['icons2:bell', 'A bell']], landmarks: [{ prop: 'toro', x: 5, z: 5 }] });
    c.add('festivals', 'hanami', { name: 'Hanami', span: { month: 4, day: 1, days: 7 }, decor: ['toro'], dish: 'nasu_dengaku', visitor: 'kitsune' });
    c.add('visitors', 'kitsune', { name: 'Kitsune', body: { blockout: 'crate', rig: 'quad' }, arrive: { near: { prop: 'torii', r: 3 } }, spot: { near: { prop: 'torii' } }, stayMs: [60_000, 120_000], gifts: ['rice'], hint: 'She likes tofu.' });
    c.add('villagers', 'ume', { name: 'Ume', body: { blockout: 'crate', rig: 'biped', height: 1 }, look: { robe: '#fff' }, home: { project: 'clear_grove', door: { x: 4, z: 4 } }, wish: { terrain: 'grass' }, likes: { items: ['tea'], tags: ['flower'] }, schedule: [{ hours: [6, 9], at: 'home.door', do: 'sweep' }, { hours: [9, 12], at: { near: { prop: 'tea' } }, do: 'idle', when: { weather: '!rain' } }], hearts: [{ n: 2, unlock: { recipe: 'nasu_dengaku' } }], dialogue: [{ id: 'hello', once: true, lines: ['Hello.'] }] });
    const m = c.itemMap();
    assert.deepEqual([m.get('seed_nasu'), m.get('nasu'), m.get('iwana'), m.get('nasu_dengaku')], [
      { name: 'Nasu seeds', kind: 'seed', crop: 'nasu', icon: 'icons:seed_tea', buy: 20 },
      { name: 'Nasu', kind: 'produce', icon: 'icons:tea', sell: 40 },
      { name: 'Iwana', kind: 'fish', icon: 'icons:ayu', sell: 50 },
      { name: 'Nasu dengaku', kind: 'dish', icon: 'icons:rice', sell: 120 },
    ]);
  }, { mode: 'merged' }).filter((e) => !/listed in IDS/.test(e)), []);

  // everything the validator rejects
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, water: 'sea', colour: 'red' })), /^fish\.bad\.colour: unknown field/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: '5', weight: 1, window: 100, water: 'sea' })), /^fish\.bad\.sell: expected an integer/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100 })), /^fish\.bad: needs water or a when condition/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, water: 'fresh', deep: true })), /^fish\.bad\.deep: deep fish live in the sea/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, when: { hour: [25, 3] } })), /^fish\.bad\.when: bad condition: hour: hour must be/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, when: { moon: 'full' } })), /^fish\.bad\.when: bad condition: unknown key "moon"/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, water: 'sea', size: [40, 20] })), /^fish\.bad\.size: expected ascending/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, water: 'sea', icon: 'icons:nope' })), /^fish\.bad\.icon: sheet "icons" has no cell "nope"/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, water: 'sea', icon: 'nowhere:koi' })), /^fish\.bad\.icon: unknown sheet "nowhere"/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, water: 'sea', icon: 'koi' })), /^fish\.bad\.icon: expected 'sheet:cell'/);
  has(problems((c) => c.add('fish', 'bad', { name: 'Bad', sell: 5, weight: 1, window: 100, water: 'sea' })), /^items\.bad\.icon: sheet "icons" has no cell "bad".*derived from fish\.bad/);
  has(problems((c) => c.add('props', 'bad', { name: 'Bad', asset: 'missing_asset', price: 5 })), /^props\.bad\.asset: unknown blockout "missing_asset"/);
  has(problems((c) => c.add('props', 'bad', { name: 'Bad', price: 5 })), /^props\.bad: needs an asset or a sprite/);
  has(problems((c) => c.add('props', 'bad', { name: 'Bad', asset: 'crate', canopy: 'baobab', price: 5 })), /^props\.bad\.canopy: unknown canopy "baobab"/);
  has(problems((c) => c.add('props', 'bad', { name: 'Bad', sprite: 'no_such_sprite', price: 5, icon: 'icons:hand' })), /^props\.bad\.sprite: sheet "vegetation" has no cell/);
  has(problems((c) => c.add('props', 'bad', { name: 'Bad', asset: 'crate', price: 5, fixed: true })), /^props\.bad\.price: fixed props are not for sale/);
  has(problems((c) => c.add('props', 'bad', { name: 'Bad', asset: 'crate', price: 0 })), /^props\.bad\.price: a prop for sale needs a price/);
  has(problems((c) => c.add('crops', 'bad', { name: 'Bad', stageMs: 1000, yield: [3, 1], sprite: 'rice', height: [1, 2, 3], sell: 1, seedPrice: 1, icon: 'icons:rice' })), /^crops\.bad\.yield: expected ascending/);
  has(problems((c) => c.add('crops', 'bad', { name: 'Bad', stageMs: 1000, yield: [1, 3], sprite: 'nothing', height: [1, 2, 3] })), /^crops\.bad\.sprite: sheet "crops" has no cell "nothing_1"/);
  has(problems((c) => c.add('crops', 'bad', { name: 'Bad', stageMs: 1000, yield: [1, 3], sprite: 'rice', height: [1, 2, 3] })), /^crops\.bad: unknown items "bad"/);
  has(problems((c) => c.add('crops', 'bad', { name: 'Bad', stageMs: 1000, yield: [1, 3], sprite: 'rice', height: [1, 2, 3], sell: 1, seedPrice: 1, icon: 'icons:rice', seasons: ['monsoon'] })), /^crops\.bad\.seasons\[0\]: expected one of/);
  has(problems((c) => c.add('crops', 'bad', { name: 'Bad', seed: 'seed_rice', stageMs: 1000, yield: [1, 3], sprite: 'rice', height: [1, 2, 3], sell: 1, icon: 'icons:rice' })), /^crops\.bad\.seed: item seed_rice belongs to crop rice/);
  has(problems((c) => c.add('forage', 'bad', { sprite: 'fern', height: 1, where: 'sky' })), /^forage\.bad\.where: expected one of/);
  has(problems((c) => c.add('forage', 'bad', { sprite: 'fern', height: 1, where: 'open' })), /^forage\.bad: unknown items "bad"/);
  has(problems((c) => c.add('items', 'bad', { name: 'Bad', kind: 'gadget', icon: 'icons:hand' })), /^items\.bad\.kind: expected one of/);
  has(problems((c) => c.add('items', 'bad', { name: 'Bad', kind: 'tool', icon: 'asset:missing' })), /^items\.bad\.icon: unknown blockout "missing"/);
  has(problems((c) => c.add('items', 'bad', { name: 'Bad', kind: 'seed', icon: 'icons:hand', crop: 'ghost' })), /^items\.bad\.crop: unknown crops "ghost"/);
  has(problems((c) => c.add('items', 'bad', { name: 'Bad', kind: 'tool', icon: 'icons:hand', unlock: 'benten' })), /^items\.bad\.unlock: unknown fortunes "benten"/);
  has(problems((c) => c.add('items', 'ayu', { name: 'Ayu again', kind: 'tool', icon: 'icons:hand' })), /^items\.ayu: defined by both items\.ayu and fish\.ayu/);
  has(problems((c) => c.add('materials', 'bad', { name: 'Bad', icon: 'icons:hand' })), /^materials\.bad\.tags: required/);
  has(problems((c) => c.add('materials', 'rice', { name: 'Rice', icon: 'icons:rice', tags: ['raw'] })), /^items\.rice: defined by both items\.rice and materials\.rice/);
  has(problems((c) => c.add('recipes', 'bad', { name: 'Bad', kind: 'craft', inputs: { ghost: 1 }, out: { rice: 1 }, bench: 'workbench' })), /^recipes\.bad\.inputs\.ghost \(key\): unknown items "ghost"/);
  has(problems((c) => c.add('recipes', 'bad', { name: 'Bad', kind: 'dish', inputs: { rice: 0 }, out: { rice: 1 }, bench: 'kitchen' })), /^recipes\.bad\.inputs\.rice: 0 is below 1/);
  has(problems((c) => c.add('recipes', 'bad', { name: 'Bad', kind: 'dish', inputs: { rice: 1 }, out: { rice: 1 }, bench: 'kitchen', item: { icon: 'icons:rice' } })), /^recipes\.bad\.out: a dish recipe's output must include its own id/);
  has(problems((c) => c.add('recipes', 'bad', { name: 'Bad', kind: 'craft', inputs: {}, out: { rice: 1 }, bench: 'workbench', item: { icon: 'icons:rice' } })), /^recipes\.bad\.item: only a dish recipe defines an item/);
  has(problems((c) => c.add('blueprints', 'bad', { name: 'Bad', set: 's', recipes: ['ghost'], unlock: {} })), /^blueprints\.bad\.recipes\[0\]: unknown recipes "ghost"/);
  has(problems((c) => c.add('blueprints', 'bad', { name: 'Bad', set: 's', recipes: [], unlock: {} })), /^blueprints\.bad\.recipes: expected at least 1 items/);
  has(problems((c) => c.add('projects', 'bad', { name: 'Bad', cost: {}, buildMs: 1, requires: {}, unlocks: [{ type: 'prop', id: 'ghost' }] })), /^projects\.bad\.unlocks\[0\]\.id: unknown props "ghost"/);
  has(problems((c) => c.add('projects', 'bad', { name: 'Bad', cost: {}, buildMs: 1, requires: {}, unlocks: [{ type: 'garden', id: 'x' }] })), /^projects\.bad\.unlocks\[0\]\.type: expected one of/);
  has(problems((c) => c.add('projects', 'bad', { name: 'Bad', cost: { gold: 3 }, buildMs: 1, requires: {}, unlocks: [] })), /^projects\.bad\.cost\.gold: unknown field/);
  has(problems((c) => c.add('projects', 'bad', { name: 'Bad', region: 'nowhere', cost: {}, buildMs: 1, requires: {}, unlocks: [] })), /^projects\.bad\.region: unknown regions "nowhere"/);
  has(problems((c) => c.add('regions', 'bad', { name: 'Bad', rect: { x: 1, z: 1, w: 0, h: 2 }, lockedUntil: {} })), /^regions\.bad\.rect\.w: 0 is below 1/);
  has(problems((c) => c.add('visitors', 'bad', { name: 'Bad', body: { blockout: 'ghost', rig: 'biped' }, arrive: {}, spot: { near: {} }, stayMs: [5, 1], gifts: [], hint: 'x' })), /^visitors\.bad\.body\.blockout: unknown blockout "ghost"/);
  has(problems((c) => c.add('visitors', 'bad', { name: 'Bad', body: { blockout: 'crate', rig: 'fish' }, arrive: {}, spot: { near: {} }, stayMs: [5, 1], gifts: [], hint: 'x' })), /^visitors\.bad\.body\.rig: expected one of/);
  has(problems((c) => c.add('visitors', 'bad', { name: 'Bad', body: { blockout: 'crate', rig: 'biped' }, arrive: {}, spot: { near: {} }, stayMs: [5, 1], gifts: [], hint: 'x' })), /^visitors\.bad\.stayMs: expected ascending/);
  has(problems((c) => c.add('villagers', 'bad', { name: 'Bad', body: { blockout: 'crate', rig: 'biped' }, likes: { items: ['ghost'] } })), /^villagers\.bad\.likes\.items\[0\]: unknown items "ghost"/);
  has(problems((c) => c.add('villagers', 'bad', { name: 'Bad', body: { blockout: 'crate', rig: 'biped' }, schedule: [{ hours: [1], at: 'x', do: 'idle' }] })), /^villagers\.bad\.schedule\[0\]\.hours: expected 2 items/);
  has(problems((c) => c.add('fortunes', 'bad', { name: 'Bad', title: 't', icon: 'icons2:bell', sleeping: 's', awake: 'a', offerings: [{ id: 'x', name: 'X', items: { rice: 1 } }, { id: 'x', name: 'Y', items: { rice: 1 } }], unlocks: [] })), /^fortunes\.bad\.offerings\[1\]\.id: duplicate offering "x"/);
  has(problems((c) => c.add('fortunes', 'bad', { name: 'Bad', title: 't', icon: 'icons2:bell', sleeping: 's', awake: 'a', offerings: [{ id: 'x', name: 'X', items: { ghost: 1 } }], unlocks: [['icons:nope', 'x']], gift: { bait: 0 } })), /^fortunes\.bad\.offerings\[0\]\.items\.ghost \(key\): unknown items "ghost"/);
  has(problems((c) => c.add('fortunes', 'bad', { name: 'Bad', title: 't', icon: 'icons2:bell', sleeping: 's', awake: 'a', offerings: [{ id: 'x', name: 'X', items: { rice: 1 } }], unlocks: [['icons:nope', 'x']] })), /^fortunes\.bad\.unlocks\[0\]\[0\]: sheet "icons" has no cell "nope"/);
  has(problems((c) => c.add('festivals', 'bad', { name: 'Bad', span: { month: 13, day: 1, days: 1 }, decor: [], dish: 'rice', visitor: 'ghost' })), /^festivals\.bad\.span\.month: 13 is above 12/);
  has(problems((c) => c.add('stamps', 'bad', { name: 'Bad', icon: 'icons:hand', when: { has: { item: 3 } } })), /^stamps\.bad\.when: bad condition: has: has needs an item id/);
  has(problems((c) => c.add('stamps', 'bad', { name: 'Bad', icon: 'icons:hand' })), /^stamps\.bad\.when: required/);
  has(problems((c) => c.override('fish', 'ayu', { sell: 0 })), /^fish\.ayu\.sell: 0 is below 1/);
  has(problems((c) => { c.defineDomain('moods'); c.add('moods', 'calm', { name: 'Calm' }); }), /^moods: no schema defined for this domain/);
  assert.throws(() => problems((c) => c.add('fish', 'ayu', { name: 'Dup' })), /duplicate fish "ayu"/);

  // fork mode: an id that IDS.json lists is soft until its owner adds it; an unlisted one is an error. merged: always an error
  const dish = (id) => (c) => c.add('recipes', 'stew', { name: 'Stew', kind: 'craft', inputs: { [id]: 1 }, out: { rice: 1 }, bench: 'kitchen' });
  assert.deepEqual(problems(dish('nasu')), []);
  assert.deepEqual(problems(dish('seed_nasu')), [], 'the derived seed of a listed crop is soft too');
  assert.deepEqual(problems(dish('prop_stairs_wood')), [], 'and the derived item of a listed prop');
  has(problems(dish('nasu'), { mode: 'merged' }), /^recipes\.stew\.inputs\.nasu \(key\): unknown items "nasu"/);
  has(problems(dish('eggplant')), /^recipes\.stew\.inputs\.eggplant \(key\): unknown items "eggplant"/);
  has(problems(dish('nasu'), { ids: {} }), /unknown items "nasu"/);
  const own = problems(() => {}, { owner: 'wp26' });
  assert.deepEqual(own.length, 7);
  has(own, /^crops\.nasu: listed in IDS\.json for wp26 but not registered/);
  assert.deepEqual(problems((c) => c.add('crops', 'nasu', { name: 'Nasu', stageMs: 1000, yield: [1, 2], sprite: 'tea', height: [1, 2, 3], sell: 4, seedPrice: 2, icon: 'icons:tea' }), { owner: 'wp26' }).length, 6, 'adding one promised id satisfies it');
  has(problems(() => {}, { ids: { ghost: { domain: 'nowhere', owner: 'wp99' } } }), /^ids\.ghost: unknown domain "nowhere"/);

  // overrides replace placeholders in the merged view and still validate
  const o = createContent({ packs: false });
  o.as('wp24').override('materials', 'stone', { icon: 'icons:basket', sell: 8, placeholder: false });
  assert.deepEqual(o.validateAll(OPTS), []);
  assert.equal(o.itemMap().get('stone').sell, 8);
  assert.equal(content.materials.get('stone').sell, undefined, 'the singleton and the base-only copy are independent');
}

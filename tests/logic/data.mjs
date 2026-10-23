// Content sanity: ids resolve, prices make sense, art references exist.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ITEMS, PROPS, CROPS, FISH, FORAGE, HOTBAR, START_INVENTORY, START_MONEY, SELLABLE_KINDS, BAIT_RARE, RIPE, fishBiting } from '../../src/game/data.js';
import { FORTUNES, FORTUNE_ORDER } from '../../src/game/shrine.js';
import { BLOCKOUTS, TREE_CANOPIES } from '../../src/assets/blockouts.js';
import { SHEETS, cellIndex } from '../../src/assets/sheets.js';
import { dayKey, hashString, hourOf, duration, HOUR, DAY, MIN } from '../../src/game/clock.js';

const cellNames = (sheet) => new Set(SHEETS[sheet].cells.map(([n]) => n));

function iconExists(icon) {
  const [sheet, cell] = icon.split(':');
  if (sheet === 'asset') return !!BLOCKOUTS[cell];
  if (sheet === 'canopy') return !!SHEETS.canopy && cellNames('canopy').has(cell);
  return !!SHEETS[sheet] && cellNames(sheet).has(cell);
}

export default function () {
  // items
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.ok(it.name && it.kind && it.icon, `${id} has name, kind, icon`);
    assert.ok(iconExists(it.icon), `${id} icon ${it.icon} exists in a sheet or blockout`);
    for (const k of ['buy', 'sell']) if (k in it) assert.ok(Number.isInteger(it[k]) && it[k] > 0, `${id}.${k}`);
    if (it.kind === 'seed') assert.equal(CROPS[it.crop].seed || `seed_${it.crop}`, id, `${id} <-> crop seed`);
    if (it.kind === 'prop') assert.ok(PROPS[it.prop] && !PROPS[it.prop].fixed, `${id} prop`);
    if (SELLABLE_KINDS.has(it.kind)) assert.ok(it.sell > 0, `${id} sells`);
    if (it.buy && it.sell) assert.ok(it.sell < it.buy, `${id} cannot be bought and sold for a profit`);
    if (it.unlock) assert.ok(FORTUNES[it.unlock], `${id} unlock names a fortune`);
  }
  for (const id of HOTBAR) assert.ok(ITEMS[id], `hotbar ${id}`);
  assert.deepEqual(HOTBAR.slice(0, 4), ['hand', 'hoe', 'can', 'rod'].slice(0, 4));
  for (const [id, n] of Object.entries(START_INVENTORY)) assert.ok(ITEMS[id] && n > 0, `start ${id}`);
  assert.ok(START_MONEY > 0);

  // props
  for (const [id, p] of Object.entries(PROPS)) {
    assert.ok(p.name, id);
    assert.ok(p.asset || p.sprite, `${id} has a mesh or a sprite`);
    if (p.asset) assert.ok(BLOCKOUTS[p.asset], `${id} blockout ${p.asset}`);
    if (p.canopy) assert.ok(TREE_CANOPIES[p.canopy], `${id} canopy ${p.canopy}`);
    if (p.sprite) assert.ok(cellNames('vegetation').has(p.sprite), `${id} sprite`);
    if (!p.fixed) assert.ok(p.price > 0, `${id} price`);
    else assert.equal(p.price, 0, `${id} fixed props are not for sale`);
  }

  // blockouts
  for (const [name, b] of Object.entries(BLOCKOUTS)) {
    assert.ok(b.label && b.desc && b.parts.length > 0, name);
    assert.ok(b.footprint.length === 2 && b.footprint.every((n) => Number.isInteger(n) && n > 0), `${name} footprint`);
    if (b.block) assert.ok(b.block.length === b.footprint[1] && b.block.every((r) => r.length === b.footprint[0]), `${name} block grid matches the footprint`);
  }

  // crops
  for (const [id, c] of Object.entries(CROPS)) {
    assert.ok(ITEMS[id] && ITEMS[c.seed || `seed_${id}`], `${id} items`);
    for (const i of [1, 2, 3]) assert.ok(cellNames(c.sheet || 'crops').has(`${c.sprite}_${i}`), `${id} stage ${i} sprite`);
    assert.ok(c.stageMs > 0 && c.yield[0] >= 1 && c.yield[1] >= c.yield[0], `${id} timing and yield`);
    assert.equal(c.height.length, 3, `${id} has one height per visible stage`);
    assert.ok(ITEMS[id].sell > 0 && ITEMS[c.seed || `seed_${id}`].buy > 0, `${id} produce and seed prices`);
  }
  assert.equal(RIPE, 3);
  assert.ok(CROPS.daikon.stageMs < CROPS.rice.stageMs && CROPS.rice.stageMs < CROPS.tea.stageMs, 'growth tiers');
  assert.ok(CROPS.tea.regrow && !CROPS.rice.regrow);

  // forage and fish
  for (const [id, f] of Object.entries(FORAGE)) assert.ok(ITEMS[id]?.kind === 'forage' && cellNames('vegetation').has(f.sprite) && ['open', 'trees'].includes(f.where), id);
  for (const [id, f] of Object.entries(FISH)) {
    assert.equal(ITEMS[id].kind, 'fish', id);
    assert.equal(ITEMS[id].sell, f.sell, `${id} sell price copied into ITEMS`);
    const water = f.water ?? f.when?.water;
    assert.ok(['fresh', 'sea', 'stream', 'pond'].includes(water) && f.weight > 0 && f.window > 0, id);
    if (f.deep) { assert.equal(f.water, 'sea', `${id} deep fish live in the sea`); assert.equal(ITEMS[id].unlock, 'ebisu', `${id} unlocks with Ebisu`); }
    else assert.ok(!ITEMS[id].unlock, `${id} available from the start`);
    // there is no hour at which a fish can never bite the pier / its water
    if (!f.when) assert.ok(Array.from({ length: 24 }, (_, h) => fishBiting(f, h)).some(Boolean), `${id} bites some hour`);
  }
  assert.ok(BAIT_RARE > 1);
  for (let h = 0; h < 24; h++) {
    for (const [water, deep] of [['fresh', false], ['sea', false], ['sea', true]]) {
      assert.ok(Object.values(FISH).some((f) => f.water === water && (deep || !f.deep) && fishBiting(f, h)), `something bites at ${h}h (${water}${deep ? ', pier' : ''})`);
    }
  }
  assert.equal(fishBiting({ hours: [19, 5] }, 23) && fishBiting({ hours: [19, 5] }, 4) && !fishBiting({ hours: [19, 5] }, 5), true, 'hours wrap past midnight');
  assert.equal(fishBiting({ hours: [5, 11] }, 11), false, 'upper bound is exclusive');

  // shrine content
  assert.deepEqual(FORTUNE_ORDER.filter((f) => !FORTUNES[f]), []);
  for (const [fid, f] of Object.entries(FORTUNES)) {
    assert.ok(iconExists(f.icon) && f.sleeping && f.awake && f.offerings.length > 0, fid);
    assert.equal(new Set(f.offerings.map((o) => o.id)).size, f.offerings.length, `${fid} offering ids unique`);
    for (const o of f.offerings) for (const [it, n] of Object.entries(o.items)) assert.ok(ITEMS[it] && n > 0, `${fid}/${o.id} ${it}`);
    for (const [icon] of f.unlocks) assert.ok(iconExists(icon), `${fid} unlock icon ${icon}`);
    for (const it of Object.keys(f.gift || {})) assert.ok(ITEMS[it], `${fid} gift ${it}`);
  }

  // sheets
  for (const [name, s] of Object.entries(SHEETS)) {
    assert.ok(s.cols * s.rows >= s.cells.length, `${name} fits its grid`);
    assert.ok(s.width >= s.cols * s.cell && s.height >= s.rows * s.cell, `${name} image covers the grid`);
    assert.equal(new Set(s.cells.map(([n]) => n)).size, s.cells.length, `${name} cell names unique`);
    s.cells.forEach(([n], i) => assert.equal(cellIndex(name, n), i, `${name}/${n} index`));
  }
  assert.ok(Object.keys(SHEETS).includes('icons') && Object.keys(SHEETS).includes('icons2'));

  // painted art that ships is declared (blockouts have a manifest entry per name once painted)
  const manifest = JSON.parse(fs.readFileSync(new URL('../../assets/painted/manifest.json', import.meta.url)));
  assert.ok(manifest.assets && manifest.sheets, 'manifest has assets and sheets');
  for (const name of Object.keys(BLOCKOUTS)) assert.ok(manifest.assets[name], `manifest paints ${name}`);

  // clock
  const noon = new Date(2026, 5, 10, 12).getTime();
  assert.equal(dayKey(noon), '2026-06-10');
  assert.equal(dayKey(new Date(2026, 5, 11, 4, 59).getTime()), '2026-06-10', 'a day lasts until 5:00');
  assert.equal(dayKey(new Date(2026, 5, 11, 5).getTime()), '2026-06-11');
  assert.equal(hourOf(new Date(2026, 5, 10, 13, 30).getTime()), 13.5);
  assert.equal(hashString('2026-06-10'), hashString('2026-06-10'));
  assert.notEqual(hashString('2026-06-10'), hashString('2026-06-11'));
  assert.deepEqual([duration(45_000), duration(12 * MIN), duration(3 * HOUR + 20 * MIN), duration(2 * DAY)], ['45 s', '12 min', '3 h 20 min', '2 days']);
}

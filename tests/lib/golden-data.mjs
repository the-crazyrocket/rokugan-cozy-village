// Computes the golden snapshots from the current modules. tools/export-golden.mjs writes
// them to tests/fixtures/golden/*.json and tests/logic/golden.mjs compares against them.
// When a refactor moves a module, re-point the imports here, never the fixtures.
import crypto from 'node:crypto';
import { ITEMS, PROPS, CROPS, FISH, FORAGE, HOTBAR, START_INVENTORY, START_MONEY, BAIT_RARE, fishBiting } from '../../src/game/data.js';
import { FORTUNES, FORTUNE_ORDER } from '../../src/game/shrine.js';
import { BLOCKOUTS } from '../../src/assets/blockouts.js';
import { SHEETS } from '../../src/assets/sheets.js';
import { World } from '../../src/game/world.js';
import { dayKey } from '../../src/game/clock.js';
import { stubDaily } from './stub.mjs';

export const sha1 = (v) => crypto.createHash('sha1').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');

/** 30 consecutive village days starting at 2026-01-01 (local noon is always inside the day). */
export function dayKeys(n = 30) {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(2026, 0, 1 + i, 12).getTime()));
}

export const SPOTS = { fresh: [true, false], 'sea-shore': [false, false], pier: [false, true] };

/** The pre-refactor Game.fishPool, rebuilt from the pure pieces. */
export function fishPoolOld(fresh, onPier, h, bait) {
  return Object.entries(FISH)
    .filter(([, f]) => (fresh ? f.water === 'fresh' : f.water === 'sea' && (onPier || !f.deep)) && fishBiting(f, h))
    .map(([k, f]) => [k, f.weight * (bait && f.rare ? BAIT_RARE : 1)]);
}

export function blockoutSummary() {
  const out = {};
  for (const [name, b] of Object.entries(BLOCKOUTS)) {
    const { parts, ...rest } = b;
    out[name] = { ...rest, parts: parts.length, hash: sha1(parts) };
  }
  return out;
}

export function dailyRolls({ awake = [] } = {}) {
  const daily = stubDaily({ awake });
  return Object.fromEntries(dayKeys().map((k) => [k, daily.roll(k)]));
}

export function fishPools() {
  const out = {};
  for (const [spot, [fresh, pier]] of Object.entries(SPOTS)) for (const bait of [false, true]) for (let h = 0; h < 24; h++) {
    out[`${spot}|bait=${bait}|h=${h}`] = fishPoolOld(fresh, pier, h, bait);
  }
  return out;
}

export function worldSummary() {
  const w = new World();
  const count = (a) => { const c = {}; for (const v of a) c[v] = (c[v] || 0) + 1; return c; };
  return { tiles: sha1(Buffer.from(w.tiles)), fresh: sha1(Buffer.from(w.fresh)), tileCounts: count(w.tiles), freshCount: w.fresh.reduce((s, v) => s + v, 0) };
}

/** name -> JSON-able value; each becomes tests/fixtures/golden/<name>.json. */
export function computeGolden() {
  return {
    items: ITEMS,
    props: PROPS,
    crops: CROPS,
    fish: FISH,
    forage: FORAGE,
    fortunes: { FORTUNES, FORTUNE_ORDER },
    misc: { HOTBAR, START_INVENTORY, START_MONEY, BAIT_RARE },
    blockouts: blockoutSummary(),
    sheets: SHEETS,
    daily: { asleep: dailyRolls(), ebisu: dailyRolls({ awake: ['ebisu'] }) },
    fishpools: fishPools(),
    world: worldSummary(),
  };
}

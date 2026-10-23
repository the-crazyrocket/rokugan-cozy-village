// Save migration and fixture invariants.
import assert from 'node:assert/strict';
import { SAVE_VERSION, migrate, encodeSave, decodeSave } from '../../src/game/save.js';
import { World, T } from '../../src/game/world.js';
import { CROPS, ITEMS, PROPS } from '../../src/game/data.js';
import { propCells } from '../../src/game/props.js';
import { FORTUNES } from '../../src/game/shrine.js';
import { readFixture, clone } from '../lib/fixtures.mjs';

const V1_STAGE_MS = { rice: 60_000, daikon: 90_000, tea: 120_000 };
const LANDMARKS = ['shrine_old', 'shrine', 'stone', 'pier'];
const names = ['fresh', 'mid', 'ebisu'];

/** The save must describe a legal village: known ids, props on free legal cells, crops on soil. */
function checkSave(s, label) {
  assert.equal(s.v, SAVE_VERSION, `${label} version`);
  assert.ok(Number.isFinite(s.money) && s.money >= 0, `${label} money`);
  for (const [id, n] of s.inv) assert.ok(ITEMS[id] && Number.isInteger(n) && n > 0, `${label} inventory ${id}`);
  assert.ok(s.slot >= 0 && s.slot < 7, `${label} slot`);
  const world = new World();
  assert.ok(world.inBounds(s.player[0], s.player[1]), `${label} player in bounds`);
  world.applyDiff(s.tiles);
  const occ = new Map();
  for (const p of s.props) {
    assert.ok(PROPS[p.type], `${label} prop type ${p.type}`);
    for (const c of propCells(p.type, p.x, p.z, p.rot).cells) {
      assert.ok(world.inBounds(c.x, c.z), `${label} ${p.type} in bounds`);
      const k = c.z * world.w + c.x;
      assert.ok(!occ.has(k), `${label} ${p.type}#${p.id} overlaps #${occ.get(k)}`);
      occ.set(k, p.id);
    }
  }
  assert.equal(new Set(s.props.map((p) => p.id)).size, s.props.length, `${label} unique prop ids`);
  for (const c of s.farm) {
    assert.ok(CROPS[c.type], `${label} crop ${c.type}`);
    assert.equal(world.get(c.x, c.z), T.SOIL, `${label} crop on soil`);
    assert.ok(c.progress >= 0 && c.progress <= 3.05 && typeof c.wet === 'boolean', `${label} crop state`);
  }
  assert.ok(!JSON.stringify(s).match(/stamina|energy|fatigue/i), `${label} has no energy system`);
}

export default async function () {
  assert.equal(SAVE_VERSION, 3);

  // v3 fixtures are already current: migrate returns them unchanged, and is idempotent
  const v3 = Object.fromEntries(names.map((n) => [n, readFixture(`save-v3-${n}.json`)]));
  for (const n of names) {
    assert.deepEqual(migrate(clone(v3[n])), v3[n], `${n} unchanged by migrate`);
    checkSave(v3[n], n);
    assert.equal(v3[n].daily.requests.length, 3, `${n} has three requests`);
    assert.ok(v3[n].props.some((p) => p.type === 'stall'), `${n} has the stall`);
  }
  assert.deepEqual(v3.fresh.shrine, { given: {}, awake: [] });
  assert.ok(v3.fresh.props.some((p) => p.type === 'shrine_old') && !v3.fresh.props.some((p) => p.type === 'pier'));
  assert.equal(v3.mid.slot, 3, 'mid: rod selected');
  assert.ok(v3.mid.stats.caught.ayu > 0 && v3.mid.stats.requests === 1, 'mid: fish caught, a request claimed');
  assert.ok(v3.mid.farm.length >= 5 && v3.mid.daily.requests.some((r) => r.claimed) && v3.mid.daily.requests.some((r) => !r.claimed));
  assert.ok(v3.mid.props.find((p) => p.type === 'crate' && p.id > Math.max(...v3.fresh.props.map((q) => q.id))), 'mid: a crate was moved (new id)');
  assert.deepEqual(v3.ebisu.shrine.awake, ['ebisu']);
  for (const o of FORTUNES.ebisu.offerings) assert.deepEqual(v3.ebisu.shrine.given[`ebisu.${o.id}`], o.items, `ebisu offering ${o.id} complete`);
  assert.ok(v3.ebisu.props.some((p) => p.type === 'pier') && v3.ebisu.props.some((p) => p.type === 'shrine'), 'ebisu: pier and restored shrine');
  assert.ok(v3.ebisu.inv.some(([id]) => id === 'bait'), 'ebisu: gift bait');
  for (const n of names) assert.equal(v3[n].savedAt, 1773483000000 + (n === 'fresh' ? -600000 : 0), `${n} frozen clock`);

  // v2 -> v3: the shrine slot appears, nothing else moves
  const v2 = readFixture('save-v2.json');
  assert.equal(v2.v, 2);
  assert.ok(!('shrine' in v2) && !v2.props.some((p) => LANDMARKS.includes(p.type)), 'v2 fixture predates the shrine');
  const m2 = migrate(clone(v2));
  assert.equal(m2.v, 3);
  assert.equal(m2.shrine, null);
  assert.deepEqual({ ...m2, v: 2, shrine: undefined }, { ...v2, shrine: undefined });
  checkSave(m2, 'v2->v3');

  // v1 -> v3: crop growth in ms becomes progress in stages, new slots get defaults
  const v1 = readFixture('save-v1.json');
  assert.equal(v1.v, 1);
  assert.ok(v1.farm.every((c) => 'growth' in c && !('progress' in c)), 'v1 crops use growth');
  assert.ok(!('daily' in v1) && !('stats' in v1) && !('timeOffset' in v1));
  const m1 = migrate(clone(v1));
  assert.equal(m1.v, 3);
  assert.equal(m1.timeOffset, 0);
  assert.equal(m1.daily, null);
  assert.deepEqual(m1.stats, {});
  assert.equal(m1.shrine, null);
  assert.equal(m1.farm.length, v1.farm.length);
  m1.farm.forEach((c, i) => {
    const old = v1.farm[i];
    assert.equal(c.progress, old.growth / V1_STAGE_MS[old.type], 'v1 progress');
    assert.ok(Math.abs(c.progress - v2.farm[i].progress) < 1e-4, 'v1 progress matches the v2 fixture it was derived from');
    assert.equal(c.last, old.last);
    assert.ok(!('growth' in c));
  });
  for (const k of ['money', 'inv', 'slot', 'player', 'props', 'tiles', 'wetSoil', 'savedAt']) assert.deepEqual(m1[k], v1[k], `v1 keeps ${k}`);
  checkSave(m1, 'v1->v3');
  assert.deepEqual(migrate(clone(m1)), m1, 'idempotent');

  // anything else is refused rather than guessed at
  for (const bad of [null, undefined, 0, 'x', [], {}, { v: 3 }, { v: 3, props: {} }, { ...clone(v3.mid), v: 4 }, { ...clone(v3.mid), v: 99 }, { ...clone(v3.mid), v: 0 }]) {
    assert.equal(migrate(bad), null, `refuses ${JSON.stringify(bad)?.slice(0, 40)}`);
  }

  // save codes round trip (gzip when CompressionStream exists)
  for (const n of names) {
    const code = await encodeSave(v3[n]);
    assert.match(code, /^RCV2z?:[A-Za-z0-9+/=]+$/);
    assert.deepEqual(await decodeSave(code), v3[n], `${n} code round trip`);
  }
  assert.deepEqual(await decodeSave(`  ${await encodeSave(v1)}\n`), m1, 'old save codes migrate on decode');
  await assert.rejects(decodeSave('not a code'), /village code/);
  await assert.rejects(decodeSave(await encodeSave({ v: 9, props: [] })), /unknown version/);
}

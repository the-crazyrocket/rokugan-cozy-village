// The current modules must still produce exactly the S0 snapshots (tests/fixtures/golden).
import assert from 'node:assert/strict';
import { computeGolden } from '../lib/golden-data.mjs';
import { readGolden } from '../lib/fixtures.mjs';

/** Same keys in the same order, at every depth (iteration order feeds the UI). */
function sameOrder(a, b, where) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a)) return;
  assert.deepEqual(Object.keys(a), Object.keys(b), `key order of ${where}`);
  for (const k of Object.keys(a)) sameOrder(a[k], b[k], `${where}.${k}`);
}

export default function () {
  const now = JSON.parse(JSON.stringify(computeGolden()));
  for (const [name, actual] of Object.entries(now)) {
    const golden = readGolden(name);
    assert.deepEqual(actual, golden, `golden ${name} drifted`);
    sameOrder(actual, golden, name);
  }
  // spot checks so a regenerated fixture cannot silently hollow the test out
  const g = (n) => readGolden(n);
  assert.equal(Object.keys(g('items')).length, 111); // + the axe and two saplings (forestry), the shovel and the stairs, and the materials (Wave 1), the workbench and 7 crops x (seed, produce) (Wave 2)
  assert.deepEqual(Object.keys(g('fish')).slice(0, 9), ['ayu', 'koi', 'tai', 'fugu', 'aji', 'saba', 'tako', 'ika', 'kintai']);
  assert.equal(Object.keys(g('fish')).length, 9 + 16); // + the Wave 2 waters
  assert.equal(Object.keys(g('daily').asleep).length, 30);
  assert.equal(Object.keys(g('fishpools')).length, 3 * 2 * 24);
  assert.equal(Object.keys(g('blockouts')).length, 25); // + stairs, + workbench, project board, scaffolding, kakei, scarecrow, + Kenji and Ume, + mill and kitchen, + stump
}

// The lazy UI sheets (src/ui/sheets): every name in the table loads once, registers through ctx.sheets and exposes render/live.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { LAZY, loadSheet } from '../../src/ui/sheets/index.js';

export default async function () {
  const core = createCore({ strict: true, now: () => 0, mono: () => 0, rng: () => 0.5 });
  const names = Object.keys(LAZY);
  assert.deepEqual(names, ['shop', 'bag', 'today', 'shrine', 'wake', 'backup', 'restore', 'tools']);
  assert.equal(core.sheets.size, 0, 'nothing is loaded before the first open');

  const [a, b] = await Promise.all([loadSheet(core, 'shop'), loadSheet(core, 'shop')]);
  assert.equal(a, b, 'two opens at once register one entry');
  assert.equal(core.sheets.size, 1);
  assert.equal(await loadSheet(core, 'shop'), a, 'a later open reuses it');

  for (const n of names) {
    const s = await loadSheet(core, n);
    assert.equal(typeof s.render, 'function', n);
    assert.equal(s.owner, 'ui', n);
    assert.equal(!!s.live, ['shop', 'bag', 'today', 'shrine', 'tools'].includes(n), `${n} live`);
  }
  await assert.rejects(loadSheet(core, 'nope'), /no sheet 'nope'/);

  const other = createCore({ strict: true, now: () => 0, mono: () => 0, rng: () => 0.5 });
  other.as('wp99').sheets.add('mine', { render: () => ({ title: 't', body: null }) });
  assert.equal((await loadSheet(other, 'mine')).owner, 'wp99', 'a sheet a pack registered itself is used as is');
}

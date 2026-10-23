// The UI side that needs no DOM: which tools overflow into the more sheet, the ctx.hud slot sync and the placeholder glyph for unknown icons.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { toolLayout, CORE_SLOTS } from '../../src/ui/hotbar.js';
import { visibleEntries, syncSlot } from '../../src/ui/hud/render.js';
import { HUD_SLOTS } from '../../src/ui/hud/index.js';
import { iconHTML, missingIcon } from '../../src/ui/icons.js';

const e = (id, order, extra = {}) => ({ id, order, compact: true, ...extra });
const BASE = [e('hand', 10), e('hoe', 20), e('can', 30), e('rod', 40), e('seed_rice', 50, { compact: 'seeds' }), e('seed_tea', 51, { compact: 'seeds' })];

// a stand-in element: outerHTML, children, replaceChildren, classList.toggle
const node = (html, tag = 'button') => ({ outerHTML: `<${tag}>${html}</${tag}>` });
const box = () => {
  const b = { children: [], replaced: 0, hidden: null, classList: { toggle: (c, on) => { if (c === 'hidden') b.hidden = !!on; } } };
  b.replaceChildren = (...n) => { b.children = n; b.replaced++; };
  return b;
};

function layout() {
  assert.equal(CORE_SLOTS, 5);
  // today's bar: the same five slots in the same order, nothing overflows
  assert.deepEqual(toolLayout(BASE, { compact: true }), { slots: ['hand', 'hoe', 'can', 'rod', 'seeds'], more: [] });
  assert.deepEqual(toolLayout(BASE, { compact: false }), { slots: BASE.map((x) => x.id), more: [] }, 'desktop shows every entry');

  // a group:'more' tool and a tool that did not ask for the compact bar go to the sheet, in bar order
  const bar = [...BASE, e('shovel', 100, { group: 'more' }), e('net', 101, { compact: false }), e('kettle', 102, { compact: undefined })];
  assert.deepEqual(toolLayout(bar, { compact: true }), { slots: ['hand', 'hoe', 'can', 'rod', 'seeds'], more: ['shovel', 'net', 'kettle'] });
  assert.deepEqual(toolLayout(bar, { compact: false }).more, [], 'desktop: no overflow');
  assert.deepEqual(toolLayout(BASE.map((x) => (x.id === 'rod' ? { ...x, group: undefined } : x)), { compact: true, groupOf: (x) => (x.id === 'rod' ? 'more' : undefined) }).more, ['rod'], 'groupOf reads the tool group');

  // a sixth compact slot would not fit on a phone: it overflows, the first five stay
  const six = [...BASE, e('brush', 60)];
  assert.deepEqual(toolLayout(six, { compact: true }), { slots: ['hand', 'hoe', 'can', 'rod', 'seeds'], more: ['brush'] });
  // seeds registered after the slots filled up still share the seeds slot
  assert.deepEqual(toolLayout([...BASE, e('seed_x', 99, { compact: 'seeds' })], { compact: true }).more, []);
  assert.deepEqual(toolLayout([], { compact: true }), { slots: [], more: [] });
}

function hud() {
  const core = createCore({ strict: true, now: () => Date.UTC(2026, 9, 22, 12), mono: () => 0, rng: () => 0.5 });
  assert.deepEqual(HUD_SLOTS, ['toolbar', 'preview', 'shutter', 'corner']);
  const ui = { tag: 'ui' };
  const seen = [];
  core.hud.add({ id: 'b', slot: 'toolbar', order: 2, render: (u, c) => { seen.push([u, c]); return node('b'); } });
  core.hud.add({ id: 'a', slot: 'toolbar', order: 1, render: () => node('a') });
  core.hud.add({ id: 'gone', slot: 'toolbar', order: 3, render: () => null });
  core.hud.add({ id: 'p', slot: 'preview', order: 1, when: { flag: 'shown' }, render: () => node('p', 'span') });

  assert.deepEqual(visibleEntries(core, 'toolbar').map((x) => x.id), ['a', 'b', 'gone'], 'ascending order');
  assert.deepEqual(visibleEntries(core, 'preview'), [], 'when: not yet');
  core.flags.set('shown', true);
  assert.deepEqual(visibleEntries(core, 'preview').map((x) => x.id), ['p']);
  assert.deepEqual(visibleEntries(core, 'corner'), []);

  const b = box(), cache = new Map();
  let els = syncSlot(b, visibleEntries(core, 'toolbar'), ui, core, cache);
  assert.equal(els.length, 2, 'an entry that renders nothing is skipped');
  assert.equal(b.hidden, false);
  assert.deepEqual(seen[0], [ui, core], 'render(ui, ctx)');
  assert.equal(b.replaced, 1);
  const [a1, b1] = b.children;

  syncSlot(b, visibleEntries(core, 'toolbar'), ui, core, cache);
  assert.equal(b.replaced, 1, 'same markup: the elements stay');
  assert.ok(b.children[0] === a1 && b.children[1] === b1);

  // an entry whose markup changes is swapped, the others are kept
  let label = 'x';
  core.hud.add({ id: 'c', slot: 'toolbar', order: 4, render: () => node(label) });
  syncSlot(b, visibleEntries(core, 'toolbar'), ui, core, cache);
  assert.equal(b.children.length, 3);
  const c1 = b.children[2];
  label = 'y';
  syncSlot(b, visibleEntries(core, 'toolbar'), ui, core, cache);
  assert.ok(b.children[2] !== c1 && b.children[0] === a1, 'changed entry replaced, unchanged kept');

  core.hud.remove('c');
  syncSlot(b, visibleEntries(core, 'toolbar'), ui, core, cache);
  assert.equal(b.children.length, 2);
  assert.ok(!cache.has('c'), 'cache forgets removed entries');

  // when stops holding: the slot empties and hides
  core.flags.set('shown', false);
  const pb = box();
  syncSlot(pb, visibleEntries(core, 'preview'), ui, core, new Map());
  assert.equal(pb.children.length, 0);
  assert.equal(pb.hidden, true);

  // a render that throws must not take the others down
  core.hud.add({ id: 'bad', slot: 'corner', order: 1, render() { throw new Error('boom'); } });
  core.hud.add({ id: 'ok', slot: 'corner', order: 2, render: () => node('ok') });
  const orig = console.error; let logged = 0; console.error = () => { logged++; };
  try {
    const cb = box();
    assert.equal(syncSlot(cb, visibleEntries(core, 'corner'), ui, core, new Map()).length, 1);
    assert.equal(logged, 1);
  } finally { console.error = orig; }
}

function icons() {
  const painted = { assets: { minka: {} }, sheets: { icons: { atlas: 'assets/painted/icons_atlas.png', cells: { basket: { uv: [0, 0, 0.25, 0.25] } } }, noatlas: { cells: { x: { uv: [0, 0, 1, 1] } } } } };
  const missing = (spec, p = painted) => /class="icon missing"/.test(iconHTML(p, spec));
  for (const spec of ['nope:x', 'icons:nope', 'asset:nope', 'icons', '', undefined, null, 'noatlas:x', 'a"b:<c>']) assert.ok(missing(spec), `placeholder for ${JSON.stringify(spec)}`);
  assert.ok(missing('icons:basket', { assets: {}, sheets: {} }), 'sheet not loaded');
  assert.ok(missing('icons:basket', {}), 'no painted at all');
  assert.ok(missing('icons:basket', null));
  globalThis.document = { baseURI: 'http://localhost/game/' }; // assetUrl resolves against the page
  try { assert.ok(!missing('icons:basket'), 'a real cell draws its sprite'); } finally { delete globalThis.document; }
  assert.match(iconHTML(painted, 'icons:nope', 'icon small'), /^<span class="icon small missing"/, 'extra classes are kept');
  assert.ok(!/["<>]/.test(missingIcon('a"b:<c>').replace(/<span class="icon missing" data-missing="|"><\/span>/g, '')), 'the spec is escaped');
}

export default function () { layout(); hud(); icons(); }

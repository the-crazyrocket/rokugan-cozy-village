// The architecture lint of docs/ARCHITECTURE.md 3.2: tiers, no unseeded randomness or wall clock in pure files, systems do not
// import each other, unique slice names and registry priorities, every emitted event declared. The rules live in
// tests/lib/archlint.mjs and are proved here on made-up files before they judge the real tree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scan, lintFiles, lintSystems, lintCore, readTree, tierOf, importsOf, resolveImport, format, ROOT } from '../lib/archlint.mjs';
import { EVENTS } from '../../src/core/events.js';
import { createCore } from '../../src/core/core.js';
import { createContent } from '../../src/core/content.js';
import { defineSystem } from '../../src/core/system.js';

const DECLARED = new Set(['harvest', 'dayChange', 'sprout']);
const lint = (files) => lintFiles(Object.entries(files).map(([p, src]) => ({ path: p, src })), { declared: DECLARED });
const rules = (files) => lint(files).map((v) => `${v.file.replace(/^src\//, '')}:${v.rule}`);

function scanner() {
  const src = [
    "const a = 'Date.now', b = \"Math.random\"; // new Date(",
    '/* performance.now\n   Math.random */ const c = `x ${Date.now()} Math.random`;',
    "const re = /['\"]Date.now/g, d = 4 / 2 / 1;",
    'const e = `${`${Math.random()}`}`; const f = `a${{ k: 1 }.k}b`; x = y / z; w = /Date.now/.test(s);',
  ].join('\n');
  const { code, text } = scan(src);
  assert.equal(code.length, src.length);
  assert.equal(text.length, src.length);
  assert.equal(code.split('\n').length, src.split('\n').length, 'lines are kept');
  assert.deepEqual([...code.matchAll(/Date\.now/g)].length, 1, 'only the call inside ${} counts');
  assert.deepEqual([...code.matchAll(/Math\.random/g)].length, 1, 'only the nested template expression counts');
  assert.ok(text.includes("'Date.now'") && text.includes('`x ${'), 'text keeps strings');
  assert.ok(!text.includes('performance.now') && !text.includes('new Date('), 'text drops comments');
  assert.ok(code.includes('4 / 2 / 1') && code.includes('y / z'), 'division is not a regex');
  assert.equal(code.includes("['\"]"), false, 'regex literals are blanked');

  const imports = importsOf(scan([
    "import { a,\n  b } from './x.js';", "import './side.js';", "export * from '../y.js';", "export { z } from './z.js';",
    "const m = await import('./lazy.js');", "// import q from './comment.js'", "import three from 'three';",
  ].join('\n')).text);
  assert.deepEqual(imports.sort(), ['../y.js', './lazy.js', './side.js', './x.js', './z.js', 'three']);
  assert.deepEqual(resolveImport('src/systems/a.js', '../core/bus.js'), { file: 'src/core/bus.js' });
  assert.deepEqual(resolveImport('src/systems/a.js', 'three'), { external: 'three' });
  assert.deepEqual(['src/core/a.js', 'src/world/w.js', 'src/systems/a.js', 'src/packs/wp1-x.js', 'src/game/game.js', 'src/ui/ui.js', 'src/main.js'].map(tierOf), ['P', 'P', 'T', 'T', null, null, null]);

  // the scanner has to cope with every file of the repo: same length, balanced braces and parens in the code part
  for (const f of readTree(['src', 'tests', 'tools'])) {
    const { code: c } = scan(f.src);
    assert.equal(c.length, f.src.length, f.path);
    const n = (ch) => c.split(ch).length - 1;
    assert.equal(n('{'), n('}'), `${f.path}: braces balance in code`);
    assert.equal(n('('), n(')'), `${f.path}: parens balance in code`);
    assert.equal(n('['), n(']'), `${f.path}: brackets balance in code`);
  }
}

function rulesOnMadeUpFiles() {
  const clean = "import { createRng } from '../core/rng.js';\n// Math.random Date.now new Date(\nexport const note = 'document window Math.random';\nexport default () => 1;\n";
  assert.deepEqual(lint({ 'src/core/ok.js': clean, 'src/systems/ok.js': clean, 'src/game/free.js': 'export const t = Math.random() + Date.now() + document.title;' }), []);

  // tiers
  assert.deepEqual(rules({
    'src/core/a.js': "import { x } from '../game/data.js'; import '../systems/b.js'; import t from 'three'; import fs from 'node:fs'; import { ok } from './bus.js';",
  }), ['core/a.js:tier', 'core/a.js:tier', 'core/a.js:tier', 'core/a.js:tier']);
  assert.deepEqual(rules({ 'src/systems/s.js': "import t from 'three'; import { n } from '../core/bus.js'; import { w } from '../world/coords.js'; import x from '../render/materials.js';" }), ['systems/s.js:tier', 'systems/s.js:system']);
  assert.deepEqual(rules({ 'src/content/base/fish.js': "import { addBase } from '../../core/content.js'; import '../index.js';" }), ['content/base/fish.js:tier']);

  // unseeded randomness and the wall clock
  assert.deepEqual(rules({ 'src/systems/r.js': 'const a = Math.random(); const b = Date.now(); const c = performance.now(); const d = new Date(5); const e = crypto.randomUUID();' }),
    ['systems/r.js:random', 'systems/r.js:random', 'systems/r.js:clock', 'systems/r.js:clock', 'systems/r.js:clock']);
  assert.deepEqual(rules({ 'src/core/time.js': 'export const t = () => Date.now() + performance.now() + new Date(0).getTime();' }), [], 'time.js may read the clock');
  assert.deepEqual(rules({ 'src/core/time.js': 'export const r = () => Math.random();' }), ['core/time.js:random'], 'but not randomness');
  assert.deepEqual(rules({ 'src/world/w.js': 'export const t = `${Date.now()}`;', 'src/content/base/c.js': 'const d = new  Date (3);' }), ['world/w.js:clock', 'content/base/c.js:clock']);
  assert.deepEqual(rules({ 'src/core/dom.js': 'export const w = window.innerWidth; const s = localStorage.getItem("a");' }), ['core/dom.js:dom']);

  // systems
  assert.deepEqual(rules({
    'src/systems/farming.js': "import { defineSystem } from '../core/system.js'; import { content } from '../content/index.js'; import '../assets/blockouts.js'; import '../assets/sheets.js'; import '../world/surface.js';\nexport default defineSystem({ name: 'farming', needs: ['props'], init(ctx) { ctx.use('props'); } });",
  }), []);
  assert.deepEqual(rules({ 'src/systems/farming.js': "import props from './props.js'; import { u } from '../ui/ui.js'; import { g } from '../assets/palette.js';" }), ['systems/farming.js:tier', 'systems/farming.js:system', 'systems/farming.js:system', 'systems/farming.js:system']);
  assert.deepEqual(rules({ 'src/systems/index.js': "import a from './a.js'; import b from './b.js';", 'src/systems/install.js': "import { systems } from './index.js';", 'src/systems/shared.js': 'export const k = 1;' }), [], 'the index lists the systems, install.js and shared.js are helpers');
  assert.deepEqual(rules({ 'src/systems/fishing.js': "import { cheb } from './shared.js'; import f from './props.js';" }), ['systems/fishing.js:system'], 'shared.js is open to systems, other systems are not');
  assert.deepEqual(rules({ 'src/systems/fishing.js': "export default defineSystem({ name: 'fishing', needs: ['props'], init(ctx) { ctx.use('props'); ctx.use('farming'); const x = other.use('inv'); } });" }),
    ['systems/fishing.js:use', 'systems/fishing.js:use']);
  assert.deepEqual(rules({ 'src/systems/f.js': "export default defineSystem({ name: 'f', tools: { use(t, ctx) {} }, init(ctx) { ctx.tools.add('hoe', { use(t, c) {} }); } });" }), [], 'a use() method is not ctx.use');

  // the W/H constants are gone: world.w / world.h
  assert.deepEqual(rules({ 'src/render/a.js': "import { World, W, H } from '../game/world.js';", 'src/render/b.js': "import { T, W as Width } from '../world/world.js';", 'src/render/c.js': "import { World, T, hash2 } from '../game/world.js'; import { W } from './other.js';" }),
    ['render/a.js:wh', 'render/b.js:wh']);

  // packs and the one importer of packs/index.js
  assert.deepEqual(rules({ 'src/packs/wp27-fishing.js': "import { add } from '../core/content.js'; import { defineSheet } from '../assets/sheets/registry.js'; import { defineBlockout } from '../assets/blockouts/registry.js'; import { defineSfx } from '../core/sfxreg.js';" }), []);
  assert.deepEqual(rules({ 'src/packs/wp27-fishing.js': "import { BLOCKOUTS } from '../assets/blockouts.js'; import { cond } from '../core/cond.js'; import g from '../game/game.js';" }), ['packs/wp27-fishing.js:tier', 'packs/wp27-fishing.js:pack', 'packs/wp27-fishing.js:pack', 'packs/wp27-fishing.js:pack']);
  assert.deepEqual(rules({ 'src/content/index.js': "import '../packs/index.js';" }), []);
  assert.deepEqual(rules({ 'src/game/data.js': "import '../packs/index.js';" }), ['game/data.js:packs']);

  // events
  assert.deepEqual(rules({ 'src/core/e.js': "bus.emit('harvest', {}); ctx.bus.emit(\"dayChange\"); time.emit?.('dayChange', {}); emit('sprout'); bus.emit('mystery', {}); ctx.bus.emit(name, {}); // bus.emit('ghost')" }), ['core/e.js:event']);
  assert.match(format(lint({ 'src/core/e.js': "bus.emit('mystery');" })), /emits 'mystery'/);

  // slices, orders, priorities
  const mk = (name, order, extra = {}) => defineSystem({ name, slice: { version: 1, order, defaults() {}, serialize() {}, load() {}, ...extra } });
  assert.deepEqual(lintSystems([mk('a', 30), mk('b', 31), defineSystem({ name: 'c' })]), []);
  assert.deepEqual(lintSystems([mk('a', 30), mk('a', 31)]).map((v) => v.msg), ["system name 'a' is used twice", "slice name 'a' is already taken by system a"]);
  assert.deepEqual(lintSystems([mk('a', 30), mk('b', 30)]).map((v) => v.msg), ['slice order 30 is already used by system a']);
  assert.deepEqual(lintSystems([mk('a', 30, { name: 'core' }), mk('away', 95)]).map((v) => v.msg), ["slice name 'core' is already taken by core (order 0)", "slice name 'away' is already taken by core (order 95)", 'slice order 95 is already used by core slice \'away\'']);
  const reg = (id, priority) => defineSystem({ name: id, init(ctx) { ctx.resolvers.add({ id, priority, fn: () => null }); ctx.hotbar.add({ id, order: priority }); } });
  const boot = (systems) => createCore({ strict: true, content: createContent({ empty: true }), systems });
  assert.deepEqual(lintCore(boot([reg('shop', 100), reg('forage', 80)])), []);
  assert.deepEqual(lintCore(boot([reg('till', 30), reg('plow', 30)])).map((v) => v.msg), ["resolver priority 30 is used by 'till' and 'plow'", "hotbar order 30 is used by 'till' and 'plow'"]);
  const typo = boot([defineSystem({ name: 'x', init(ctx) { ctx.bus.on('harvset', () => {}); } })]);
  assert.deepEqual(lintCore(typo).map((v) => v.msg), ["a handler listens to 'harvset', which nobody declared"]);
}

async function realTree() {
  const dir = path.join(ROOT, 'src/systems');
  let specs = [];
  if (fs.existsSync(path.join(dir, 'index.js'))) {
    for (const idx of ['src/content/index.js']) if (fs.existsSync(path.join(ROOT, idx))) await import(pathToFileURL(path.join(ROOT, idx)).href);
    const mod = await import(pathToFileURL(path.join(dir, 'index.js')).href);
    specs = mod.systems ?? mod.default ?? [];
    const listed = new Set(specs.map((s) => s.name));
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js') && !['index.js', 'install.js', 'shared.js'].includes(n))) {
      const own = (await import(pathToFileURL(path.join(dir, f)).href)).default;
      assert.ok(own && listed.has(own.name), `systems/${f} is not listed in systems/index.js`);
    }
  }
  const declared = new Set([...Object.keys(EVENTS), ...specs.flatMap((s) => Object.keys(s.events || {}))]);
  const core = specs.length ? createCore({ strict: true, systems: specs }) : null;
  const problems = [
    ...lintFiles(readTree(['src']), { declared }),
    ...lintSystems(specs),
    ...(core ? lintCore(core) : []),
  ];
  assert.equal(problems.length, 0, `architecture lint:\n${format(problems)}`);
  if (core) {
    // the real tree has its resolvers and hotbar (so the uniqueness rules above judge something), and a second resolver on a taken priority fails
    assert.ok(core.resolvers.size >= 8 && core.hotbar.size >= 7, 'the systems register resolvers and hotbar entries');
    const taken = core.resolvers.all()[0];
    core.as('wp0').resolvers.add({ id: 'twin', priority: taken.priority, fn: () => null });
    assert.deepEqual(lintCore(core).map((v) => v.msg), [`resolver priority ${taken.priority} is used by '${taken.id}' and 'twin'`]);
  }
  const tiers = readTree(['src']).filter((f) => tierOf(f.path)).length;
  assert.ok(tiers >= 20, `the lint looked at ${tiers} P/T files`);
}

export default async function () {
  scanner();
  rulesOnMadeUpFiles();
  await realTree();
}

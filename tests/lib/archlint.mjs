// The architecture lint of docs/ARCHITECTURE.md 3.2, as functions over { path, src } records so the same rules run on the
// real tree and on made-up files. Tiers: [P] pure (nothing but other [P] files), [T] testable in Node (also [P] and `three`),
// everything else is [B] browser and may not be imported by a P or T file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const P = [
  /^src\/core\//, /^src\/world\//, /^src\/version\.js$/, /^src\/assets\/palette\.js$/,
  /^src\/content\/(schemas|base)\//, /^src\/assets\/(blockouts|sheets)\/registry\.js$/, /^src\/assets\/blockouts\/base\//, /^src\/assets\/sheets\/base\.js$/,
];
const T = [
  /^src\/systems\//, /^src\/content\/index\.js$/, /^src\/packs\//, /^src\/assets\/(blockouts|sheets)\.js$/, /^src\/assets\/blockouts\/geometry\.js$/,
];

/** 'P' | 'T' | null (null is the browser tier, or a file the lint does not know). */
export const tierOf = (file) => (P.some((r) => r.test(file)) ? 'P' : T.some((r) => r.test(file)) ? 'T' : null);

const SYSTEM_HELPERS = new Set(['src/systems/index.js', 'src/systems/install.js', 'src/systems/shared.js']); // not systems themselves
// Temporary (S6A): pure legacy modules that systems still import. They count as [T] and are allowed in systems; none is left.
export const LEGACY_ALLOWED = new Set();
const SYSTEM_IMPORTS = [/^src\/core\//, /^src\/world\//, /^src\/content\//, /^src\/assets\/(blockouts|sheets)\.js$/];
const PACK_IMPORTS = new Set(['src/core/content.js', 'src/assets/blockouts/registry.js', 'src/assets/sheets/registry.js', 'src/core/sfxreg.js']);
const externalOk = (spec) => spec === 'three' || spec.startsWith('three/');
const CLOCK_FILES = new Set(['src/core/time.js']); // the one module that reads the wall clock

const WORD = /[A-Za-z0-9_$]/;
const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']);

/**
 * Splits JS source into two same-length strings (newlines kept): `code` has comments, strings, template text and regex
 * literals blanked, `text` has only the comments blanked. Enough JavaScript for this repo, not a parser.
 */
export function scan(src) {
  let code = '', text = '', i = 0, last = '';  // last: previous significant token (a punctuator or a word)
  const stack = [];                            // one brace counter per open `${` inside a template
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const put = (s, inCode, inText = true) => { code += inCode ? s : blank(s); text += inText ? s : blank(s); };
  const n = src.length;

  function template() { // positioned after the opening backtick; ends at the closing one or at `${`
    for (;;) {
      if (i >= n) return;
      const c = src[i];
      if (c === '\\') { put(src.slice(i, i + 2), false); i += 2; continue; }
      if (c === '`') { put(c, true); i++; last = '`'; return; }
      if (c === '$' && src[i + 1] === '{') { put('${', true); i += 2; stack.push(0); last = '{'; return; }
      put(c, false); i++;
    }
  }

  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const j = e < 0 ? n : e; put(src.slice(i, j), false, false); i = j; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; put(src.slice(i, j), false, false); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      put(c, true); put(src.slice(i + 1, j), false); put(src[j] === c ? c : '', true);
      i = Math.min(n, j + 1); last = '"'; continue;
    }
    if (c === '`') { put(c, true); i++; template(); continue; }
    if (c === '/') {
      const division = last === ')' || last === ']' || last === '}' || last === '"' || last === '`' || last === '0' || (WORD.test(last[0] || '') && !REGEX_AFTER.has(last));
      if (!division) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
        j++;
        while (j < n && /[a-z]/.test(src[j])) j++;
        put(src.slice(i, j), false);
        i = j; last = '"'; continue;
      }
    }
    if (c === '{' && stack.length) stack[stack.length - 1]++;
    if (c === '}' && stack.length) {
      if (stack[stack.length - 1] === 0) { stack.pop(); put(c, true); i++; template(); continue; }
      stack[stack.length - 1]--;
    }
    if (WORD.test(c)) {
      let j = i + 1;
      while (j < n && WORD.test(src[j])) j++;
      const w = src.slice(i, j);
      put(w, true);
      i = j; last = /^[0-9]/.test(w) ? '0' : w; continue;
    }
    put(c, true);
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return { code, text };
}

/** Resolves an import specifier found in `from` to a repo-relative path; { external } for a bare specifier. */
export function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return { external: spec };
  return { file: path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)) };
}

const IMPORTS = [
  /\b(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\s*(['"])([^'"]+)\1/g,
  /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
];
export const importsOf = (text) => [...new Set(IMPORTS.flatMap((re) => [...text.matchAll(re)].map((m) => m[2])))];

const WORLD_IMPORT = /\bimport\s*\{([^}]*)\}\s*from\s*(['"])([^'"]*world\.js)\2/g;
const eventsIn = (text) => [...text.matchAll(/\bemit\s*(?:\?\.)?\(\s*(['"`])([\w.:-]+)\1/g)].map((m) => m[2]);
const useIn = (text) => [...text.matchAll(/\buse\s*\(\s*(['"])([A-Za-z0-9]+)\1\s*\)/g)].map((m) => m[2]);
const needsIn = (text) => {
  const m = /\bneeds\s*:\s*\[([^\]]*)\]/.exec(text);
  return m ? [...m[1].matchAll(/['"]([A-Za-z0-9]+)['"]/g)].map((x) => x[1]) : [];
};

const CLOCK = [[/\bDate\s*\.\s*now\b/, 'Date.now'], [/\bperformance\s*\.\s*now\b/, 'performance.now'], [/\bnew\s+Date\s*\(/, 'new Date(']];
const RANDOM = [[/\bMath\s*\.\s*random\b/, 'Math.random'], [/\bcrypto\s*\.\s*(?:getRandomValues|randomUUID)\b/, 'crypto randomness']];
// a property key or member (`window: 950` on a fish, `x.window`) is data, not the global
const DOM = /(?<![.$\w])(document|window|localStorage|sessionStorage|navigator|requestAnimationFrame)\b(?!\s*:)/;

/**
 * files: [{ path, src }] with repo-relative posix paths. declared: Set of event names that exist.
 * -> [{ file, rule, msg }] (empty when clean).
 */
export function lintFiles(files, { declared = new Set() } = {}) {
  const out = [];
  const bad = (file, rule, msg) => out.push({ file, rule, msg });
  for (const { path: file, src } of files) {
    const { code, text } = scan(src);
    const imports = importsOf(text).map((spec) => ({ spec, ...resolveImport(file, spec) }));

    for (const m of imports) {
      if (m.file && m.file === 'src/packs/index.js' && file !== 'src/content/index.js') bad(file, 'packs', 'only content/index.js imports packs/index.js');
    }

    for (const m of text.matchAll(WORLD_IMPORT)) {
      const target = resolveImport(file, m[3]).file;
      if (target !== 'src/game/world.js' && target !== 'src/world/world.js') continue;
      const names = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]);
      if (names.includes('W') || names.includes('H')) bad(file, 'wh', 'imports the W/H constants; use world.w / world.h');
    }

    const tier = tierOf(file);
    if (!tier) continue;

    for (const m of imports) {
      if (m.external) {
        if (tier === 'P' || !externalOk(m.external)) bad(file, 'tier', `${tier} file imports '${m.external}'`);
        continue;
      }
      const to = tierOf(m.file) || (LEGACY_ALLOWED.has(m.file) ? 'T' : null);
      if (!to) bad(file, 'tier', `${tier} file imports ${m.file}, which is a browser (B) or unknown file`);
      else if (tier === 'P' && to === 'T') bad(file, 'tier', `P file imports the T file ${m.file}`);
    }

    for (const [re, name] of RANDOM) if (re.test(code)) bad(file, 'random', `${name} (use an injected rng)`);
    if (!CLOCK_FILES.has(file)) for (const [re, name] of CLOCK) if (re.test(code)) bad(file, 'clock', `${name} (use ctx.now() / ctx.mono())`);
    const dom = DOM.exec(code);
    if (dom) bad(file, 'dom', `uses ${dom[1]}, which does not exist in Node`);

    for (const name of eventsIn(text)) if (!declared.has(name)) bad(file, 'event', `emits '${name}', which nobody declared`);

    if (/^src\/packs\//.test(file) && file !== 'src/packs/index.js') {
      for (const m of imports) if (!m.file || !PACK_IMPORTS.has(m.file)) bad(file, 'pack', `a pack imports only core/content.js and the leaf registries, not ${m.spec}`);
    }

    if (/^src\/systems\//.test(file) && !SYSTEM_HELPERS.has(file)) {
      for (const m of imports) {
        if (!m.file) continue;
        if (SYSTEM_HELPERS.has(m.file)) continue; // systems may use shared.js, the pure helpers they and Game share
        if (/^src\/systems\//.test(m.file)) bad(file, 'system', `a system imports another system (${m.spec}); use events or ctx.use`);
        else if (!LEGACY_ALLOWED.has(m.file) && !SYSTEM_IMPORTS.some((r) => r.test(m.file))) bad(file, 'system', `a system may not import ${m.file}`);
      }
      const needs = needsIn(text);
      for (const u of useIn(text)) if (!needs.includes(u)) bad(file, 'use', `ctx.use('${u}') but needs is [${needs.join(', ')}]`);
    }
  }
  return out;
}

/** Every .js file under the given repo-relative directories, as { path, src }. */
export function readTree(dirs = ['src'], root = ROOT) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push({ path: p, src: fs.readFileSync(path.join(root, p), 'utf8') });
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

/**
 * Checks on defined systems (the objects defineSystem returns): unique names, slice names and slice orders,
 * and that nothing reuses the names and orders the core keeps for itself.
 */
export function lintSystems(specs, { reserved = { core: 0, scheduler: 90, away: 95 } } = {}) {
  const out = [];
  const bad = (file, rule, msg) => out.push({ file, rule, msg });
  const names = new Set(), slices = new Map(Object.keys(reserved).map((n) => [n, `core (order ${reserved[n]})`]));
  const orders = new Map(Object.entries(reserved).map(([n, o]) => [o, `core slice '${n}'`]));
  for (const s of specs) {
    if (names.has(s.name)) bad(s.name, 'unique', `system name '${s.name}' is used twice`);
    names.add(s.name);
    if (!s.slice) continue;
    const slice = s.slice.name ?? s.name;
    if (slices.has(slice)) bad(s.name, 'unique', `slice name '${slice}' is already taken by ${slices.get(slice)}`);
    else slices.set(slice, `system ${s.name}`);
    if (orders.has(s.slice.order)) bad(s.name, 'unique', `slice order ${s.slice.order} is already used by ${orders.get(s.slice.order)}`);
    else orders.set(s.slice.order, `system ${s.name}`);
  }
  return out;
}

/** Checks on a booted core: unique resolver priorities and hotbar orders, no handler on an undeclared event. */
export function lintCore(core) {
  const out = [];
  const bad = (file, rule, msg) => out.push({ file, rule, msg });
  const dup = (reg, prop, label) => {
    const seen = new Map();
    for (const e of core[reg].all()) {
      const v = e[prop];
      if (seen.has(v)) bad(e.owner || e[core[reg].field], 'unique', `${label} ${v} is used by '${seen.get(v)}' and '${e[core[reg].field]}'`);
      else seen.set(v, e[core[reg].field]);
    }
  };
  dup('resolvers', 'priority', 'resolver priority');
  dup('hotbar', 'order', 'hotbar order');
  for (const n of core.bus.undeclared()) bad('bus', 'event', `a handler listens to '${n}', which nobody declared`);
  return out;
}

export const format = (list) => list.map((v) => `${v.file}: [${v.rule}] ${v.msg}`).join('\n');

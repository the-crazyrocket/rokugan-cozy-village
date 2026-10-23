// Fast logic layer: runs every tests/logic/*.mjs in Node (no browser, no WebGL).
// A test file exports a default (async) function, or just uses top-level asserts.
// Usage: node tests/logic.mjs [name-filter ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'logic');
const filters = process.argv.slice(2);
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs') && (!filters.length || filters.some((s) => f.includes(s)))).sort();

const t0 = performance.now();
let failed = 0;
for (const f of files) {
  const t = performance.now();
  try {
    const mod = await import(pathToFileURL(path.join(DIR, f)).href);
    if (typeof mod.default === 'function') await mod.default();
    console.log(`ok    ${f} (${Math.round(performance.now() - t)} ms)`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${f}\n${String(e.stack || e).replace(/^/gm, '      ')}`);
  }
}
console.log(`\n${files.length - failed}/${files.length} files passed in ${Math.round(performance.now() - t0)} ms`);
process.exit(failed || !files.length ? 1 : 0);

// Writes the golden snapshots (tests/fixtures/golden/*.json) from the current pure modules.
// Node only. Run it deliberately when base content changes on purpose; the logic test
// tests/logic/golden.mjs fails on any unintended drift.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGolden } from '../tests/lib/golden-data.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'golden');
fs.mkdirSync(DIR, { recursive: true });
for (const [name, data] of Object.entries(computeGolden())) {
  const file = path.join(DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
}

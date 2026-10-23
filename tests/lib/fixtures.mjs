import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
export const readGolden = (name) => readFixture(path.join('golden', `${name}.json`));
export const clone = (v) => JSON.parse(JSON.stringify(v));

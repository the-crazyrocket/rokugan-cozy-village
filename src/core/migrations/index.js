// Ordered chain of whole-save migrations. v1-v3 are one flat object; v3 -> v4 produces the slice envelope.
import { v1ToV2 } from './v1-v2.js';
import { v2ToV3 } from './v2-v3.js';
import { v3ToV4 } from './v3-v4.js';

export const SAVE_VERSION = 4;
export const CHAIN = Object.freeze([
  { from: 1, to: 2, run: v1ToV2 },
  { from: 2, to: 3, run: v2ToV3 },
  { from: 3, to: 4, run: v3ToV4 },
]);

/** Bring a parsed save of any known version up to SAVE_VERSION. Throws on anything unusable; never mutates `raw`. */
export function migrateRaw(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a save');
  let s = raw;
  if (!Number.isInteger(s.v) || s.v < 1 || s.v > SAVE_VERSION) throw new Error(`unknown save version ${s.v}`);
  if (s.v < 4 && !Array.isArray(s.props)) throw new Error('not a save');
  while (s.v < SAVE_VERSION) {
    const step = CHAIN.find((m) => m.from === s.v);
    if (!step) throw new Error(`no migration from v${s.v}`);
    s = step.run(s);
    if (!s || s.v !== step.to) throw new Error(`migration v${step.from}-v${step.to} did not reach v${step.to}`);
  }
  return s;
}

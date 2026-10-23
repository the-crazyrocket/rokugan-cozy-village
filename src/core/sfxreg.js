// Leaf registry for sound effects: no imports. An effect is (sound, ...args) => void.
const SFX = new Map();

export function defineSfx(name, fn) {
  if (SFX.has(name)) throw new Error('sfx already defined: ' + name);
  SFX.set(name, fn);
  return fn;
}

export const getSfx = (name) => SFX.get(name);
export const sfxNames = () => [...SFX.keys()];

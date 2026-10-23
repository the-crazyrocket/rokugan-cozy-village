// Leaf registry for painted sheets: no imports, so base data and packs can register without reaching the browser.
export const SHEETS = {};

export function defineSheet(name, def) {
  if (SHEETS[name]) throw new Error('sheet already defined: ' + name);
  SHEETS[name] = def;
  return def;
}

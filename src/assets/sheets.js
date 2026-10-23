// Painted sprite / texture sheets. Shared by the pipeline (guide images + Codex
// prompts + slicing) and the game (atlas lookup); a facade over assets/sheets/*.
import { SHEETS } from './sheets/registry.js';
import './sheets/base.js';

export { SHEETS, defineSheet } from './sheets/registry.js';

export function cellIndex(sheet, name) {
  return SHEETS[sheet].cells.findIndex((c) => c[0] === name);
}

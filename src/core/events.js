// Cross-WP event names and payload schemas (field specs, see schema.js). Append-only: one line per event.
// Payloads are strict: unknown fields fail in core.strict. WP-private events are declared in the owning system's `events:`.

import { T, WK } from '../world/kinds.js';
import { MAX_HEIGHT } from '../world/coords.js';

const oneOf = (...values) => ({ enum: values });
const xz = { x: 'number', z: 'number' };
const items = { map: 'int', keys: 'id' };
const SEASONS = oneOf('spring', 'summer', 'autumn', 'winter');

// The tile edit (world/edit.js, docs/ARCHITECTURE.md section 4): what the 'terraform', 'reclaim' and 'dig' guards are handed.
// `from` is checked against every tile of the rect (only the fields given), `to` is what each of them becomes (fields left out stay).
export const EDIT_KINDS = Object.freeze(['raise', 'lower', 'dig', 'fill', 'reclaim', 'pave', 'patch']);
const tileState = { fields: {
  kind: { type: 'int', min: 0, max: Math.max(...Object.values(T)), optional: true },
  height: { type: 'int', min: 0, max: MAX_HEIGHT, optional: true },
  water: { type: 'int', min: 0, max: Math.max(...Object.values(WK)), optional: true },
} };
export const EDIT = Object.freeze({ fields: {
  kind: oneOf(...EDIT_KINDS), x: 'int', z: 'int', w: { type: 'int', min: 1, optional: true }, h: { type: 'int', min: 1, optional: true },
  from: tileState, to: tileState, by: oneOf('player', 'project', 'system'), project: 'id?', via: 'string?',
} });

export const EVENTS = Object.freeze({
  harvest: { crop: 'id', n: 'int', quality: { type: 'int', min: 1, max: 3 }, ...xz, via: oneOf('hand', 'sweep', 'sprinkler'), giant: 'bool?' },
  cropRipe: { crop: 'id', ...xz },
  catch: { kind: oneOf('fish', 'bug'), id: 'id', size: 'number', water: { ...oneOf('sea', 'fresh', 'pond', 'stream', 'tide'), nullable: true }, spot: { fields: xz }, bait: { any: ['string', 'bool'], nullable: true }, first: 'bool', via: oneOf('rod', 'trap', 'net') },
  forage: { item: 'id', n: 'int', ...xz, first: 'bool' },
  place: { prop: 'id', id: 'int', ...xz, rot: 'int', via: oneOf('build', 'move', 'project', 'load') },
  remove: { prop: 'id', id: 'int', ...xz, to: oneOf('bag', 'gone') },
  craft: { recipe: 'id', bench: { type: 'string', nullable: true }, made: items, used: items },
  cook: { dish: 'id', ingredients: { array: 'id' }, discovered: 'bool', quality: 'number' },
  visit: { visitor: 'id', phase: oneOf('arrive', 'leave', 'photo'), ...xz, gifts: items },
  gift: { to: 'id', item: 'id', reaction: oneOf('love', 'like', 'neutral', 'dislike'), hearts: 'number' },
  wake: { fortune: 'id' },
  projectDone: { project: 'id', doneAt: 'number', unlocks: { array: { fields: { type: 'string', id: 'id' } } } },
  dayChange: { day: 'number', prev: 'number', skipped: 'int' },
  seasonChange: { season: SEASONS, prev: SEASONS, year: 'int' },
  itemGain: { item: 'id', n: 'int', reason: 'string?' },
  itemLoss: { item: 'id', n: 'int', reason: 'string?' },
  moneyChange: { delta: 'number', reason: 'string?' },
  sell: { item: 'id', n: 'int', total: 'number' },
  buy: { item: 'id', n: 'int', total: 'number' },
  requestClaimed: { index: 'int', kind: 'string', reward: 'number', gift: { type: 'id', nullable: true } },
  offer: { fortune: 'id', offering: 'id', gave: items },
  terraform: { ...xz, from: tileState, to: tileState, kind: oneOf(...EDIT_KINDS), by: 'string?' },
  waterChange: { rect: { fields: { ...xz, w: 'int', h: 'int' } } },
  mail: { from: 'id', id: { any: ['string', 'int'] } },
  trapReady: { id: { any: ['string', 'int'] } },
  saveFailed: { reason: 'string' },
  projectWaiting: { project: 'id', why: 'string' },
  say: { text: 'string', icon: 'string?', tone: 'string?' },
  sfx: { name: 'string', opts: 'object?' },
  fx: { kind: 'string', x: 'number', y: 'number', z: 'number', opts: 'object?' },
  invalidate: { what: oneOf('veg', 'crops', 'ground', 'terrain', 'ui') },
  buildMode: { on: 'bool' },
  haptic: { ms: 'int' },
  bubble: { text: { type: 'string', nullable: true } },
  playerMove: { manual: 'bool' },
  arrive: { action: 'object' },
  openSheet: { name: 'string' },
  floatLabel: { text: 'string', ...xz },
  queueChange: {},
  buildSelect: { index: 'int' },
});

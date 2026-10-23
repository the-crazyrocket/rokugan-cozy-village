// Crops. seed: the seed item (default seed_<id>); sell, seedPrice and icon let the crop derive its own seed and produce
// items instead of listing them in the items domain. stageMs is the time of each of the first stages.
import { schema } from '../../core/schema.js';
import { SEASONS } from '../../core/cond.js';

const stage = { type: 'int', min: 1 };

schema.define('crops', {
  name: 'string',
  seed: { ref: 'items', optional: true },
  stageMs: stage,
  yield: { tuple: [stage, stage], ordered: true },
  sheet: { enum: ['crops', 'crops2', 'crops3'], optional: true }, // the sprite sheet (default crops)
  sprite: { any: ['crops', 'crops2', 'crops3'].map((sheet) => ({ type: 'cell', sheet, frames: 3 })) },
  height: { tuple: ['number', 'number', 'number'] },
  regrow: { any: ['bool', stage], optional: true },
  kind: { enum: ['field', 'paddy', 'tree', 'pond'], optional: true }, // pond: planted straight into a pond, no soil
  sell: { type: 'int', min: 1, optional: true },
  seedPrice: { type: 'int', min: 1, optional: true },
  icon: 'icon?',
  seedIcon: 'icon?',
  niche: 'cond?',
  seasons: { array: { enum: SEASONS }, optional: true },
  unlock: { ref: 'fortunes', optional: true },
  tags: { array: 'id', optional: true },
});

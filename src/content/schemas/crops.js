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
  sprite: { type: 'cell', sheet: 'crops', frames: 3 },
  height: { tuple: ['number', 'number', 'number'] },
  regrow: { any: ['bool', stage], optional: true },
  kind: { enum: ['field', 'paddy', 'tree'], optional: true },
  sell: { type: 'int', min: 1, optional: true },
  seedPrice: { type: 'int', min: 1, optional: true },
  icon: 'icon?',
  seedIcon: 'icon?',
  niche: 'cond?',
  seasons: { array: { enum: SEASONS }, optional: true },
  unlock: { ref: 'fortunes', optional: true },
  tags: { array: 'id', optional: true },
});

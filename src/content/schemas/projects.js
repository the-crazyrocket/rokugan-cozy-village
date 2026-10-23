// Village projects: paid for up front, built in real time, revealed when done. unlocks names what completion adds;
// type is one of prop, recipe, blueprint, region, villager, crop, fish, item, visitor, fortune, stamp.
import { schema } from '../../core/schema.js';
import { UNLOCK_TYPES } from '../../core/content-check.js';

schema.define('projects', {
  name: 'string',
  region: { ref: 'regions', optional: true },
  cost: { fields: { koku: { type: 'int', min: 0, optional: true }, items: { map: { type: 'int', min: 1 }, keys: { ref: 'items' }, optional: true } } },
  buildMs: { type: 'int', min: 0 },
  requires: 'cond',
  unlocks: { array: { fields: { type: { enum: UNLOCK_TYPES }, id: 'id' } } },
  scaffold: { type: 'object', optional: true },
  icon: 'icon?',
  hint: 'string?',
});

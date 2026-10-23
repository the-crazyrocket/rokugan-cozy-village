// Recipes. inputs and out map item ids to counts. A dish recipe may carry `item` (its dish item is registered under the recipe's
// own id, so `out` includes it); bench names the station ('workbench', 'kitchen', 'mill' ...).
import { schema } from '../../core/schema.js';

const count = { type: 'int', min: 1 };
const bag = { map: count, keys: { ref: 'items' } };

schema.define('recipes', {
  name: 'string',
  kind: { enum: ['dish', 'process', 'craft'] },
  inputs: bag,
  out: bag,
  bench: 'id',
  timeMs: { type: 'int', min: 0, optional: true },
  discover: 'bool?',
  item: { fields: { name: 'string?', icon: 'icon', sell: { type: 'int', min: 1, optional: true }, hint: 'string?' }, optional: true },
  buff: { type: 'object', optional: true },
  unlock: 'cond?',
  hint: 'string?',
  tags: { array: 'id', optional: true },
});

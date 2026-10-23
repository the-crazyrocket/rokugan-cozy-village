// Items: tools, seeds, produce, forage, bait. Fish, bug, material, prop and dish items are derived (content.itemMap()).
// Base fields are frozen; a work package adds namespaced ones with schema.extend('items', 'x_wpNN_name', spec).
import { schema } from '../../core/schema.js';

export const ITEM_KINDS = ['tool', 'seed', 'produce', 'forage', 'bait', 'fish', 'bug', 'prop', 'material', 'dish', 'craft', 'gift', 'sapling'];

schema.define('items', {
  name: 'string',
  kind: { enum: ITEM_KINDS },
  icon: 'icon',
  hint: 'string?',
  crop: { ref: 'crops', optional: true },
  prop: { ref: 'props', optional: true },
  buy: { type: 'int', min: 1, optional: true },
  sell: { type: 'int', min: 1, optional: true },
  unlock: { ref: 'fortunes', optional: true },
  tags: { array: 'id', optional: true },
});

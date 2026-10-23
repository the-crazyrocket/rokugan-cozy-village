// Wild greens that spring up each day. name, icon and sell let a forage entry derive its own item.
import { schema } from '../../core/schema.js';

schema.define('forage', {
  sprite: { type: 'cell', sheet: 'vegetation' },
  height: { type: 'number', min: 0 },
  where: { enum: ['open', 'trees'] },
  when: 'cond?',
  name: 'string?',
  icon: 'icon?',
  sell: { type: 'int', min: 1, optional: true },
  tags: { array: 'id', optional: true },
});

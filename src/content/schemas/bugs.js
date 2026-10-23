// Bugs caught with the net. A bug item is derived.
import { schema } from '../../core/schema.js';

schema.define('bugs', {
  name: 'string',
  sell: { type: 'int', min: 1 },
  weight: { type: 'number', min: 0 },
  when: 'cond',
  icon: 'icon',
  rare: 'bool?',
  size: { tuple: [{ type: 'number', min: 0 }, { type: 'number', min: 0 }], ordered: true, optional: true },
  hint: 'string?',
  tags: { array: 'id', optional: true },
});

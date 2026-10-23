// Festivals: a span of days (month 1-12, day 1-31, days long) with decor props, a dish and a visitor.
import { schema } from '../../core/schema.js';

schema.define('festivals', {
  name: 'string',
  span: { fields: { month: { type: 'int', min: 1, max: 12 }, day: { type: 'int', min: 1, max: 31 }, days: { type: 'int', min: 1 } } },
  decor: { array: { ref: 'props' } },
  dish: { ref: 'items' },
  visitor: { ref: 'visitors' },
  icon: 'icon?',
  hint: 'string?',
});

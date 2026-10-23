// Fish. The old form names the water (water: 'fresh'|'sea', deep: pier only, hours: [from, to) on the local clock);
// the new form is a condition `when` (docs/ARCHITECTURE.md 3.4). One of water or when is required.
// A fish item is derived: icon defaults to icons:<id>, a deep fish unlocks with Ebisu unless `unlock` says otherwise.
import { schema } from '../../core/schema.js';

const hour = { type: 'number', min: 0, max: 24 };

schema.define('fish', {
  name: 'string',
  sell: { type: 'int', min: 1 },
  weight: { type: 'number', min: 0 },
  window: { type: 'int', min: 1 },
  water: { enum: ['fresh', 'sea'], optional: true },
  deep: 'bool?',
  hours: { tuple: [hour, hour], optional: true },
  when: 'cond?',
  size: { tuple: [{ type: 'number', min: 0 }, { type: 'number', min: 0 }], ordered: true, optional: true },
  shadow: { enum: ['s', 'm', 'l'], optional: true },
  icon: 'icon?',
  rare: 'bool?',
  rod: { ref: 'items', optional: true },
  unlock: { ref: 'fortunes', optional: true },
  tags: { array: 'id', optional: true },
});

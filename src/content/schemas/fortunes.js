// The Seven Fortunes. offerings are small bundles made a little at a time; unlocks are [icon, text] lines for the wake card;
// order is the position in the chapter sequence (the base Fortune keeps it implicit); landmarks are props the awakening places.
import { schema } from '../../core/schema.js';

const bag = { map: { type: 'int', min: 1 }, keys: { ref: 'items' } };

schema.define('fortunes', {
  name: 'string',
  title: 'string',
  icon: 'icon',
  order: { type: 'int', min: 1, optional: true },
  sleeping: 'string',
  awake: 'string',
  offerings: { array: { fields: { id: 'id', name: 'string', items: bag } }, minLen: 1 },
  unlocks: { array: { tuple: ['icon', 'string'] } },
  gift: { ...bag, optional: true },
  landmarks: { array: { fields: { prop: { ref: 'props' }, x: 'int', z: 'int' } }, optional: true },
  requires: 'cond?',
});

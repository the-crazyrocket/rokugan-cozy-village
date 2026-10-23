// Placeable props. asset: painted blockout; canopy: billboard foliage on a trunk asset; sprite: billboard-only prop.
import { schema } from '../../core/schema.js';

schema.define('props', {
  name: 'string',
  asset: { type: 'asset', optional: true },
  canopy: { type: 'canopy', optional: true },
  sprite: { type: 'cell', sheet: 'vegetation', optional: true },
  price: { type: 'int', min: 0 },
  footprint: { tuple: [{ type: 'int', min: 1 }, { type: 'int', min: 1 }], optional: true },
  fixed: 'bool?',
  light: 'bool?',
  icon: 'icon?',
  tags: { array: 'id', optional: true },
  set: 'id?',
  unlock: { ref: 'fortunes', optional: true },
  stairs: { fields: { dir: 'string' }, open: true, optional: true },
});

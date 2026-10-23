// Regions of the island: a rectangle of tiles that stays locked until lockedUntil holds. patch is applied through world/edit.js
// when the region opens (its shape belongs to the work package that owns the region).
import { schema } from '../../core/schema.js';

schema.define('regions', {
  name: 'string',
  rect: { fields: { x: { type: 'int', min: 0 }, z: { type: 'int', min: 0 }, w: { type: 'int', min: 1 }, h: { type: 'int', min: 1 } } },
  lockedUntil: 'cond',
  patch: { type: 'any', optional: true },
  hint: 'string?',
  tags: { array: 'id', optional: true },
});

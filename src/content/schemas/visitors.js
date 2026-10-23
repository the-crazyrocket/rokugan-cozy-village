// Visitors: yokai and animals that arrive when `arrive` holds, stay stayMs [from, to] and leave gifts and a hint.
import { schema } from '../../core/schema.js';

schema.define('visitors', {
  name: 'string',
  body: { fields: { blockout: 'asset', rig: { enum: ['biped', 'quad', 'bird'] }, height: 'number?' } },
  look: { type: 'object', optional: true },
  arrive: 'cond',
  spot: { fields: { near: 'object' }, open: true },
  stayMs: { tuple: [{ type: 'int', min: 1 }, { type: 'int', min: 1 }], ordered: true },
  gifts: { array: { ref: 'items' } },
  hint: 'string',
  icon: 'icon?',
  tags: { array: 'id', optional: true },
});

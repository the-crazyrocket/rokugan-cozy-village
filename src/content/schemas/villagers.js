// Villagers (docs/ARCHITECTURE.md section 6). schedule entries are { hours: [from, to), at: 'home.door' | { near: ... }, do: clip, when?: cond }.
import { schema } from '../../core/schema.js';

const items = { array: { ref: 'items' }, optional: true };
const tile = { fields: { x: 'int', z: 'int' } };
const taste = { fields: { items, tags: { array: 'id', optional: true } }, optional: true };

schema.define('villagers', {
  name: 'string',
  title: 'string?',
  body: { fields: { blockout: 'asset?', rig: { enum: ['biped', 'quad', 'bird'] }, height: 'number?' } },
  look: { type: 'object', optional: true },
  home: { fields: { project: { ref: 'projects' }, door: { ...tile, optional: true } }, optional: true },
  wish: 'cond?',
  likes: taste,
  dislikes: taste,
  schedule: {
    array: { fields: { hours: { tuple: [{ type: 'number', min: 0, max: 24 }, { type: 'number', min: 0, max: 24 }] }, at: { any: ['string', 'object'] }, do: 'id', when: 'cond?' } },
    optional: true,
  },
  hearts: { array: { fields: { n: { type: 'int', min: 1, max: 10 }, unlock: 'object' } }, optional: true },
  dialogue: { array: { fields: { id: 'id', when: 'cond?', once: 'bool?', lines: { array: 'string', minLen: 1 } } }, optional: true },
  icon: 'icon?',
});

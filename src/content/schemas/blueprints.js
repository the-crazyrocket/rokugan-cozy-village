// Blueprints: a themed set of recipes (tea garden, harbour, festival) that unlocks together.
import { schema } from '../../core/schema.js';

schema.define('blueprints', {
  name: 'string',
  set: 'id',
  recipes: { array: { ref: 'recipes' }, minLen: 1 },
  unlock: 'cond',
  icon: 'icon?',
  hint: 'string?',
});

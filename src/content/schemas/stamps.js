// Stamps of the goshuin-style book: a gentle achievement that is earned the first time `when` holds.
import { schema } from '../../core/schema.js';

schema.define('stamps', {
  name: 'string',
  icon: 'icon',
  when: 'cond',
  hint: 'string?',
  tags: { array: 'id', optional: true },
});

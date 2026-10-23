// Materials: items of kind 'material' that costs and recipes consume. placeholder marks the shared ids of
// content/base/{materials,shared}.js until their owning work package overrides them.
import { schema } from '../../core/schema.js';

schema.define('materials', {
  name: 'string',
  icon: 'icon',
  tags: { array: 'id' },
  sell: { type: 'int', min: 1, optional: true },
  source: 'string?',
  placeholder: 'bool?',
});

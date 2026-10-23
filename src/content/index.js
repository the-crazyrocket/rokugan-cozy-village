// THE content entry module: schemas, base content, then every pack, then freeze. Anything that needs populated
// registries (tests, the pipeline, the asset facades, data.js) imports this file.
import './schemas/items.js';
import './schemas/props.js';
import './schemas/crops.js';
import './schemas/fish.js';
import './schemas/bugs.js';
import './schemas/materials.js';
import './schemas/forage.js';
import './schemas/recipes.js';
import './schemas/blueprints.js';
import './schemas/projects.js';
import './schemas/regions.js';
import './schemas/villagers.js';
import './schemas/visitors.js';
import './schemas/fortunes.js';
import './schemas/festivals.js';
import './schemas/stamps.js';
import './base/props.js';
import './base/crops.js';
import './base/forage.js';
import './base/fish.js';
import './base/items.js';
import './base/materials.js';
import './base/shared.js';
import './base/fortunes.js';
import './base/recipes.js';
import './base/projects.js';
import './base/villagers.js';
import './base/visitors.js';
import './base/kitchen.js';
import './base/bugs.js';
import '../packs/index.js';
import { content as registries } from '../core/content.js';

export { schema } from '../core/schema.js';
export { LANDMARKS, HOME } from './base/landmarks.js';
export { FORTUNE_ORDER } from './base/fortunes.js';
export const content = registries.freeze();

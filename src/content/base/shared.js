// Crafted materials that costs and recipes of several work packages use (paving, scaffolds, traps, fences).
// Placeholders like base/materials.js: the owner in docs/IDS.json overrides them in its own pack.
import { addBase } from '../../core/content.js';

const ph = (name, icon, tags, source) => ({ name, icon, tags, source, placeholder: true });

addBase('materials', 'gravel', ph('Gravel', 'tiles:path', ['crafted', 'stone'], 'gather'));
addBase('materials', 'paver', ph('Paving stone', 'tiles:cliff', ['crafted', 'stone'], 'craft'));
addBase('materials', 'plank', ph('Plank', 'icons:basket', ['crafted', 'wood'], 'craft'));
addBase('materials', 'rope', ph('Rope', 'icons:basket', ['crafted', 'plant'], 'craft'));

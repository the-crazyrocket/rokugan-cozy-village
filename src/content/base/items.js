// Tools, seeds, produce, forage and bait. Fish and prop items are derived from their registries
// (content.itemMap()), as are the items of any later crop that carries its own prices.
// icon: 'sheet:cell' in the painted icon atlas, or 'asset:name' for painted prop icons
import { addBase } from '../../core/content.js';

addBase('items', 'hand', { name: 'Hand', kind: 'tool', icon: 'icons:hand', hint: 'Harvest, talk, interact' });
addBase('items', 'hoe', { name: 'Hoe', kind: 'tool', icon: 'icons:hoe', hint: 'Till grass into soil' });
addBase('items', 'can', { name: 'Watering can', kind: 'tool', icon: 'icons:can', hint: 'Water crops: they grow twice as fast' });
addBase('items', 'rod', { name: 'Fishing rod', kind: 'tool', icon: 'icons:rod', hint: 'Face water and cast' });
addBase('items', 'seed_rice', { name: 'Rice seeds', kind: 'seed', crop: 'rice', icon: 'icons:seed_rice', buy: 10 });
addBase('items', 'seed_daikon', { name: 'Daikon seeds', kind: 'seed', crop: 'daikon', icon: 'icons:seed_daikon', buy: 5 });
addBase('items', 'seed_tea', { name: 'Tea seeds', kind: 'seed', crop: 'tea', icon: 'icons:seed_tea', buy: 30 });
addBase('items', 'rice', { name: 'Rice', kind: 'produce', icon: 'icons:rice', sell: 16 });
addBase('items', 'daikon', { name: 'Daikon', kind: 'produce', icon: 'icons:daikon', sell: 12 });
addBase('items', 'tea', { name: 'Tea leaves', kind: 'produce', icon: 'icons:tea', sell: 34 });
addBase('items', 'wildflower', { name: 'Wildflowers', kind: 'forage', icon: 'vegetation:flowers_pink', sell: 12 });
addBase('items', 'warabi', { name: 'Warabi shoots', kind: 'forage', icon: 'vegetation:fern', sell: 22 });
addBase('items', 'bait', { name: 'Bait', kind: 'bait', icon: 'icons2:bait', buy: 8, unlock: 'ebisu', hint: 'Rare fish bite more often; one is used each time you land a fish' });

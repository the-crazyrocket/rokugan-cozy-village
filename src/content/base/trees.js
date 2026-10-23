// Forestry: the axe (dig kit), saplings that grow into the trees in real time, and the stump a chopped tree leaves.
import { addBase } from '../../core/content.js';

addBase('items', 'axe', { name: 'Axe', kind: 'tool', icon: 'icons6:axe', hint: 'Chop a grown tree for wood' });
addBase('items', 'sapling_sakura', { name: 'Sakura sapling', kind: 'sapling', prop: 'sakura', icon: 'icons6:sapling_sakura', buy: 15 });
addBase('items', 'sapling_pine', { name: 'Pine sapling', kind: 'sapling', prop: 'pine', icon: 'icons6:sapling_pine', buy: 10 });
addBase('props', 'stump', { name: 'Tree stump', asset: 'stump', price: 0, fixed: true });

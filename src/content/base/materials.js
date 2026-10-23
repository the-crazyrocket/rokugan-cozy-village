// Raw materials that more than one work package needs. Every entry is a placeholder: the owner in docs/IDS.json
// replaces icon, sell value and so on with override() in its own pack and never has to add the id.
import { addBase } from '../../core/content.js';

const ph = (name, icon, tags, source) => ({ name, icon, tags, source, placeholder: true });

addBase('materials', 'earth', ph('Earth', 'icons3:earth', ['raw', 'earth'], 'shovel'));
addBase('materials', 'stone', ph('Stone', 'icons3:stone', ['raw', 'stone'], 'gather'));
addBase('materials', 'wood', ph('Wood', 'icons3:wood', ['raw', 'wood'], 'gather'));
addBase('materials', 'bamboo', ph('Bamboo', 'vegetation:bamboo', ['raw', 'plant'], 'gather'));
addBase('materials', 'clay', ph('Clay', 'icons3:clay', ['raw', 'earth'], 'gather'));
addBase('materials', 'shell', ph('Shell', 'icons3:shell', ['raw', 'shore'], 'gather'));
addBase('materials', 'fibre', ph('Fibre', 'icons3:fibre', ['raw', 'plant'], 'gather'));
addBase('materials', 'herb', ph('Herbs', 'vegetation:fern', ['raw', 'plant'], 'gather'));
addBase('materials', 'mushroom', ph('Mushrooms', 'icons3:mushroom', ['raw', 'plant'], 'gather'));

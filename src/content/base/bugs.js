// Bugs for the net: each lives somewhere (tags: meadow, water, tree, field) and is about at some seasons and hours (`when`).
// Every hour a few are out across the island; their icons double as the sprites fluttering in the world.
import { addBase } from '../../core/content.js';

const bug = (id, name, sell, weight, where, when, more = {}) => addBase('bugs', id, { name, sell, weight, when, icon: `bugs:${id}`, tags: [where], ...more });
bug('monshiro', 'Cabbage white', 20, 6, 'field', { season: ['spring', 'summer'], hour: [7, 17] }, { hint: 'Flutters over the vegetable beds by day' });
bug('ageha', 'Swallowtail', 60, 3, 'meadow', { season: ['spring', 'summer'], hour: [8, 16] }, { hint: 'A big yellow butterfly of sunny meadows' });
bug('hotaru', 'Firefly', 80, 5, 'water', { season: 'summer', hour: [19, 23] }, { hint: 'Glows over fresh water on summer evenings' });
bug('tonbo', 'Red dragonfly', 45, 5, 'water', { season: ['summer', 'autumn'], hour: [8, 18] }, { hint: 'Darts along the river in the warm months' });
bug('semi', 'Cicada', 35, 5, 'tree', { season: 'summer', hour: [6, 19] }, { hint: 'Sings from the tree trunks all summer day' });
bug('suzumushi', 'Bell cricket', 70, 4, 'meadow', { season: 'autumn', hour: [18, 2] }, { hint: 'Rings in the grass on autumn nights' });
bug('kabutomushi', 'Rhinoceros beetle', 250, 1, 'tree', { season: 'summer', hour: [20, 4] }, { rare: true, hint: 'A prize of summer nights, on the trees' });
bug('tentomushi', 'Ladybird', 15, 6, 'field', { season: ['spring', 'summer', 'autumn'], hour: [7, 17] }, { hint: 'Red and spotted, on the crops' });
bug('yukimushi', 'Snow fly', 90, 3, 'meadow', { season: 'winter', hour: [9, 15] }, { rare: true, hint: 'A drifting white fluff on still winter days' });
addBase('items', 'net', { name: 'Bug net', kind: 'tool', icon: 'bugs:net', hint: 'Tap a bug nearby to catch it' });

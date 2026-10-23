// Workbench recipes: what the island's raw materials become. Props come out as their bag items (prop_*), placed from Build.
import { addBase } from '../../core/content.js';

const craft = (name, inputs, out, hint) => ({ name, kind: 'craft', bench: 'workbench', inputs, out, hint });

addBase('recipes', 'fence', craft('Fence', { wood: 2 }, { prop_fence: 2 }, 'Two rustic fence segments'));
addBase('recipes', 'crate', craft('Crate', { wood: 3 }, { prop_crate: 1 }));
addBase('recipes', 'pot', craft('Clay pot', { clay: 2 }, { prop_pot: 1 }));
addBase('recipes', 'stairs', craft('Stone stairs', { stone: 3 }, { prop_stairs: 1 }, 'For climbing a step of the hills you raise'));
addBase('recipes', 'toro', craft('Stone lantern', { stone: 4, wood: 1 }, { prop_toro: 1 }));
addBase('recipes', 'bridge', craft('Arched bridge', { wood: 6, stone: 2 }, { prop_bridge: 1 }));
addBase('recipes', 'bamboo', craft('Bamboo cane', { bamboo: 2 }, { prop_bamboo: 1 }, 'Plant a new stand of bamboo'));
addBase('recipes', 'bait', craft('Shell bait', { shell: 1 }, { bait: 3 }, 'Crushed shell lures the sea fish to the pier'));
addBase('recipes', 'kakei', craft('Bamboo water pipe', { bamboo: 3, stone: 1 }, { prop_kakei: 1 }, 'Keeps the crops around it watered'));
addBase('recipes', 'scarecrow', craft('Scarecrow', { wood: 2, bamboo: 1 }, { prop_scarecrow: 1 }, 'One more at every harvest within two tiles'));

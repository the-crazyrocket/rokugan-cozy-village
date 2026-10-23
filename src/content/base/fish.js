// deep: only bites from Ebisu's pier. hours: [from, to) on the local clock
// (may wrap past midnight). rare: bait makes it bite more often.
import { addBase } from '../../core/content.js';

addBase('fish', 'ayu', { name: 'Ayu', water: 'fresh', weight: 6, window: 950, sell: 30 });
addBase('fish', 'koi', { name: 'Koi', water: 'fresh', weight: 4, window: 780, sell: 65, rare: true });
addBase('fish', 'tai', { name: 'Tai', water: 'sea', weight: 6, window: 850, sell: 75 });
addBase('fish', 'fugu', { name: 'Fugu', water: 'sea', weight: 3, window: 650, sell: 120, rare: true });
addBase('fish', 'aji', { name: 'Aji', water: 'sea', deep: true, weight: 7, window: 900, sell: 32, icon: 'icons2:aji' });
addBase('fish', 'saba', { name: 'Saba', water: 'sea', deep: true, weight: 7, window: 820, sell: 48, hours: [5, 11], icon: 'icons2:saba' });
addBase('fish', 'tako', { name: 'Tako', water: 'sea', deep: true, weight: 5, window: 760, sell: 85, hours: [16, 21], icon: 'icons2:tako' });
addBase('fish', 'ika', { name: 'Ika', water: 'sea', deep: true, weight: 6, window: 800, sell: 70, hours: [19, 5], icon: 'icons2:ika' });
addBase('fish', 'kintai', { name: 'Golden tai', water: 'sea', deep: true, weight: 0.5, window: 560, sell: 420, rare: true, icon: 'icons2:kintai' });

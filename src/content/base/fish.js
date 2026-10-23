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
// Wave 2: the island's wider waters. Streams, ponds, the shore and the pier each have their own fish, by season and hour; every
// fish has a size range (the fish book keeps the biggest) and a shadow size.
const fish = (name, sell, weight, win, size, shadow, when, more = {}) => ({ name, sell, weight, window: win, size, shadow, when, ...more });
const icon = (id) => ({ icon: `icons5:${id}` });
addBase('fish', 'iwana', fish('Iwana', 55, 4, 800, [20, 45], 'm', { water: 'stream', season: ['spring', 'autumn'], hour: [5, 11] }, icon('iwana')));
addBase('fish', 'yamame', fish('Yamame', 40, 5, 850, [15, 30], 's', { water: 'stream', hour: [6, 18] }, icon('yamame')));
addBase('fish', 'unagi', fish('Unagi', 110, 3, 700, [40, 90], 'l', { water: 'fresh', season: ['summer', 'autumn'], hour: [19, 4] }, icon('unagi')));
addBase('fish', 'sakuramasu', fish('Sakuramasu', 160, 1.5, 650, [40, 65], 'l', { water: 'stream', season: 'spring' }, { ...icon('sakuramasu'), rare: true }));
addBase('fish', 'funa', fish('Funa', 18, 7, 950, [10, 25], 's', { water: 'pond' }, icon('funa')));
addBase('fish', 'namazu', fish('Namazu', 90, 3, 720, [30, 70], 'l', { water: 'pond', hour: [18, 5] }, icon('namazu')));
addBase('fish', 'kingyo', fish('Kingyo', 85, 1.5, 700, [5, 12], 's', { water: 'pond', season: 'summer' }, { ...icon('kingyo'), rare: true }));
addBase('fish', 'dojo', fish('Dojo', 16, 5, 900, [8, 15], 's', { water: 'fresh', season: ['spring', 'summer'] }, icon('dojo')));
addBase('fish', 'kisu', fish('Kisu', 28, 6, 900, [15, 28], 's', { water: 'sea', season: ['summer', 'autumn'], hour: [5, 17], standing: '!pier' }, icon('kisu')));
addBase('fish', 'haze', fish('Haze', 20, 6, 950, [8, 18], 's', { water: 'sea', season: ['autumn', 'winter'], standing: '!pier' }, icon('haze')));
addBase('fish', 'mebaru', fish('Mebaru', 45, 4, 820, [15, 30], 'm', { water: 'sea', hour: [18, 5] }, icon('mebaru')));
addBase('fish', 'hirame', fish('Hirame', 180, 1.5, 650, [35, 80], 'l', { water: 'sea', season: ['winter', 'spring'] }, { ...icon('hirame'), rare: true }));
addBase('fish', 'isaki', fish('Isaki', 50, 4, 840, [20, 40], 'm', { water: 'sea', season: 'summer' }, icon('isaki')));
const deep = (when) => ({ ...when, water: 'sea', standing: 'pier' });
addBase('fish', 'buri', fish('Buri', 150, 3, 700, [60, 100], 'l', deep({ season: ['autumn', 'winter'] }), { ...icon('buri'), water: 'sea', deep: true }));
addBase('fish', 'katsuo', fish('Katsuo', 130, 3, 720, [40, 70], 'l', deep({ season: ['spring', 'summer'] }), { ...icon('katsuo'), water: 'sea', deep: true }));
addBase('fish', 'maguro', fish('Maguro', 600, 0.3, 520, [100, 250], 'l', deep({}), { ...icon('maguro'), water: 'sea', deep: true, rare: true }));

// Three timescales: daikon is a snack crop for a play session (6 min), rice
// fits a long session or a short break (36 min), tea is the check-in crop
// (4 h, then regrows every 80 min). Watering doubles the current stage's speed.
import { addBase } from '../../core/content.js';
import { MIN } from '../../core/time.js';

addBase('crops', 'rice', { name: 'Rice', seed: 'seed_rice', stageMs: 12 * MIN, yield: [2, 3], sprite: 'rice', height: [0.45, 0.75, 0.95] });
addBase('crops', 'daikon', { name: 'Daikon', seed: 'seed_daikon', stageMs: 2 * MIN, yield: [1, 2], sprite: 'daikon', height: [0.4, 0.6, 0.8] });
addBase('crops', 'tea', { name: 'Tea', seed: 'seed_tea', stageMs: 80 * MIN, yield: [3, 4], sprite: 'tea', height: [0.4, 0.6, 0.85], regrow: true });
// Wave 2: more crops, each with its own pace, season (in season: one more at harvest) and, for some, its own place to grow.
const crop2 = (name, sheet, stageMin, yld, sell, seedPrice, seasons, more = {}) => ({
  name, sheet, sprite: more.sprite, stageMs: stageMin * MIN, yield: yld, sell, seedPrice, seasons, height: more.height || [0.4, 0.62, 0.85],
  icon: `icons4:${more.sprite}`, seedIcon: `icons4:seed_${more.sprite}`, ...more,
});
addBase('crops', 'edamame', crop2('Edamame', 'crops2', 3, [2, 4], 9, 4, ['summer'], { sprite: 'edamame', height: [0.35, 0.55, 0.7] }));
addBase('crops', 'nasu', crop2('Nasu', 'crops2', 7, [2, 3], 22, 12, ['summer', 'autumn'], { sprite: 'nasu' }));
addBase('crops', 'satsuma_imo', crop2('Sweet potato', 'crops2', 15, [2, 3], 38, 20, ['autumn'], { sprite: 'satsuma_imo', height: [0.35, 0.5, 0.6] }));
addBase('crops', 'kabocha', crop2('Kabocha', 'crops2', 30, [1, 1], 120, 40, ['autumn'], { sprite: 'kabocha', height: [0.35, 0.55, 0.65] }));
addBase('crops', 'shiso', crop2('Shiso', 'crops3', 10, [2, 3], 14, 15, ['summer'], { sprite: 'shiso', regrow: true }));
addBase('crops', 'wasabi', crop2('Wasabi', 'crops3', 60, [1, 2], 140, 60, ['spring', 'autumn'], { sprite: 'wasabi', niche: { near: { water: 'stream', r: 1 } }, tags: ['stream'] }));
addBase('crops', 'lotus', crop2('Lotus root', 'crops3', 70, [1, 2], 110, 50, ['summer'], { sprite: 'lotus', kind: 'pond', regrow: true, height: [0.35, 0.55, 0.9] }));

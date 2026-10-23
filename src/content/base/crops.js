// Three timescales: daikon is a snack crop for a play session (6 min), rice
// fits a long session or a short break (36 min), tea is the check-in crop
// (4 h, then regrows every 80 min). Watering doubles the current stage's speed.
import { addBase } from '../../core/content.js';
import { MIN } from '../../core/time.js';

addBase('crops', 'rice', { name: 'Rice', seed: 'seed_rice', stageMs: 12 * MIN, yield: [2, 3], sprite: 'rice', height: [0.45, 0.75, 0.95] });
addBase('crops', 'daikon', { name: 'Daikon', seed: 'seed_daikon', stageMs: 2 * MIN, yield: [1, 2], sprite: 'daikon', height: [0.4, 0.6, 0.8] });
addBase('crops', 'tea', { name: 'Tea', seed: 'seed_tea', stageMs: 80 * MIN, yield: [3, 4], sprite: 'tea', height: [0.4, 0.6, 0.85], regrow: true });

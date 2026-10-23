// Blockouts: terrain pieces (stairs between height levels).
import { defineBlockout } from '../registry.js';

const RISE = 0.5;  // one height level (world/coords.js LEVEL_Y)
const STEPS = 4;

/** Stone stairs on the lower tile, rising towards local -z onto the level above. */
function stairs() {
  const p = [], d = 1 / STEPS;
  for (let k = 0; k < STEPS; k++) {
    const h = (k + 1) * (RISE / STEPS);
    p.push({ shape: 'box', size: [0.78, h, d + 0.01], pos: [0, h / 2, 0.5 - d / 2 - k * d], part: k % 2 ? 'stone' : 'stoneDark' });
  }
  // stepped side cheeks a little above the treads, with a rounded cap at the top, so the flight reads from the iso view
  for (const x of [-0.44, 0.44]) {
    for (let k = 0; k < STEPS; k++) {
      const h = (k + 1) * (RISE / STEPS) + 0.07;
      p.push({ shape: 'box', size: [0.1, h, d + 0.005], pos: [x, h / 2, 0.5 - d / 2 - k * d], part: 'stoneDark' });
    }
    p.push({ shape: 'sphere', r: 0.075, pos: [x, RISE + 0.1, -0.4], part: 'stone', seg: 8 });
  }
  return p;
}

defineBlockout('stairs', {
  label: 'Stone stairs', footprint: [1, 1], walkable: true, parts: stairs(),
  desc: 'short flight of four grey granite steps with low stone side walls ending in round stone caps, a little moss in the joints',
});

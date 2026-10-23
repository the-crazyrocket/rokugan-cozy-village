// Growing the island: the rock outcrop the shovel quarries for stone.
import { defineBlockout } from '../registry.js';

/** A knot of weathered grey boulders, one big and split, smaller ones leaning on it, moss in the cracks, chips of stone at the foot. */
function outcrop() {
  const p = [];
  p.push({ shape: 'sphere', r: 0.42, pos: [0.02, 0.26, -0.04], scale: [1.1, 0.95, 0.9], rot: [8, 20, -6], part: 'stone', seg: 7 });
  p.push({ shape: 'sphere', r: 0.3, pos: [-0.3, 0.17, 0.2], scale: [1, 0.8, 1.05], rot: [-10, 50, 12], part: 'stoneDark', seg: 6 });
  p.push({ shape: 'sphere', r: 0.24, pos: [0.33, 0.13, 0.26], scale: [1.15, 0.75, 1], rot: [0, -30, 10], part: 'stone', seg: 6 });
  p.push({ shape: 'box', size: [0.05, 0.36, 0.5], pos: [0.08, 0.36, -0.02], rot: [0, 20, 8], part: 'stoneDark' }); // the split
  p.push({ shape: 'sphere', r: 0.22, pos: [-0.12, 0.5, -0.1], scale: [1.3, 0.25, 1], part: 'moss', seg: 8 }); // moss on top
  p.push({ shape: 'sphere', r: 0.16, pos: [-0.38, 0.06, -0.22], scale: [1.4, 0.3, 1], part: 'moss', seg: 8 });
  for (const [x, z, r] of [[0.42, -0.18, 0.06], [-0.05, 0.42, 0.05], [0.18, 0.44, 0.04]]) p.push({ shape: 'sphere', r, pos: [x, r * 0.6, z], scale: [1.2, 0.7, 1], part: 'stone', seg: 5 });
  return p;
}

defineBlockout('outcrop', {
  label: 'Rock outcrop', footprint: [1, 1], parts: outcrop(), noShop: true,
  desc: 'a knot of weathered grey granite boulders: one big rounded boulder with a crack splitting it, two smaller ones leaning against it, moss on top and in the cracks, and a few chips of broken stone on the ground at its foot',
});

// Daikoku's chapter: the stone mill and the outdoor kitchen.
import { defineBlockout } from '../registry.js';

/** A hand mill: two round millstones on a low wooden stand, a crank handle, sacks beside it, under a little thatched roof. */
function mill() {
  const p = [];
  p.push({ shape: 'box', size: [0.7, 0.1, 0.7], pos: [0, 0.05, 0], part: 'stoneDark' });
  p.push({ shape: 'box', size: [0.56, 0.26, 0.56], pos: [0, 0.23, 0], part: 'woodDark' });
  p.push({ shape: 'cyl', rt: 0.3, rb: 0.3, h: 0.12, pos: [0, 0.42, 0], part: 'stone', seg: 16 });
  p.push({ shape: 'cyl', rt: 0.28, rb: 0.3, h: 0.14, pos: [0, 0.55, 0], part: 'stone', seg: 16 });
  p.push({ shape: 'cyl', rt: 0.05, rb: 0.05, h: 0.04, pos: [0, 0.64, 0], part: 'stoneDark', seg: 8 }); // the hopper hole
  p.push({ shape: 'cyl', rt: 0.025, rb: 0.025, h: 0.26, pos: [0.22, 0.73, 0.05], part: 'woodLight', seg: 6 }); // the crank
  p.push({ shape: 'box', size: [0.08, 0.06, 0.1], pos: [0.36, 0.43, 0], part: 'stone' }); // the spout
  p.push({ shape: 'sphere', r: 0.15, pos: [-0.32, 0.14, 0.3], scale: [1, 1.1, 0.9], part: 'paper', seg: 8 }); // flour sacks
  p.push({ shape: 'sphere', r: 0.12, pos: [-0.36, 0.11, -0.05], scale: [1, 1.1, 0.9], part: 'thatch', seg: 8 });
  for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) p.push({ shape: 'box', size: [0.07, 1.2, 0.07], pos: [x, 0.6, z], part: 'wood' });
  p.push({ shape: 'hip', w: 1.15, d: 1.15, h: 0.4, ridge: 0.2, pos: [0, 1.2, 0], part: 'thatch' });
  return p;
}

/** An outdoor kitchen: a clay kamado with two cooking pots, a chopping board on a bench, a rack of bowls, a small tiled roof. */
function kitchen() {
  const p = [];
  p.push({ shape: 'box', size: [1.8, 0.08, 0.8], pos: [0, 0.04, 0], part: 'stone' });
  p.push({ shape: 'box', size: [0.95, 0.5, 0.6], pos: [-0.38, 0.33, 0], part: 'clay' }); // the kamado
  for (const x of [-0.6, -0.16]) {
    p.push({ shape: 'cyl', rt: 0.16, rb: 0.11, h: 0.16, pos: [x, 0.66, 0], part: 'lacquerDark', seg: 12 });
    p.push({ shape: 'cyl', rt: 0.17, rb: 0.17, h: 0.04, pos: [x, 0.76, 0], part: 'woodLight', seg: 12 }); // wooden lids
    p.push({ shape: 'box', size: [0.16, 0.12, 0.04], pos: [x, 0.22, 0.31], part: 'lacquerDark' }); // the fire mouths
  }
  p.push({ shape: 'box', size: [0.66, 0.5, 0.56], pos: [0.5, 0.29, 0], part: 'wood' }); // the bench
  p.push({ shape: 'box', size: [0.4, 0.04, 0.28], pos: [0.5, 0.56, 0.05], part: 'woodLight' }); // chopping board
  p.push({ shape: 'box', size: [0.18, 0.02, 0.04], pos: [0.52, 0.59, 0.05], rot: [0, 25, 0], part: 'stone' }); // a knife
  p.push({ shape: 'sphere', r: 0.07, pos: [0.36, 0.6, -0.12], scale: [1.2, 0.8, 1], part: 'moss', seg: 8 }); // a vegetable
  p.push({ shape: 'box', size: [0.08, 1.35, 0.08], pos: [0.86, 0.68, -0.35], part: 'woodDark' }); // posts and a shelf of bowls
  p.push({ shape: 'box', size: [0.08, 1.35, 0.08], pos: [-0.86, 0.68, -0.35], part: 'woodDark' });
  p.push({ shape: 'box', size: [1.7, 0.05, 0.2], pos: [0, 1.05, -0.3], part: 'wood' });
  for (const x of [-0.5, -0.3, 0.2, 0.4]) p.push({ shape: 'cyl', rt: 0.07, rb: 0.04, h: 0.06, pos: [x, 1.11, -0.3], part: 'plaster', seg: 10 });
  p.push({ shape: 'prism', w: 1.95, h: 0.3, d: 0.75, pos: [0, 1.36, -0.2], part: 'roofTile' });
  return p;
}

defineBlockout('mill', {
  label: 'Stone mill', footprint: [1, 1], parts: mill(),
  desc: 'a small Japanese stone hand mill: two round grey millstones with a wooden crank on a dark wooden stand, a spout with flour, cloth and straw sacks beside it, under a little four-post thatched roof',
});
defineBlockout('kitchen', {
  label: 'Kitchen', footprint: [2, 1], parts: kitchen(),
  desc: 'a cosy Japanese outdoor kitchen: a reddish clay kamado stove with two black iron rice pots under pale wooden lids and glowing fire mouths, a wooden prep bench with a chopping board, a knife and a green vegetable, a shelf of white bowls on dark posts behind, under a small grey tiled roof',
});

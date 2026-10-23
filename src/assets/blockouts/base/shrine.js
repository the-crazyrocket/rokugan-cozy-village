// Blockouts: Ebisu's shrine, his pier and the sleeping stone.
import { defineBlockout } from '../registry.js';

/** Ebisu's little shrine. `old` = the overgrown, sleeping state (same footprint). */
function shrine(old = false) {
  const p = [];
  p.push({ shape: 'box', size: [1.85, 0.16, 1.7], pos: [0, 0.08, -0.05], part: 'stoneDark' });
  p.push({ shape: 'box', size: [0.7, 0.08, 0.26], pos: [0, 0.04, 0.88], part: 'stone' });
  // hall: plank walls, vermilion posts, lattice doors, a little veranda
  p.push({ shape: 'box', size: [1.15, 0.75, 0.9], pos: [0, 0.535, -0.3], part: old ? 'woodDark' : 'wood' });
  for (const x of [-0.62, 0.62]) for (const z of [-0.78, 0.18]) {
    p.push({ shape: 'cyl', rt: 0.055, rb: 0.06, h: 0.86, pos: [x, 0.59, z], part: old ? 'woodDark' : 'lacquer', seg: 8 });
  }
  p.push({ shape: 'box', size: [0.72, 0.5, 0.04], pos: [0, 0.48, 0.165], part: 'paper' });
  p.push({ shape: 'box', size: [0.04, 0.5, 0.04], pos: [0, 0.48, 0.19], part: 'woodDark' });
  p.push({ shape: 'box', size: [1.42, 0.06, 0.34], pos: [0, 0.3, 0.34], part: 'woodLight' });
  // gabled tile roof, ridge, crossed chigi and katsuogi logs
  p.push({ shape: 'prism', w: 1.72, h: 0.56, d: 1.55, pos: [0, 0.92, -0.3], part: 'roofTile' });
  p.push({ shape: 'box', size: [1.78, 0.08, 0.12], pos: [0, 1.49, -0.3], part: 'woodDark' });
  for (const x of [-0.86, 0.86]) for (const s of [-1, 1]) {
    p.push({ shape: 'box', size: [0.05, 0.42, 0.06], pos: [x, 1.6, -0.3 + s * 0.07], rot: [s * 28, 0, 0], part: old ? 'woodDark' : 'gold' });
  }
  for (const x of [-0.4, 0, 0.4]) p.push({ shape: 'cyl', rt: 0.05, rb: 0.05, h: 0.12, pos: [x, 1.55, -0.3], rot: [90, 0, 0], part: old ? 'woodDark' : 'gold', seg: 8 });
  // shimenawa rope across the front
  p.push({ shape: 'cyl', rt: 0.045, rb: 0.045, h: 1.3, pos: [0, old ? 0.8 : 0.86, 0.24], rot: [0, 0, old ? 84 : 90], part: 'rope', seg: 8 });
  if (old) {
    // moss on the roof, ivy up the posts, grass at the base, a fallen bell, a tipped box
    for (const [x, z, r] of [[-0.45, 0.05, 0.32], [0.35, -0.75, 0.28], [0.6, 0.15, 0.22], [-0.2, -0.85, 0.24]]) {
      const y = 0.92 + 0.56 * (1 - Math.abs(z + 0.3) / 0.775);
      p.push({ shape: 'sphere', r, pos: [x, y, z], scale: [1.2, 0.32, 1], part: 'moss', seg: 10 });
    }
    for (const x of [-0.62, 0.62]) p.push({ shape: 'cyl', rt: 0.07, rb: 0.09, h: 0.55, pos: [x, 0.44, 0.18], part: 'moss', seg: 7 });
    for (const [x, z, h] of [[-0.85, 0.6, 0.3], [0.8, 0.55, 0.35], [-0.88, -0.7, 0.4], [0.86, -0.4, 0.32], [0.45, 0.8, 0.22]]) {
      p.push({ shape: 'cone', r: 0.15, h, pos: [x, 0.16 + h / 2, z], part: 'moss', seg: 6 });
    }
    p.push({ shape: 'sphere', r: 0.08, pos: [0.42, 0.24, 0.68], part: 'gold', seg: 10 });
    p.push({ shape: 'box', size: [0.5, 0.26, 0.28], pos: [-0.2, 0.27, 0.66], rot: [0, 12, 14], part: 'woodDark' });
  } else {
    for (const x of [-0.45, -0.15, 0.15, 0.45]) p.push({ shape: 'box', size: [0.07, 0.18, 0.01], pos: [x, 0.74, 0.27], rot: [0, 0, 8], part: 'paper' });
    p.push({ shape: 'sphere', r: 0.075, pos: [0, 0.79, 0.36], part: 'gold', seg: 10 });
    p.push({ shape: 'cyl', rt: 0.02, rb: 0.02, h: 0.36, pos: [0, 0.56, 0.37], part: 'lacquer', seg: 6 });
    p.push({ shape: 'box', size: [0.34, 0.17, 0.03], pos: [0, 0.83, 0.17], part: 'gold' });
    // offering box with a gold rim, two red lanterns
    p.push({ shape: 'box', size: [0.5, 0.26, 0.28], pos: [0, 0.29, 0.64], part: 'wood' });
    p.push({ shape: 'box', size: [0.52, 0.03, 0.3], pos: [0, 0.43, 0.64], part: 'gold' });
    for (const x of [-0.7, 0.7]) p.push({ shape: 'sphere', r: 0.1, pos: [x, 0.74, 0.36], scale: [1, 1.3, 1], part: 'lacquer', seg: 10 });
  }
  return p;
}

/** Ebisu's fishing pier: four tiles of deck on posts, the land end at -z. */
export const PIER_DECK = 0.1;
function pier() {
  const p = [];
  for (let i = 0; i < 10; i++) {
    p.push({ shape: 'box', size: [0.96, 0.06, 0.38], pos: [0, PIER_DECK - 0.03, -1.8 + i * 0.4], part: i % 3 === 1 ? 'wood' : 'woodLight' });
  }
  for (const x of [-0.4, 0.4]) p.push({ shape: 'box', size: [0.07, 0.1, 4.0], pos: [x, PIER_DECK - 0.11, 0], part: 'woodDark' });
  for (const z of [-1.5, -0.5, 0.5, 1.5]) for (const x of [-0.46, 0.46]) {
    p.push({ shape: 'cyl', rt: 0.06, rb: 0.07, h: 1.0, pos: [x, -0.3, z], part: 'woodDark', seg: 8 });
  }
  // the far end: taller posts with a rope rail, a lantern and a bait basket
  for (const x of [-0.46, 0.46]) p.push({ shape: 'cyl', rt: 0.06, rb: 0.06, h: 0.5, pos: [x, PIER_DECK + 0.25, 1.85], part: 'woodDark', seg: 8 });
  p.push({ shape: 'cyl', rt: 0.025, rb: 0.025, h: 0.92, pos: [0, PIER_DECK + 0.4, 1.85], rot: [0, 0, 90], part: 'rope', seg: 6 });
  p.push({ shape: 'box', size: [0.05, 0.7, 0.05], pos: [0.46, PIER_DECK + 0.35, 1.0], part: 'woodDark' });
  p.push({ shape: 'box', size: [0.2, 0.04, 0.04], pos: [0.38, PIER_DECK + 0.68, 1.0], part: 'woodDark' });
  p.push({ shape: 'sphere', r: 0.09, pos: [0.3, PIER_DECK + 0.56, 1.0], scale: [1, 1.3, 1], part: 'paper', seg: 10 });
  p.push({ shape: 'cyl', rt: 0.14, rb: 0.11, h: 0.16, pos: [-0.25, PIER_DECK + 0.08, 1.45], part: 'rope', seg: 10 });
  return p;
}

/** A sacred stone where Daikoku sleeps (the hook for chapter 2). */
function stone() {
  return [
    { shape: 'sphere', r: 0.36, pos: [0, 0.26, 0], scale: [1.05, 0.78, 0.92], part: 'stone', seg: 12 },
    { shape: 'sphere', r: 0.17, pos: [0.06, 0.58, 0.02], scale: [1.1, 0.8, 1], part: 'stoneDark', seg: 10 },
    { shape: 'cyl', rt: 0.37, rb: 0.38, h: 0.06, pos: [0, 0.3, 0], part: 'rope', seg: 14 },
    { shape: 'box', size: [0.08, 0.16, 0.01], pos: [-0.12, 0.2, 0.36], rot: [0, 0, 8], part: 'paper' },
    { shape: 'box', size: [0.08, 0.16, 0.01], pos: [0.14, 0.2, 0.35], rot: [0, 0, -8], part: 'paper' },
    { shape: 'sphere', r: 0.16, pos: [-0.22, 0.42, -0.12], scale: [1, 0.35, 1], part: 'moss', seg: 8 },
    { shape: 'cone', r: 0.12, h: 0.2, pos: [0.32, 0.1, 0.18], part: 'moss', seg: 6 },
  ];
}

defineBlockout('shrine_old', {
  label: 'Quiet shrine', footprint: [2, 2], parts: shrine(true), noShop: true,
  desc: 'small, long-forgotten Shinto shrine (hokora) on a stone platform: faded weathered dark wood, paint peeled off, roof tiles covered in thick green moss, ivy creeping up the posts, a sagging straw shimenawa rope, a tipped-over wooden offering box and a fallen brass bell in the grass; melancholic but cosy, waiting to be restored',
});
defineBlockout('shrine', {
  label: 'Ebisu shrine', footprint: [2, 2], parts: shrine(false), noShop: true,
  desc: 'small, freshly restored Shinto shrine (hokora) of Ebisu, god of fishermen and luck: stone platform, warm wooden hall with vermilion lacquered posts, paper lattice doors, grey tiled gable roof with golden crossed chigi and katsuogi on the ridge, a straw shimenawa rope with white paper shide zigzags, a golden bell with red rope, a golden fish plaque, a wooden offering box with gold trim and two red paper lanterns',
});
defineBlockout('pier', {
  label: 'Fishing pier', footprint: [1, 4], onWater: true, walkable: true, parts: pier(), noShop: true,
  desc: 'long narrow wooden fishing pier: weathered light wood plank deck on dark wooden posts standing in the sea, a rope rail at the far end, a small paper lantern on a hook and a woven bait basket',
});
defineBlockout('stone', {
  label: 'Sleeping stone', footprint: [1, 1], parts: stone(), noShop: true,
  desc: 'round mossy sacred boulder (iwakura) with a smaller stone on top, a thick straw shimenawa rope tied around its middle with two white paper shide zigzags, patches of moss',
});

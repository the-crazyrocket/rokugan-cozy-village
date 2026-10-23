// Blockouts: the village props (tile units, y = 0 is the ground, origin = footprint centre).
import { defineBlockout } from '../registry.js';

function minka() {
  const p = [];
  p.push({ shape: 'box', size: [2.7, 0.22, 2.3], pos: [0, 0.11, 0], part: 'stoneDark' });
  p.push({ shape: 'box', size: [2.4, 1.05, 2.0], pos: [0, 0.74, 0], part: 'plaster' });
  for (const x of [-1.2, 0, 1.2]) for (const z of [-1.0, 1.0]) {
    p.push({ shape: 'box', size: [0.13, 1.1, 0.13], pos: [x, 0.76, z], part: 'woodDark' });
  }
  for (const z of [-0.33, 0.33]) for (const x of [-1.2, 1.2]) {
    p.push({ shape: 'box', size: [0.13, 1.1, 0.13], pos: [x, 0.76, z], part: 'woodDark' });
  }
  p.push({ shape: 'box', size: [2.52, 0.12, 2.12], pos: [0, 1.3, 0], part: 'woodDark' });
  p.push({ shape: 'box', size: [2.48, 0.07, 2.08], pos: [0, 0.66, 0], part: 'wood' });
  // sliding door (front, +z) and shoji windows (+x side)
  p.push({ shape: 'box', size: [0.75, 0.82, 0.05], pos: [0.35, 0.68, 1.01], part: 'woodDark' });
  p.push({ shape: 'box', size: [0.6, 0.42, 0.04], pos: [-0.55, 0.92, 1.01], part: 'paper' });
  p.push({ shape: 'box', size: [0.04, 0.42, 0.7], pos: [1.21, 0.92, 0.35], part: 'paper' });
  p.push({ shape: 'box', size: [0.04, 0.42, 0.5], pos: [1.21, 0.92, -0.55], part: 'paper' });
  p.push({ shape: 'box', size: [0.04, 0.42, 0.7], pos: [-1.21, 0.92, 0.0], part: 'paper' });
  // engawa veranda + step
  p.push({ shape: 'box', size: [2.5, 0.08, 0.42], pos: [0, 0.34, 1.22], part: 'woodLight' });
  p.push({ shape: 'box', size: [0.6, 0.12, 0.3], pos: [0.35, 0.12, 1.52], part: 'stone' });
  // thick hipped thatch roof + ridge cap
  p.push({ shape: 'hip', w: 3.15, d: 2.75, h: 1.35, ridge: 1.7, pos: [0, 1.32, 0], part: 'thatch' });
  p.push({ shape: 'box', size: [1.95, 0.2, 0.42], pos: [0, 2.69, 0], part: 'thatchDark' });
  for (const x of [-0.7, 0, 0.7]) {
    p.push({ shape: 'box', size: [0.08, 0.32, 0.5], pos: [x, 2.78, 0], part: 'woodDark' });
  }
  // little lantern by the door
  p.push({ shape: 'cyl', rt: 0.09, rb: 0.09, h: 0.22, pos: [0.95, 1.05, 1.1], part: 'paper', seg: 8 });
  return p;
}

function crate() {
  const p = [{ shape: 'box', size: [0.66, 0.56, 0.66], pos: [0, 0.29, 0], part: 'woodLight' }];
  for (const x of [-0.31, 0.31]) for (const z of [-0.31, 0.31]) {
    p.push({ shape: 'box', size: [0.08, 0.6, 0.08], pos: [x, 0.3, z], part: 'woodDark' });
  }
  for (const y of [0.04, 0.56]) {
    p.push({ shape: 'box', size: [0.7, 0.07, 0.07], pos: [0, y, 0.31], part: 'woodDark' });
    p.push({ shape: 'box', size: [0.7, 0.07, 0.07], pos: [0, y, -0.31], part: 'woodDark' });
    p.push({ shape: 'box', size: [0.07, 0.07, 0.7], pos: [0.31, y, 0], part: 'woodDark' });
    p.push({ shape: 'box', size: [0.07, 0.07, 0.7], pos: [-0.31, y, 0], part: 'woodDark' });
  }
  p.push({ shape: 'box', size: [0.69, 0.12, 0.02], pos: [0, 0.3, 0.335], rot: [0, 0, 38], part: 'wood' });
  p.push({ shape: 'box', size: [0.02, 0.12, 0.69], pos: [0.335, 0.3, 0], rot: [38, 0, 0], part: 'wood' });
  // a daikon peeking out
  p.push({ shape: 'cone', r: 0.07, h: 0.25, pos: [0.1, 0.66, -0.05], rot: [180, 0, 20], part: 'paper', seg: 8 });
  p.push({ shape: 'cone', r: 0.09, h: 0.22, pos: [0.13, 0.86, -0.05], part: 'moss', seg: 6 });
  return p;
}

function pot() {
  return [
    { shape: 'cyl', rt: 0.16, rb: 0.2, h: 0.08, pos: [0, 0.04, 0], part: 'clay', seg: 14 },
    { shape: 'sphere', r: 0.3, pos: [0, 0.33, 0], scale: [1, 0.95, 1], part: 'clay', seg: 16 },
    { shape: 'cyl', rt: 0.17, rb: 0.15, h: 0.14, pos: [0, 0.65, 0], part: 'clay', seg: 14 },
    { shape: 'cyl', rt: 0.2, rb: 0.2, h: 0.04, pos: [0, 0.73, 0], part: 'clay', seg: 14 },
    { shape: 'cyl', rt: 0.305, rb: 0.305, h: 0.07, pos: [0, 0.4, 0], part: 'indigoCloth', seg: 16 },
    { shape: 'cyl', rt: 0.16, rb: 0.18, h: 0.05, pos: [0, 0.77, 0], part: 'woodLight', seg: 14 },
  ];
}

function toro() {
  return [
    { shape: 'cyl', rt: 0.24, rb: 0.3, h: 0.14, pos: [0, 0.07, 0], part: 'stoneDark', seg: 8 },
    { shape: 'cyl', rt: 0.09, rb: 0.11, h: 0.48, pos: [0, 0.38, 0], part: 'stone', seg: 10 },
    { shape: 'box', size: [0.42, 0.1, 0.42], pos: [0, 0.66, 0], part: 'stone' },
    { shape: 'box', size: [0.3, 0.26, 0.3], pos: [0, 0.84, 0], part: 'stone' },
    { shape: 'box', size: [0.16, 0.16, 0.31], pos: [0, 0.85, 0], part: 'paper' },
    { shape: 'box', size: [0.31, 0.16, 0.16], pos: [0, 0.85, 0], part: 'paper' },
    { shape: 'cone', r: 0.38, h: 0.24, pos: [0, 1.09, 0], rot: [0, 45, 0], part: 'stoneDark', seg: 4 },
    { shape: 'sphere', r: 0.07, pos: [0, 1.25, 0], part: 'stone', seg: 10 },
  ];
}

function torii() {
  const p = [];
  for (const x of [-1.0, 1.0]) {
    p.push({ shape: 'cyl', rt: 0.09, rb: 0.11, h: 2.2, pos: [x, 1.1, 0], part: 'lacquer', seg: 12 });
    p.push({ shape: 'cyl', rt: 0.135, rb: 0.135, h: 0.18, pos: [x, 0.09, 0], part: 'lacquerDark', seg: 12 });
  }
  p.push({ shape: 'box', size: [2.6, 0.12, 0.2], pos: [0, 1.75, 0], part: 'lacquer' });
  p.push({ shape: 'box', size: [2.7, 0.12, 0.22], pos: [0, 2.16, 0], part: 'lacquer' });
  p.push({ shape: 'box', size: [1.6, 0.13, 0.28], pos: [0, 2.3, 0], part: 'lacquerDark' });
  p.push({ shape: 'box', size: [0.8, 0.13, 0.28], pos: [-1.18, 2.33, 0], rot: [0, 0, 6], part: 'lacquerDark' });
  p.push({ shape: 'box', size: [0.8, 0.13, 0.28], pos: [1.18, 2.33, 0], rot: [0, 0, -6], part: 'lacquerDark' });
  p.push({ shape: 'box', size: [0.12, 0.34, 0.12], pos: [0, 1.95, 0], part: 'lacquer' });
  p.push({ shape: 'box', size: [0.3, 0.3, 0.04], pos: [0, 1.95, 0.08], part: 'gold' });
  return p;
}

function fence() {
  const p = [];
  for (const x of [-0.44, 0.44]) {
    p.push({ shape: 'box', size: [0.1, 0.62, 0.1], pos: [x, 0.31, 0], part: 'wood' });
    p.push({ shape: 'cone', r: 0.08, h: 0.08, pos: [x, 0.66, 0], rot: [0, 45, 0], part: 'woodDark', seg: 4 });
  }
  for (const y of [0.24, 0.48]) {
    p.push({ shape: 'box', size: [1.0, 0.07, 0.05], pos: [0, y, 0.02], part: 'woodLight' });
  }
  for (const x of [-0.22, 0, 0.22]) {
    p.push({ shape: 'cyl', rt: 0.025, rb: 0.025, h: 0.5, pos: [x, 0.3, -0.03], part: 'moss', seg: 6 });
  }
  p.push({ shape: 'box', size: [0.12, 0.09, 0.12], pos: [0.44, 0.48, 0], part: 'rope' });
  p.push({ shape: 'box', size: [0.12, 0.09, 0.12], pos: [-0.44, 0.48, 0], part: 'rope' });
  return p;
}

function trunk() {
  return [
    { shape: 'cyl', rt: 0.1, rb: 0.17, h: 1.45, pos: [0, 0.72, 0], part: 'bark', seg: 9 },
    { shape: 'cyl', rt: 0.22, rb: 0.26, h: 0.12, pos: [0, 0.04, 0], part: 'moss', seg: 9 },
    { shape: 'cyl', rt: 0.04, rb: 0.07, h: 0.7, pos: [0.25, 1.35, 0.05], rot: [0, 0, -50], part: 'bark', seg: 7 },
    { shape: 'cyl', rt: 0.04, rb: 0.07, h: 0.6, pos: [-0.2, 1.25, -0.12], rot: [-30, 0, 45], part: 'bark', seg: 7 },
    { shape: 'cyl', rt: 0.03, rb: 0.06, h: 0.5, pos: [0.0, 1.5, 0.22], rot: [50, 0, 0], part: 'bark', seg: 7 },
  ];
}

function well() {
  const p = [];
  p.push({ shape: 'cyl', rt: 0.4, rb: 0.44, h: 0.5, pos: [0, 0.25, 0], part: 'stone', seg: 12 });
  p.push({ shape: 'cyl', rt: 0.43, rb: 0.43, h: 0.06, pos: [0, 0.52, 0], part: 'stoneDark', seg: 12 });
  p.push({ shape: 'cyl', rt: 0.32, rb: 0.32, h: 0.02, pos: [0, 0.5, 0], part: 'water', seg: 12 });
  for (const x of [-0.4, 0.4]) {
    p.push({ shape: 'box', size: [0.08, 1.15, 0.08], pos: [x, 0.62, 0], part: 'woodDark' });
  }
  p.push({ shape: 'box', size: [0.9, 0.07, 0.07], pos: [0, 1.06, 0], part: 'woodDark' });
  p.push({ shape: 'cyl', rt: 0.05, rb: 0.05, h: 0.6, pos: [0, 0.93, 0], rot: [0, 0, 90], part: 'wood', seg: 8 });
  p.push({ shape: 'prism', w: 1.15, h: 0.36, d: 0.85, pos: [0, 1.16, 0], part: 'roofTile' });
  p.push({ shape: 'cyl', rt: 0.012, rb: 0.012, h: 0.3, pos: [0.0, 0.76, 0], part: 'rope', seg: 4 });
  p.push({ shape: 'cyl', rt: 0.09, rb: 0.07, h: 0.14, pos: [0.0, 0.62, 0], part: 'wood', seg: 10 });
  return p;
}

function stall() {
  const p = [];
  p.push({ shape: 'box', size: [1.8, 0.62, 0.62], pos: [0, 0.31, 0.12], part: 'wood' });
  p.push({ shape: 'box', size: [1.9, 0.07, 0.72], pos: [0, 0.65, 0.12], part: 'woodLight' });
  for (const x of [-0.88, 0.88]) for (const z of [-0.4, 0.42]) {
    p.push({ shape: 'box', size: [0.08, 1.65, 0.08], pos: [x, 0.82, z], part: 'woodDark' });
  }
  p.push({ shape: 'prism', w: 2.15, h: 0.4, d: 1.25, pos: [0, 1.62, 0], part: 'roofTile' });
  // noren curtain strips
  for (let i = 0; i < 5; i++) {
    p.push({ shape: 'box', size: [0.33, 0.34, 0.02], pos: [-0.7 + i * 0.35, 1.42, 0.55], part: 'indigoCloth' });
  }
  p.push({ shape: 'box', size: [0.5, 0.18, 0.03], pos: [0, 1.78, 0.6], part: 'paper' });
  // goods on the counter
  p.push({ shape: 'box', size: [0.34, 0.16, 0.26], pos: [-0.55, 0.77, 0.15], part: 'woodLight' });
  p.push({ shape: 'sphere', r: 0.08, pos: [-0.6, 0.88, 0.15], part: 'lacquer', seg: 8 });
  p.push({ shape: 'sphere', r: 0.08, pos: [-0.47, 0.88, 0.2], part: 'gold', seg: 8 });
  p.push({ shape: 'cyl', rt: 0.1, rb: 0.12, h: 0.22, pos: [0.15, 0.8, 0.2], part: 'clay', seg: 10 });
  p.push({ shape: 'box', size: [0.4, 0.06, 0.2], pos: [0.6, 0.72, 0.25], part: 'stone' });
  p.push({ shape: 'cyl', rt: 0.05, rb: 0.05, h: 0.36, pos: [0.6, 0.78, 0.25], rot: [0, 0, 90], part: 'water', seg: 6 });
  // paper lanterns hanging from the eaves
  p.push({ shape: 'sphere', r: 0.12, pos: [-0.88, 1.4, 0.62], scale: [1, 1.3, 1], part: 'lacquer', seg: 10 });
  p.push({ shape: 'sphere', r: 0.12, pos: [0.88, 1.4, 0.62], scale: [1, 1.3, 1], part: 'lacquer', seg: 10 });
  return p;
}

defineBlockout('minka', {
  label: 'Minka house', footprint: [3, 3], parts: minka(),
  desc: 'small traditional Japanese minka farmhouse with a thick thatched straw hipped roof, dark timber frame, cream plaster walls, paper shoji windows, a wooden veranda and stone foundation',
});
defineBlockout('crate', {
  label: 'Wooden crate', footprint: [1, 1], parts: crate(),
  desc: 'small wooden produce crate with dark corner posts and cross bracing, a white daikon radish with green leaves peeking out of the top',
});
defineBlockout('pot', {
  label: 'Clay pot', footprint: [1, 1], parts: pot(),
  desc: 'round terracotta clay storage pot (tsubo) with an indigo cloth band tied around its belly and a small wooden lid',
});
defineBlockout('toro', {
  label: 'Stone lantern', footprint: [1, 1], parts: toro(),
  desc: 'Japanese stone garden lantern (toro): round base, pillar, square fire box with warm glowing paper windows, pyramidal stone roof and a jewel finial; mossy weathered grey stone',
});
defineBlockout('torii', {
  label: 'Torii gate', footprint: [3, 1], block: [[1, 0, 1]], parts: torii(),
  desc: 'vermilion lacquered Shinto torii gate with black lintel caps, black pillar bases and a small golden plaque in the centre',
});
defineBlockout('fence', {
  label: 'Fence', footprint: [1, 1], parts: fence(),
  desc: 'short rustic wooden fence segment with two posts, two rails, green bamboo stakes behind and straw rope ties',
});
defineBlockout('trunk', {
  label: 'Tree trunk', footprint: [1, 1], parts: trunk(), noShop: true,
  desc: 'gnarled tree trunk with three short branches (the leaves will be added separately), brown bark, a ring of moss at the base',
});
defineBlockout('well', {
  label: 'Village well', footprint: [1, 1], parts: well(),
  desc: 'round stone village well with water inside, two dark wooden posts, a pulley beam, a rope with a small wooden bucket and a little grey tiled gable roof',
});
defineBlockout('stall', {
  label: 'Merchant stall', footprint: [2, 1], parts: stall(),
  desc: 'small wooden Japanese market stall (yatai) with a dark grey tiled roof, indigo noren curtain strips with cream lettering-free patterns, red paper lanterns, and goods (fruit, a clay jar, a fish) on the counter',
});

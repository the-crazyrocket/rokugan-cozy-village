// Single source of truth for every prop/building shape.
// Each blockout is a list of simple primitives (tile units: 1 unit = 1 grid tile,
// y = 0 is the ground, origin = footprint centre). The SAME data is used by
//  - the game (merged into one geometry per asset, projection-mapped with paint)
//  - the art pipeline (rendered grey from the isometric paint cameras).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARTS } from './palette.js';

const D = Math.PI / 180;

// ---------------------------------------------------------------- definitions
// shape params: box{size:[w,h,d]}, cyl{rt,rb,h,seg}, cone{r,h,seg}, sphere{r,seg},
// prism{w,h,d} (gable, ridge along x), hip{w,d,h,ridge} (hipped roof, ridge along x)
// common: pos:[x,y,z] (centre; for prism/hip the base centre), rot:[x,y,z] degrees, scale:[x,y,z]

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

/** Bridge deck centre height along its local z axis (used for walking on it). */
export const BRIDGE_DECK = (z) => 0.08 + 0.32 * Math.cos((Math.max(-1.55, Math.min(1.55, z)) / 1.55) * Math.PI * 0.5);

function bridge() {
  const p = [];
  const n = 7;
  const deckY = BRIDGE_DECK;
  for (let i = 0; i < n; i++) {
    const z = -1.5 + (i + 0.5) * (3 / n);
    const z2 = z + 3 / n * 0.5;
    const z1 = z - 3 / n * 0.5;
    const ang = Math.atan2(deckY(z2) - deckY(z1), 3 / n) / D;
    p.push({ shape: 'box', size: [0.95, 0.08, 3 / n + 0.02], pos: [0, deckY(z), z], rot: [-ang, 0, 0], part: 'woodLight' });
  }
  for (const x of [-0.47, 0.47]) {
    for (let i = 0; i <= 4; i++) {
      const z = -1.4 + i * 0.7;
      p.push({ shape: 'box', size: [0.08, 0.42, 0.08], pos: [x, deckY(z) + 0.2, z], part: 'lacquer' });
      p.push({ shape: 'sphere', r: 0.055, pos: [x, deckY(z) + 0.44, z], part: 'gold', seg: 8 });
    }
    for (let i = 0; i < 4; i++) {
      const za = -1.4 + i * 0.7, zb = za + 0.7;
      const ya = deckY(za) + 0.36, yb = deckY(zb) + 0.36;
      const ang = Math.atan2(yb - ya, 0.7) / D;
      p.push({ shape: 'box', size: [0.06, 0.06, 0.74], pos: [x, (ya + yb) / 2, (za + zb) / 2], rot: [-ang, 0, 0], part: 'lacquer' });
    }
    p.push({ shape: 'box', size: [0.06, 0.18, 2.9], pos: [x, 0.0, 0], part: 'woodDark' });
  }
  return p;
}

export const BLOCKOUTS = {
  minka: {
    label: 'Minka house', footprint: [3, 3], parts: minka(),
    desc: 'small traditional Japanese minka farmhouse with a thick thatched straw hipped roof, dark timber frame, cream plaster walls, paper shoji windows, a wooden veranda and stone foundation',
  },
  crate: {
    label: 'Wooden crate', footprint: [1, 1], parts: crate(),
    desc: 'small wooden produce crate with dark corner posts and cross bracing, a white daikon radish with green leaves peeking out of the top',
  },
  pot: {
    label: 'Clay pot', footprint: [1, 1], parts: pot(),
    desc: 'round terracotta clay storage pot (tsubo) with an indigo cloth band tied around its belly and a small wooden lid',
  },
  toro: {
    label: 'Stone lantern', footprint: [1, 1], parts: toro(),
    desc: 'Japanese stone garden lantern (toro): round base, pillar, square fire box with warm glowing paper windows, pyramidal stone roof and a jewel finial; mossy weathered grey stone',
  },
  torii: {
    label: 'Torii gate', footprint: [3, 1], block: [[1, 0, 1]], parts: torii(),
    desc: 'vermilion lacquered Shinto torii gate with black lintel caps, black pillar bases and a small golden plaque in the centre',
  },
  fence: {
    label: 'Fence', footprint: [1, 1], parts: fence(),
    desc: 'short rustic wooden fence segment with two posts, two rails, green bamboo stakes behind and straw rope ties',
  },
  trunk: {
    label: 'Tree trunk', footprint: [1, 1], parts: trunk(), noShop: true,
    desc: 'gnarled tree trunk with three short branches (the leaves will be added separately), brown bark, a ring of moss at the base',
  },
  well: {
    label: 'Village well', footprint: [1, 1], parts: well(),
    desc: 'round stone village well with water inside, two dark wooden posts, a pulley beam, a rope with a small wooden bucket and a little grey tiled gable roof',
  },
  stall: {
    label: 'Merchant stall', footprint: [2, 1], parts: stall(),
    desc: 'small wooden Japanese market stall (yatai) with a dark grey tiled roof, indigo noren curtain strips with cream lettering-free patterns, red paper lanterns, and goods (fruit, a clay jar, a fish) on the counter',
  },
  bridge: {
    label: 'Arched bridge', footprint: [1, 3], onWater: true, walkable: true, parts: bridge(),
    desc: 'small arched wooden footbridge with light wood plank deck and vermilion lacquered railings with golden post caps',
  },
};

// Non-blockout props built from shared parts (canopies are billboards, see vegetation.js)
export const TREE_CANOPIES = {
  sakura: [
    { pos: [0, 2.0, 0], size: 2.35, sprite: 'sakura_a' },
    { pos: [0.5, 1.7, 0.3], size: 1.55, sprite: 'sakura_b' },
    { pos: [-0.45, 1.75, -0.3], size: 1.5, sprite: 'sakura_b' },
  ],
  pine: [
    { pos: [0, 2.15, 0], size: 2.2, sprite: 'pine_a' },
    { pos: [0.4, 1.6, 0.25], size: 1.5, sprite: 'pine_b' },
    { pos: [-0.35, 1.5, -0.25], size: 1.4, sprite: 'pine_b' },
  ],
};

// ---------------------------------------------------------------- geometry
function triGeometry(tris, center) {
  // tris: array of [a,b,c] Vector3; flips winding so normals point away from center
  const pos = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (const [a, b, d] of tris) {
    ab.subVectors(b, a); ac.subVectors(d, a); n.crossVectors(ab, ac);
    c.copy(a).add(b).add(d).divideScalar(3).sub(center);
    if (n.dot(c) < 0) pos.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function quad(a, b, c, d) { return [[a, b, c], [a, c, d]]; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function prismGeometry(w, h, d) {
  const x0 = -w / 2, x1 = w / 2;
  const A0 = V(x0, 0, -d / 2), B0 = V(x0, 0, d / 2), C0 = V(x0, h, 0);
  const A1 = V(x1, 0, -d / 2), B1 = V(x1, 0, d / 2), C1 = V(x1, h, 0);
  return triGeometry([
    [A0, B0, C0], [A1, B1, C1],
    ...quad(B0, B1, C1, C0), ...quad(A0, A1, C1, C0), ...quad(A0, A1, B1, B0),
  ], V(0, h / 3, 0));
}

function hipGeometry(w, d, h, ridge) {
  const a = V(-w / 2, 0, -d / 2), b = V(w / 2, 0, -d / 2), c = V(w / 2, 0, d / 2), e = V(-w / 2, 0, d / 2);
  const r0 = V(-ridge / 2, h, 0), r1 = V(ridge / 2, h, 0);
  return triGeometry([
    ...quad(e, c, r1, r0), ...quad(a, b, r1, r0), [b, c, r1], [a, e, r0], ...quad(a, b, c, e),
  ], V(0, h / 3, 0));
}

function primitiveGeometry(p) {
  let g;
  switch (p.shape) {
    case 'box': g = new THREE.BoxGeometry(...p.size); break;
    case 'cyl': g = new THREE.CylinderGeometry(p.rt, p.rb, p.h, p.seg || 12); break;
    case 'cone': g = new THREE.ConeGeometry(p.r, p.h, p.seg || 12); break;
    case 'sphere': g = new THREE.SphereGeometry(p.r, p.seg || 12, Math.max(6, Math.round((p.seg || 12) * 0.66))); break;
    case 'prism': g = prismGeometry(p.w, p.h, p.d); break;
    case 'hip': g = hipGeometry(p.w, p.d, p.h, p.ridge); break;
    default: throw new Error('unknown shape ' + p.shape);
  }
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0]).map((v) => v * D)));
  m.compose(V(...p.pos), q, V(...(p.scale || [1, 1, 1])));
  g.applyMatrix4(m);
  return g;
}

/**
 * Merge a blockout into a single BufferGeometry (asset space).
 * mode: 'palette' -> vertex colour = part colour, 'grey' -> neutral grey value.
 */
export function buildBlockoutGeometry(name, { mode = 'palette' } = {}) {
  const def = BLOCKOUTS[name];
  if (!def) throw new Error('unknown blockout ' + name);
  const geos = def.parts.map((p) => {
    const g = primitiveGeometry(p);
    const part = PARTS[p.part] || PARTS.wood;
    const c = mode === 'grey'
      ? new THREE.Color().setRGB(part.grey, part.grey, part.grey, THREE.SRGBColorSpace)
      : new THREE.Color(part.color); // converted to linear working space
    const rgb = [c.r, c.g, c.b];
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = rgb[0]; col[i + 1] = rgb[1]; col[i + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export const PAINTED_ASSETS = Object.keys(BLOCKOUTS);

// Blockouts: making things (the workbench), the village's project board and the scaffolding a project stands in while it is built.
import { defineBlockout } from '../registry.js';

/** A 2x1 carpenter's bench: thick top on trestle legs, a vice, tools hanging from a back rail, a few planks and a saw. */
function workbench() {
  const p = [];
  p.push({ shape: 'box', size: [1.7, 0.12, 0.62], pos: [0, 0.62, 0], part: 'woodLight' });
  for (const x of [-0.72, 0.72]) {
    for (const z of [-0.24, 0.24]) p.push({ shape: 'box', size: [0.1, 0.58, 0.1], pos: [x, 0.29, z], part: 'woodDark' });
    p.push({ shape: 'box', size: [0.08, 0.08, 0.56], pos: [x, 0.16, 0], part: 'woodDark' });
  }
  p.push({ shape: 'box', size: [1.5, 0.06, 0.5], pos: [0, 0.17, 0], part: 'wood' }); // lower shelf
  p.push({ shape: 'box', size: [0.5, 0.08, 0.14], pos: [0.3, 0.2, 0.0], part: 'woodLight' }); // planks on the shelf
  p.push({ shape: 'box', size: [0.46, 0.06, 0.12], pos: [0.28, 0.27, 0.02], part: 'wood' });
  // back rail with tools
  for (const x of [-0.78, 0.78]) p.push({ shape: 'box', size: [0.07, 0.62, 0.07], pos: [x, 0.98, -0.27], part: 'woodDark' });
  p.push({ shape: 'box', size: [1.62, 0.07, 0.05], pos: [0, 1.25, -0.27], part: 'woodDark' });
  p.push({ shape: 'box', size: [0.05, 0.36, 0.03], pos: [-0.5, 1.03, -0.24], part: 'wood' }); // a mallet
  p.push({ shape: 'box', size: [0.14, 0.09, 0.08], pos: [-0.5, 0.86, -0.24], part: 'woodDark' });
  p.push({ shape: 'box', size: [0.04, 0.3, 0.03], pos: [-0.2, 1.06, -0.24], part: 'woodDark' }); // a chisel
  p.push({ shape: 'box', size: [0.03, 0.12, 0.02], pos: [-0.2, 0.86, -0.24], part: 'stoneDark' });
  p.push({ shape: 'cyl', rt: 0.012, rb: 0.012, h: 0.26, pos: [0.2, 1.1, -0.24], part: 'rope', seg: 4 }); // a coil of rope
  p.push({ shape: 'cyl', rt: 0.1, rb: 0.1, h: 0.05, pos: [0.2, 0.95, -0.22], rot: [90, 0, 0], part: 'rope', seg: 12 });
  // on the top: a vice block, a saw, shavings and a little box joint in progress
  p.push({ shape: 'box', size: [0.16, 0.16, 0.2], pos: [-0.7, 0.76, 0.18], part: 'woodDark' });
  p.push({ shape: 'box', size: [0.5, 0.02, 0.12], pos: [-0.15, 0.69, 0.12], rot: [0, 18, 0], part: 'stone' });
  p.push({ shape: 'box', size: [0.12, 0.04, 0.05], pos: [-0.42, 0.7, 0.04], rot: [0, 18, 0], part: 'wood' });
  p.push({ shape: 'box', size: [0.3, 0.16, 0.22], pos: [0.45, 0.76, 0.02], part: 'woodLight' });
  p.push({ shape: 'sphere', r: 0.06, pos: [0.15, 0.69, 0.18], scale: [1.4, 0.4, 1], part: 'woodLight', seg: 6 });
  return p;
}

/** A small roofed notice board on two posts, pinned with paper notices. */
function noticeBoard() {
  const p = [];
  for (const x of [-0.36, 0.36]) {
    p.push({ shape: 'box', size: [0.09, 1.5, 0.09], pos: [x, 0.75, 0], part: 'woodDark' });
    p.push({ shape: 'cyl', rt: 0.09, rb: 0.11, h: 0.1, pos: [x, 0.05, 0], part: 'stone', seg: 8 });
  }
  p.push({ shape: 'box', size: [0.74, 0.62, 0.05], pos: [0, 0.98, 0.02], part: 'wood' });
  p.push({ shape: 'box', size: [0.8, 0.05, 0.08], pos: [0, 0.66, 0.03], part: 'woodDark' });
  p.push({ shape: 'box', size: [0.8, 0.05, 0.08], pos: [0, 1.3, 0.03], part: 'woodDark' });
  // the notices: paper sheets at small angles, one with a red seal
  const notes = [[-0.2, 1.08, 0.2, 0.24, 4], [0.13, 1.12, 0.22, 0.2, -6], [-0.12, 0.82, 0.26, 0.16, -3], [0.2, 0.84, 0.16, 0.2, 7]];
  for (const [x, y, w, h, r] of notes) p.push({ shape: 'box', size: [w, h, 0.01], pos: [x, y, 0.055], rot: [0, 0, r], part: 'paper' });
  p.push({ shape: 'cyl', rt: 0.025, rb: 0.025, h: 0.01, pos: [0.13, 1.06, 0.065], rot: [90, 0, 0], part: 'lacquer', seg: 10 });
  p.push({ shape: 'prism', w: 1.0, h: 0.24, d: 0.36, pos: [0, 1.5, 0], part: 'roofTile' });
  return p;
}

/** Bamboo scaffolding lashed with rope around a straw-matted frame, planks across: what a project looks like while it is built. */
function scaffold() {
  const p = [];
  for (const x of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) {
    p.push({ shape: 'cyl', rt: 0.035, rb: 0.04, h: 1.4, pos: [x, 0.7, z], part: 'moss', seg: 6 });
  }
  for (const y of [0.45, 1.05]) {
    for (const z of [-0.42, 0.42]) p.push({ shape: 'cyl', rt: 0.025, rb: 0.025, h: 0.92, pos: [0, y, z], rot: [0, 0, 90], part: 'moss', seg: 6 });
    for (const x of [-0.42, 0.42]) p.push({ shape: 'cyl', rt: 0.025, rb: 0.025, h: 0.92, pos: [x, y, 0], rot: [90, 0, 0], part: 'moss', seg: 6 });
  }
  p.push({ shape: 'box', size: [0.9, 0.04, 0.22], pos: [0, 1.08, 0.3], part: 'woodLight' }); // planks
  p.push({ shape: 'box', size: [0.9, 0.04, 0.22], pos: [0, 0.48, -0.3], part: 'woodLight' });
  p.push({ shape: 'box', size: [0.7, 0.75, 0.04], pos: [0, 0.7, 0.44], part: 'thatch' }); // a straw mat hung on the front
  p.push({ shape: 'box', size: [0.34, 0.24, 0.3], pos: [0.18, 0.12, 0.05], part: 'woodLight' }); // a stack of timber
  p.push({ shape: 'box', size: [0.4, 0.1, 0.12], pos: [-0.16, 0.05, -0.1], rot: [0, 30, 0], part: 'wood' });
  p.push({ shape: 'sphere', r: 0.12, pos: [-0.2, 0.08, 0.2], scale: [1, 0.6, 1], part: 'stone', seg: 6 });
  return p;
}

defineBlockout('workbench', {
  label: 'Workbench', footprint: [2, 1], parts: workbench(),
  desc: 'a sturdy Japanese carpenter’s workbench of pale cypress on dark trestle legs, a back rail with a wooden mallet, chisel and coiled rope, a pull-saw and wood shavings on top, planks on the lower shelf',
});
defineBlockout('noticeboard', {
  label: 'Project board', footprint: [1, 1], parts: noticeBoard(),
  desc: 'a small village notice board on two dark wooden posts with stone footings and a little tiled roof, cream paper notices pinned to it, one with a red seal',
});
defineBlockout('scaffold', {
  label: 'Scaffolding', footprint: [1, 1], parts: scaffold(), noShop: true,
  desc: 'green bamboo scaffolding lashed with straw rope, pale wooden planks across it, a woven straw mat hung on the front and a little stack of timber and a stone at its foot',
});

/** A kakei: a bamboo pipe on two crossed-stick stands, dripping into a stone basin; it waters the crops around it. */
function kakei() {
  const p = [];
  p.push({ shape: 'cyl', rt: 0.26, rb: 0.3, h: 0.22, pos: [0.2, 0.11, 0.1], part: 'stone', seg: 10 });
  p.push({ shape: 'cyl', rt: 0.21, rb: 0.21, h: 0.02, pos: [0.2, 0.21, 0.1], part: 'water', seg: 10 });
  // the pipe runs along x, from high on the left down to just over the basin: A -> B
  const A = [-0.44, 0.72, 0.1], B = [0.12, 0.45, 0.1];
  const at = (t) => A.map((a, i) => a + (B[i] - a) * t);
  const mid = at(0.5), len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const tilt = (Math.atan2(Math.hypot(B[0] - A[0], B[2] - A[2]), A[1] - B[1]) * 180) / Math.PI;
  p.push({ shape: 'cyl', rt: 0.05, rb: 0.05, h: len + 0.1, pos: mid, rot: [0, 0, tilt], part: 'moss', seg: 8 });
  // two crossed-stick stands under it
  for (const t of [0.2, 0.72]) {
    const [x, y, z] = at(t), h = y + 0.06;
    for (const lean of [-14, 14]) p.push({ shape: 'cyl', rt: 0.022, rb: 0.028, h, pos: [x, h / 2, z], rot: [lean, 0, 0], part: 'woodDark', seg: 5 });
    p.push({ shape: 'cyl', rt: 0.03, rb: 0.03, h: 0.04, pos: [x, y - 0.03, z], part: 'rope', seg: 6 });
  }
  p.push({ shape: 'cyl', rt: 0.012, rb: 0.012, h: 0.24, pos: [B[0] + 0.02, 0.33, B[2] + 0.02], part: 'water', seg: 4 }); // the trickle
  return p;
}

/** A scarecrow (kakashi) in a straw hat and a patched indigo coat, arms out on a cross-pole. */
function scarecrow() {
  const p = [];
  p.push({ shape: 'cyl', rt: 0.035, rb: 0.04, h: 1.3, pos: [0, 0.65, 0], part: 'woodDark', seg: 6 });
  p.push({ shape: 'cyl', rt: 0.03, rb: 0.03, h: 0.95, pos: [0, 0.95, 0], rot: [0, 0, 90], part: 'woodDark', seg: 6 });
  p.push({ shape: 'box', size: [0.42, 0.42, 0.2], pos: [0, 0.82, 0], part: 'indigoCloth' }); // the coat
  p.push({ shape: 'box', size: [0.86, 0.12, 0.16], pos: [0, 0.95, 0], part: 'indigoCloth' }); // sleeves
  p.push({ shape: 'box', size: [0.12, 0.12, 0.03], pos: [0.1, 0.78, 0.11], part: 'paper' }); // a patch
  p.push({ shape: 'sphere', r: 0.13, pos: [0, 1.17, 0], part: 'paper', seg: 10 }); // a cloth head
  p.push({ shape: 'cone', r: 0.28, h: 0.16, pos: [0, 1.32, 0], part: 'thatch', seg: 12 }); // the straw hat
  for (const x of [-0.46, 0.46]) p.push({ shape: 'cone', r: 0.05, h: 0.12, pos: [x, 0.95, 0], rot: [0, 0, x > 0 ? -90 : 90], part: 'thatch', seg: 6 }); // straw hands
  p.push({ shape: 'cone', r: 0.16, h: 0.2, pos: [0, 0.52, 0], rot: [180, 0, 0], part: 'thatch', seg: 8 }); // a straw skirt
  return p;
}

defineBlockout('kakei', {
  label: 'Bamboo water pipe', footprint: [1, 1], parts: kakei(),
  desc: 'a Japanese kakei: a length of green bamboo pipe resting on crossed dark sticks, a thin trickle of water falling into a round mossy stone basin',
});
defineBlockout('scarecrow', {
  label: 'Scarecrow', footprint: [1, 1], parts: scarecrow(),
  desc: 'a friendly Japanese scarecrow (kakashi) on a wooden cross-pole, a wide straw hat, a cloth face, a patched indigo cotton coat with outstretched sleeves and a straw skirt',
});

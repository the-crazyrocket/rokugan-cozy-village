// Forestry: what a chopped tree leaves behind (the trees themselves are the shared trunk with billboard canopies).
import { defineBlockout } from '../registry.js';

/** A low sawn-off stump: bark sides, a pale cut face with its rings, roots spreading into the moss, a few chips beside it. */
function stump() {
  const p = [];
  p.push({ shape: 'cyl', rt: 0.24, rb: 0.28, h: 0.1, pos: [0, 0.04, 0], part: 'moss', seg: 10 });
  p.push({ shape: 'cyl', rt: 0.17, rb: 0.21, h: 0.3, pos: [0, 0.16, 0], part: 'bark', seg: 10 });
  p.push({ shape: 'cyl', rt: 0.165, rb: 0.165, h: 0.02, pos: [0, 0.315, 0], part: 'woodLight', seg: 10 }); // the cut face
  for (const [a, l] of [[0.3, 0.2], [2.4, 0.17], [4.3, 0.19]]) {
    p.push({ shape: 'cyl', rt: 0.03, rb: 0.05, h: l, pos: [Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2], rot: [Math.sin(a) * 70, 0, -Math.cos(a) * 70], part: 'bark', seg: 6 });
  }
  p.push({ shape: 'box', size: [0.08, 0.02, 0.04], pos: [0.3, 0.02, 0.12], rot: [0, 30, 0], part: 'woodLight' });
  p.push({ shape: 'box', size: [0.06, 0.02, 0.03], pos: [-0.12, 0.02, 0.3], rot: [0, -50, 0], part: 'woodLight' });
  return p;
}

defineBlockout('stump', {
  label: 'Tree stump', footprint: [1, 1], parts: stump(), noShop: true,
  desc: 'a low freshly sawn tree stump with brown bark, a pale cut top showing its growth rings, little roots spreading into a ring of moss, and two wood chips on the ground beside it',
});

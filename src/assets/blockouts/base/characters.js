// Character blockouts: the villagers' bodies in a rest pose (arms a little out from the sides so the paint cameras see them), each
// part tagged with the `bone` it moves with. `bones` gives each bone's pivot (asset space); the game cuts the body up by bone and
// turns the limbs about those pivots, the paint following (render/painted-character.js). Sizes match render/character.js.
import { defineBlockout } from '../registry.js';

export const BIPED_BONES = { torso: [0, 0, 0], head: [0, 0.78, 0], armL: [-0.21, 0.58, 0], armR: [0.21, 0.58, 0], legL: [-0.08, 0.22, 0], legR: [0.08, 0.22, 0] };
const ARM_OUT = 14; // degrees

/** A point `len` down an arm hanging from its pivot, swung out by ARM_OUT. */
const down = (side, len) => {
  const [px, py] = BIPED_BONES[side < 0 ? 'armL' : 'armR'], a = (side * ARM_OUT * Math.PI) / 180;
  return [px + len * Math.sin(a), py - len * Math.cos(a), 0];
};

/** The common body: legs and sandals, the robe and its sash, the arms in their sleeves, the head and its eyes. */
function biped({ robe = 'cloth', sash = 'gold', legs = 'lacquerDark', sleeve = [0.05, 0.065], skirt = 0.25, long = false } = {}) {
  const p = [];
  for (const side of [-1, 1]) {
    const bone = side < 0 ? 'legL' : 'legR', x = side * 0.08;
    p.push({ shape: 'cyl', rt: 0.055, rb: 0.06, h: 0.2, pos: [x, 0.12, 0], part: legs, seg: 7, bone });
    p.push({ shape: 'box', size: [0.1, 0.05, 0.15], pos: [x, 0.025, 0.03], part: 'thatch', bone }); // straw sandals
  }
  p.push(long
    ? { shape: 'cyl', rt: 0.17, rb: skirt, h: 0.56, pos: [0, 0.33, 0], part: robe, seg: 10, bone: 'torso' }
    : { shape: 'cyl', rt: 0.17, rb: skirt, h: 0.42, pos: [0, 0.4, 0], part: robe, seg: 10, bone: 'torso' });
  p.push({ shape: 'cyl', rt: 0.19, rb: 0.2, h: 0.08, pos: [0, 0.42, 0], part: sash, seg: 10, bone: 'torso' });
  for (const side of [-1, 1]) p.push({ shape: 'box', size: [0.035, 0.17, 0.02], pos: [side * 0.035, 0.53, 0.168], rot: [-22, 0, -side * 28], part: 'plaster', bone: 'torso' }); // the crossed collar
  for (const side of [-1, 1]) {
    const bone = side < 0 ? 'armL' : 'armR';
    p.push({ shape: 'cyl', rt: sleeve[0], rb: sleeve[1], h: 0.26, pos: down(side, 0.13), rot: [0, 0, side * ARM_OUT], part: robe, seg: 7, bone });
    p.push({ shape: 'sphere', r: 0.045, pos: down(side, 0.28), part: 'skin', seg: 8, bone });
  }
  p.push({ shape: 'sphere', r: 0.2, pos: [0, 0.78, 0], part: 'skin', seg: 14, bone: 'head' });
  for (const side of [-1, 1]) p.push({ shape: 'sphere', r: 0.026, pos: [side * 0.07, 0.78, 0.182], part: 'lacquerDark', seg: 6, bone: 'head' });
  return p;
}

function kenji() {
  const p = biped({ robe: 'cloth', sash: 'woodDark', legs: 'indigoCloth' });
  p.push({ shape: 'sphere', r: 0.205, pos: [0, 0.84, -0.06], scale: [1.02, 0.78, 0.95], part: 'hair', seg: 14, bone: 'head' });
  p.push({ shape: 'cyl', rt: 0.19, rb: 0.205, h: 0.045, pos: [0, 0.89, -0.01], part: 'plaster', seg: 14, bone: 'head' }); // the headband
  p.push({ shape: 'sphere', r: 0.07, pos: [0, 1.0, -0.1], part: 'hair', seg: 8, bone: 'head' }); // topknot
  p.push({ shape: 'box', size: [0.1, 0.1, 0.06], pos: [0.16, 0.36, 0.13], rot: [0, 30, 0], part: 'woodDark', bone: 'torso' }); // tool pouch
  const [hx, hy] = down(1, 0.28);
  p.push({ shape: 'box', size: [0.03, 0.22, 0.03], pos: [hx, hy - 0.02, 0.07], rot: [80, 0, 0], part: 'woodLight', bone: 'armR' }); // a mallet
  p.push({ shape: 'box', size: [0.12, 0.07, 0.07], pos: [hx, hy - 0.02, 0.18], part: 'woodDark', bone: 'armR' });
  return p;
}

function ume() {
  const p = biped({ robe: 'moss', sash: 'lacquer', legs: 'moss', sleeve: [0.06, 0.1], skirt: 0.24, long: true });
  p.push({ shape: 'sphere', r: 0.205, pos: [0, 0.84, -0.06], scale: [1.02, 0.78, 0.95], part: 'clothLight', seg: 14, bone: 'head' });
  p.push({ shape: 'sphere', r: 0.1, pos: [0, 0.97, -0.1], part: 'clothLight', seg: 10, bone: 'head' }); // the bun
  p.push({ shape: 'cyl', rt: 0.01, rb: 0.01, h: 0.26, pos: [0, 0.98, -0.1], rot: [0, 0, 70], part: 'gold', seg: 4, bone: 'head' }); // a hairpin
  p.push({ shape: 'box', size: [0.2, 0.16, 0.06], pos: [0, 0.44, -0.2], part: 'lacquer', bone: 'torso' }); // the obi's bow
  return p;
}

defineBlockout('char_kenji', {
  label: 'Kenji', footprint: [1, 1], parts: kenji(), noShop: true, character: 'biped', bones: BIPED_BONES,
  desc: 'a cute chibi Japanese village carpenter, Kenji: a round friendly face with small dark eyes, black hair in a topknot under a white hachimaki headband, a short brown happi work coat with a dark sash, indigo trousers, straw sandals, a small wooden mallet in his right hand and a leather tool pouch at his hip',
});
defineBlockout('char_ume', {
  label: 'Ume', footprint: [1, 1], parts: ume(), noShop: true, character: 'biped', bones: BIPED_BONES,
  desc: 'a cute chibi elderly Japanese tea master, Ume: a kind round face with small dark eyes and rosy cheeks, silver-grey hair in a neat bun with a gold hairpin, a long sage-green kimono with wide sleeves, a red obi sash tied in a bow at the back, straw sandals',
});

// A villager's painted body: the character blockout cut up by bone, each bone a mesh pivoting where BIPED_BONES says, painted by
// projection from the rest pose (each vertex keeps its rest position in `paintPos`, so the paint follows a swinging limb). The
// result has the same shape as render/character.js buildCharacter ({ root, rig, parts }), so animateCharacter drives both.
// Returns null when the blockout has no (current) paint: the caller falls back to the procedural body.
import * as THREE from 'three';
import { BLOCKOUTS, buildBlockoutGeometry, buildPartsGeometry } from '../assets/blockouts.js';
import { geomHash } from '../assets/geomhash.js';
import { makePaintedMaterial } from './materials.js';

const mats = new Map();

export function buildPaintedCharacter(name, painted) {
  const def = BLOCKOUTS[name], a = painted?.assets?.[name];
  if (!def?.bones || !a?.angles || a.angles.length < 2 || !a.angles.slice(0, 2).every((g) => g.tex && g.depthTex && g.camera)) return null;
  if (a.geomHash && a.geomHash !== geomHash(buildBlockoutGeometry(name))) return null;
  if (!mats.has(name)) mats.set(name, makePaintedMaterial(a, { attr: 'paintPos' }));
  const mat = mats.get(name);
  const root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig);
  const parts = {};
  for (const [bone, pivot] of Object.entries(def.bones)) {
    const own = def.parts.filter((p) => p.bone === bone);
    if (!own.length) continue;
    const g = buildPartsGeometry(own);
    g.setAttribute('paintPos', g.attributes.position.clone());
    g.translate(-pivot[0], -pivot[1], -pivot[2]);
    const m = new THREE.Mesh(g, mat);
    m.position.set(...pivot);
    m.castShadow = true;
    rig.add(m);
    parts[bone === 'torso' ? 'body' : bone] = m;
  }
  parts.hand = new THREE.Group();
  parts.hand.position.set(0, -0.27, 0.02);
  parts.armR?.add(parts.hand);
  return { root, rig, parts };
}

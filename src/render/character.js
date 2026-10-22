// Cute low-poly villager built from primitives (brushy procedural material).
import * as THREE from 'three';
import { makeBrushMaterial } from './materials.js';
import { PALETTE } from '../assets/palette.js';

const mats = new Map();
const M = (c) => { if (!mats.has(c)) mats.set(c, makeBrushMaterial(c)); return mats.get(c); };

function mesh(geo, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, M(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * opts: { robe, sash, hat (bool), hair, skin }
 * returns { root, parts: { body, head, armL, armR, legL, legR, hand } }
 */
export function buildCharacter(opts = {}) {
  const o = { robe: PALETTE.indigo, sash: PALETTE.gold, hat: true, hair: '#2a2420', skin: PALETTE.skin, pants: '#3d3a40', ...opts };
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  // legs
  const legGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.2, 7); legGeo.translate(0, -0.1, 0);
  const legL = mesh(legGeo, o.pants, -0.08, 0.22, 0);
  const legR = mesh(legGeo, o.pants, 0.08, 0.22, 0);
  const footGeo = new THREE.BoxGeometry(0.1, 0.05, 0.15); footGeo.translate(0, -0.2, 0.03);
  legL.add(mesh(footGeo, PALETTE.straw)); legR.add(mesh(footGeo, PALETTE.straw));
  rig.add(legL, legR);
  // robe body
  const body = mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.42, 9), o.robe, 0, 0.4, 0);
  rig.add(body);
  body.add(mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.08, 9), o.sash, 0, 0.0, 0));
  const collar = mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), o.skin === PALETTE.skin ? PALETTE.cream : PALETTE.cream, 0, 0.1, 0.19);
  collar.rotation.x = -0.35; body.add(collar);
  // arms
  const armGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.26, 7); armGeo.translate(0, -0.13, 0);
  const armL = mesh(armGeo, o.robe, -0.21, 0.58, 0);
  const armR = mesh(armGeo, o.robe, 0.21, 0.58, 0);
  const handGeo = new THREE.SphereGeometry(0.045, 8, 6); handGeo.translate(0, -0.27, 0);
  armL.add(mesh(handGeo, o.skin)); armR.add(mesh(handGeo, o.skin));
  armL.rotation.z = -0.25; armR.rotation.z = 0.25;
  rig.add(armL, armR);
  const hand = new THREE.Group(); hand.position.set(0, -0.27, 0.02); armR.add(hand);
  // head
  const head = new THREE.Group(); head.position.set(0, 0.78, 0); rig.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.2, 14, 10), o.skin));
  const hairM = mesh(new THREE.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), o.hair, 0, 0.01, -0.02);
  hairM.rotation.x = -0.35; head.add(hairM);
  const eyeGeo = new THREE.SphereGeometry(0.025, 6, 5);
  head.add(mesh(eyeGeo, PALETTE.black, -0.07, 0.0, 0.18), mesh(eyeGeo, PALETTE.black, 0.07, 0.0, 0.18));
  const blush = new THREE.SphereGeometry(0.03, 6, 5); blush.scale(1, 0.6, 0.4);
  head.add(mesh(blush, '#e89a8c', -0.12, -0.05, 0.155), mesh(blush, '#e89a8c', 0.12, -0.05, 0.155));
  if (o.hat) {
    const hat = mesh(new THREE.ConeGeometry(0.4, 0.22, 14), PALETTE.straw, 0, 0.2, 0);
    head.add(hat);
    hat.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.04, 14), PALETTE.vermilion, 0, -0.07, 0));
  } else {
    head.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), o.hair, 0, 0.17, -0.1)); // topknot
  }
  return { root, rig, parts: { body, head, armL, armR, legL, legR, hand } };
}

/** Simple walk / idle / swing animation. */
export function animateCharacter(c, t, { moving = false, speed = 1, swing = 0 } = {}) {
  const p = c.parts;
  const ph = t * 10 * speed;
  const a = moving ? Math.sin(ph) * 0.6 : 0;
  p.legL.rotation.x = a; p.legR.rotation.x = -a;
  p.armL.rotation.x = -a * 0.8;
  p.armR.rotation.x = swing ? -swing : a * 0.8;
  c.rig.position.y = moving ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 2.2) * 0.008;
  p.head.rotation.z = moving ? Math.sin(ph * 0.5) * 0.05 : Math.sin(t * 1.3) * 0.03;
}

// Time of day from the player's local clock: sun and moon path and colour,
// sky light, the post-process grade, the tint of unlit painted surfaces and
// sprites, lantern glows, and a 0..1 "night" factor for fireflies and ambience.
import * as THREE from 'three';
import { paintUniforms } from './materials.js';
import { hourOf } from '../game/clock.js';

const NIGHT = {
  sun: '#a9bce8', si: 0.55, sky: '#8ea0d4', gnd: '#34405f', hi: 1.15, bg: '#1d2c48',
  unlit: [0.62, 0.68, 0.9], tint: [0.64, 0.72, 1.0], exp: 0.58, sat: 0.85, night: 1,
};
// Keyframes over the local day; everything in between is interpolated.
const KEYS = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  { h: 5.8, sun: '#ffb592', si: 1.1, sky: '#f4c8b6', gnd: '#6e6670', hi: 1.2, bg: '#6a7a98', unlit: [0.95, 0.84, 0.8], tint: [1.0, 0.88, 0.86], exp: 0.86, sat: 0.95, night: 0.3 },
  { h: 7.3, sun: '#ffe6c4', si: 1.75, sky: '#fff1dc', gnd: '#7d8f5a', hi: 1.4, bg: '#2f6f8f', unlit: [1, 0.98, 0.95], tint: [1, 0.99, 0.97], exp: 0.98, sat: 1.04, night: 0 },
  { h: 12, sun: '#ffe2b8', si: 1.9, sky: '#fff3dc', gnd: '#7d8f5a', hi: 1.45, bg: '#2f6f8f', unlit: [1, 1, 1], tint: [1, 1, 1], exp: 1, sat: 1.06, night: 0 },
  { h: 16.5, sun: '#ffd8a2', si: 1.85, sky: '#fff0d6', gnd: '#7d8f5a', hi: 1.42, bg: '#2f6f8f', unlit: [1, 0.97, 0.92], tint: [1, 0.98, 0.94], exp: 1, sat: 1.06, night: 0 },
  { h: 18.3, sun: '#ff9f66', si: 1.45, sky: '#f5c29e', gnd: '#6f6060', hi: 1.25, bg: '#5a6a8a', unlit: [1.0, 0.86, 0.74], tint: [1.06, 0.88, 0.78], exp: 0.92, sat: 1.08, night: 0.15 },
  { h: 19.5, sun: '#a99ad8', si: 0.8, sky: '#a19ccc', gnd: '#3f405e', hi: 1.15, bg: '#33405e', unlit: [0.78, 0.76, 0.95], tint: [0.78, 0.76, 1.0], exp: 0.72, sat: 0.9, night: 0.7 },
  { h: 20.8, ...NIGHT },
  { h: 24, ...NIGHT },
];
const COLORS = ['sun', 'sky', 'gnd', 'bg'];
const NUMS = ['si', 'hi', 'exp', 'sat', 'night'];
const VECS = ['unlit', 'tint'];
for (const k of KEYS) for (const c of COLORS) k[c] = new THREE.Color(k[c]);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Daylight {
  constructor({ scene, sun, hemi, post, game }) {
    Object.assign(this, { scene, sun, hemi, post, game });
    this.override = null; // fixed hour for screenshots / dev
    this.hour = 12;
    this.night = 0;
    this.cur = { ...KEYS[4], sun: new THREE.Color(), sky: new THREE.Color(), gnd: new THREE.Color(), bg: new THREE.Color() };
    this.sunOffset = new THREE.Vector3(-9, 18, 5);
    // lantern glows: a bright halo at the fire box and a warm pool on the ground
    const tex = glowTexture();
    this.haloMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.poolMat = new THREE.MeshBasicMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.glows = new THREE.Group();
    this.glows.name = 'lantern-glows';
    scene.add(this.glows);
    this.propsVersion = -1;
  }

  syncLanterns() {
    const props = this.game.props;
    if (props.version === this.propsVersion) return;
    this.propsVersion = props.version;
    this.glows.clear();
    for (const p of props.list) {
      if (p.type !== 'toro') continue;
      const halo = new THREE.Sprite(this.haloMat);
      const y0 = this.game.props.baseY(p);
      halo.position.set(p.cx, y0 + 0.86, p.cz);
      halo.scale.setScalar(1.1);
      halo.renderOrder = 7;
      const pool = new THREE.Mesh(this.poolGeo, this.poolMat);
      pool.position.set(p.cx, y0 + 0.02, p.cz);
      pool.scale.setScalar(3.4);
      pool.renderOrder = 2;
      this.glows.add(halo, pool);
    }
  }

  /** Interpolated keyframe for an hour of the day. */
  sample(h) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
    const o = this.cur;
    for (const c of COLORS) o[c].copy(a[c]).lerp(b[c], t);
    for (const n of NUMS) o[n] = a[n] + (b[n] - a[n]) * t;
    for (const v of VECS) o[v] = a[v].map((x, k) => x + (b[v][k] - x) * t);
    return o;
  }

  update(now) {
    const h = this.override ?? hourOf(now);
    this.hour = h;
    const k = this.sample(h);
    this.night = k.night;
    this.sun.color.copy(k.sun); this.sun.intensity = k.si;
    this.hemi.color.copy(k.sky); this.hemi.groundColor.copy(k.gnd); this.hemi.intensity = k.hi;
    this.scene.background.copy(k.bg);
    const u = this.post.material.uniforms;
    u.uTint.value.set(...k.tint); u.uExposure.value = k.exp; u.uSat.value = k.sat; u.uNight.value = k.night;
    paintUniforms.uUnlit.value.setRGB(...k.unlit);
    for (const layer of [this.game.veg, ...Object.values(this.game.cropLayers), this.game.canopy, this.game.gatherLayer, this.game.visitorLayer, this.game.bugLayer, this.game.fellLayer]) layer.material.uniforms.uLight.value.setRGB(...k.unlit);
    this.game.particles.night = k.night;
    // sun arcs from the east in the morning to the west in the evening; a fixed high moon at night
    if (h > 5 && h < 20) {
      const a = (THREE.MathUtils.clamp((h - 5.5) / 14, 0, 1) - 0.5) * 2.4;
      this.sunOffset.set(-6 - 13 * Math.sin(a), 4 + 15 * Math.cos(a), 5 + 4 * Math.sin(a));
    } else this.sunOffset.set(8, 17, -5);
    // lanterns light up as the sky darkens
    this.syncLanterns();
    const g = THREE.MathUtils.smoothstep(k.night, 0.12, 0.75);
    this.glows.visible = g > 0.01;
    // HDR and strongly orange: the night grade cools and darkens everything after this
    this.haloMat.color.setRGB(3.2 * g, 1.55 * g, 0.42 * g);
    this.poolMat.color.setRGB(1.05 * g, 0.5 * g, 0.12 * g);
  }
}

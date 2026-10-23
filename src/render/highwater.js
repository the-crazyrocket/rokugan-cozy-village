// Water above sea level: the surface of ponds and streams dug into raised ground (one quad per tile at its level, drawn with the
// sea's material) and the waterfalls where water steps down one level into water below (or into the sea).
import * as THREE from 'three';
import { LEVEL_Y, WATER_Y } from '../world/coords.js';
import { NOISE_GLSL } from './materials.js';

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TUCK = 0.06; // surfaces reach this far under the banks, so no seam shows at the waterline

/** The tiles of water standing on raised ground: [{ x, z, h }]. */
export function highWaterTiles(world) {
  const out = [];
  for (let z = 0; z < world.h; z++) for (let x = 0; x < world.w; x++) {
    const h = world.heightAt(x, z);
    if (h > 0 && world.isWater(x, z)) out.push({ x, z, h });
  }
  return out;
}

/** Where water drops a level: [{ x, z, dx, dz, top, bottom }] (the edge of tile x,z towards dx,dz; surface heights). */
export function waterfalls(world) {
  const out = [];
  for (const { x, z, h } of highWaterTiles(world)) {
    for (const [dx, dz] of SIDES) {
      const nx = x + dx, nz = z + dz;
      if (!world.isWater(nx, nz) || world.heightAt(nx, nz) !== h - 1) continue;
      out.push({ x, z, dx, dz, top: h * LEVEL_Y + WATER_Y, bottom: (h - 1) * LEVEL_Y + WATER_Y });
    }
  }
  return out;
}

/** One horizontal quad per raised water tile, at its surface. */
export function surfaceGeometry(world) {
  const pos = [];
  for (const { x, z, h } of highWaterTiles(world)) {
    const y = h * LEVEL_Y + WATER_Y;
    // reach under a bank, but not over the lip of a fall (the fall starts at the tile edge)
    const lip = (dx, dz) => world.isWater(x + dx, z + dz) && world.heightAt(x + dx, z + dz) < h;
    const x0 = x - (lip(-1, 0) ? 0 : TUCK), x1 = x + 1 + (lip(1, 0) ? 0 : TUCK);
    const z0 = z - (lip(0, -1) ? 0 : TUCK), z1 = z + 1 + (lip(0, 1) ? 0 : TUCK);
    pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Vertical sheets of falling water, uv.x along the edge, uv.y from the lip (0) to the pool below (1). */
export function fallsGeometry(world) {
  const pos = [], uv = [];
  for (const f of waterfalls(world)) {
    // the edge between the two tiles, pushed a hair outwards so it stands in front of the bank
    const ex = f.dx > 0 ? f.x + 1 : f.dx < 0 ? f.x : null, ez = f.dz > 0 ? f.z + 1 : f.dz < 0 ? f.z : null;
    const a = ex !== null ? [ex + f.dx * 0.02, f.z] : [f.x, ez + f.dz * 0.02];
    const b = ex !== null ? [ex + f.dx * 0.02, f.z + 1] : [f.x + 1, ez + f.dz * 0.02];
    const t = f.top + 0.01, btm = f.bottom - 0.04, u0 = (f.x + f.z) % 2;
    pos.push(a[0], t, a[1], b[0], t, b[1], b[0], btm, b[1], a[0], t, a[1], b[0], btm, b[1], a[0], btm, a[1]);
    uv.push(u0, 0, u0 + 1, 0, u0 + 1, 1, u0, 0, u0 + 1, 1, u0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Streaks running down, whiter and frothier towards the foot, a little see-through at the sides. */
export function makeFallsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color('#5aa7b8') }, uFoam: { value: new THREE.Color('#f4f1e6') } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
uniform float uTime; uniform vec3 uDeep, uFoam; varying vec2 vUv; varying vec3 vW;
${NOISE_GLSL}
void main(){
  float streak = rcvNoise(vec3(vUv.x * 7.0, vUv.y * 1.6 - uTime * 2.2, 3.0));
  float fine = rcvNoise(vec3(vUv.x * 19.0, vUv.y * 3.0 - uTime * 3.1, 9.0));
  float foam = smoothstep(0.55, 1.0, vUv.y) + smoothstep(0.62, 0.9, streak * 0.7 + fine * 0.5) * 0.6 + smoothstep(0.12, 0.0, vUv.y) * 0.5;
  vec3 col = mix(uDeep, uFoam, clamp(foam, 0.0, 1.0));
  float edge = smoothstep(0.0, 0.08, fract(vUv.x)) * smoothstep(1.0, 0.92, fract(vUv.x));
  gl_FragColor = vec4(col, mix(0.55, 0.92, edge) * mix(0.85, 1.0, foam));
  #include <colorspace_fragment>
}`,
  });
}

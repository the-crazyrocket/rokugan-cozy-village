// Island terrain (painted tile textures blended in a Lambert shader) + sea.
import * as THREE from 'three';
import { T } from '../world/kinds.js';
import { NOISE_GLSL } from './materials.js';
import { WATER_Y, LEVEL_Y, MAX_HEIGHT } from '../world/coords.js';
import { surfaceGeometry, fallsGeometry, makeFallsMaterial } from './highwater.js';

export { WATER_Y };
const CLIFF_DEPTH = 0.7;
const BEVEL = 0.24;       // radius of the rounded top edge (stays above the water line)
const BEVEL_STEPS = 4;
const CORNER = 0.42;      // plan-view fillet radius at coastline corners (>= BEVEL, < 0.5)
const CORNER_STEPS = 5;

/**
 * Closed coastline loops around the land, with land on the left. Each point
 * carries its outward normal (nx, nz). Tiles that only touch diagonally stay
 * separate, and every 90° turn is replaced by a CORNER-radius arc.
 */
function traceCoast(world, solid = (x, z) => world.isLand(x, z)) {
  const key = (x, z) => x * 1000 + z;
  const out = new Map(); // start vertex -> edges leaving it
  const add = (x0, z0, x1, z1) => {
    const e = { x0, z0, dx: x1 - x0, dz: z1 - z0, used: false };
    const k = key(x0, z0);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(e);
  };
  for (let z = -1; z <= world.h; z++) for (let x = -1; x <= world.w; x++) {
    if (!solid(x, z)) continue;
    if (!solid(x, z - 1)) add(x, z, x + 1, z);
    if (!solid(x + 1, z)) add(x + 1, z, x + 1, z + 1);
    if (!solid(x, z + 1)) add(x + 1, z + 1, x, z + 1);
    if (!solid(x - 1, z)) add(x, z + 1, x, z);
  }
  const loops = [];
  for (const list of out.values()) for (const first of list) {
    if (first.used) continue;
    // walk the loop, collecting the corners (direction changes)
    const corners = [];
    let e = first;
    do {
      e.used = true;
      const x = e.x0 + e.dx, z = e.z0 + e.dz;
      const next = out.get(key(x, z)).filter((n) => !n.used || n === first);
      // two ways on at a diagonal pinch: turn towards the land to keep the tiles apart
      const n = next.length > 1 ? next.find((c) => c.dx === -e.dz && c.dz === e.dx) || next[0] : next[0];
      if (n.dx !== e.dx || n.dz !== e.dz) corners.push({ x, z, ax: e.dx, az: e.dz, bx: n.dx, bz: n.dz });
      e = n;
    } while (e !== first);
    const pts = [];
    for (const c of corners) for (let i = 0; i <= CORNER_STEPS; i++) {
      // fillet from C - a·R to C + b·R around O = C - a·R + b·R
      const t = (i / CORNER_STEPS) * Math.PI / 2, ct = Math.cos(t), st = Math.sin(t);
      const ox = c.x - c.ax * CORNER + c.bx * CORNER, oz = c.z - c.az * CORNER + c.bz * CORNER;
      const tx = c.ax * ct + c.bx * st, tz = c.az * ct + c.bz * st; // tangent
      pts.push({ x: ox - c.bx * CORNER * ct + c.ax * CORNER * st, z: oz - c.bz * CORNER * ct + c.az * CORNER * st, nx: tz, nz: -tx });
    }
    loops.push(pts);
  }
  return loops;
}

/** Signed area in the xz plane: positive for outer coastlines, negative for ponds. */
function area(l) {
  let s = 0;
  for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a.x * b.z - b.x * a.z; }
  return s / 2;
}

function pointInLoop(p, l) {
  let inside = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
    const a = l[i], b = l[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export class Ground {
  constructor(world, sheets) {
    this.world = world;
    this.group = new THREE.Group();
    // type map: R = sand, G = path, B = soil, A = wet soil
    const { w: W, h: H } = world;
    this.typeData = new Uint8Array(W * H * 4);
    this.typeTex = new THREE.DataTexture(this.typeData, W, H, THREE.RGBAFormat);
    this.typeTex.magFilter = THREE.LinearFilter; this.typeTex.minFilter = THREE.LinearFilter;
    this.typeTex.flipY = false;
    this.wet = new Set();
    const tiles = sheets.tiles.tex;
    this.uniforms = {
      uType: { value: this.typeTex },
      uMapSize: { value: new THREE.Vector2(W, H) },
      uGrass: { value: tiles.grass }, uSand: { value: tiles.sand }, uPath: { value: tiles.path },
      uSoil: { value: tiles.soil }, uCliff: { value: tiles.cliff },
    };
    this.material = this.makeMaterial();
    this.mesh = null;
    this.rebuildMesh();
    this.water = this.makeWater(tiles.water);
    this.group.add(this.water);
    this.rebuildHighWater();
    this.updateTypes();
  }

  makeMaterial() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position,1.0)).xyz; vWNormal = normal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNormal;
uniform sampler2D uType, uGrass, uSand, uPath, uSoil, uCliff; uniform vec2 uMapSize;
${NOISE_GLSL}
vec3 tri(sampler2D t, vec2 p){ return texture2D(t, p).rgb; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vWPos.xz;
  float n1 = rcvNoise(vec3(p * 0.9, 1.0)), n2 = rcvNoise(vec3(p * 3.1, 7.0));
  vec3 col = vec3(0.0);
  // the rounded rim keeps the top texture until it turns over into the cliff
  float top = smoothstep(0.4, 0.78, normalize(vWNormal).y);
  if (top < 1.0) {
    vec2 cp = vec2(vWPos.x + vWPos.z, vWPos.y * 1.6) * 0.35;
    col = tri(uCliff, cp) * mix(0.75, 1.0, smoothstep(-0.7, 0.0, vWPos.y));
    if (vWPos.y > 0.02) col *= mix(0.78, 1.0, smoothstep(0.0, 0.3, fract(vWPos.y / ${LEVEL_Y.toFixed(3)}))); // shade at the foot of each step
  }
  if (top > 0.0) {
    vec2 q = p + (vec2(n1, n2) - 0.5) * 0.55;            // wobbly, painterly borders
    vec4 ty = texture2D(uType, q / uMapSize);
    vec2 cell = floor(p);
    vec4 tc = texelFetch(uType, ivec2(clamp(cell, vec2(0.0), uMapSize - 1.0)), 0);
    vec2 f = fract(p);
    float edge = smoothstep(0.0, 0.07, min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)));
    float soil = tc.b;
    float wet = tc.a;
    vec2 uv = p * 0.33;
    vec3 grass = tri(uGrass, uv) * mix(0.86, 1.1, rcvNoise(vec3(p * 0.25, 3.0)));
    grass = mix(grass, tri(uGrass, uv * 0.61 + 0.37), 0.35);
    vec3 sand = tri(uSand, uv);
    vec3 path = tri(uPath, p * 0.45);
    vec3 dirt = tri(uSoil, p * 0.5) * mix(1.0, 0.62, wet) * mix(0.72, 1.0, edge);
    float sw = smoothstep(0.35, 0.6, ty.r + (n2 - 0.5) * 0.25);
    float pw = smoothstep(0.35, 0.6, ty.g + (n2 - 0.5) * 0.25);
    vec3 tcol = mix(grass, sand, sw);
    tcol = mix(tcol, path, pw);
    tcol = mix(tcol, dirt, soil);
    col = mix(col, tcol * mix(0.9, 1.0, top), top);
  }
  diffuseColor.rgb *= col;
}`);
    };
    mat.customProgramCacheKey = () => 'ground-v3';
    return mat;
  }

  /**
   * Land as soft blocks, one per height level: the land at level >= L (sea, river and pond banks, and the foot of every
   * higher step) is traced into closed loops, every grid corner is filleted in plan view, and a quarter-round profile rolls
   * the top (y = L * LEVEL_Y) over into a vertical cliff. Level 0 drops into the sea; a higher level's cliff reaches just
   * below the rim of the level under it, so the steps read as stacked rounded blocks.
   */
  rebuildMesh() {
    const sink = () => {
      const pos = [], nor = [];
      const tri = (a, b, c, na, nb, nc) => {
        // keep every triangle facing the way its normals point
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
        if (gx * (na[0] + nb[0] + nc[0]) + gy * (na[1] + nb[1] + nc[1]) + gz * (na[2] + nb[2] + nc[2]) < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; }
        pos.push(...a, ...b, ...c); nor.push(...na, ...nb, ...nc);
      };
      const geometry = () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        return g;
      };
      return { tri, geometry };
    };
    const ground = sink(), walls = sink(); // walls: the cliffs of raised levels, the only ground that casts shadows
    const world = this.world;
    let top = 0;
    for (let i = 0; i < world.height.length; i++) if (world.kind[i] !== T.WATER && world.height[i] > top) top = world.height[i];
    for (let level = 0; level <= Math.min(top, MAX_HEIGHT); level++) {
      // land stands up to its level; water on raised ground has ground under it up to the level below its own (the basin floor)
      const solid = (x, z) => (world.isLand(x, z) ? world.heightAt(x, z) >= level : world.heightAt(x, z) > level);
      const y0 = level * LEVEL_Y, floor = level === 0 ? -CLIFF_DEPTH : y0 - LEVEL_Y - BEVEL - 0.02;
      this.addBlock(traceCoast(world, solid), y0, floor, ground.tri, level > 0 ? walls.tri : null);
    }
    const g = ground.geometry(), cg = walls.geometry();
    if (this.mesh) {
      this.mesh.geometry.dispose(); this.mesh.geometry = g;
      this.caster.geometry.dispose(); this.caster.geometry = cg;
      return;
    }
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'ground';
    this.group.add(this.mesh);
    // drawn only into the shadow map (no colour, no depth): raised ground shades what lies below it without the tops shadowing themselves
    this.caster = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    this.caster.castShadow = true;
    this.caster.name = 'ground-shadow';
    this.group.add(this.caster);
  }

  /**
   * One level's block: the flat top at y0 (holes cut out), then the rounded rim and the cliff down to `floor`, swept along each loop.
   * `wall`, when given, also gets the rim and the cliff (the shadow caster).
   */
  addBlock(loops, y0, floor, tri, wall = null) {
    const UP = [0, 1, 0];
    // flat top: the outline inset by the bevel radius, holes (ponds, river, lower ground) cut out
    const inset = loops.map((l) => l.map((p) => new THREE.Vector2(p.x - p.nx * BEVEL, p.z - p.nz * BEVEL)));
    const outers = [], holes = [];
    loops.forEach((l, i) => (area(l) > 0 ? outers : holes).push(i));
    const holesOf = new Map(outers.map((i) => [i, []]));
    for (const h of holes) {
      const inside = outers.filter((o) => pointInLoop(loops[h][0], loops[o])).sort((a, b) => area(loops[a]) - area(loops[b]));
      if (inside.length) holesOf.get(inside[0]).push(h);
    }
    for (const [o, hs] of holesOf) {
      const verts = [inset[o], ...hs.map((h) => inset[h])].flat();
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(inset[o], hs.map((h) => inset[h]))) {
        const v = (i) => [verts[i].x, y0, verts[i].y];
        tri(v(a), v(b), v(c), UP, UP, UP);
      }
    }
    const ring = [];
    for (let j = 0; j <= BEVEL_STEPS; j++) {
      const th = (j / BEVEL_STEPS) * Math.PI / 2;
      ring.push({ out: -BEVEL * (1 - Math.sin(th)), y: y0 - BEVEL * (1 - Math.cos(th)), s: Math.sin(th), c: Math.cos(th) });
    }
    ring.push({ out: 0, y: floor, s: 1, c: 0 });
    for (const l of loops) for (let k = 0; k < l.length; k++) {
      const p = l[k], q = l[(k + 1) % l.length];
      const at = (P, r) => [P.x + P.nx * r.out, r.y, P.z + P.nz * r.out];
      const nAt = (P, r) => [P.nx * r.s, r.c, P.nz * r.s];
      for (let j = 0; j < ring.length - 1; j++) {
        const r0 = ring[j], r1 = ring[j + 1];
        for (const f of wall ? [tri, wall] : [tri]) {
          f(at(p, r0), at(q, r0), at(q, r1), nAt(p, r0), nAt(q, r0), nAt(q, r1));
          f(at(p, r0), at(q, r1), at(p, r1), nAt(p, r0), nAt(q, r1), nAt(p, r1));
        }
      }
    }
  }

  updateTypes() {
    const d = this.typeData, w = this.world, W = w.w, H = w.h;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = w.get(x, z), i = (z * W + x) * 4;
      // water tiles next to sand read as sand so beaches blend under the waterline
      let sand = t === T.SAND;
      if (t === T.WATER) for (let dz = -1; dz <= 1 && !sand; dz++) for (let dx = -1; dx <= 1; dx++) if (w.get(x + dx, z + dz) === T.SAND) sand = true;
      d[i] = sand ? 255 : 0;
      d[i + 1] = t === T.PATH ? 255 : 0;
      d[i + 2] = t === T.SOIL ? 255 : 0;
      d[i + 3] = t === T.SOIL && this.wet.has(z * W + x) ? 255 : 0;
    }
    this.typeTex.needsUpdate = true;
  }

  /** Distance-to-land field (in the uDist texture): shallows and foam follow the shore, and every dug pond's banks. */
  updateWaterField() {
    const { w: W, h: H } = this.world;
    const S = 2, fw = W * S, fh = H * S;
    const land = new Float32Array(fw * fh);
    for (let z = 0; z < fh; z++) for (let x = 0; x < fw; x++) land[z * fw + x] = this.world.isLand(Math.floor(x / S), Math.floor(z / S)) ? 0 : 99;
    // two-pass chamfer distance
    const idx = (x, z) => z * fw + x;
    for (let pass = 0; pass < 2; pass++) for (let z = 0; z < fh; z++) for (let x = 0; x < fw; x++) {
      const xx = pass ? fw - 1 - x : x, zz = pass ? fh - 1 - z : z, s = pass ? 1 : -1;
      let v = land[idx(xx, zz)];
      if (xx + s >= 0 && xx + s < fw) v = Math.min(v, land[idx(xx + s, zz)] + 1);
      if (zz + s >= 0 && zz + s < fh) v = Math.min(v, land[idx(xx, zz + s)] + 1);
      if (xx + s >= 0 && xx + s < fw && zz + s >= 0 && zz + s < fh) v = Math.min(v, land[idx(xx + s, zz + s)] + 1.414);
      land[idx(xx, zz)] = v;
    }
    if (!this.distTex) {
      this.distTex = new THREE.DataTexture(new Uint8Array(fw * fh * 4), fw, fh, THREE.RGBAFormat);
      this.distTex.magFilter = this.distTex.minFilter = THREE.LinearFilter;
    }
    const data = this.distTex.image.data;
    for (let i = 0; i < fw * fh; i++) {
      const v = Math.min(255, (land[i] / S) * 40);
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    this.distTex.needsUpdate = true;
  }

  /** Water on raised ground and its waterfalls, rebuilt with the terrain; the sea plane covers level 0. */
  rebuildHighWater() {
    const swap = (mesh, g) => { mesh.geometry.dispose(); mesh.geometry = g; };
    if (!this.high) {
      this.high = new THREE.Mesh(surfaceGeometry(this.world), this.waterMat);
      this.high.name = 'high-water';
      this.falls = new THREE.Mesh(fallsGeometry(this.world), makeFallsMaterial());
      this.falls.name = 'waterfalls';
      this.falls.renderOrder = 3;
      this.group.add(this.high, this.falls);
      return;
    }
    swap(this.high, surfaceGeometry(this.world));
    swap(this.falls, fallsGeometry(this.world));
  }

  /** After the ground changed shape: the blocks, the water on top of them and the shallows. */
  rebuildTerrain() {
    this.rebuildMesh();
    this.updateWaterField();
    this.rebuildHighWater();
  }

  makeWater(waterTex) {
    const { w: W, h: H } = this.world;
    this.updateWaterField();
    const distTex = this.distTex;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDist: { value: distTex }, uTex: { value: waterTex }, uMapSize: { value: new THREE.Vector2(W, H) },
        uDeep: { value: new THREE.Color('#2f6f8f') }, uShallow: { value: new THREE.Color('#7cc3c0') }, uFoam: { value: new THREE.Color('#f4ead2') },
      },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
uniform float uTime; uniform sampler2D uDist, uTex; uniform vec2 uMapSize; uniform vec3 uDeep, uShallow, uFoam; varying vec3 vW;
${NOISE_GLSL}
void main(){
  vec2 p = vW.xz;
  vec2 duv = p / uMapSize;
  float inside = step(0.0, duv.x) * step(0.0, duv.y) * step(duv.x, 1.0) * step(duv.y, 1.0);
  float d = mix(6.0, texture2D(uDist, clamp(duv, 0.0, 1.0)).r * 255.0 / 40.0, inside); // tiles to shore
  float n = rcvNoise(vec3(p * 0.7, uTime * 0.15));
  vec3 tex = texture2D(uTex, p * 0.18 + vec2(uTime * 0.012, uTime * 0.007)).rgb;
  vec3 tex2 = texture2D(uTex, p * 0.11 - vec2(uTime * 0.009, -uTime * 0.011)).rgb;
  float shallow = 1.0 - smoothstep(0.0, 2.6 + n, d);
  vec3 col = mix(uDeep, uShallow, shallow);
  vec3 tx = (tex + tex2) * 0.5;
  float tl = dot(tx, vec3(0.3, 0.5, 0.2));
  col *= mix(vec3(1.0), tx / max(tl, 0.05) * mix(0.85, 1.12, smoothstep(0.25, 0.75, tl)), mix(0.35, 0.7, shallow));
  float foamBand = (1.0 - smoothstep(0.05, 0.42, d + (n - 0.5) * 0.25));
  float ripple = smoothstep(0.75, 0.95, sin(d * 9.0 - uTime * 1.6 + n * 4.0)) * (1.0 - smoothstep(0.3, 1.2, d));
  col = mix(col, uFoam, clamp(foamBand * 0.85 + ripple * 0.45, 0.0, 1.0));
  float spark = smoothstep(0.86, 0.93, rcvNoise(vec3(p * 2.5, uTime * 0.6))) * 0.12;
  col += spark;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
    });
    const g = new THREE.PlaneGeometry(W + 120, H + 120);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(W / 2, WATER_Y, H / 2);
    mesh.name = 'water';
    this.waterMat = mat;
    return mesh;
  }

  update(t) { this.waterMat.uniforms.uTime.value = t; this.falls.material.uniforms.uTime.value = t; }
}

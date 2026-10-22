// Island terrain (painted tile textures blended in a Lambert shader) + sea.
import * as THREE from 'three';
import { W, H, T } from '../game/world.js';
import { NOISE_GLSL } from './materials.js';

export const WATER_Y = -0.32;
const CLIFF_DEPTH = 0.7;

export class Ground {
  constructor(world, sheets) {
    this.world = world;
    this.group = new THREE.Group();
    // type map: R = sand, G = path, B = soil, A = wet soil
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
  vec3 col;
  if (vWNormal.y < 0.5) {
    vec2 cp = vec2(vWPos.x + vWPos.z, vWPos.y * 1.6) * 0.35;
    col = tri(uCliff, cp) * mix(0.75, 1.0, smoothstep(-0.7, 0.0, vWPos.y));
  } else {
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
    col = mix(grass, sand, sw);
    col = mix(col, path, pw);
    col = mix(col, dirt, soil);
  }
  diffuseColor.rgb *= col;
}`);
    };
    mat.customProgramCacheKey = () => 'ground-v1';
    return mat;
  }

  rebuildMesh() {
    const pos = [], nor = [];
    const quad = (a, b, c, d, n) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) nor.push(...n); };
    const w = this.world;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!w.isLand(x, z)) continue;
      quad([x, 0, z], [x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], [0, 1, 0]);
      const y0 = 0, y1 = -CLIFF_DEPTH;
      if (!w.isLand(x + 1, z)) quad([x + 1, y0, z + 1], [x + 1, y1, z + 1], [x + 1, y1, z], [x + 1, y0, z], [1, 0, 0]);
      if (!w.isLand(x - 1, z)) quad([x, y0, z], [x, y1, z], [x, y1, z + 1], [x, y0, z + 1], [-1, 0, 0]);
      if (!w.isLand(x, z + 1)) quad([x, y0, z + 1], [x, y1, z + 1], [x + 1, y1, z + 1], [x + 1, y0, z + 1], [0, 0, 1]);
      if (!w.isLand(x, z - 1)) quad([x + 1, y0, z], [x + 1, y1, z], [x, y1, z], [x, y0, z], [0, 0, -1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.geometry = g; return; }
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'ground';
    this.group.add(this.mesh);
  }

  updateTypes() {
    const d = this.typeData, w = this.world;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = w.get(x, z), i = (z * W + x) * 4;
      // water tiles next to sand read as sand so beaches blend under the waterline
      d[i] = t === T.SAND ? 255 : 0;
      d[i + 1] = t === T.PATH ? 255 : 0;
      d[i + 2] = t === T.SOIL ? 255 : 0;
      d[i + 3] = t === T.SOIL && this.wet.has(z * W + x) ? 255 : 0;
    }
    this.typeTex.needsUpdate = true;
  }

  makeWater(waterTex) {
    // distance-to-land field for shallows + foam
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
    const data = new Uint8Array(fw * fh * 4);
    for (let i = 0; i < fw * fh; i++) {
      const v = Math.min(255, (land[i] / S) * 40);
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    const distTex = new THREE.DataTexture(data, fw, fh, THREE.RGBAFormat);
    distTex.magFilter = distTex.minFilter = THREE.LinearFilter;
    distTex.needsUpdate = true;
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

  update(t) { this.waterMat.uniforms.uTime.value = t; }
}

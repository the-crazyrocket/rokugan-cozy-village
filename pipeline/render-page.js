// Pipeline page: renders every blockout from the fixed isometric paint cameras
// and produces the passes the paint step needs. Driven by pipeline/render.mjs
// through window.pipeline.*; every function returns PNG data URLs + JSON.
import * as THREE from 'three';
import { BLOCKOUTS, buildBlockoutGeometry } from '../src/assets/blockouts.js';
import { SHEETS } from '../src/assets/sheets.js';
import { PALETTE } from '../src/assets/palette.js';
import { computePaintCamera, PAINT_AZIMUTHS } from '../src/render/paintCamera.js';

const SIZE = 1024;
const MAGENTA = new THREE.Color('#ff00ff');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const rtOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true };
const depthRT = new THREE.WebGLRenderTarget(SIZE, SIZE, rtOpts);
const normalRT = new THREE.WebGLRenderTarget(SIZE, SIZE, rtOpts);

// Packs NDC depth (0..1, linear for ortho) into R (coarse) + G (fine), B = 1, A = 1.
const depthMaterial = new THREE.ShaderMaterial({
  vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `void main(){
    float d = clamp(gl_FragCoord.z, 0.0, 0.99998);
    float hi = floor(d * 255.0) / 255.0;
    float lo = fract(d * 255.0);
    gl_FragColor = vec4(hi, lo, 1.0, 1.0);
  }`,
});
const normalMaterial = new THREE.ShaderMaterial({
  vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 1.0); }`,
});

const quadScene = new THREE.Scene();
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { tDepth: { value: depthRT.texture }, tNormal: { value: normalRT.texture }, texel: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDepth, tNormal; uniform vec2 texel; varying vec2 vUv;
    float dep(vec2 uv){ vec4 c = texture2D(tDepth, uv); return c.b < 0.5 ? 1.0 : c.r + c.g / 255.0; }
    vec3 nor(vec2 uv){ return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }
    void main(){
      float d0 = dep(vUv); vec3 n0 = nor(vUv);
      float e = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 o = i == 0 ? vec2(1,0) : i == 1 ? vec2(-1,0) : i == 2 ? vec2(0,1) : vec2(0,-1);
        vec2 uv = vUv + o * texel * 1.5;
        float d = dep(uv); vec3 n = nor(uv);
        e = max(e, step(0.004, abs(d - d0)));
        e = max(e, smoothstep(0.25, 0.6, 1.0 - dot(n, n0)));
      }
      gl_FragColor = vec4(vec3(1.0 - e), 1.0);
    }`,
  depthTest: false,
});
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMaterial));

// three's render targets don't include our custom "background = far" sentinel
// for the depth pass: clear to (1,1,0) so B=0 marks background.
function renderTo(rt, scene, cam, clear) {
  renderer.setRenderTarget(rt);
  renderer.setClearColor(clear, 1);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
}

function rtToDataURL(rt) {
  const buf = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, buf);
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    const src = (SIZE - 1 - y) * SIZE * 4;
    img.data.set(buf.subarray(src, src + SIZE * 4), y * SIZE * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function canvasPass(scene, cam, bg) {
  scene.background = bg;
  renderer.setRenderTarget(null);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
}

function litScene(mesh) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-2, 6, 4);
  scene.add(sun);
  scene.add(mesh);
  return scene;
}

function renderAsset(name, az) {
  const greyGeo = buildBlockoutGeometry(name, { mode: 'grey' });
  const colGeo = buildBlockoutGeometry(name, { mode: 'palette' });
  const { camera, json } = computePaintCamera(greyGeo, az);
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const greyMesh = new THREE.Mesh(greyGeo, lambert);
  const colMesh = new THREE.Mesh(colGeo, lambert);
  const out = { camera: { asset: name, size: SIZE, ...json } };

  out.grey = canvasPass(litScene(greyMesh), camera, MAGENTA);
  out.color = canvasPass(litScene(colMesh), camera, MAGENTA);

  const flat = new THREE.Scene();
  const maskMesh = new THREE.Mesh(greyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  flat.add(maskMesh);
  out.mask = canvasPass(flat, camera, new THREE.Color(0x000000));

  maskMesh.material = normalMaterial;
  renderTo(normalRT, flat, camera, 0x000000);
  out.normal = rtToDataURL(normalRT);
  maskMesh.material = depthMaterial;
  renderTo(depthRT, flat, camera, 0xffff00);
  out.depth = rtToDataURL(depthRT);

  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);
  out.outline = renderer.domElement.toDataURL('image/png');

  greyGeo.dispose(); colGeo.dispose(); lambert.dispose();
  return out;
}

// ------------------------------------------------------------ sheet guides
// Rough coloured placeholder sketches laid out on the sheet grid. They tell
// Codex where each sprite goes, and double as the procedural fallback.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function brushStroke(ctx, x0, y0, x1, y1, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + (y1 - y0) * 0.15, (y0 + y1) / 2, x1, y1); ctx.stroke();
}
function blades(ctx, r, cx, by, w, h, n, cols) {
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * w;
    brushStroke(ctx, x, by, x + (r() - 0.5) * w * 0.6, by - h * (0.5 + r() * 0.5), 6 + r() * 6, cols[i % cols.length]);
  }
}
function blobs(ctx, r, cx, cy, rad, n, cols) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, rad * (0.25 + r() * 0.25), 0, Math.PI * 2); ctx.fill();
  }
}
function stalks(ctx, r, cx, by, h, n, col) {
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * 26;
    ctx.fillStyle = col; ctx.fillRect(x - 7, by - h * (0.8 + r() * 0.2), 14, h);
    ctx.fillStyle = PALETTE.mossDark;
    for (let y = by - 40; y > by - h * 0.8; y -= 60) ctx.fillRect(x - 8, y, 16, 4);
  }
}

const DRAW = {
  grass_a: (c, r, x, y, w, h) => blades(c, r, x, y, w * 0.4, h * 0.35, 14, [PALETTE.moss, PALETTE.mossDark, '#8aa556']),
  grass_b: (c, r, x, y, w, h) => { blades(c, r, x, y, w * 0.6, h * 0.3, 20, [PALETTE.moss, PALETTE.mossDark]); blobs(c, r, x, y - h * 0.1, w * 0.12, 5, ['#8aa556']); },
  flowers_pink: (c, r, x, y, w, h) => { blades(c, r, x, y, w * 0.45, h * 0.3, 12, [PALETTE.moss, PALETTE.mossDark]); blobs(c, r, x, y - h * 0.3, w * 0.16, 7, [PALETTE.sakura, PALETTE.vermilion]); },
  flowers_white: (c, r, x, y, w, h) => { blades(c, r, x, y, w * 0.45, h * 0.3, 12, [PALETTE.moss, PALETTE.mossDark]); blobs(c, r, x, y - h * 0.3, w * 0.16, 7, [PALETTE.cream, PALETTE.gold]); },
  bamboo: (c, r, x, y, w, h) => { stalks(c, r, x, y, h * 0.9, 3, '#7f9c4a'); blobs(c, r, x, y - h * 0.8, w * 0.25, 12, [PALETTE.moss, '#8aa556']); },
  bush: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.25, w * 0.3, 18, [PALETTE.moss, PALETTE.mossDark, '#8aa556']),
  reeds: (c, r, x, y, w, h) => { blades(c, r, x, y, w * 0.4, h * 0.75, 12, [PALETTE.moss, PALETTE.straw]); blobs(c, r, x, y - h * 0.65, w * 0.08, 3, [PALETTE.woodDark]); },
  fern: (c, r, x, y, w, h) => { blades(c, r, x, y, w * 0.7, h * 0.4, 16, [PALETTE.moss, PALETTE.mossDark, '#5f7e3a']); },
  rice_1: (c, r, x, y, w, h) => blades(c, r, x, y, w * 0.3, h * 0.2, 8, ['#8aa556']),
  rice_2: (c, r, x, y, w, h) => blades(c, r, x, y, w * 0.45, h * 0.5, 16, [PALETTE.moss, '#8aa556']),
  rice_3: (c, r, x, y, w, h) => { blades(c, r, x, y, w * 0.5, h * 0.6, 16, [PALETTE.straw, '#a8a34a']); blobs(c, r, x, y - h * 0.55, w * 0.2, 10, [PALETTE.gold]); },
  daikon_1: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.08, w * 0.08, 3, ['#8aa556']),
  daikon_2: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.2, w * 0.2, 10, [PALETTE.moss, '#8aa556']),
  daikon_3: (c, r, x, y, w, h) => { blobs(c, r, x, y - h * 0.4, w * 0.25, 12, [PALETTE.moss, '#8aa556']); c.fillStyle = PALETTE.paper; c.beginPath(); c.ellipse(x, y - h * 0.12, w * 0.1, h * 0.14, 0, 0, Math.PI * 2); c.fill(); },
  tea_1: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.08, w * 0.08, 4, [PALETTE.mossDark]),
  tea_2: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.2, w * 0.2, 12, [PALETTE.mossDark, PALETTE.moss]),
  tea_3: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.3, w * 0.32, 22, [PALETTE.mossDark, PALETTE.moss, '#9cbf5a']),
  sakura_a: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.5, w * 0.38, 30, [PALETTE.sakura, '#e79bb0', '#f7d3dc']),
  sakura_b: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.4, w * 0.28, 20, [PALETTE.sakura, '#e79bb0', '#f7d3dc']),
  pine_a: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.5, w * 0.38, 30, [PALETTE.pine, '#2f5238', '#56825a']),
  pine_b: (c, r, x, y, w, h) => blobs(c, r, x, y - h * 0.4, w * 0.28, 20, [PALETTE.pine, '#2f5238', '#56825a']),
};
const TILE_BASE = { grass: PALETTE.moss, sand: '#d9c08f', path: '#a88b66', soil: PALETTE.soil, water: PALETTE.water, cliff: '#7a5a3e' };

function renderSheetGuide(name) {
  const s = SHEETS[name];
  const c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, s.width, s.height);
  const cw = s.width / s.cols, ch = s.height / s.rows;
  s.cells.forEach(([id], i) => {
    const col = i % s.cols, row = Math.floor(i / s.cols);
    const x0 = col * cw, y0 = row * ch;
    const r = rng(i * 7919 + name.length * 31);
    if (s.tile) {
      ctx.fillStyle = TILE_BASE[id]; ctx.fillRect(x0, y0, cw, ch);
      for (let k = 0; k < 220; k++) {
        const x = x0 + r() * cw, y = y0 + r() * ch, l = 10 + r() * 30;
        const shade = r() < 0.5 ? 'rgba(255,255,230,0.12)' : 'rgba(30,20,10,0.12)';
        brushStroke(ctx, x, y, x + l, y + (r() - 0.5) * 8, 4 + r() * 6, shade);
      }
    } else if (DRAW[id]) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 + 8, y0 + 8, cw - 16, ch - 16); ctx.clip();
      DRAW[id](ctx, r, x0 + cw / 2, y0 + ch * 0.92, cw, ch);
      ctx.restore();
    } else {
      // icons: neutral round placeholder
      ctx.fillStyle = '#9a9a9a';
      ctx.beginPath(); ctx.arc(x0 + cw / 2, y0 + ch / 2, Math.min(cw, ch) * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  });
  return c.toDataURL('image/png');
}

window.pipeline = {
  assets: () => Object.keys(BLOCKOUTS),
  azimuths: () => PAINT_AZIMUTHS,
  sheets: () => Object.keys(SHEETS),
  renderAsset,
  renderSheetGuide,
};
window.pipelineReady = true;

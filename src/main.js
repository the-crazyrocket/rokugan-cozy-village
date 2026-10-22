// Boot: renderer, isometric camera, lights, painted assets, input and the main loop.
import * as THREE from 'three';
import { loadPaintedAssets } from './render/assets.js';
import { PostFX } from './render/postfx.js';
import { cameraOffsetDir, GAME_AZIMUTH } from './render/paintCamera.js';
import { Game } from './game/game.js';
import { UI } from './game/ui.js';
import { W, H } from './game/world.js';
import { setupInput } from './game/input.js';

const canvas = document.getElementById('game');
const loading = document.getElementById('loading');
const bar = document.getElementById('loading-bar');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2f6f8f');

// Fixed isometric orthographic camera (same elevation/azimuth as the paint cameras).
// Zoom is the world extent of the SHORT screen side, so portrait phones don't
// end up with a 5-tile-wide sliver: portrait shows ~10 units across.
const camDir = cameraOffsetDir(GAME_AZIMUTH);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 120);
const SIN_EL = Math.sin(THREE.MathUtils.degToRad(35.264));
let zoom = 11;
const camTarget = new THREE.Vector3(W / 2, 0, H / 2);
const panOffset = new THREE.Vector3();
let lastPan = -1e9;
const viewW = () => canvas.clientWidth || window.innerWidth;
const viewH = () => canvas.clientHeight || window.innerHeight;
function updateCamera() {
  const aspect = viewW() / viewH();
  const height = aspect >= 1 ? zoom : (zoom * 0.9) / aspect;
  camera.left = (-height * aspect) / 2; camera.right = (height * aspect) / 2;
  camera.top = height / 2; camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}
function placeCamera() {
  camera.position.copy(camTarget).addScaledVector(camDir, 60);
  camera.lookAt(camTarget);
}
const view = {
  getZoom: () => zoom,
  setZoom(z) { zoom = THREE.MathUtils.clamp(z, 6, 22); updateCamera(); },
  /** Drag the world by (dx, dy) screen pixels. */
  pan(dx, dy) {
    const k = (camera.top - camera.bottom) / viewH();
    const sx = dx * k, sy = (dy * k) / SIN_EL;
    // screen right = world (1,0,-1)/√2, screen down (on the ground) = world (1,0,1)/√2
    panOffset.x -= (sx + sy) * Math.SQRT1_2;
    panOffset.z -= (-sx + sy) * Math.SQRT1_2;
    panOffset.clampLength(0, 18);
    lastPan = performance.now();
  },
  get panOffset() { return panOffset; },
};
updateCamera();

// Lights: warm sun + soft sky/ground hemisphere
const hemi = new THREE.HemisphereLight('#fff3dc', '#7d8f5a', 1.45);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe2b8', 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-9, 18, 5);

const post = new PostFX(renderer);

function resize() {
  renderer.setSize(viewW(), viewH(), false);
  post.setSize();
  updateCamera();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ------------------------------------------------------------------ boot
const painted = await loadPaintedAssets((p) => (bar.style.width = `${Math.round(p * 100)}%`));
const ui = new UI(painted);
const game = new Game({ scene, painted, ui });
const firstVisit = !Game.hasSave() || !game.load();
if (firstVisit) game.newGame();
ui.attach(game);
ui.onZoom = (d) => view.setZoom(zoom * (d > 0 ? 1.15 : 1 / 1.15));
if (firstVisit) ui.showHelp();
camTarget.copy(game.player.pos);
placeCamera();
const input = setupInput({ canvas, camera, game, ui, view });
ui.toScreen = input.toScreen;

document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('pagehide', () => game.save());

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let t = 0, frames = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  t += dt;
  game.update(dt, t);
  // two-finger / build-mode pan drifts back to the player once they walk (or after a while)
  const idlePan = performance.now() - lastPan > (game.mode === 'build' ? 1e9 : 4000);
  if ((game.player.moving && game.mode === 'play') || idlePan) panOffset.multiplyScalar(Math.exp(-dt * 3));
  camTarget.lerp(new THREE.Vector3().copy(game.player.pos).add(panOffset), 1 - Math.exp(-dt * 6));
  placeCamera();
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).add(SUN_OFFSET);
  game.particles.mat.uniforms.uScale.value = renderer.getPixelRatio() * (viewH() / 800) * (11 / (camera.top - camera.bottom));
  post.render(scene, camera, t);
  ui.update(camera, game.player.pos.clone().add(new THREE.Vector3(0, 1.45, 0)), canvas, dt);
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
loading.classList.add('done');
setTimeout(() => loading.remove(), 800);

// test / debug hook
window.__game = {
  game, ui, camera, renderer, scene,
  get frames() { return frames; },
  view,
  tileAt: (x, y) => input.pick(x, y).tile,
  pick: input.pick,
  ready: true,
  tileToScreen(x, z, y = 0) {
    const v = new THREE.Vector3(x + 0.5, y, z + 0.5).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  },
};

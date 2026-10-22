// Boot: renderer, isometric camera, lights, painted assets, input and the main loop.
import * as THREE from 'three';
import { loadPaintedAssets } from './render/assets.js';
import { PostFX } from './render/postfx.js';
import { cameraOffsetDir, GAME_AZIMUTH } from './render/paintCamera.js';
import { Game } from './game/game.js';
import { UI } from './game/ui.js';
import { W, H } from './game/world.js';

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

// Fixed isometric orthographic camera (same elevation/azimuth as the paint cameras)
const camDir = cameraOffsetDir(GAME_AZIMUTH);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 120);
let viewSize = 11;
const camTarget = new THREE.Vector3(W / 2, 0, H / 2);
function updateCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-viewSize * aspect) / 2; camera.right = (viewSize * aspect) / 2;
  camera.top = viewSize / 2; camera.bottom = -viewSize / 2;
  camera.updateProjectionMatrix();
}
function placeCamera() {
  camera.position.copy(camTarget).addScaledVector(camDir, 60);
  camera.lookAt(camTarget);
}
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
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  post.setSize();
  updateCamera();
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ boot
const painted = await loadPaintedAssets((p) => (bar.style.width = `${Math.round(p * 100)}%`));
const ui = new UI(painted);
const game = new Game({ scene, painted, ui });
if (!Game.hasSave() || !game.load()) { game.newGame(); document.getElementById('help').classList.remove('hidden'); }
ui.attach(game);
ui.onZoom = (d) => { viewSize = THREE.MathUtils.clamp(viewSize + d * 1.5, 6, 22); updateCamera(); };
camTarget.copy(game.player.pos);
placeCamera();

// ------------------------------------------------------------------ input
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function tileAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // prefer props / ground hits so clicking a tall prop selects its tile
  const hits = raycaster.intersectObjects([game.props.group, game.ground.mesh], true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && o.userData.propId == null && o.parent) o = o.parent;
    if (o && o.userData.propId != null && game.mode === 'play') {
      const p = game.props.list.find((q) => q.id === o.userData.propId);
      if (p) {
        const c = p.cells.reduce((b, c) => (Math.hypot(c.x + 0.5 - hits[0].point.x, c.z + 0.5 - hits[0].point.z) < Math.hypot(b.x + 0.5 - hits[0].point.x, b.z + 0.5 - hits[0].point.z) ? c : b));
        return { x: c.x, z: c.z };
      }
    }
  }
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, pt)) return null;
  // water sits lower: re-intersect at water height when over water
  const t = { x: Math.floor(pt.x), z: Math.floor(pt.z) };
  if (game.world.isWater(t.x, t.z)) {
    const wp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.32);
    if (raycaster.ray.intersectPlane(wp, pt)) return { x: Math.floor(pt.x), z: Math.floor(pt.z) };
  }
  return t;
}

const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (BLOCK_KEYS.has(e.code)) e.preventDefault();
  document.getElementById('help').classList.add('hidden');
  if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
  game.setKey(e.code, true);
  if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') game.action();
  else if (e.code === 'KeyB') { ui.closeModal(); game.toggleBuild(); }
  else if (e.code === 'KeyR') game.rotate();
  else if (e.code === 'KeyI') (ui.modal === 'bag' ? ui.closeModal() : ui.openBag());
  else if (e.code === 'Escape') { if (ui.modalOpen()) ui.closeModal(); else if (game.mode === 'build') game.toggleBuild(false); }
  else if (/^Digit[1-9]$/.test(e.code)) {
    const n = Number(e.code.slice(5));
    if (game.mode === 'play' && n === 8) game.toggleBuild(true);
    else if (game.mode === 'play' && n === 9) ui.openBag();
    else game.selectSlot(n - 1);
  }
});
window.addEventListener('keyup', (e) => game.setKey(e.code, false));
window.addEventListener('blur', () => game.keys.clear());

let down = null;
canvas.addEventListener('pointerdown', (e) => {
  document.getElementById('help').classList.add('hidden');
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 12) return;
  const t = tileAt(e.clientX, e.clientY);
  if (t) game.clickTile(t);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || game.mode === 'build') game.hoverTile = tileAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => (game.hoverTile = null));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); ui.onZoom(Math.sign(e.deltaY)); }, { passive: false });
// on-screen d-pad (touch)
document.querySelectorAll('[data-dir]').forEach((b) => {
  const code = `touch-${b.dataset.dir}`;
  const on = (e) => { e.preventDefault(); game.setKey(code, true); };
  const off = () => game.setKey(code, false);
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('pagehide', () => game.save());

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let t = 0, frames = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  t += dt;
  game.update(dt, t);
  camTarget.lerp(game.player.pos, 1 - Math.exp(-dt * 5));
  placeCamera();
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).add(SUN_OFFSET);
  game.particles.mat.uniforms.uScale.value = renderer.getPixelRatio() * (11 / viewSize);
  post.render(scene, camera, t);
  ui.update(camera, game.player.pos.clone().add(new THREE.Vector3(0, 1.45, 0)), canvas);
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
  tileAt,
  ready: true,
  tileToScreen(x, z, y = 0) {
    const v = new THREE.Vector3(x + 0.5, y, z + 0.5).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  },
};

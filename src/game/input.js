// Input: keyboard, mouse and touch gestures + screen -> tile picking.
//
// Touch (per pointer id):
//   tap        < 10 px movement, released before the hold -> smart context action
//   long-press < 10 px, held >= 500 ms              -> inspect (play) / prop menu (build)
//   drag       >= 10 px                             -> floating joystick (play), camera pan or
//                                                      ghost drag (build); starting on the
//                                                      field: sweep (harvest/water/plant each tile)
//   2 fingers  any time                             -> pinch zoom + two-finger pan
// Mouse: click = smart action / build, drag across the field = sweep, hover = cursor, wheel = zoom.
import * as THREE from 'three';
import { CROPS, PROPS, RIPE } from './data.js';
import { TREE_CANOPIES } from '../assets/blockouts.js';
import { WATER_Y } from '../render/ground.js';
import { T } from './world.js';

const TAP_SLOP = 10;
const TAP_MS = 400;
const LONG_MS = 500;
const JOY_DEAD = 10;
const JOY_FULL = 50;
const GHOST_LIFT = 70; // px: dragged build preview sits above the finger
const SNAP_PX = 28;
const SWEEP_STEP_PX = 10; // fast swipes are sampled along the segment so no tile is skipped

export function setupInput({ canvas, camera, game, ui, view }) {
  const raycaster = new THREE.Raycaster();
  const v3 = new THREE.Vector3();
  const rect = () => canvas.getBoundingClientRect();

  function toScreen(x, y, z) {
    v3.set(x, y, z).project(camera);
    const r = rect();
    return { x: r.left + (v3.x * 0.5 + 0.5) * r.width, y: r.top + (-v3.y * 0.5 + 0.5) * r.height };
  }
  const pxPerUnit = () => rect().height / (camera.top - camera.bottom);

  function setRay(cx, cy) {
    const r = rect();
    raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  }

  /** Ground tile under a screen point (land at y=0, water lower). */
  function groundTile(cx, cy) {
    setRay(cx, cy);
    const pt = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) return null;
    const t = { x: Math.floor(pt.x), z: Math.floor(pt.z) };
    if (game.world.isWater(t.x, t.z) && !game.props.isBridge(t.x, t.z)) {
      if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y), pt)) return { x: Math.floor(pt.x), z: Math.floor(pt.z) };
    }
    return t;
  }

  /**
   * Smart pick: tall props (mesh raycast), billboards (crops, canopies, bamboo,
   * screen-space rectangles), the merchant, then the ground. With `fuzzy`
   * (touch), snaps to nearby interactables within SNAP_PX.
   */
  function pick(cx, cy, { fuzzy = false } = {}) {
    const ground = groundTile(cx, cy);
    const cands = []; // { tile, dist (along the view ray, smaller = closer), prop? }
    setRay(cx, cy);
    const rayDist = (x, y, z) => v3.set(x, y, z).sub(raycaster.ray.origin).dot(raycaster.ray.direction);
    const objs = [game.props.group];
    if (game.merchant) objs.push(game.merchant.root);
    const hit = raycaster.intersectObjects(objs, true)[0];
    if (hit) {
      let o = hit.object;
      while (o && o.userData.propId == null && o !== game.merchant?.root && o.parent) o = o.parent;
      if (o === game.merchant?.root || (game.merchant && isChild(hit.object, game.merchant.root))) {
        cands.push({ tile: { ...game.merchantCell }, dist: hit.distance - 0.3 });
      } else if (o && o.userData.propId != null) {
        const p = game.props.list.find((q) => q.id === o.userData.propId);
        if (p) {
          const c = p.cells.reduce((b, c) => (Math.hypot(c.x + 0.5 - hit.point.x, c.z + 0.5 - hit.point.z) < Math.hypot(b.x + 0.5 - hit.point.x, b.z + 0.5 - hit.point.z) ? c : b));
          cands.push({ tile: { x: c.x, z: c.z }, dist: hit.distance, prop: p });
        }
      }
    }
    const ppu = pxPerUnit();
    // crops: rectangle from the base to the sprite top
    for (const c of game.farm.values()) {
      const s = game.stage(c), def = CROPS[c.type];
      const h = s === 0 ? 0.28 : def.height[s - 1];
      const base = toScreen(c.x + 0.5, 0, c.z + 0.5), top = toScreen(c.x + 0.5, h, c.z + 0.5);
      const hw = ppu * 0.42;
      if (cx > base.x - hw && cx < base.x + hw && cy > top.y - 4 && cy < base.y + ppu * 0.2) {
        // billboards lean toward the camera: measure at the tile's front edge
        cands.push({ tile: { x: c.x, z: c.z }, dist: rayDist(c.x + 0.85, h * 0.4, c.z + 0.85) - (s >= RIPE ? 0.1 : 0) });
      }
    }
    // tree canopies + bamboo clumps belong to their prop tile
    for (const p of game.props.list) {
      const def = PROPS[p.type];
      if (!def.canopy && !def.sprite) continue;
      const sc = p.mesh.scale.x;
      const top = def.canopy ? TREE_CANOPIES[def.canopy][0].pos[1] * sc + 0.6 : 2.4;
      const a = toScreen(p.cx, 0, p.cz), b = toScreen(p.cx, top, p.cz);
      const hw = ppu * (def.canopy ? 0.8 : 0.4) * sc;
      if (cx > a.x - hw && cx < a.x + hw && cy > b.y - hw * 0.3 && cy < a.y + ppu * 0.15) {
        cands.push({ tile: { x: p.x, z: p.z }, dist: rayDist(p.cx, top * 0.7, p.cz), prop: p, foliage: true });
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    let best = cands[0] || null;
    // foliage hides the ground behind it; in play mode an actionable tile back there wins
    if (best?.foliage && game.mode === 'play' && ground && !(ground.x === best.tile.x && ground.z === best.tile.z)) {
      const k = game.resolve(ground).kind;
      if (k !== 'walk' && k !== 'inspect') best = cands.find((c) => !c.foliage) || null;
    }
    const groundKind = ground && game.mode === 'play' ? game.resolve(ground).kind : 'walk';
    if (!best && fuzzy && ground && (groundKind === 'walk' || groundKind === 'inspect')) {
      // fat-finger snap (only when the tile itself does nothing): ripe crops > merchant > crops
      let bd = Math.min(SNAP_PX, ppu * 0.6), bt = null;
      const consider = (x, z, y, bonus) => {
        const s = toScreen(x + 0.5, y, z + 0.5);
        const d = Math.hypot(s.x - cx, s.y - cy) - bonus;
        if (d < bd) { bd = d; bt = { x, z }; }
      };
      for (const c of game.farm.values()) if (cheb(c, ground) <= 1) consider(c.x, c.z, 0.25, game.stage(c) >= RIPE ? 8 : 0);
      if (game.merchantCell && cheb(game.merchantCell, ground) <= 1) consider(game.merchantCell.x, game.merchantCell.z, 0.5, 6);
      if (bt) best = { tile: bt, dist: 0, snapped: true };
    }
    return { tile: best ? best.tile : ground, ground, prop: best?.prop || (ground && game.props.at(ground.x, ground.z)) || null, foliage: !!best?.foliage };
  }

  // ------------------------------------------------------------------ keyboard
  const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (BLOCK_KEYS.has(e.code)) e.preventDefault();
    ui.hideHelp();
    if (e.repeat && !MOVE_KEYS.includes(e.code)) return;
    game.touchInput = false; ui.setTouch(false);
    game.setKey(e.code, true);
    if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') game.action();
    else if (e.code === 'KeyB') { ui.closeModal(); game.toggleBuild(); }
    else if (e.code === 'KeyR') game.rotate();
    else if (e.code === 'KeyI') (ui.modal === 'bag' ? ui.closeModal() : ui.openBag());
    else if (e.code === 'KeyT') (ui.modal === 'today' ? ui.closeModal() : ui.openToday());
    else if (e.code === 'Escape') {
      if (ui.dialogOpen()) ui.closeDialog(false);
      else if (ui.modalOpen()) ui.closeModal();
      else if (game.mode === 'build') game.toggleBuild(false);
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const n = Number(e.code.slice(5));
      if (game.mode === 'play' && n === 8) game.toggleBuild(true);
      else if (game.mode === 'play' && n === 9) ui.openBag();
      else game.selectSlot(n - 1);
    }
  });
  window.addEventListener('keyup', (e) => game.setKey(e.code, false));
  window.addEventListener('blur', () => { game.keys.clear(); endJoystick(); view.hold = false; });

  // ------------------------------------------------------------------ pointers
  const pointers = new Map();
  let g = null; // current gesture

  function endJoystick() { game.setAnalog(null); ui.joystick(null); }

  function startPinch() {
    if (g?.timer) clearTimeout(g.timer);
    endJoystick();
    view.hold = false;
    const [a, b] = [...pointers.values()];
    g = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.getZoom(), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    ui.closePropMenu();
  }

  const trace = []; // last few gesture outcomes (debug hook for tests)
  const note = (o) => { trace.push(o); if (trace.length > 8) trace.shift(); };

  function onTap(x, y, touch) {
    ui.ripple(x, y);
    if (ui.modalOpen() || ui.dialogOpen()) { note({ tap: 'modal' }); return; }
    ui.closeSeedPicker();
    if (game.fishing) { game.reel(); return; }
    const pk = pick(x, y, { fuzzy: touch });
    note({ tap: pk.tile, x: Math.round(x), y: Math.round(y) });
    if (game.mode === 'build') {
      if (!touch) {
        // desktop: click places / picks up directly
        const t = game.buildSel === 'pickup' && pk.prop ? pk.tile : pk.ground;
        if (t) game.buildAt(t.x, t.z);
        return;
      }
      touchBuildTap(pk, x, y);
      return;
    }
    ui.closePropMenu();
    if (!pk.tile) return;
    game.tap(pk.tile);
  }

  function inGhost(t) {
    if (!t || !game.buildCursor || game.buildSel === 'pickup') return false;
    return game.ghost.cellsAt?.().some((c) => c.x === t.x && c.z === t.z);
  }

  function touchBuildTap(pk, x, y) {
    ui.closePropMenu();
    if (game.buildSel !== 'pickup') {
      if (game.buildCursor && (inGhost(pk.ground) || (pk.prop && inGhost(pk.tile)))) { game.confirmBuild(); return; }
      // placing: a tap on foliage means the ground behind it; a tap on a solid prop edits that prop
      const solid = pk.prop && !pk.foliage ? pk.prop : (pk.ground && game.props.at(pk.ground.x, pk.ground.z));
      if (solid && !inGhost(pk.ground)) { ui.openPropMenu(solid, x, y); return; }
      if (pk.ground) { game.buildCursor = pk.ground; ui.refresh(); }
      return;
    }
    if (pk.prop) ui.openPropMenu(pk.prop, x, y);
    else ui.toast('Tap a decoration to move, rotate or store it — or pick one below.');
  }

  /** Does a drag starting here sweep the field instead of walking? */
  // A fence or tree in front of the field can cover its tiles on screen, so a
  // sweep also considers the ground tile under the finger, not just what's picked.
  const isField = (t) => !!t && (!!game.crop(t.x, t.z) || game.world.get(t.x, t.z) === T.SOIL);

  function onField(x, y) {
    if (game.mode !== 'play' || game.fishing || ui.modalOpen()) return false;
    const pk = pick(x, y);
    return isField(pk.tile) || isField(pk.ground);
  }

  function sweepAt(x, y) {
    const pk = pick(x, y);
    for (const t of [pk.tile, pk.ground]) {
      if (!isField(t)) continue;
      const k = t.z * 1000 + t.x;
      if (g.visited.has(k)) return;
      g.visited.add(k);
      if (game.sweepTile(t)) { ui.ripple(x, y); game.haptic(6); }
      return;
    }
  }

  function sweepTo(x, y) {
    const d = Math.hypot(x - g.lx, y - g.ly), n = Math.max(1, Math.ceil(d / SWEEP_STEP_PX));
    for (let i = 1; i <= n; i++) sweepAt(g.lx + ((x - g.lx) * i) / n, g.ly + ((y - g.ly) * i) / n);
  }

  function onLongPress(x, y) {
    const pk = pick(x, y, { fuzzy: true });
    ui.ripple(x, y, true);
    if (game.mode === 'build') { if (pk.prop) ui.openPropMenu(pk.prop, x, y); return; }
    if (pk.tile) game.inspect({ t: pk.tile });
  }

  canvas.addEventListener('pointerdown', (e) => {
    const touch = e.pointerType !== 'mouse';
    ui.hideHelp();
    game.touchInput = touch; ui.setTouch(touch);
    if (!touch && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && touch) { startPinch(); return; }
    if (pointers.size > 1) return;
    // a bite is on: reel immediately on touch-down, anywhere
    if (touch && game.fishing && game.fishing.phase === 'bite' && !ui.modalOpen()) {
      game.reel(); g = { type: 'dead', id: e.pointerId }; return;
    }
    // timings use the events' own timestamps: a slow frame must not turn a tap into a hold
    g = { type: 'pending', id: e.pointerId, touch, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: e.timeStamp, field: onField(e.clientX, e.clientY) };
    if (touch) {
      const gg = g;
      g.timer = setTimeout(() => {
        if (g === gg && g.type === 'pending') { g.type = 'long'; onLongPress(g.x0, g.y0); }
      }, LONG_MS);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (e.pointerType === 'mouse' && !p) {
      const pk = pick(e.clientX, e.clientY);
      game.hoverTile = game.mode === 'build' ? pk.ground : pk.tile;
      return;
    }
    if (!g || !p) return;
    if (g.type === 'pinch') {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      view.setZoom(g.z0 * (g.d0 / d));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      view.pan(mx - g.mx, my - g.my);
      g.mx = mx; g.my = my;
      return;
    }
    if (e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (g.type === 'pending' && Math.hypot(dx, dy) >= TAP_SLOP) {
      clearTimeout(g.timer);
      if (g.field && game.mode === 'play') {
        g.type = 'sweep'; g.visited = new Set();
        view.hold = true;
        ui.closePropMenu(); ui.closeSeedPicker();
        sweepAt(g.x0, g.y0);
        g.lx = g.x0; g.ly = g.y0;
      } else if (!g.touch) { g.type = 'mousedrag'; }
      else if (game.mode === 'build') {
        g.type = inGhost(groundTile(g.x0, g.y0)) ? 'ghost' : 'pan';
        ui.closePropMenu();
      } else {
        g.type = 'joy'; g.ox = g.x0; g.oy = g.y0;
        ui.closePropMenu(); ui.closeSeedPicker();
      }
    }
    if (g.type === 'joy') {
      let vx = e.clientX - g.ox, vy = e.clientY - g.oy;
      let len = Math.hypot(vx, vy);
      // let the stick's centre trail the finger so direction changes stay easy
      const maxR = JOY_FULL + 20;
      if (len > maxR) { g.ox += (vx / len) * (len - maxR); g.oy += (vy / len) * (len - maxR); vx = e.clientX - g.ox; vy = e.clientY - g.oy; len = maxR; }
      const m = len < JOY_DEAD ? 0 : Math.min(1, 0.3 + 0.7 * (len - JOY_DEAD) / (JOY_FULL - JOY_DEAD));
      game.setAnalog(m ? { x: vx / len, y: vy / len, m } : null);
      ui.joystick({ ox: g.ox, oy: g.oy, x: e.clientX, y: e.clientY });
    } else if (g.type === 'sweep') {
      sweepTo(e.clientX, e.clientY);
    } else if (g.type === 'pan') {
      view.pan(e.clientX - g.lx, e.clientY - g.ly);
    } else if (g.type === 'ghost') {
      const t = groundTile(e.clientX, e.clientY - GHOST_LIFT);
      if (t) game.buildCursor = t;
    } else if (g.type === 'mousedrag' && game.mode === 'build') {
      game.hoverTile = groundTile(e.clientX, e.clientY);
    }
    g.lx = e.clientX; g.ly = e.clientY;
  });

  function release(e, cancelled) {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!g || !p) return;
    if (g.type === 'pinch') { if (pointers.size < 2) g = { type: 'dead' }; }
    else if (e.pointerId === g.id) {
      clearTimeout(g.timer);
      const dt = e.timeStamp - g.t0;
      // No dead zone between tap and long-press: released before the hold fired = tap.
      // 'long' with a short real duration = the hold timer fired during a stalled frame;
      // 'pending' with a long real duration = the timer was starved, so it's a hold after all.
      const starved = g.type === 'pending' && g.touch && dt >= LONG_MS;
      const isTap = !cancelled && ((g.type === 'pending' && !starved) || (g.type === 'long' && dt < TAP_MS));
      note({ release: g.type, dt: Math.round(dt), cancelled, isTap, ev: e.type });
      if (isTap) onTap(e.clientX, e.clientY, g.touch);
      else if (starved && !cancelled) onLongPress(g.x0, g.y0);
      if (g.type === 'joy') endJoystick();
      if (g.type === 'sweep') view.hold = false;
      if (g.type === 'ghost') ui.refresh();
      g = { type: 'dead' };
    }
    if (pointers.size === 0) g = null;
  }
  canvas.addEventListener('pointerup', (e) => release(e, false));
  canvas.addEventListener('pointercancel', (e) => release(e, true));
  canvas.addEventListener('lostpointercapture', (e) => { if (pointers.has(e.pointerId)) release(e, true); });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') game.hoverTile = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS Safari ignores user-scalable=no: block its page pinch-zoom gestures
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.setZoom(view.getZoom() * (e.deltaY > 0 ? 1.12 : 1 / 1.12)); }, { passive: false });

  return { pick, groundTile, toScreen, debug: () => ({ pointers: [...pointers.keys()], gesture: g?.type ?? null, trace }) };
}

function cheb(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)); }
function isChild(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }

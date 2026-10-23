// Pointer gestures.
//
// Touch (per pointer id):
//   tap        < 10 px movement, released before the hold -> smart context action (walking there first)
//   long-press < 10 px, held >= 500 ms              -> inspect (play) / prop menu (build)
//   drag       >= 10 px                             -> camera pan, or ghost drag (build); starting on
//                                                      the field, or anywhere in the dig kit: sweep
//                                                      (harvest/water/plant, or till/dig/raise each tile)
//   2 fingers  any time                             -> pinch zoom + two-finger pan
// Mouse: the same; hover = cursor, wheel = zoom.
import { T } from '../game/world.js';

const TAP_SLOP = 10;
const TAP_MS = 400;
const LONG_MS = 500;
const GHOST_LIFT = 70; // px: dragged build preview sits above the finger
const SWEEP_STEP_PX = 10; // fast swipes are sampled along the segment so no tile is skipped

export function setupGestures({ canvas, game, ui, view, picker }) {
  const { pick, groundTile } = picker;
  const pointers = new Map();
  let g = null; // current gesture

  function startPinch() {
    if (g?.timer) clearTimeout(g.timer);
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

  /** Does a drag starting here sweep instead of panning? On the field, or anywhere with the dig kit. */
  // A fence or tree in front of the field can cover its tiles on screen, so a
  // sweep also considers the ground tile under the finger, not just what's picked.
  const isField = (t) => !!t && (!!game.crop(t.x, t.z) || game.world.get(t.x, t.z) === T.SOIL);
  const sweepable = (t) => !!t && (game.kit === 'dig' || isField(t));

  function onField(x, y) {
    if (game.mode !== 'play' || game.fishing || ui.modalOpen()) return false;
    if (game.kit === 'dig') return true;
    const pk = pick(x, y);
    return isField(pk.tile) || isField(pk.ground);
  }

  function sweepAt(x, y) {
    const pk = pick(x, y);
    for (const t of game.kit === 'dig' ? [pk.ground] : [pk.tile, pk.ground]) {
      if (!sweepable(t)) continue;
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
      } else if (game.mode === 'build') {
        g.type = !g.touch ? 'mousedrag' : inGhost(groundTile(g.x0, g.y0)) ? 'ghost' : 'pan';
        ui.closePropMenu();
      } else {
        g.type = 'pan';
        ui.closePropMenu(); ui.closeSeedPicker();
      }
    }
    if (g.type === 'sweep') {
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

  return { debug: () => ({ pointers: [...pointers.keys()], gesture: g?.type ?? null, trace }) };
}

// Gamepad (the standard mapping: Xbox, PlayStation, Steam Deck), polled once a frame from the main loop.
//
// In the world:  left stick walk · A do what is in front · B stop / reel in nothing · X dig kit · Y bag · LB/RB tool
//                LT/RT zoom · right stick look around · Menu today · View build · D-pad up the ribbon's chore,
//                left/right tool, down the camera back on the player
// Build mode:    stick / D-pad move the build cursor (the camera follows it) · A place or pick up · X rotate · LB/RB what to
//                place · B or View done
// Sheets, the help card and dialogs: D-pad / stick move the highlight between the buttons · A press · B close · LB/RB the tabs
//                · right stick scroll
// Any pad input puts the UI in pad mode (body.pad: controller prompts instead of keys); a key or a click takes it out again.
// The `haptic` events rumble the pad.
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.22; // stick dead zone (radial)
const REPEAT_FIRST = 0.38, REPEAT = 0.13; // menu / cursor auto-repeat (s)
const CLICKABLE = 'button, a[href], input, select, [tabindex]:not([tabindex="-1"])';
const $ = (s) => document.querySelector(s);
const shown = (el) => !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0;

/** A stick as { x, y, m } (unit direction and magnitude past the dead zone), or null. */
function stick(ax, ay) {
  const l = Math.hypot(ax, ay);
  if (l < DEAD) return null;
  const m = Math.min(1, (l - DEAD) / (1 - DEAD));
  return { x: ax / l, y: ay / l, m };
}

/** What can take the highlight in a layer: buttons and the like, and anything with a click handler, visible and enabled. */
function focusables(layer) {
  const out = [];
  for (const el of layer.querySelectorAll('*')) {
    if (!(el.matches(CLICKABLE) || el.onclick)) continue;
    if (el.disabled || !el.getClientRects().length) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.pointerEvents === 'none') continue;
    out.push(el);
  }
  return out;
}

const keyOf = (el) => `${el.tagName}|${[...el.classList].filter((c) => c !== 'pad-focus').join('.')}|${JSON.stringify({ ...el.dataset })}`;
const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };

/** The best candidate from `from` in screen direction (dx, dy): nearest along it, little off to the side. */
function nearestInDirection(from, list, dx, dy) {
  const a = center(from);
  let best = null, score = Infinity;
  for (const el of list) {
    if (el === from) continue;
    const b = center(el), vx = b.x - a.x, vy = b.y - a.y;
    const along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
    if (along <= 4) continue;
    const s = along + side * 2.2;
    if (s < score) { score = s; best = el; }
  }
  return best;
}

export function setupGamepad({ game, ui, view }) {
  const core = game.core;
  let prev = [], repeat = { key: '', t: 0 }, focus = null, focusMemo = null, focusLayer = null, cursor = null, steering = false;

  const ix = () => core.use('interact');
  const build = () => core.use('build');

  window.addEventListener('pointerdown', () => ui.setPad(false), true); // a tap or a click: back to touch / mouse prompts
  core.bus.on('haptic', (p) => {
    if (!ui.pad) return;
    const pad = [...(navigator.getGamepads?.() || [])].find((g) => g?.connected);
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: Math.min(120, (p.ms || 15) * 2), strongMagnitude: 0.25, weakMagnitude: 0.55 }).catch?.(() => {});
  }, { owner: 'gamepad' });

  // ---------------------------------------------------------------- the highlight in a sheet / card / dialog
  function setFocus(el) {
    if (focus && focus !== el) focus.classList.remove('pad-focus');
    focus = el;
    if (!el) { focusMemo = null; return; }
    el.classList.add('pad-focus');
    el.focus?.({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const list = focusables(focusLayer);
    focusMemo = { key: keyOf(el), text: el.textContent.trim().slice(0, 32), index: list.indexOf(el) };
  }
  /** Keep the highlight across a live sheet's redraws: the same element again, found by its kind, data and text, else its place. */
  function keepFocus(layer) {
    if (focusLayer !== layer) { focusLayer = layer; focus = null; focusMemo = null; }
    if (focus && layer.contains(focus) && focus.getClientRects().length && !focus.disabled) { focus.classList.add('pad-focus'); return; }
    const list = focusables(layer);
    if (!list.length) { focus = null; return; }
    let el = null;
    if (focusMemo) {
      const same = list.filter((e) => keyOf(e) === focusMemo.key);
      el = same.find((e) => e.textContent.trim().slice(0, 32) === focusMemo.text) || (same.length === 1 ? same[0] : null)
        || list[Math.min(focusMemo.index, list.length - 1)];
    }
    // first time in: the main button if there is one, else the first that is not the close cross
    el ||= list.find((e) => e.matches('.btn.go, .btn.big, .dlg-ok')) || list.find((e) => !e.matches('.close')) || list[0];
    setFocus(el);
  }

  function layerNav(layer, dir, pressed, axes, dt) {
    keepFocus(layer);
    if (dir && focus) {
      const next = nearestInDirection(focus, focusables(layer), dir.x, dir.y);
      if (next) setFocus(next);
    }
    if (pressed(B.A) && focus) focus.click();
    if (pressed(B.LB) || pressed(B.RB)) {
      const tabs = [...layer.querySelectorAll('.tabs .tab:not(:disabled)')];
      const on = tabs.findIndex((t) => t.classList.contains('on'));
      const t = tabs[(on + (pressed(B.RB) ? 1 : -1) + tabs.length) % tabs.length];
      if (t && tabs.length > 1) { t.click(); focusMemo = null; focus = null; }
    }
    // scroll whatever scrolls under the highlight (or the card)
    if (axes.r && Math.abs(axes.r.y) > 0.3) {
      let s = focus || layer.firstElementChild;
      while (s && s !== document.body && !(s.scrollHeight > s.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      (s && s !== document.body ? s : layer.querySelector('.card-body, .body') || layer.firstElementChild)?.scrollBy?.(0, axes.r.y * axes.r.m * dt * 900);
    }
  }

  // ---------------------------------------------------------------- build mode: a tile cursor of its own
  /** One tile step for a screen direction (8-way): straight up on screen is diagonal on the grid. */
  function stepFor(dir) {
    const a = Math.round(Math.atan2(dir.y, dir.x) / (Math.PI / 4)) * (Math.PI / 4);
    const sx = Math.round(Math.cos(a)), sy = Math.round(Math.sin(a));
    // screen right = world (1, -1), screen down = world (1, 1)
    return { x: Math.sign(sx + sy), z: Math.sign(-sx + sy) };
  }

  function buildNav(dir, pressed) {
    const b = build(), w = game.world;
    if (!cursor) cursor = { ...game.core.use('player').target() };
    if (dir) {
      const st = stepFor(dir);
      cursor = { x: Math.max(0, Math.min(w.w - 1, cursor.x + st.x)), z: Math.max(0, Math.min(w.h - 1, cursor.z + st.z)) };
    }
    game.hoverTile = cursor;
    const pl = game.player.pos;
    view.panOffset.set(cursor.x + 0.5 - pl.x, 0, cursor.z + 0.5 - pl.z).clampLength(0, 18);
    if (pressed(B.A)) b.buildAt(cursor.x, cursor.z);
    if (pressed(B.X)) b.rotate();
    if (pressed(B.LB) || pressed(B.RB)) {
      const items = ui.buildItems || [], i = Math.max(0, items.indexOf(game.buildSel));
      if (items.length) ui.selectBuild((i + (pressed(B.RB) ? 1 : -1) + items.length) % items.length);
    }
    if (pressed(B.B) || pressed(B.VIEW)) { game.toggleBuild(false); view.panOffset.set(0, 0, 0); }
    if (pressed(B.Y)) ui.openBag();
  }

  // ---------------------------------------------------------------- the world
  function worldNav(pressed, axes, down, dt) {
    const a = axes.l;
    // walking: the screen-space stick, as the touch stick used to be (game.analog)
    if (a) { game.analog = { x: a.x, y: a.y, m: a.m }; steering = true; } else if (steering) { game.analog = null; steering = false; }
    if (axes.r) view.pan(-axes.r.x * axes.r.m * dt * 700, -axes.r.y * axes.r.m * dt * 700);
    const zoom = (down[B.RT] ? 1 : 0) - (down[B.LT] ? 1 : 0);
    if (zoom) view.setZoom(view.getZoom() * Math.exp(-zoom * dt * 1.4));
    if (pressed(B.A)) ix().action();
    if (pressed(B.B)) {
      if (game.fishing) game.cancelFishing();
      const i = ix();
      i.queue.length = 0;
      core.use('player').stop();
      core.use('trees').stopFelling?.();
      core.bus.emit('queueChange');
    }
    if (pressed(B.X)) ix().setKit(ix().kit === 'dig' ? 'play' : 'dig');
    if (pressed(B.Y)) ui.openBag();
    const slot = (pressed(B.RB) || pressed(B.RIGHT) ? 1 : 0) - (pressed(B.LB) || pressed(B.LEFT) ? 1 : 0);
    if (slot) {
      const n = ix().hotbar().length;
      if (n) game.selectSlot((ix().slot + slot + n) % n);
    }
    if (pressed(B.UP)) ui.todoTop?.onTap?.();
    if (pressed(B.DOWN)) view.panOffset.set(0, 0, 0);
    if (pressed(B.MENU)) ui.openToday();
    if (pressed(B.VIEW)) { ui.closeModal(); game.toggleBuild(true); cursor = null; }
  }

  return {
    update(dt) {
      const pad = [...(navigator.getGamepads?.() || [])].find((g) => g?.connected && g.mapping === 'standard') || [...(navigator.getGamepads?.() || [])].find((g) => g?.connected);
      if (!pad) { if (steering) { game.analog = null; steering = false; } prev = []; return; }
      const down = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      const axes = { l: stick(pad.axes[0] || 0, pad.axes[1] || 0), r: stick(pad.axes[2] || 0, pad.axes[3] || 0) };
      const last = prev;
      const pressed = (i) => !!down[i] && !last[i];
      prev = down;
      if (down.some(Boolean) || axes.l || axes.r) {
        if (!ui.pad) { ui.setPad(true); game.touchInput = false; ui.setTouch(false); }
      } else if (!ui.pad) return; // a pad lying idle while the mouse is in use: leave it be

      // a direction for menus and the build cursor: the D-pad or the left stick, with auto-repeat
      const dp = { x: (down[B.RIGHT] ? 1 : 0) - (down[B.LEFT] ? 1 : 0), y: (down[B.DOWN] ? 1 : 0) - (down[B.UP] ? 1 : 0) };
      let held = dp.x || dp.y ? dp : axes.l && axes.l.m > 0.45 ? { x: axes.l.x, y: axes.l.y } : null;
      let dir = null;
      if (held) {
        const k = stepKey(held);
        if (k !== repeat.key) { repeat = { key: k, t: REPEAT_FIRST }; dir = held; } else if ((repeat.t -= dt) <= 0) { repeat.t = REPEAT; dir = held; }
      } else repeat = { key: '', t: 0 };

      const layer = ui.dialogOpen() ? $('#dialog') : shown($('#help')) ? $('#help') : ui.modal ? $('#panel') : shown($('#seed-picker')) ? $('#seed-picker') : null;
      if (layer) {
        if (steering) { game.analog = null; steering = false; }
        layerNav(layer, dir && norm(dir), pressed, axes, dt);
        if (pressed(B.B)) {
          if (layer.id === 'dialog') ui.closeDialog(false);
          else if (layer.id === 'help') ui.hideHelp();
          else if (layer.id === 'seed-picker') ui.closeSeedPicker();
          else ui.closeModal();
        }
        if (layer.id === 'panel' && ((pressed(B.Y) && ui.modal === 'bag') || (pressed(B.MENU) && ui.modal === 'today'))) ui.closeModal();
        return;
      }
      if (focus) { focus.classList.remove('pad-focus'); focus = null; focusLayer = null; }
      if (game.mode === 'build') { if (steering) { game.analog = null; steering = false; } buildNav(dir, pressed); return; }
      cursor = null;
      worldNav(pressed, axes, down, dt);
    },
  };
}

const norm = (d) => { const l = Math.hypot(d.x, d.y) || 1; return { x: d.x / l, y: d.y / l }; };
/** Which of 8 directions a held direction is (so a steady push repeats, a new one acts at once). */
const stepKey = (d) => String(Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)));

// DOM HUD: koku, clock, toasts, prop menu and settings. The parts (icons, fast tap, toasts,
// touch feedback, confirm dialog, hotbar, context action button, build bar) live in ../ui/*.js and are mixed in at the bottom.
import { ITEMS, PROPS } from './data.js';
import { clockText, hourOf } from './clock.js';
import { $, el } from '../ui/dom.js';
import { iconMixin } from '../ui/icons.js';
import { fasttapMixin } from '../ui/fasttap.js';
import { toastMixin } from '../ui/toast.js';
import { fxMixin } from '../ui/fx.js';
import { hotbarMixin } from '../ui/hotbar.js';
import { actionButtonMixin } from '../ui/action-button.js';
import { buildBarMixin } from '../ui/build-bar.js';
import { hudMixin } from '../ui/hud/index.js';
import { dialogsMixin } from '../ui/dialogs.js';
import { LAZY, loadSheet } from '../ui/sheets/index.js';

export class UI {
  constructor(painted) {
    this.painted = painted;
    this.game = null;
    this.modal = null;
    this.pendingSheet = null; // a sheet whose module is still loading
    this.sheetArgs = null;
    this.shopTab = 'sell';
    this.hotbar = $('#hotbar');
    this.toasts = $('#toasts');
    this.panel = $('#panel');
    this.bubbleEl = $('#bubble');
    this.bubbleText = null;
    this.fx = $('#fx');
    this.labels = [];
    this.chips = [];
    this.actionT = 0;
    this.touch = false;
    this.setTouch(matchMedia('(pointer: coarse)').matches);
    this.dialogResolve = null;
    this.sound = null;
    this.awayInfo = null;
    this.clockT = 0;
    this.installPrompt = null; // Android "add to home screen" event
    this.installFastTap();
  }

  attach(game) {
    this.game = game;
    this.bindBuildBar();
    this.bindActionButton();
    $('#btn-bag').onclick = () => (this.modal === 'bag' ? this.closeModal() : this.openBag());
    $('#btn-help').onclick = () => ($('#help').classList.contains('hidden') ? this.showHelp() : this.hideHelp());
    $('#help-close').onclick = () => this.hideHelp();
    $('#btn-zoom-in').onclick = () => this.onZoom?.(-1);
    $('#btn-zoom-out').onclick = () => this.onZoom?.(1);
    $('#btn-reset').onclick = async () => {
      if (await this.confirm('Start a new village? Your current save will be erased.', 'Start over')) { game.frozen = true; game.constructor.clearSave(); location.reload(); }
    };
    $('#btn-today').onclick = () => (this.modal === 'today' ? this.closeModal() : this.openToday());
    $('#set-music').onclick = () => { this.sound?.set('music', !this.sound.settings.music); this.refreshSettings(); };
    $('#set-sfx').onclick = () => { this.sound?.set('sfx', !this.sound.settings.sfx); this.refreshSettings(); };
    $('#btn-export').onclick = () => { this.hideHelp(); this.openBackup(); };
    $('#btn-import').onclick = () => { this.hideHelp(); this.openRestore(); };
    $('#btn-install').onclick = async () => {
      const p = this.installPrompt;
      if (!p) return;
      this.installPrompt = null;
      p.prompt();
      try { await p.userChoice; } catch { /* dismissed */ }
      this.refreshSettings();
    };
    this.panel.addEventListener('click', (e) => { if (e.target === this.panel) this.closeModal(); });
    window.addEventListener('resize', () => this.refresh());
    this.refresh();
    // fetch the sheets once the first frame is out, so the first tap on the stall does not wait for a module
    setTimeout(() => { for (const n of Object.keys(LAZY)) loadSheet(game.core, n).catch(() => {}); }, 0);
  }

  // ------------------------------------------------------------------ helpers
  setTouch(on) {
    if (on === this.touch) return;
    this.touch = on;
    document.body.classList.toggle('touch', on);
    if (this.game) this.refresh();
  }
  compact() { return this.touch || window.innerWidth < 700; }

  // ------------------------------------------------------------------ refresh (hotbar, build bar and the open sheet)
  refresh() {
    const g = this.game;
    if (!g) return;
    $('#koku').textContent = g.money.toLocaleString();
    this.updateClock();
    document.body.classList.toggle('build-mode', g.mode === 'build');
    $('#mode-label').textContent = g.mode === 'build' ? (this.touch ? 'Build mode' : 'Build mode · R rotate · B done') : '';
    this.renderHotbar();
    this.renderHud();
    this.updateBuildBar();
    if (this.modal && this.sheetDef(this.modal)?.live) this.renderSheet();
  }

  /** HUD clock pill: local time, sun / moon, and a dot when something waits in Today. */
  updateClock() {
    const g = this.game, now = g.now(), h = hourOf(now);
    $('#clock').textContent = clockText(now);
    const sky = h < 5.5 || h >= 19.5 ? 'moon' : h < 7 || h >= 17.5 ? 'dusk' : 'sun';
    $('#btn-today').dataset.sky = sky;
    const st = g.daily.state;
    $('#today-dot').classList.toggle('hidden', !st || (st.seen && !g.daily.claimable()));
  }

  /** Per-frame: bubble, chips, labels, action button. */
  update(camera, worldPos, canvas, dt = 0.016) {
    if (this.bubbleText) {
      const v = worldPos.clone().project(camera);
      const r = canvas.getBoundingClientRect();
      this.bubbleEl.style.left = `${r.left + (v.x * 0.5 + 0.5) * r.width}px`;
      this.bubbleEl.style.top = `${r.top + (-v.y * 0.5 + 0.5) * r.height}px`;
    }
    if (!this.game) return;
    this.refreshQueue();
    for (const c of this.chips) if (!c.classList.contains('hidden') && c._t) this.placeAt(c, c._t.x + 0.5, 0.6, c._t.z + 0.5);
    this.labels = this.labels.filter((l) => {
      l.t += dt;
      if (l.t > 2.2) { l.e.remove(); return false; }
      this.placeAt(l.e, l.x, 0.9, l.z, -l.t * 14);
      l.e.style.opacity = String(Math.min(1, (2.2 - l.t) * 2));
      return true;
    });
    this.actionT -= dt;
    if (this.actionT <= 0) { this.updateAction(); this.updateBuildBar(); this.renderHud(); this.actionT = 0.15; }
    this.clockT -= dt;
    if (this.clockT <= 0) { this.updateClock(); this.clockT = 1; }
  }

  // ------------------------------------------------------------------ prop menu (touch build)
  openPropMenu(p, x, y) {
    const g = this.game;
    const m = $('#prop-menu');
    m.innerHTML = `<div class="pm-title">${PROPS[p.type].name}</div>`;
    const add = (label, cls, fn) => { const b = el('button', 'btn ' + cls, label); b.dataset.act = cls; b.onclick = () => { this.closePropMenu(); fn(); }; m.appendChild(b); };
    if (PROPS[p.type].fixed) m.appendChild(el('div', 'muted', 'Hana’s stall stays put.'));
    else {
      add('Move', 'move', () => g.moveProp(p));
      add('Rotate', 'rotate', () => g.rotateProp(p));
      add('Store', 'store', () => g.pickUp(p));
    }
    add('✕', 'close-pm', () => {});
    m.classList.remove('hidden');
    const w = m.offsetWidth || 220, h = m.offsetHeight || 60;
    m.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2))}px`;
    m.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 120, y - h - 24))}px`;
  }
  closePropMenu() { $('#prop-menu')?.classList.add('hidden'); }

  // ------------------------------------------------------------------ help
  showHelp() { this.refreshSettings(); $('#help').classList.remove('hidden'); }

  async refreshSettings() {
    const st = this.sound?.settings || { music: true, sfx: true };
    $('#set-music').textContent = `Music ${st.music ? 'on' : 'off'}`;
    $('#set-music').classList.toggle('off', !st.music);
    $('#set-sfx').textContent = `Sounds ${st.sfx ? 'on' : 'off'}`;
    $('#set-sfx').classList.toggle('off', !st.sfx);
    $('#btn-install').classList.toggle('hidden', !this.installPrompt);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let persisted = false;
    try { persisted = !!(await navigator.storage?.persisted?.()); } catch { /* unsupported */ }
    $('#storage-note').textContent = standalone || persisted
      ? 'Your village is kept safely on this device. A backup code never hurts.'
      : ios
        ? 'Safari may clear a site’s data after a week away. Add the game to your Home Screen (Share → Add to Home Screen) and keep a backup code.'
        : 'Your browser may clear site data after a long break. Install the app or keep a backup code.';
  }
  hideHelp() { $('#help').classList.add('hidden'); }

  // ------------------------------------------------------------------ sheets (src/ui/sheets/*, registered in ctx.sheets)
  modalOpen() { return !!this.modal || !!this.pendingSheet; }
  closeModal() { this.modal = null; this.pendingSheet = null; this.panel.classList.add('hidden'); this.panel.innerHTML = ''; }

  /** The registered sheet `name` (render, live), or undefined while its module is not loaded yet. */
  sheetDef(name) { return this.game?.core.sheets.get(name); }
  /** Draws the open sheet (or `name`) again: its render returns { title, body } and card() shows it. */
  renderSheet(name = this.modal, args = this.sheetArgs) {
    const def = this.sheetDef(name);
    if (!def) return;
    this.sheetArgs = args;
    const out = def.render(this, this.game.core, args);
    if (out) this.card(out.title, out.body);
  }

  /** Opens a sheet by name (`render` is only for a one-off function that draws itself with this = ui). The first open of a lazy sheet waits for its module. */
  openModal(name, render, args) {
    this.closeSeedPicker(); this.closePropMenu();
    if (this.modal !== name) this.sound?.play('page');
    const show = () => {
      this.modal = name;
      this.pendingSheet = null;
      this.panel.classList.remove('hidden');
      if (render) render.call(this); else this.renderSheet(name, args);
    };
    if (render || this.sheetDef(name)) { show(); return; }
    this.pendingSheet = name;
    loadSheet(this.game.core, name).then(() => { if (this.pendingSheet === name) show(); }, (e) => { this.pendingSheet = null; console.error(`sheet ${name} failed to load`, e); });
  }
  openShop() { this.openModal('shop'); }
  openBag() { this.openModal('bag'); }
  openTools() { this.openModal('tools'); }
  /** Today sheet; `away` adds a "while you were away" summary on top. */
  openToday(away = null) {
    this.awayInfo = away;
    if (this.game.daily.state) this.game.daily.state.seen = true;
    this.openModal('today', null, { away });
    this.updateClock();
  }
  openShrine() { this.openModal('shrine'); }
  /** After the camera tour: the "a Fortune wakes" card. */
  celebrate(f, delay = 0) {
    clearTimeout(this.celebrateTimer);
    this.celebrateTimer = setTimeout(() => this.openModal('wake', null, { fortune: f }), delay);
  }
  openBackup() { this.openModal('backup'); }
  openRestore() { this.openModal('restore'); }

  card(title, body) {
    const prev = this.panel.querySelector('.card');
    const prevScroll = prev?.scrollTop || 0;
    const same = prev && prev.dataset.title === title; // re-render: don't replay the slide-in
    this.panel.innerHTML = '';
    const c = el('div', 'card sheet' + (same ? ' static' : ''));
    c.dataset.title = title;
    c.innerHTML = `<div class="grabber"></div><div class="card-head"><h2>${title}</h2><span class="purse">${this.iconHTML('icons:koku', 'icon small')}<b>${this.game.money}</b> koku</span><button class="close" title="Close" aria-label="Close">✕</button></div>`;
    c.querySelector('.close').onclick = () => this.closeModal();
    c.appendChild(body);
    this.panel.appendChild(c);
    c.scrollTop = prevScroll;
    this.swipeToClose(c);
  }

  /** Drag the sheet's header down (portrait) or right (landscape side sheet) to dismiss. */
  swipeToClose(card) {
    const head = [card.querySelector('.grabber'), card.querySelector('.card-head')];
    let start = null;
    const side = () => matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
    const onDown = (e) => { if (e.target.closest('button')) return; start = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); };
    const onMove = (e) => {
      if (!start) return;
      const d = side() ? Math.max(0, e.clientX - start.x) : Math.max(0, e.clientY - start.y);
      card.style.transform = side() ? `translateX(${d}px)` : `translateY(${d}px)`;
    };
    const onUp = (e) => {
      if (!start) return;
      const d = side() ? e.clientX - start.x : e.clientY - start.y;
      start = null;
      card.style.transform = '';
      if (d > 80) this.closeModal();
    };
    for (const h of head) {
      if (!h) continue;
      h.addEventListener('pointerdown', onDown); h.addEventListener('pointermove', onMove);
      h.addEventListener('pointerup', onUp); h.addEventListener('pointercancel', () => { start = null; card.style.transform = ''; });
    }
  }

  row(id, right) {
    const it = ITEMS[id];
    const r = el('div', 'row');
    r.dataset.item = id;
    r.innerHTML = `${this.iconHTML(it.icon)}<span class="name">${it.name}</span>`;
    r.appendChild(right);
    return r;
  }
}

Object.assign(UI.prototype, iconMixin, fasttapMixin, toastMixin, fxMixin, dialogsMixin, hotbarMixin, actionButtonMixin, buildBarMixin, hudMixin);

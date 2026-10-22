// DOM HUD: koku, hotbar / build bar, context action button, toasts, shop + bag
// sheets, prop menu, confirm dialog, touch feedback (ripples, joystick, queue chips).
import { ITEMS, HOTBAR, PROPS } from './data.js';
import { assetUrl } from '../render/assets.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const SEEDS = ['seed_rice', 'seed_daikon', 'seed_tea'];
const ACTION_KINDS = new Set(['shop', 'harvest', 'water', 'plant', 'till', 'fish']);

export class UI {
  constructor(painted) {
    this.painted = painted;
    this.game = null;
    this.modal = null;
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
  }

  attach(game) {
    this.game = game;
    $('#btn-build').onclick = () => game.toggleBuild();
    $('#btn-bag').onclick = () => (this.modal === 'bag' ? this.closeModal() : this.openBag());
    $('#btn-help').onclick = () => ($('#help').classList.contains('hidden') ? this.showHelp() : this.hideHelp());
    $('#help-close').onclick = () => this.hideHelp();
    // pointerdown so reeling in reacts instantly on touch screens
    const act = $('#btn-action');
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); game.touchInput = e.pointerType !== 'mouse'; game.action(); this.actionT = 0; });
    act.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    $('#btn-rotate').onclick = () => game.rotate();
    $('#bb-place').onclick = () => game.confirmBuild();
    $('#bb-rotate').onclick = () => game.rotate();
    $('#bb-cancel').onclick = () => game.cancelBuildPreview();
    $('#btn-zoom-in').onclick = () => this.onZoom?.(-1);
    $('#btn-zoom-out').onclick = () => this.onZoom?.(1);
    $('#btn-reset').onclick = async () => {
      if (await this.confirm('Start a new village? Your current save will be erased.', 'Start over')) { game.constructor.clearSave(); location.reload(); }
    };
    this.panel.addEventListener('click', (e) => { if (e.target === this.panel) this.closeModal(); });
    window.addEventListener('resize', () => this.refresh());
    this.refresh();
  }

  // ------------------------------------------------------------------ helpers
  setTouch(on) {
    if (on === this.touch) return;
    this.touch = on;
    document.body.classList.toggle('touch', on);
    if (this.game) this.refresh();
  }
  compact() { return this.touch || window.innerWidth < 700; }

  iconHTML(spec, cls = 'icon') {
    const [kind, name] = spec.split(':');
    if (kind === 'asset') return `<span class="${cls}" style="background-image:url('${assetUrl(`assets/painted/icons/${name}.png`)}');background-size:contain"></span>`;
    const sheet = this.painted.sheets[kind];
    const c = sheet?.cells[name];
    if (!c) return `<span class="${cls}"></span>`;
    const [u0, v0, u1, v1] = c.uv;
    const cw = u1 - u0, ch = v1 - v0;
    const px = cw < 1 ? (u0 / (1 - cw)) * 100 : 0, py = ch < 1 ? ((1 - v1) / (1 - ch)) * 100 : 0;
    return `<span class="${cls}" style="background-image:url('${assetUrl(sheet.atlas)}');background-size:${100 / cw}% ${100 / ch}%;background-position:${px}% ${py}%"></span>`;
  }

  // ------------------------------------------------------------------ hotbar
  refresh() {
    const g = this.game;
    if (!g) return;
    $('#koku').textContent = g.money.toLocaleString();
    document.body.classList.toggle('build-mode', g.mode === 'build');
    $('#mode-label').textContent = g.mode === 'build' ? (this.touch ? 'Build mode' : 'Build mode · R rotate · B done') : '';
    this.hotbar.innerHTML = '';
    const compact = this.compact();
    this.hotbar.classList.toggle('compact', compact);
    if (g.mode === 'build') {
      const items = ['pickup', ...[...g.inv.keys()].filter((id) => ITEMS[id]?.kind === 'prop' && g.count(id) > 0)];
      if (g.buildSel !== 'pickup' && !items.includes(g.buildSel)) g.buildSel = 'pickup';
      this.buildItems = items;
      items.slice(0, 12).forEach((id, i) => {
        const s = el('button', 'slot' + (g.buildSel === id ? ' sel' : ''));
        s.dataset.item = id;
        s.innerHTML = (id === 'pickup' ? this.iconHTML('icons:basket') : this.iconHTML(ITEMS[id].icon))
          + `<span class="key">${i < 9 ? i + 1 : ''}</span>` + (id !== 'pickup' ? `<span class="count">${g.count(id)}</span>` : '')
          + `<span class="tip">${id === 'pickup' ? (this.touch ? 'Edit' : 'Pick up') : ITEMS[id].name}</span>`;
        s.onclick = () => this.selectBuild(i);
        this.hotbar.appendChild(s);
      });
      const done = el('button', 'slot special done', '<span class="glyph">✓</span><span class="tip">Done (B)</span>');
      done.dataset.item = 'done';
      done.onclick = () => g.toggleBuild(false);
      this.hotbar.appendChild(done);
    } else {
      const slots = compact ? ['hand', 'hoe', 'can', 'rod', 'seeds'] : HOTBAR;
      slots.forEach((id, i) => {
        if (id === 'seeds') { this.hotbar.appendChild(this.seedSlot()); return; }
        const it = ITEMS[id];
        const idx = HOTBAR.indexOf(id);
        const s = el('button', 'slot' + (g.slot === idx ? ' sel' : '') + (it.kind === 'seed' && !g.count(id) ? ' empty' : ''));
        s.dataset.item = id;
        s.innerHTML = this.iconHTML(it.icon) + `<span class="key">${i + 1}</span>`
          + (it.kind === 'seed' ? `<span class="count">${g.count(id)}</span>` : '') + `<span class="tip">${id === 'hand' && compact ? 'Hand (auto)' : it.name}</span>`;
        s.onclick = () => { this.closeSeedPicker(); g.selectSlot(idx); };
        this.hotbar.appendChild(s);
      });
      const b = el('button', 'slot special', `${this.iconHTML('asset:minka')}<span class="key">8</span><span class="tip">Build (B)</span>`);
      b.dataset.item = 'build';
      b.onclick = () => { this.closeSeedPicker(); g.toggleBuild(true); };
      const bag = el('button', 'slot special', `${this.iconHTML('icons:basket')}<span class="key">9</span><span class="tip">Bag (I)</span>`);
      bag.dataset.item = 'bag';
      bag.onclick = () => { this.closeSeedPicker(); this.openBag(); };
      this.hotbar.append(b, bag);
    }
    const tool = ITEMS[g.mode === 'build' ? 'hand' : HOTBAR[g.slot]];
    $('#tool-hint').textContent = g.mode === 'build'
      ? (g.buildSel === 'pickup'
        ? (this.touch ? 'Tap a decoration to move, rotate or store it' : 'Click a prop to pick it up')
        : (this.touch ? `Tap to preview ${ITEMS[g.buildSel].name.toLowerCase()}, tap again or ✓ to place` : `Click to place ${ITEMS[g.buildSel].name.toLowerCase()} · R to rotate`))
      : (this.touch ? 'Drag to walk · tap things to use them' : `${tool.name}${tool.hint ? ' — ' + tool.hint : ' — plant on tilled soil'}`);
    this.updateBuildBar();
    if (this.modal === 'shop') this.renderShop();
    if (this.modal === 'bag') this.renderBag();
  }

  /** Compact hotbar: one slot for all seeds; tap again to choose which. */
  seedSlot() {
    const g = this.game;
    const selSeed = SEEDS.includes(HOTBAR[g.slot]) ? HOTBAR[g.slot] : (g.lastSeed && SEEDS.includes(g.lastSeed) ? g.lastSeed : SEEDS.find((s) => g.count(s) > 0) || 'seed_rice');
    const sel = SEEDS.includes(HOTBAR[g.slot]);
    const s = el('button', 'slot' + (sel ? ' sel' : '') + (g.count(selSeed) ? '' : ' empty'));
    s.dataset.item = 'seeds';
    s.innerHTML = this.iconHTML(ITEMS[selSeed].icon) + `<span class="count">${g.count(selSeed)}</span><span class="more">▴</span><span class="tip">Seeds</span>`;
    s.onclick = () => {
      if (!sel) { g.selectSlot(HOTBAR.indexOf(selSeed)); g.lastSeed = selSeed; return; }
      this.openSeedPicker(s);
    };
    return s;
  }

  openSeedPicker(anchor) {
    const g = this.game;
    const pk = $('#seed-picker');
    pk.innerHTML = '';
    for (const id of SEEDS) {
      const b = el('button', 'seed-opt' + (HOTBAR[g.slot] === id ? ' sel' : ''), `${this.iconHTML(ITEMS[id].icon)}<span>${ITEMS[id].name}</span><b>${g.count(id)}</b>`);
      b.dataset.item = id;
      b.onclick = () => { g.selectSlot(HOTBAR.indexOf(id)); g.lastSeed = id; this.closeSeedPicker(); };
      pk.appendChild(b);
    }
    const r = anchor.getBoundingClientRect();
    pk.style.left = `${Math.max(8, Math.min(window.innerWidth - 220, r.left + r.width / 2 - 105))}px`;
    pk.style.bottom = `${window.innerHeight - r.top + 8}px`;
    pk.classList.remove('hidden');
  }
  closeSeedPicker() { $('#seed-picker')?.classList.add('hidden'); }

  selectBuild(i) {
    const g = this.game;
    const id = this.buildItems?.[i];
    if (!id) return;
    if (g.moving && id !== g.buildSel) g.cancelBuildPreview();
    g.buildSel = id;
    if (id === 'pickup') g.buildCursor = null;
    this.closePropMenu();
    this.refresh();
  }

  updateBuildBar() {
    const g = this.game;
    const show = g.mode === 'build' && this.touch && g.buildSel !== 'pickup' && !!g.buildCursor;
    $('#build-bar').classList.toggle('hidden', !show);
  }

  // ------------------------------------------------------------------ context action button
  updateAction() {
    const g = this.game;
    const btn = $('#btn-action');
    let html = null, cls = '';
    if (g.fishing) {
      html = '<span class="lbl">Reel!</span>';
      cls = g.fishing.phase === 'bite' ? 'reel bite' : 'reel';
    } else if (g.mode === 'build') {
      html = this.touch ? null : '<span class="lbl">Place</span>';
    } else if (!this.modalOpen()) {
      const a = g.resolve(g.targetTile());
      if (ACTION_KINDS.has(a.kind)) html = `${this.iconHTML(a.icon, 'icon act')}<span class="lbl">${a.label}</span>`;
      else if (!this.touch) html = `${this.iconHTML(ITEMS[g.tool].icon, 'icon act')}<span class="lbl">Use</span>`;
    }
    btn.classList.toggle('hidden', !html);
    if (html && btn.dataset.html !== html) { btn.innerHTML = html; btn.dataset.html = html; }
    btn.className = btn.className.replace(/\b(reel|bite)\b/g, '').trim() + (cls ? ` ${cls}` : '');
    btn.classList.toggle('hidden', !html);
  }

  // ------------------------------------------------------------------ feedback
  toast(msg, icon) {
    const t = el('div', 'toast', (icon ? this.iconHTML(icon, 'icon small') : '') + `<span>${msg}</span>`);
    this.toasts.appendChild(t);
    const max = this.compact() ? 2 : 4;
    while (this.toasts.children.length > max) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  bubble(text) {
    this.bubbleText = text;
    this.bubbleEl.textContent = text || '';
    this.bubbleEl.classList.toggle('hidden', !text);
  }

  ripple(x, y, long = false) {
    const r = el('div', 'ripple' + (long ? ' long' : ''));
    r.style.left = `${x}px`; r.style.top = `${y}px`;
    this.fx.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  /** Small rising label over a tile (crop status, prop names...). */
  floatLabel(text, x, z) {
    if (!text) return;
    const e = el('div', 'float-label', text);
    this.fx.appendChild(e);
    const l = { e, x: x + 0.5, z: z + 0.5, t: 0 };
    this.labels.push(l);
    this.placeAt(e, l.x, 0.9, l.z);
  }

  joystick(s) {
    const j = $('#joy');
    if (!s) { j.classList.add('hidden'); return; }
    j.classList.remove('hidden');
    j.style.left = `${s.ox}px`; j.style.top = `${s.oy}px`;
    const k = j.querySelector('.knob');
    k.style.transform = `translate(${s.x - s.ox}px, ${s.y - s.oy}px)`;
  }

  placeAt(e, x, y, z, dy = 0) {
    if (!this.toScreen) return;
    const s = this.toScreen(x, y, z);
    e.style.left = `${s.x}px`; e.style.top = `${s.y + dy}px`;
  }

  /** Queue markers: one chip per pending / queued action, numbered. */
  refreshQueue() {
    const g = this.game;
    const list = [g.player.pending, ...g.queue].filter(Boolean);
    while (this.chips.length < list.length) { const c = el('div', 'chip'); this.fx.appendChild(c); this.chips.push(c); }
    this.chips.forEach((c, i) => {
      const a = list[i];
      c.classList.toggle('hidden', !a);
      if (!a) return;
      const key = `${a.icon}|${i}`;
      if (c.dataset.key !== key) { c.innerHTML = `${this.iconHTML(a.icon, 'icon chip-icon')}${list.length > 1 ? `<b>${i + 1}</b>` : ''}`; c.dataset.key = key; }
      c._t = a.t;
    });
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
    if (this.actionT <= 0) { this.updateAction(); this.updateBuildBar(); this.actionT = 0.15; }
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

  // ------------------------------------------------------------------ dialogs / help
  confirm(text, okLabel = 'OK') {
    const d = $('#dialog');
    d.querySelector('.dlg-text').textContent = text;
    d.querySelector('.dlg-ok').textContent = okLabel;
    d.classList.remove('hidden');
    return new Promise((resolve) => {
      this.dialogResolve = resolve;
      d.querySelector('.dlg-ok').onclick = () => this.closeDialog(true);
      d.querySelector('.dlg-cancel').onclick = () => this.closeDialog(false);
    });
  }
  dialogOpen() { return !$('#dialog').classList.contains('hidden'); }
  closeDialog(v) { $('#dialog').classList.add('hidden'); const r = this.dialogResolve; this.dialogResolve = null; r?.(v); }

  showHelp() { $('#help').classList.remove('hidden'); }
  hideHelp() { $('#help').classList.add('hidden'); }

  // ------------------------------------------------------------------ sheets (shop / bag)
  modalOpen() { return !!this.modal; }
  closeModal() { this.modal = null; this.panel.classList.add('hidden'); this.panel.innerHTML = ''; }

  openShop() { this.closeSeedPicker(); this.closePropMenu(); this.modal = 'shop'; this.panel.classList.remove('hidden'); this.renderShop(); }
  openBag() { this.closeSeedPicker(); this.closePropMenu(); this.modal = 'bag'; this.panel.classList.remove('hidden'); this.renderBag(); }

  card(title, body) {
    const prevScroll = this.panel.querySelector('.card')?.scrollTop || 0;
    this.panel.innerHTML = '';
    const c = el('div', 'card sheet');
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

  renderShop() {
    const g = this.game;
    const body = el('div', 'shop');
    const tabs = el('div', 'tabs');
    for (const [k, label] of [['sell', 'Sell'], ['seeds', 'Seeds'], ['decor', 'Decor']]) {
      const b = el('button', 'tab' + (this.shopTab === k ? ' on' : ''), label);
      b.dataset.tab = k;
      b.onclick = () => { this.shopTab = k; this.renderShop(); };
      tabs.appendChild(b);
    }
    body.appendChild(el('p', 'npc', 'Merchant Hana: <i>“Welcome, friend! Fresh daikon and a good koi always find a buyer here.”</i>'));
    body.appendChild(tabs);
    const list = el('div', 'list');
    if (this.shopTab === 'sell') {
      const sellables = [...g.inv.keys()].filter((id) => ITEMS[id]?.sell && ITEMS[id].kind !== 'prop' && g.count(id) > 0);
      const all = el('button', 'btn big sell-all', 'Sell all harvest & fish');
      all.onclick = () => g.sellAll();
      list.appendChild(all);
      if (!sellables.length) list.appendChild(el('p', 'muted', 'Nothing to sell yet — harvest crops or go fishing!'));
      for (const id of sellables) {
        const right = el('span', 'right');
        right.innerHTML = `<span class="qty">×${g.count(id)}</span><span class="price">${ITEMS[id].sell} koku</span>`;
        const b1 = el('button', 'btn', 'Sell 1'); b1.onclick = (e) => { e.stopPropagation(); g.sell(id, 1); };
        const ba = el('button', 'btn', 'All'); ba.onclick = (e) => { e.stopPropagation(); g.sell(id); };
        right.append(b1, ba);
        const r = this.row(id, right);
        r.classList.add('tappable');
        r.onclick = () => g.sell(id, 1); // tap the row = sell one
        list.appendChild(r);
      }
    } else {
      const ids = Object.keys(ITEMS).filter((id) => (this.shopTab === 'seeds' ? ITEMS[id].kind === 'seed' : ITEMS[id].kind === 'prop'));
      for (const id of ids) {
        const right = el('span', 'right');
        right.innerHTML = `<span class="qty">own ${g.count(id)}</span><span class="price">${ITEMS[id].buy} koku</span>`;
        const b = el('button', 'btn', 'Buy');
        b.disabled = g.money < ITEMS[id].buy;
        b.onclick = () => g.buy(id);
        right.appendChild(b);
        list.appendChild(this.row(id, right));
      }
    }
    body.appendChild(list);
    this.card('Hana’s Stall', body);
  }

  renderBag() {
    const g = this.game;
    const body = el('div', 'bag');
    const grid = el('div', 'grid');
    for (const [id, n] of g.inv) {
      const it = ITEMS[id];
      if (!it || it.kind === 'tool') continue;
      const c = el('div', 'bag-item', `${this.iconHTML(it.icon)}<span class="count">${n}</span><span class="label">${it.name}</span>`);
      c.dataset.item = id;
      if (it.kind === 'prop') {
        c.classList.add('clickable'); c.title = 'Place in build mode';
        c.onclick = () => { this.closeModal(); g.buildSel = id; g.toggleBuild(true); };
      } else if (it.kind === 'seed') {
        c.classList.add('clickable');
        c.onclick = () => { this.closeModal(); g.selectSlot(HOTBAR.indexOf(id)); g.lastSeed = id; };
      }
      grid.appendChild(c);
    }
    if (!grid.children.length) grid.appendChild(el('p', 'muted', 'Your bag is empty.'));
    body.appendChild(grid);
    body.appendChild(el('p', 'muted', this.touch
      ? 'Tip: tap a decoration to place it, or seeds to plant them. Sell produce and fish at Hana’s stall.'
      : 'Tip: click a decoration to place it. Sell produce and fish at Hana’s stall in the plaza.'));
    this.card('Bag', body);
  }
}

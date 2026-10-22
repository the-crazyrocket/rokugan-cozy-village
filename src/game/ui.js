// DOM HUD: koku, hotbar / build bar, toasts, shop + bag panels, speech bubble.
import { ITEMS, HOTBAR, PROPS } from './data.js';
import { assetUrl } from '../render/assets.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

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
  }

  attach(game) {
    this.game = game;
    $('#btn-build').onclick = () => game.toggleBuild();
    $('#btn-bag').onclick = () => (this.modal === 'bag' ? this.closeModal() : this.openBag());
    $('#btn-help').onclick = () => $('#help').classList.toggle('hidden');
    $('#help-close').onclick = () => $('#help').classList.add('hidden');
    $('#btn-action').onclick = () => game.action();
    $('#btn-rotate').onclick = () => game.rotate();
    $('#btn-zoom-in').onclick = () => this.onZoom?.(-1);
    $('#btn-zoom-out').onclick = () => this.onZoom?.(1);
    $('#btn-reset').onclick = () => {
      if (confirm('Start a new village? Your current save will be erased.')) { game.constructor.clearSave(); location.reload(); }
    };
    this.panel.addEventListener('click', (e) => { if (e.target === this.panel) this.closeModal(); });
    this.refresh();
  }

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

  refresh() {
    const g = this.game;
    if (!g) return;
    $('#koku').textContent = g.money.toLocaleString();
    document.body.classList.toggle('build-mode', g.mode === 'build');
    $('#mode-label').textContent = g.mode === 'build' ? 'Build mode · R rotate · B done' : '';
    this.hotbar.innerHTML = '';
    if (g.mode === 'build') {
      const items = ['pickup', ...[...g.inv.keys()].filter((id) => ITEMS[id]?.kind === 'prop' && g.count(id) > 0)];
      this.buildItems = items;
      items.slice(0, 12).forEach((id, i) => {
        const s = el('button', 'slot' + (g.buildSel === id ? ' sel' : ''));
        s.dataset.item = id;
        s.innerHTML = (id === 'pickup' ? this.iconHTML('icons:basket') : this.iconHTML(ITEMS[id].icon))
          + `<span class="key">${i < 9 ? i + 1 : ''}</span>` + (id !== 'pickup' ? `<span class="count">${g.count(id)}</span>` : '')
          + `<span class="tip">${id === 'pickup' ? 'Pick up' : ITEMS[id].name}</span>`;
        s.onclick = () => this.selectBuild(i);
        this.hotbar.appendChild(s);
      });
      const done = el('button', 'slot special', '<span class="glyph">✓</span><span class="tip">Done (B)</span>');
      done.onclick = () => g.toggleBuild(false);
      this.hotbar.appendChild(done);
    } else {
      HOTBAR.forEach((id, i) => {
        const it = ITEMS[id];
        const s = el('button', 'slot' + (g.slot === i ? ' sel' : '') + (it.kind === 'seed' && !g.count(id) ? ' empty' : ''));
        s.dataset.item = id;
        s.innerHTML = this.iconHTML(it.icon) + `<span class="key">${i + 1}</span>`
          + (it.kind === 'seed' ? `<span class="count">${g.count(id)}</span>` : '') + `<span class="tip">${it.name}</span>`;
        s.onclick = () => g.selectSlot(i);
        this.hotbar.appendChild(s);
      });
      const b = el('button', 'slot special', `${this.iconHTML('asset:minka')}<span class="key">8</span><span class="tip">Build (B)</span>`);
      b.onclick = () => g.toggleBuild(true);
      const bag = el('button', 'slot special', `${this.iconHTML('icons:basket')}<span class="key">9</span><span class="tip">Bag (I)</span>`);
      bag.onclick = () => this.openBag();
      this.hotbar.append(b, bag);
    }
    const tool = ITEMS[g.mode === 'build' ? 'hand' : HOTBAR[g.slot]];
    $('#tool-hint').textContent = g.mode === 'build'
      ? (g.buildSel === 'pickup' ? 'Click a prop to pick it up' : `Click to place ${ITEMS[g.buildSel].name.toLowerCase()} · R to rotate`)
      : `${tool.name}${tool.hint ? ' — ' + tool.hint : ' — plant on tilled soil'}`;
    if (this.modal === 'shop') this.renderShop();
    if (this.modal === 'bag') this.renderBag();
  }

  selectBuild(i) {
    const g = this.game;
    const id = this.buildItems?.[i];
    if (!id) return;
    g.buildSel = id;
    this.refresh();
  }

  toast(msg, icon) {
    const t = el('div', 'toast', (icon ? this.iconHTML(icon, 'icon small') : '') + `<span>${msg}</span>`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  bubble(text) {
    this.bubbleText = text;
    this.bubbleEl.textContent = text || '';
    this.bubbleEl.classList.toggle('hidden', !text);
  }

  /** Position the "!" bubble over the player's head each frame. */
  update(camera, worldPos, canvas) {
    if (!this.bubbleText) return;
    const v = worldPos.clone().project(camera);
    const r = canvas.getBoundingClientRect();
    this.bubbleEl.style.left = `${r.left + (v.x * 0.5 + 0.5) * r.width}px`;
    this.bubbleEl.style.top = `${r.top + (-v.y * 0.5 + 0.5) * r.height}px`;
  }

  modalOpen() { return !!this.modal; }
  closeModal() { this.modal = null; this.panel.classList.add('hidden'); this.panel.innerHTML = ''; }

  openShop() { this.modal = 'shop'; this.panel.classList.remove('hidden'); this.renderShop(); }
  openBag() { this.modal = 'bag'; this.panel.classList.remove('hidden'); this.renderBag(); }

  card(title, body) {
    this.panel.innerHTML = '';
    const c = el('div', 'card');
    c.innerHTML = `<div class="card-head"><h2>${title}</h2><span class="purse">${this.iconHTML('icons:koku', 'icon small')}<b>${this.game.money}</b> koku</span><button class="close" title="Close">✕</button></div>`;
    c.querySelector('.close').onclick = () => this.closeModal();
    c.appendChild(body);
    this.panel.appendChild(c);
  }

  row(id, right) {
    const it = ITEMS[id];
    const r = el('div', 'row');
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
      b.onclick = () => { this.shopTab = k; this.renderShop(); };
      tabs.appendChild(b);
    }
    body.appendChild(el('p', 'npc', 'Merchant Hana: <i>“Welcome, friend! Fresh daikon and a good koi always find a buyer here.”</i>'));
    body.appendChild(tabs);
    const list = el('div', 'list');
    if (this.shopTab === 'sell') {
      const sellables = [...g.inv.keys()].filter((id) => ITEMS[id]?.sell && ITEMS[id].kind !== 'prop' && g.count(id) > 0);
      const all = el('button', 'btn big', 'Sell all harvest & fish');
      all.onclick = () => g.sellAll();
      list.appendChild(all);
      if (!sellables.length) list.appendChild(el('p', 'muted', 'Nothing to sell yet — harvest crops or go fishing!'));
      for (const id of sellables) {
        const right = el('span', 'right');
        right.innerHTML = `<span class="qty">×${g.count(id)}</span><span class="price">${ITEMS[id].sell} koku</span>`;
        const b1 = el('button', 'btn', 'Sell 1'); b1.onclick = () => g.sell(id, 1);
        const ba = el('button', 'btn', 'All'); ba.onclick = () => g.sell(id);
        right.append(b1, ba);
        list.appendChild(this.row(id, right));
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
      if (it.kind === 'prop') {
        c.classList.add('clickable'); c.title = 'Place in build mode';
        c.onclick = () => { this.closeModal(); g.buildSel = id; g.toggleBuild(true); };
      }
      grid.appendChild(c);
    }
    if (!grid.children.length) grid.appendChild(el('p', 'muted', 'Your bag is empty.'));
    body.appendChild(grid);
    body.appendChild(el('p', 'muted', 'Tip: click a decoration to place it. Sell produce and fish at Hana’s stall in the plaza.'));
    this.card('Bag', body);
  }
}

export { PROPS };

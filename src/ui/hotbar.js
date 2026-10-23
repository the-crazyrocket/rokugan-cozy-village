import { ITEMS } from '../game/data.js';
import { $, el } from './dom.js';

export const CORE_SLOTS = 5; // the compact bar's own tool slots; further tools go to the more sheet

/**
 * Where each hotbar entry goes. Desktop shows every entry as a slot. The compact bar has one slot per entry that asks for its own
 * (compact: true) and one per group (compact: 'seeds'), at most CORE_SLOTS of them; an entry in group 'more', one that does not ask
 * for the compact bar, or one that would be the sixth slot is reached through the more sheet instead. `groupOf(entry)` is its tool group.
 */
export function toolLayout(bar, { compact, groupOf = (e) => e.group } = {}) {
  if (!compact) return { slots: bar.map((e) => e.id), more: [] };
  const slots = [], more = [];
  for (const e of bar) {
    const slot = e.compact === true ? e.id : e.compact;
    if (!slot || groupOf(e) === 'more' || (!slots.includes(slot) && slots.length >= CORE_SLOTS)) more.push(e.id);
    else if (!slots.includes(slot)) slots.push(slot);
  }
  return { slots, more };
}

export const hotbarMixin = {
  /** The hotbar registry's entries, in order: the tools, then the seeds. */
  bar() { return this.game.core.use('interact').hotbar(); },
  /** Name, icon, hint and kind of tool `id`: the hotbar entry first, then the item of the same id (a registered tool may have no item). */
  toolInfo(id) {
    const e = this.bar().find((x) => x.id === id), it = ITEMS[id];
    return { id, name: e?.name ?? it?.name ?? id, icon: e?.icon ?? it?.icon, hint: e?.hint ?? it?.hint, kind: it?.kind };
  },
  groupOf(e) { return e.group ?? this.game.core.tools.get(e.id)?.group; },
  /** Ids of the tools the compact bar leaves to the more sheet. */
  moreTools() { return toolLayout(this.bar(), { compact: true, groupOf: (e) => this.groupOf(e) }).more; },
  /** Hotbar slot of tool `id` (what selectSlot takes). */
  slotOf(id) { return this.bar().findIndex((e) => e.id === id); },
  /** The seed ids, the entries that share the compact bar's one seeds slot. */
  seeds() { return this.bar().filter((e) => e.compact === 'seeds').map((e) => e.id); },

  /** Redraws the slots (play tools or build items) and the tool hint line. */
  renderHotbar() {
    const g = this.game;
    this.hotbar.innerHTML = '';
    const compact = this.compact();
    this.hotbar.classList.toggle('compact', compact);
    if (g.mode === 'build') {
      const items = ['pickup', ...[...g.inv.keys()].filter((id) => ITEMS[id]?.kind === 'prop' && g.count(id) > 0)];
      if (g.buildSel !== 'pickup' && !items.includes(g.buildSel)) g.buildSel = 'pickup';
      this.buildItems = items;
      // Done first: it must never scroll out of view on narrow phones
      const done = el('button', 'slot special done', '<span class="glyph">✓</span><span class="tip">Done (B)</span>');
      done.dataset.item = 'done';
      done.onclick = () => g.toggleBuild(false);
      this.hotbar.appendChild(done);
      items.slice(0, 12).forEach((id, i) => {
        const s = el('button', 'slot' + (g.buildSel === id ? ' sel' : ''));
        s.dataset.item = id;
        s.innerHTML = (id === 'pickup' ? this.iconHTML('icons:basket') : this.iconHTML(ITEMS[id].icon))
          + `<span class="key">${i < 9 ? i + 1 : ''}</span>` + (id !== 'pickup' ? `<span class="count">${g.count(id)}</span>` : '')
          + `<span class="tip">${id === 'pickup' ? (this.touch ? 'Edit' : 'Pick up') : ITEMS[id].name}</span>`;
        s.onclick = () => this.selectBuild(i);
        this.hotbar.appendChild(s);
      });
    } else {
      // the play kit holds the seeds, the dig kit the land tools (taps do the rest by context);
      // compact: a slot for each entry that asks for its own (compact: true) and one for each group of entries (compact: 'seeds')
      const dig = g.kit === 'dig';
      if (dig) {
        const done = el('button', 'slot special done', '<span class="glyph">✓</span><span class="tip">Done digging (G)</span>');
        done.dataset.item = 'done';
        done.onclick = () => g.setKit('play');
        this.hotbar.appendChild(done);
      }
      const bar = this.bar();
      const { slots, more } = toolLayout(bar, { compact, groupOf: (e) => this.groupOf(e) });
      slots.forEach((id, i) => {
        if (id === 'seeds') { this.hotbar.appendChild(this.seedSlot()); return; }
        const it = this.toolInfo(id);
        const idx = this.slotOf(id);
        const s = el('button', 'slot' + (g.slot === idx ? ' sel' : '') + ((it.kind === 'seed' || it.kind === 'material') && !g.count(id) ? ' empty' : ''));
        s.dataset.item = id;
        s.innerHTML = this.iconHTML(it.icon) + `<span class="key">${i + 1}</span>`
          + (it.kind === 'seed' || it.kind === 'material' ? `<span class="count">${g.count(id)}</span>` : '') + `<span class="tip">${it.name}</span>`;
        s.onclick = () => { this.closeSeedPicker(); g.selectSlot(idx); };
        this.hotbar.appendChild(s);
      });
      if (more.length) this.hotbar.appendChild(this.moreSlot(more));
      if (dig) { this.renderHint(); return; }
      const d = el('button', 'slot special', `${this.iconHTML('icons3:shovel')}<span class="key">G</span><span class="tip">Dig (G)</span>`);
      d.dataset.item = 'dig';
      d.onclick = () => { this.closeSeedPicker(); g.setKit('dig'); };
      this.hotbar.appendChild(d);
      const b = el('button', 'slot special', `${this.iconHTML('asset:minka')}<span class="key">B</span><span class="tip">Build (B)</span>`);
      b.dataset.item = 'build';
      b.onclick = () => { this.closeSeedPicker(); g.toggleBuild(true); };
      this.hotbar.appendChild(b);
      // with a more slot the bar is as wide as it can be on a phone: the bag moves into the more sheet
      if (!more.length) {
        const bag = el('button', 'slot special', `${this.iconHTML('icons:basket')}<span class="key">I</span><span class="tip">Bag (I)</span>`);
        bag.dataset.item = 'bag';
        bag.onclick = () => { this.closeSeedPicker(); this.openBag(); };
        this.hotbar.appendChild(bag);
      }
    }
    this.renderHint();
  },

  renderHint() {
    const g = this.game;
    this.hotbar.querySelector('.slot.sel')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const tool = this.toolInfo(g.tool);
    $('#tool-hint').textContent = g.mode === 'build'
      ? (g.buildSel === 'pickup'
        ? (this.touch ? 'Tap a decoration to move, rotate or store it' : 'Click a prop to pick it up')
        : (this.touch ? `Tap to preview ${ITEMS[g.buildSel].name.toLowerCase()}, tap again or ✓ to place` : `Click to place ${ITEMS[g.buildSel].name.toLowerCase()} · R to rotate`))
      : g.kit === 'dig'
        ? (this.touch ? `${tool.name}${tool.hint ? ' — ' + tool.hint : ''}` : `${tool.name}${tool.hint ? ' — ' + tool.hint : ''} · click or drag over the ground`)
        : (this.touch ? 'Tap to go · swipe the field to tend it' : `${tool.name}${tool.hint ? ' — ' + tool.hint : ' — plant on tilled soil'} · click to go or use, drag over the field to tend it`);
  },

  /** Compact hotbar: the one slot for the tools in `more`; it shows the one in hand, and a tap opens the tools sheet. */
  moreSlot(more) {
    const g = this.game;
    const held = more.includes(g.tool) ? g.tool : null;
    const s = el('button', 'slot' + (held ? ' sel' : ''));
    s.dataset.item = 'more';
    s.innerHTML = (held ? this.iconHTML(this.toolInfo(held).icon) : '<span class="glyph">⋯</span>') + `<span class="more">▴</span><span class="tip">${held ? this.toolInfo(held).name : 'More tools'}</span>`;
    s.onclick = () => { this.closeSeedPicker(); this.openTools(); };
    return s;
  },

  /** Compact hotbar: one slot for all seeds; tap again to choose which. */
  seedSlot() {
    const g = this.game;
    const SEEDS = this.seeds();
    const selSeed = SEEDS.includes(g.tool) ? g.tool : (g.lastSeed && SEEDS.includes(g.lastSeed) ? g.lastSeed : SEEDS.find((s) => g.count(s) > 0) || SEEDS[0]);
    const sel = SEEDS.includes(g.tool);
    const s = el('button', 'slot' + (g.count(selSeed) ? '' : ' empty'));
    s.dataset.item = 'seeds';
    s.innerHTML = this.iconHTML(ITEMS[selSeed].icon) + `<span class="count">${g.count(selSeed)}</span><span class="more">▴</span><span class="tip">Seeds</span>`;
    s.onclick = () => {
      if (!sel) { g.selectSlot(this.slotOf(selSeed)); g.lastSeed = selSeed; return; }
      this.openSeedPicker(s);
    };
    return s;
  },

  openSeedPicker(anchor) {
    const g = this.game;
    const pk = $('#seed-picker');
    pk.innerHTML = '';
    for (const id of this.seeds()) {
      const b = el('button', 'seed-opt' + (g.tool === id ? ' sel' : ''), `${this.iconHTML(ITEMS[id].icon)}<span>${ITEMS[id].name}</span><b>${g.count(id)}</b>`);
      b.dataset.item = id;
      b.onclick = () => { g.selectSlot(this.slotOf(id)); g.lastSeed = id; this.closeSeedPicker(); };
      pk.appendChild(b);
    }
    const r = anchor.getBoundingClientRect();
    pk.style.left = `${Math.max(8, Math.min(window.innerWidth - 220, r.left + r.width / 2 - 105))}px`;
    pk.style.bottom = `${window.innerHeight - r.top + 8}px`;
    pk.classList.remove('hidden');
  },
  closeSeedPicker() { $('#seed-picker')?.classList.add('hidden'); },

  /** Build-mode slot `i` (0 is the pick-up basket). */
  selectBuild(i) {
    const g = this.game;
    const id = this.buildItems?.[i];
    if (!id) return;
    if (g.moving && id !== g.buildSel) g.cancelBuildPreview();
    g.buildSel = id;
    if (id === 'pickup') g.buildCursor = null;
    this.closePropMenu();
    this.refresh();
  },
};

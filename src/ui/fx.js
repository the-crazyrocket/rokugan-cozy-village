import { $, el } from './dom.js';

// Touch feedback laid over the canvas: ripples, the joystick, float labels and the queue chips.
export const fxMixin = {
  ripple(x, y, long = false) {
    const r = el('div', 'ripple' + (long ? ' long' : ''));
    r.style.left = `${x}px`; r.style.top = `${y}px`;
    this.fx.appendChild(r);
    setTimeout(() => r.remove(), 600);
  },

  /** Small rising label over a tile (crop status, prop names...). */
  floatLabel(text, x, z) {
    if (!text) return;
    const e = el('div', 'float-label', text);
    this.fx.appendChild(e);
    const l = { e, x: x + 0.5, z: z + 0.5, t: 0 };
    this.labels.push(l);
    this.placeAt(e, l.x, 0.9, l.z);
  },

  joystick(s) {
    const j = $('#joy');
    if (!s) { j.classList.add('hidden'); return; }
    j.classList.remove('hidden');
    j.style.left = `${s.ox}px`; j.style.top = `${s.oy}px`;
    const k = j.querySelector('.knob');
    k.style.transform = `translate(${s.x - s.ox}px, ${s.y - s.oy}px)`;
  },

  placeAt(e, x, y, z, dy = 0) {
    if (!this.toScreen) return;
    const s = this.toScreen(x, y, z);
    e.style.left = `${s.x}px`; e.style.top = `${s.y + dy}px`;
  },

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
  },
};

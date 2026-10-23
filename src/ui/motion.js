// Motion: an icon flies from the player to the bag (or its hotbar slot) when something is picked up, and the koku counter ticks to
// its new value. Both are CSS / Web Animations only; nothing here touches the game state.
import { $, el } from './dom.js';

const MAX_FLIGHTS = 6;

export const motionMixin = {
  /** The item's icon flies from above the player to where it went: its hotbar slot when it has one, otherwise the Bag button. */
  flyToBag(item) {
    const g = this.game, it = g?.core.content.itemMap().get(item);
    if (!it || !this.toScreen || !g.player?.pos) return;
    this.flights ||= 0;
    if (this.flights >= MAX_FLIGHTS || document.hidden) return;
    const p = g.player.pos, from = this.toScreen(p.x, 1.1 + (g.world.levelY(p.x, p.z) || 0), p.z);
    const slot = this.hotbar.querySelector(`.slot[data-item="${item}"]`);
    const target = slot && slot.offsetParent ? slot : $('#btn-bag');
    const r = target.getBoundingClientRect(), to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const f = el('div', 'fly', this.iconHTML(it.icon, 'icon'));
    f.style.left = `${from.x}px`; f.style.top = `${from.y}px`;
    document.body.appendChild(f);
    this.flights++;
    const dx = to.x - from.x, dy = to.y - from.y, lift = Math.min(90, 40 + Math.abs(dx) * 0.15);
    const a = f.animate([
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.15 - lift}px)) scale(1.15)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: 0.9 },
    ], { duration: 650, easing: 'cubic-bezier(.45,.05,.55,.95)' });
    a.onfinish = a.oncancel = () => {
      f.remove(); this.flights--;
      target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump');
    };
  },

  /** The koku counter counts to `v` (a short tick up or down, flashing the purse). */
  tickKoku(v) {
    const e = $('#koku');
    if (this.kokuShown === undefined || Math.abs(v - this.kokuShown) > 100000) { this.kokuShown = v; e.textContent = v.toLocaleString(); return; }
    if (v === this.kokuTo) return;
    const from = this.kokuShown, t0 = performance.now(), ms = Math.min(700, 250 + Math.abs(v - from) * 2);
    this.kokuTo = v;
    const box = e.parentElement;
    box.classList.remove('up', 'down'); void box.offsetWidth; box.classList.add(v > from ? 'up' : 'down');
    const step = (now) => {
      if (this.kokuTo !== v) return;
      const k = Math.min(1, (now - t0) / ms), ease = 1 - Math.pow(1 - k, 3);
      this.kokuShown = Math.round(from + (v - from) * ease);
      e.textContent = this.kokuShown.toLocaleString();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
};

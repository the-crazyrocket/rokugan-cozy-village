import { $, el } from '../dom.js';
import { visibleEntries, syncSlot } from './render.js';

// toolbar: above the hotbar (shovel modes); preview: a chip for the reclaim / terraform preview; shutter: the photo button; corner: markers such as "Not saved"
export const HUD_SLOTS = ['toolbar', 'preview', 'shutter', 'corner'];

export const hudMixin = {
  /** The box of HUD slot `slot`, made the first time it is needed (the toolbar sits in #bottom, above the hotbar). */
  hudBox(slot) {
    this.hudBoxes ||= new Map();
    if (!this.hudBoxes.has(slot)) {
      const box = el('div', 'hud-slot hidden');
      box.id = `hud-${slot}`;
      if (slot === 'toolbar') $('#bottom').insertBefore(box, this.hotbar); else document.body.appendChild(box);
      this.hudBoxes.set(slot, { box, cache: new Map() });
    }
    return this.hudBoxes.get(slot);
  },

  /** Draws the entries of ctx.hud into their slots: on refresh and every few frames from update(). */
  renderHud() {
    const core = this.game?.core;
    if (!core || (!core.hud.size && !this.hudBoxes)) return;
    for (const slot of HUD_SLOTS) {
      const entries = visibleEntries(core, slot);
      if (!entries.length && !this.hudBoxes?.has(slot)) continue;
      const { box, cache } = this.hudBox(slot);
      syncSlot(box, entries, this, core, cache);
    }
  },
};

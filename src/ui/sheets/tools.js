import { el } from '../dom.js';

export const live = true;

// The compact bar's "more tools" sheet: a grid of the tools that have no slot of their own. Tapping one takes it in hand.
export function render(ui) {
  const g = ui.game;
  const body = el('div', 'tools');
  const grid = el('div', 'grid');
  const held = ui.bar()[g.slot]?.id;
  for (const id of ui.moreTools()) {
    const t = ui.toolInfo(id);
    const c = el('div', 'bag-item clickable' + (id === held ? ' sel' : ''), `${ui.iconHTML(t.icon)}<span class="label">${t.name}</span>`);
    c.dataset.item = id;
    c.onclick = () => { ui.closeModal(); g.selectSlot(ui.slotOf(id)); };
    grid.appendChild(c);
  }
  // the bar has no bag slot while the more slot is there
  const bag = el('div', 'bag-item clickable', `${ui.iconHTML('icons:basket')}<span class="label">Bag</span>`);
  bag.dataset.item = 'bag';
  bag.onclick = () => ui.openBag();
  grid.appendChild(bag);
  body.appendChild(grid);
  return { title: 'Tools', body };
}

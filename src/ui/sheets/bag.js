import { ITEMS } from '../../game/data.js';
import { el } from '../dom.js';

export const live = true;

export function render(ui) {
  const g = ui.game;
  const body = el('div', 'bag');
  const grid = el('div', 'grid');
  for (const [id, n] of g.inv) {
    const it = ITEMS[id];
    if (!it || it.kind === 'tool') continue;
    const c = el('div', 'bag-item', `${ui.iconHTML(it.icon)}<span class="count">${n}</span><span class="label">${it.name}</span>`);
    c.dataset.item = id;
    if (it.kind === 'prop') {
      c.classList.add('clickable'); c.title = 'Place in build mode';
      c.onclick = () => { ui.closeModal(); g.buildSel = id; g.toggleBuild(true); };
    } else if (it.kind === 'seed') {
      c.classList.add('clickable');
      c.onclick = () => { ui.closeModal(); g.selectSlot(ui.slotOf(id)); g.lastSeed = id; };
    }
    grid.appendChild(c);
  }
  if (!grid.children.length) grid.appendChild(el('p', 'muted', 'Your bag is empty.'));
  body.appendChild(grid);
  body.appendChild(el('p', 'muted', ui.touch
    ? 'Tip: tap a decoration to place it, or seeds to plant them. Sell produce and fish at Hana’s stall.'
    : 'Tip: click a decoration to place it. Sell produce and fish at Hana’s stall in the plaza.'));
  return { title: 'Bag', body };
}

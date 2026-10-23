// The workbench sheet: every recipe the bench knows, what it takes (have / need) and a Make button.
import { ITEMS } from '../../game/data.js';
import { el } from '../dom.js';

export const live = true;

export function render(ui) {
  const g = ui.game, craft = g.core.use('craft');
  const body = el('div', 'workbench');
  body.appendChild(el('p', 'npc', 'Gather stone, wood, clay and shells around the island, and make them into things here.'));
  const list = el('div', 'list');
  for (const r of craft.recipes()) {
    const [outId, outN] = Object.entries(r.out)[0];
    const row = el('div', 'row recipe' + (craft.can(r.id) ? '' : ' short'));
    row.dataset.recipe = r.id;
    const needs = Object.entries(r.inputs).map(([id, n]) => {
      const have = g.count(id);
      return `<span class="cost${have < n ? ' short' : ' full'}">${ui.iconHTML(ITEMS[id].icon, 'icon tiny')}${have}/${n}</span>`;
    }).join('');
    row.innerHTML = `${ui.iconHTML(ITEMS[outId].icon)}<span class="name">${r.name}${outN > 1 ? ` ×${outN}` : ''}<small class="needs">${needs}</small>${r.hint ? `<small>${r.hint}</small>` : ''}</span>`;
    const right = el('span', 'right');
    const b = el('button', 'btn make', 'Make');
    b.disabled = !craft.can(r.id);
    b.onclick = () => craft.make(r.id);
    right.appendChild(b);
    row.appendChild(right);
    list.appendChild(row);
  }
  body.appendChild(list);
  return { title: 'Workbench', body };
}

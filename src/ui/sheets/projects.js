// The project board: Kenji's projects, what each costs, how long it takes, and the one being built.
import { ITEMS } from '../../game/data.js';
import { duration } from '../../game/clock.js';
import { el } from '../dom.js';

export const live = true;

export function render(ui) {
  const g = ui.game, pj = g.core.use('projects');
  const body = el('div', 'projects');
  const a = pj.active;
  body.appendChild(el('p', 'npc', a
    ? `Kenji the carpenter: <i>“Hard at work on ${g.core.content.projects.get(a.id).name.toLowerCase()}. Come back in ${duration(pj.left())}.”</i>`
    : 'Kenji the carpenter: <i>“Bring me koku and materials and I’ll build it, even while you sleep.”</i>'));
  const list = el('div', 'list');
  for (const p of pj.list()) {
    const row = el('div', `row project ${p.status}`);
    row.dataset.project = p.id;
    const c = p.cost, cost = [];
    if (c.koku) cost.push(`<span class="cost${g.money < c.koku ? ' short' : ' full'}">${ui.iconHTML('icons:koku', 'icon tiny')}${c.koku}</span>`);
    for (const [id, n] of Object.entries(c.items || {})) cost.push(`<span class="cost${g.count(id) < n ? ' short' : ' full'}">${ui.iconHTML(ITEMS[id].icon, 'icon tiny')}${g.count(id)}/${n}</span>`);
    const sub = p.status === 'done' ? '<small>Built ✓</small>'
      : p.status === 'building' ? `<small>Ready in ${duration(pj.left())}</small><span class="bar"><i style="width:${(1 - pj.left() / p.buildMs) * 100}%"></i></span>`
      : p.status === 'locked' ? '<small>Finish the project before it first.</small>'
      : `<small class="needs">${cost.join('')}</small><small>${p.hint} Takes ${duration(p.buildMs)}.</small>`;
    row.innerHTML = `${ui.iconHTML(p.icon)}<span class="name">${p.name}${sub}</span>`;
    const right = el('span', 'right');
    if (p.status === 'open') {
      const b = el('button', 'btn big start', 'Build');
      b.disabled = !!pj.why(p.id);
      b.onclick = () => { if (pj.start(p.id)) ui.closeModal(); };
      right.appendChild(b);
    }
    row.appendChild(right);
    list.appendChild(row);
  }
  body.appendChild(list);
  return { title: 'Village projects', body };
}

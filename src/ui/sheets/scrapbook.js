// The scrapbook: every visitor, with how often it came and the photos taken; one not met yet shows as a shadow with its hint.
import { el } from '../dom.js';

export const live = true;

export function render(ui, core) {
  const vs = core.use('visitors');
  const all = [...core.content.visitors.all()];
  const body = el('div', 'scrapbook');
  body.appendChild(el('p', 'npc', `${all.filter(([id]) => vs.seen(id)).length} of ${all.length} visitors met. Tap a visitor to take its photo.`));
  const list = el('div', 'list');
  for (const [id, d] of all) {
    const n = vs.seen(id), ph = vs.photos(id);
    const row = el('div', 'row fish' + (n ? '' : ' unseen'));
    row.dataset.visitor = id;
    const stats = n ? `<small class="needs"><span class="cost full">${n} visit${n > 1 ? 's' : ''}</span>${ph ? `<span class="cost full">${ph} photo${ph > 1 ? 's' : ''}</span>` : '<span class="cost">no photo yet</span>'}</small>` : '';
    row.innerHTML = `${ui.iconHTML(d.icon)}<span class="name">${n ? d.name : '???'}${stats}<small>${d.hint}</small></span>`;
    list.appendChild(row);
  }
  body.appendChild(list);
  return { title: 'Scrapbook', body };
}

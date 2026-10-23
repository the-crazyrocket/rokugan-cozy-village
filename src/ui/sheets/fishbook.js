// The collection book: every fish and bug of the island, where and when it is about, how many have been caught and the biggest
// fish. One not caught yet shows as a shadow, with its hint.
import { el } from '../dom.js';
import { fishWhen } from '../../systems/fishing.js';

export const live = true;

export function render(ui) {
  const g = ui.game, core = g.core, fishing = core.use('fishing');
  const items = core.content.itemMap();
  const sections = [['Fish', [...core.content.fish.all()], fishWhen], ['Bugs', [...core.content.bugs.all()], (b) => b.when]];
  const total = sections.reduce((a, [, all]) => a + all.length, 0);
  const got = sections.reduce((a, [, all]) => a + all.filter(([id]) => fishing.caught[id]).length, 0);
  const body = el('div', 'fishbook');
  body.appendChild(el('p', 'npc', `${got} of ${total} caught.`));
  for (const [title, all, whenOf] of sections) {
    body.appendChild(el('h3', 'book-head', `${title} · ${all.filter(([id]) => fishing.caught[id]).length}/${all.length}`));
    const list = el('div', 'list');
    for (const [id, f] of all) {
      const n = fishing.caught[id] || 0, best = fishing.best[id];
      const where = core.cond.describe(whenOf(f));
      const row = el('div', 'row fish' + (n ? '' : ' unseen'));
      row.dataset.fish = id;
      const stats = n ? `<small class="needs"><span class="cost full">×${n}</span>${best ? `<span class="cost full">best ${best} cm</span>` : ''}${f.rare ? '<span class="cost">rare</span>' : ''}</small>` : '';
      row.innerHTML = `${ui.iconHTML(items.get(id).icon)}<span class="name">${n ? f.name : '???'}${stats}<small>${where[0].toUpperCase()}${where.slice(1)}.${f.hint && !n ? ` ${f.hint}.` : ''}</small></span>`;
      list.appendChild(row);
    }
    body.appendChild(list);
  }
  return { title: 'Collection', body };
}

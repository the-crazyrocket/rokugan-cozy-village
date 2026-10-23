// The kitchen: dishes you know (cook again in one tap), the ones still to discover (their hint), and the pot: put ingredients in
// from the bag and cook; exactly a dish's ingredients make it.
import { el } from '../dom.js';

export const live = true;
const INGREDIENT = new Set(['produce', 'fish', 'forage', 'craft']);

export function render(ui, core) {
  const k = core.use('kitchen'), items = core.content.itemMap();
  const pot = (ui.pot ||= {});
  const body = el('div', 'workbench kitchen');
  // the pot
  const inPot = Object.entries(pot).filter(([, n]) => n > 0);
  const potRow = el('div', 'row pot');
  potRow.innerHTML = `<span class="name">The pot<small class="needs">${inPot.length ? inPot.map(([id, n]) => `<span class="cost full">${ui.iconHTML(items.get(id).icon, 'icon tiny')}×${n}</span>`).join('') : '<span class="cost">empty: tap ingredients below</span>'}</small></span>`;
  const cook = el('button', 'btn make', 'Cook');
  cook.disabled = !inPot.length;
  cook.onclick = () => { const res = k.cook(pot); if (res) ui.pot = {}; ui.renderSheet(); };
  const empty = el('button', 'btn', 'Empty');
  empty.disabled = !inPot.length;
  empty.onclick = () => { ui.pot = {}; ui.renderSheet(); };
  potRow.append(empty, cook);
  body.appendChild(potRow);
  const grid = el('div', 'grid');
  for (const [id, n] of ui.game.inv) {
    const it = items.get(id);
    if (!it || !INGREDIENT.has(it.kind) || n - (pot[id] || 0) <= 0) continue;
    const c = el('div', 'bag-item clickable', `${ui.iconHTML(it.icon)}<span class="count">${n - (pot[id] || 0)}</span><span class="label">${it.name}</span>`);
    c.dataset.item = id;
    c.onclick = () => { if (Object.keys(pot).length >= 3 && !pot[id]) { ui.toast('Three ingredients at most.'); return; } pot[id] = (pot[id] || 0) + 1; ui.renderSheet(); };
    grid.appendChild(c);
  }
  body.appendChild(grid);
  // the recipes
  const list = el('div', 'list');
  for (const r of k.dishes()) {
    const it = items.get(r.id), can = Object.entries(r.inputs).every(([i, n]) => core.inv.count(i) >= n);
    const row = el('div', 'row recipe fish' + (r.known ? '' : ' unseen'));
    if (r.known) {
      const needs = Object.entries(r.inputs).map(([id, need]) => { const have = core.inv.count(id); return `<span class="cost${have < need ? ' short' : ' full'}">${ui.iconHTML(items.get(id).icon, 'icon tiny')}${have}/${need}</span>`; }).join('');
      row.innerHTML = `${ui.iconHTML(it.icon)}<span class="name">${it.name} · ${it.sell} koku<small class="needs">${needs}</small></span>`;
      const b = el('button', 'btn make', 'Cook');
      b.disabled = !can;
      b.onclick = () => k.cook({ ...r.inputs });
      row.appendChild(b);
    } else row.innerHTML = `${ui.iconHTML(it.icon)}<span class="name">???<small>${r.hint}</small></span>`;
    list.appendChild(row);
  }
  body.appendChild(list);
  return { title: 'Kitchen', body };
}

// The mill's sheet: what it is grinding and how long is left, or the batches it can start (one at a time).
import { el } from '../dom.js';

export const live = true;

export function render(ui, core, args = {}) {
  const k = core.use('kitchen'), pid = args.prop, items = core.content.itemMap();
  const body = el('div', 'workbench');
  const st = k.state(pid);
  if (st !== 'idle') {
    const r = core.content.recipes.get(k.job(pid).recipe), [out, n] = Object.entries(r.out)[0];
    const row = el('div', 'row recipe');
    row.innerHTML = `${ui.iconHTML(items.get(out).icon)}<span class="name">${r.name} ×${n}<small>${st === 'done' ? 'Ready!' : `${Math.ceil(k.left(pid) / 60e3)} min left`}</small></span>`;
    if (st === 'done') { const b = el('button', 'btn make', 'Collect'); b.onclick = () => k.collect(pid); row.appendChild(b); }
    body.appendChild(row);
    return { title: 'Stone mill', body };
  }
  body.appendChild(el('p', 'npc', 'Pour a harvest between the stones. It takes a few minutes, and keeps grinding while you are away.'));
  const list = el('div', 'list');
  for (const r of k.processes()) {
    const [out, n] = Object.entries(r.out)[0];
    const needs = Object.entries(r.inputs).map(([id, need]) => { const have = core.inv.count(id); return `<span class="cost${have < need ? ' short' : ' full'}">${ui.iconHTML(items.get(id).icon, 'icon tiny')}${have}/${need}</span>`; }).join('');
    const row = el('div', 'row recipe' + (k.canMill(r.id) ? '' : ' short'));
    row.innerHTML = `${ui.iconHTML(items.get(out).icon)}<span class="name">${r.name} ×${n} · ${Math.round(r.timeMs / 60e3)} min<small class="needs">${needs}</small><small>${r.hint || ''}</small></span>`;
    const b = el('button', 'btn make', 'Start');
    b.disabled = !k.canMill(r.id);
    b.onclick = () => k.startMill(pid, r.id);
    row.appendChild(b);
    list.appendChild(row);
  }
  body.appendChild(list);
  return { title: 'Stone mill', body };
}

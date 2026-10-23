import { ITEMS } from '../../game/data.js';
import { FORTUNES } from '../../game/shrine.js';
import { el } from '../dom.js';
import { unlockList } from './shrine.js';

export function render(ui, ctx, args) {
  const def = FORTUNES[args.fortune];
  const body = el('div', 'wake-card');
  body.appendChild(el('div', 'fortune big', `${ui.iconHTML(def.icon, 'icon huge')}<span><b>${def.name} is awake!</b><small>${def.title}</small></span>`));
  body.appendChild(el('p', 'lore', def.awake));
  body.appendChild(unlockList(ui, def));
  const gift = Object.entries(def.gift || {}).map(([it, n]) => `${n} ${ITEMS[it].name.toLowerCase()}`).join(', ');
  if (gift) body.appendChild(el('p', 'muted', `${def.name} left you a gift: ${gift}.`));
  const ok = el('button', 'btn big', 'Wonderful');
  ok.onclick = () => ui.closeModal();
  body.appendChild(ok);
  return { title: 'A Fortune wakes', body };
}

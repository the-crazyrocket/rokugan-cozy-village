// A villager's card: what they said, their hearts, what they like (once learnt by giving it), and the bag's giftable things.
import { el } from '../dom.js';

export const live = true;
const GIFTABLE = new Set(['produce', 'fish', 'forage', 'material', 'dish', 'craft']);

export function render(ui, core, args = {}) {
  const vs = core.use('villagers'), id = args.who, d = core.content.villagers.get(id);
  if (!d) return null;
  const items = core.content.itemMap();
  const body = el('div', 'villager');
  const hearts = vs.hearts(id), pts = vs.points(id) % 10;
  body.appendChild(el('p', 'npc', `“${args.reply || args.line || '…'}”`));
  const meter = el('div', 'hearts', `${'<b>♥</b>'.repeat(hearts)}${'<i>♡</i>'.repeat(Math.max(0, Math.min(10, (d.hearts?.at(-1)?.n || 4)) - hearts))}<small>${hearts < 10 ? ` ${pts}/10 to the next` : ''}</small>`);
  body.appendChild(meter);
  const next = (d.hearts || []).find((h) => h.n > hearts);
  if (next) body.appendChild(el('p', 'muted', `At ${'♥'.repeat(next.n)}: ${d.name} has something for you.`));
  if (vs.giftedToday(id)) { body.appendChild(el('p', 'muted', `You gave ${d.name} a present today. Come back tomorrow.`)); return { title: `${d.name} · ${d.title || ''}`, body }; }
  body.appendChild(el('p', 'muted', `Give ${d.name} something (one present a day):`));
  const grid = el('div', 'grid');
  for (const [item, n] of ui.game.inv) {
    const it = items.get(item);
    if (!it || !GIFTABLE.has(it.kind) || n <= 0) continue;
    const c = el('div', 'bag-item clickable', `${ui.iconHTML(it.icon)}<span class="count">${n}</span><span class="label">${it.name}</span>`);
    c.dataset.item = item;
    c.onclick = () => { const reply = vs.give(id, item); if (reply) ui.openModal('villager', undefined, { who: id, reply }); };
    grid.appendChild(c);
  }
  if (!grid.children.length) grid.appendChild(el('p', 'muted', 'Nothing to give yet: fish, crops, wild greens or materials.'));
  body.appendChild(grid);
  return { title: `${d.name} · ${d.title || ''}`, body };
}

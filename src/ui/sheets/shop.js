import { ITEMS } from '../../game/data.js';
import { DEMAND_BONUS, SPECIAL_DISCOUNT } from '../../game/daily.js';
import { el } from '../dom.js';

export const live = true;

export function render(ui) {
  const g = ui.game;
  const body = el('div', 'shop');
  const tabs = el('div', 'tabs');
  const baitOpen = g.shrine.isAwake('ebisu');
  for (const [k, label] of [['sell', 'Sell'], ['seeds', baitOpen ? 'Seeds & bait' : 'Seeds'], ['decor', 'Decor']]) {
    const b = el('button', 'tab' + (ui.shopTab === k ? ' on' : ''), label);
    b.dataset.tab = k;
    b.onclick = () => { ui.shopTab = k; ui.renderSheet(); };
    tabs.appendChild(b);
  }
  const dem = g.daily.state?.demand;
  body.appendChild(el('p', 'npc', ui.shopTab === 'seeds' && baitOpen
    ? 'Merchant Hana: <i>“Bait! Ever since the shrine bell rang, the fishermen can’t get enough of it.”</i>'
    : dem
    ? `Merchant Hana: <i>“Welcome, friend! I’m paying extra for ${ITEMS[dem].name.toLowerCase()} today.”</i>`
    : 'Merchant Hana: <i>“Welcome, friend! Fresh daikon and a good koi always find a buyer here.”</i>'));
  body.appendChild(tabs);
  const list = el('div', 'list');
  if (ui.shopTab === 'sell') {
    const sellables = [...g.inv.keys()].filter((id) => ITEMS[id]?.sell && ITEMS[id].kind !== 'prop' && g.count(id) > 0);
    const haul = g.haul();
    const all = el('button', 'btn big sell-all', haul.total ? `Sell all · +${haul.total} koku` : 'Sell all harvest & fish');
    all.disabled = !haul.total;
    // sold: on to the seeds, to restock
    all.onclick = () => { g.sellAll(); ui.shopTab = 'seeds'; ui.renderSheet(); };
    list.appendChild(all);
    if (!sellables.length) list.appendChild(el('p', 'muted', 'Nothing to sell yet — harvest crops or go fishing!'));
    for (const id of sellables) {
      const right = el('span', 'right');
      const hot = g.daily.state?.demand === id ? `<span class="tag">×${DEMAND_BONUS} today</span>` : '';
      right.innerHTML = `<span class="qty">×${g.count(id)}</span>${hot}<span class="price">${g.sellPrice(id)} koku</span>`;
      const b1 = el('button', 'btn', 'Sell 1'); b1.onclick = (e) => { e.stopPropagation(); g.sell(id, 1); };
      const ba = el('button', 'btn', 'All'); ba.onclick = (e) => { e.stopPropagation(); g.sell(id); };
      right.append(b1, ba);
      const r = ui.row(id, right);
      r.classList.add('tappable');
      r.onclick = () => g.sell(id, 1); // tap the row = sell one
      list.appendChild(r);
    }
  } else {
    const ids = Object.keys(ITEMS).filter((id) => (ui.shopTab === 'seeds' ? ['seed', 'sapling', 'bait'].includes(ITEMS[id].kind) : ITEMS[id].kind === 'prop')
      && (!ITEMS[id].unlock || g.shrine.isAwake(ITEMS[id].unlock)));
    // today's specials first
    if (ui.shopTab === 'decor') ids.sort((a, b) => (g.buyPrice(b) < ITEMS[b].buy) - (g.buyPrice(a) < ITEMS[a].buy));
    for (const id of ids) {
      const right = el('span', 'right');
      const price = g.buyPrice(id);
      const sale = price < ITEMS[id].buy ? `<span class="tag">−${Math.round((1 - SPECIAL_DISCOUNT) * 100)}%</span>` : '';
      right.innerHTML = `<span class="qty">own ${g.count(id)}</span>${sale}<span class="price">${price} koku</span>`;
      const b = el('button', 'btn', 'Buy');
      b.disabled = g.money < price;
      b.onclick = () => g.buy(id);
      right.appendChild(b);
      if (ui.shopTab === 'seeds' && ITEMS[id].kind !== 'sapling') {
        const b5 = el('button', 'btn five', '×5');
        b5.disabled = g.money < price * 5;
        b5.onclick = () => g.buy(id, 5);
        right.appendChild(b5);
      }
      list.appendChild(ui.row(id, right));
    }
  }
  body.appendChild(list);
  return { title: 'Hana’s Stall', body };
}

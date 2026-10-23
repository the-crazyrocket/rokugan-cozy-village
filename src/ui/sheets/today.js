import { ITEMS, RIPE, CROPS } from '../../game/data.js';
import { DEMAND_BONUS } from '../../game/daily.js';
import { dateText, partOfDay, hourOf, duration } from '../../game/clock.js';
import { FORTUNES } from '../../game/shrine.js';
import { LANDMARKS } from '../../content/base/landmarks.js';
import { el } from '../dom.js';

export const live = true;

/** Where the shrine story stands, with a button to walk there. */
function shrineSummary(ui) {
  const g = ui.game, sh = g.shrine, f = sh.current();
  const box = el('div', 'shrine-sum');
  box.appendChild(el('h3', null, 'The shrine'));
  if (f) {
    const def = FORTUNES[f], n = def.offerings.length, done = sh.doneCount(f);
    const row = el('div', 'row shrine-row');
    const note = sh.ready(f) ? 'Every offering is made: ring the bell!' : sh.offerable() ? 'You have something to offer' : 'Gather rice, fish, tea and flowers';
    row.innerHTML = `${ui.iconHTML(def.icon)}<span class="name">${def.name} sleeps · ${done}/${n} offerings<span class="bar"><i style="width:${(done / n) * 100}%"></i></span><small>${note}</small></span>`;
    const right = el('span', 'right');
    const go = el('button', 'btn go-shrine', 'Go');
    go.onclick = () => { ui.closeModal(); g.goAndAct({ x: LANDMARKS.shrine.x, z: LANDMARKS.shrine.z + 1 }); };
    right.appendChild(go);
    row.appendChild(right);
    box.appendChild(row);
  } else {
    const biting = g.fishPool(false, true).filter(([k]) => ITEMS[k].unlock).map(([k]) => ITEMS[k].name.toLowerCase());
    box.appendChild(el('p', 'muted', `Ebisu is awake. Biting off the pier right now: ${biting.join(', ')}. Daikoku’s stone hums beside the shrine…`));
  }
  return box;
}

export function render(ui, ctx, args) {
  const g = ui.game, d = g.daily, st = d.state, now = g.now();
  if (!st) return null;
  const body = el('div', 'today');
  body.appendChild(el('p', 'today-date', `${dateText(now)} · ${partOfDay(hourOf(now))}`));
  const a = args?.away ?? null;
  if (a) {
    const box = el('div', 'away');
    const lines = [];
    if (a.awayMs > 60_000) lines.push(`You were away for ${duration(a.awayMs)}.`);
    const ripe = Object.entries(a.ripe).map(([k, n]) => `${n} ${CROPS[k].name.toLowerCase()}`);
    if (ripe.length) lines.push(`Ready to harvest: ${ripe.join(', ')}.`);
    else if (a.grew) lines.push('Your crops grew while you were away.');
    if (a.newDay) lines.push('A new day: Hana has fresh requests.');
    if (a.forage) lines.push(`Wild greens have sprung up around the island (${a.forage}).`);
    box.innerHTML = `<b>Welcome back!</b>${lines.map((l) => `<span>${l}</span>`).join('')}`;
    body.appendChild(box);
  }

  body.appendChild(el('h3', null, 'Hana’s requests'));
  const list = el('div', 'list requests');
  st.requests.forEach((r, i) => {
    const { text, icon } = d.describe(r);
    const prog = d.progress(r);
    const reward = `${r.reward} koku${r.bonus ? ` + ${r.bonus.n > 1 ? `${r.bonus.n} ` : ''}${ITEMS[r.bonus.item].name.toLowerCase()}` : ''}`;
    const row = el('div', 'row req' + (r.claimed ? ' done' : ''));
    row.dataset.req = String(i);
    row.innerHTML = `${ui.iconHTML(icon)}<span class="name">${text}<span class="bar"><i style="width:${(prog / r.n) * 100}%"></i></span><small>${reward}</small></span>`;
    const right = el('span', 'right');
    if (r.claimed) right.appendChild(el('span', 'done-mark', '✓ Done'));
    else if (d.ready(r)) {
      const b = el('button', 'btn big claim', r.kind === 'deliver' ? 'Give' : 'Claim');
      b.onclick = () => g.claimRequest(i);
      right.appendChild(b);
    } else right.appendChild(el('span', 'prog', `${prog}/${r.n}`));
    row.appendChild(right);
    list.appendChild(row);
  });
  body.appendChild(list);
  body.appendChild(el('p', 'muted', st.gift
    ? `Hana’s thank-you gift today: ${ITEMS[st.gift].name.toLowerCase()} ♪`
    : 'Finish all three for a thank-you gift. New requests arrive every morning at 5.'));

  body.appendChild(shrineSummary(ui));

  body.appendChild(el('h3', null, 'At the stall today'));
  const market = el('div', 'market');
  market.innerHTML = `<span>${ui.iconHTML(ITEMS[st.demand].icon, 'icon small')} Hana pays ×${DEMAND_BONUS} for <b>${ITEMS[st.demand].name.toLowerCase()}</b></span>`
    + st.specials.map((id) => `<span>${ui.iconHTML(ITEMS[id].icon, 'icon small')} <b>${ITEMS[id].name}</b> on special: ${g.buyPrice(id)} koku</span>`).join('');
  body.appendChild(market);

  body.appendChild(el('h3', null, 'Around the village'));
  const crops = [...g.farm.values()];
  const ready = crops.filter((c) => g.stage(c) >= RIPE).length;
  const thirsty = crops.filter((c) => g.stage(c) < RIPE && !c.wet).length;
  const next = crops.filter((c) => g.stage(c) < RIPE).sort((p, q) => g.timeToRipe(p) - g.timeToRipe(q))[0];
  const facts = [];
  facts.push(ready ? `<b>${ready}</b> ${ready === 1 ? 'crop is' : 'crops are'} ready to harvest` : 'Nothing is ripe yet');
  if (thirsty) facts.push(`<b>${thirsty}</b> ${thirsty === 1 ? 'plant would' : 'plants would'} love some water`);
  if (next) facts.push(`Next up: ${CROPS[next.type].name.toLowerCase()} in ${duration(g.timeToRipe(next))}`);
  const left = d.forageLeft();
  facts.push(left ? `<b>${left}</b> wild ${left === 1 ? 'green' : 'greens'} still to find (look for the glints)` : 'You found all of today’s wild greens');
  body.appendChild(el('ul', 'facts', facts.map((f) => `<li>${f}</li>`).join('')));
  return { title: 'Today', body };
}

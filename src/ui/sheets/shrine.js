import { ITEMS } from '../../game/data.js';
import { FORTUNES, FORTUNE_ORDER } from '../../game/shrine.js';
import { el } from '../dom.js';

export const live = true;

export function unlockList(ui, def) {
  return el('ul', 'unlocks', def.unlocks.map(([icon, text]) => `<li>${ui.iconHTML(icon, 'icon small')}<span>${text}</span></li>`).join(''));
}

export function render(ui) {
  const g = ui.game, sh = g.shrine, f = sh.current() || FORTUNE_ORDER[FORTUNE_ORDER.length - 1];
  const def = FORTUNES[f], awake = sh.isAwake(f);
  const body = el('div', 'shrine');
  body.appendChild(el('div', 'fortune', `${ui.iconHTML(def.icon, 'icon big')}<span><b>${def.name}</b><small>${def.title}</small></span>`));
  body.appendChild(el('p', 'lore', awake ? def.awake : def.sleeping));
  if (!awake) {
    body.appendChild(el('h3', null, `Offerings · ${sh.doneCount(f)}/${def.offerings.length}`));
    const list = el('div', 'list offerings');
    for (const o of def.offerings) {
      const done = sh.done(f, o);
      const row = el('div', 'row offering' + (done ? ' done' : ''));
      row.dataset.offering = o.id;
      const chips = Object.keys(o.items).map((it) => {
        const have = sh.givenOf(f, o, it), need = o.items[it], extra = done ? '' : sh.canGive(f, o, it);
        return `<span class="need${have >= need ? ' full' : ''}">${ui.iconHTML(ITEMS[it].icon, 'icon small')}${have}/${need}${extra ? `<em>+${extra}</em>` : ''}</span>`;
      }).join('');
      row.innerHTML = `<span class="name">${o.name}<span class="needs">${chips}</span></span>`;
      const right = el('span', 'right');
      if (done) right.appendChild(el('span', 'done-mark', '✓ Offered'));
      else {
        const b = el('button', 'btn offer', 'Offer');
        b.disabled = !sh.canOffer(f, o);
        b.onclick = () => g.offer(o.id, f);
        right.appendChild(b);
      }
      row.appendChild(right);
      list.appendChild(row);
    }
    body.appendChild(list);
    if (sh.ready(f)) {
      const ring = el('button', 'btn big wake', `${ui.iconHTML('icons2:bell', 'icon small')} Ring the bell`);
      ring.onclick = () => g.wakeFortune(f);
      body.appendChild(ring);
    } else body.appendChild(el('p', 'muted', 'Offerings can be made a little at a time; whatever you give stays given. A green +n means you have some with you.'));
  } else {
    body.appendChild(unlockList(ui, def));
    body.appendChild(el('p', 'muted', 'Beside the shrine, a mossy stone hums softly. Another Fortune sleeps there… (a later chapter)'));
  }
  return { title: awake ? `${def.name}’s Shrine` : 'The Quiet Shrine', body };
}

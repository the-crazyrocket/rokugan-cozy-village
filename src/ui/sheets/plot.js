// A new plot: the square of sea the basket was tapped on, in the size picked (outlined on the water while this is open), what it
// costs, how long the village takes, and the button that sets them to work. With a plot already being filled, how far along it is.
import { ITEMS } from '../../game/data.js';
import { duration } from '../../game/clock.js';
import { SIZES, plotMs } from '../../systems/reclaim.js';
import { el } from '../dom.js';

export const live = true;

export function render(ui, ctx, args = {}) {
  const g = ui.game, r = g.core.use('reclaim');
  const body = el('div', 'plot');
  const a = r.active;
  if (a) {
    body.appendChild(el('p', 'npc', `Kenji’s crew: <i>“One plot at a time! This one is ${a.tiles.length} tiles; it’ll be land in ${duration(r.left())}.”</i>`));
    const bar = el('div', 'progress');
    bar.innerHTML = `<span class="bar"><i style="width:${(1 - r.left() / a.ms) * 100}%"></i></span>`;
    body.appendChild(bar);
    return { title: 'New land', body };
  }
  body.appendChild(el('p', 'npc', 'Kenji’s crew: <i>“Stone for the edge, wood for the piles, and we’ll fill it with earth. Pick a size.”</i>'));
  const tabs = el('div', 'tabs sizes');
  for (const n of SIZES) {
    const p = r.plotAt(args.x, args.z, n);
    const b = el('button', 'tab' + (r.size === n ? ' on' : ''), `${n}×${n}`);
    b.dataset.size = n;
    b.disabled = !p;
    b.onclick = () => { r.size = n; ui.renderSheet(); };
    tabs.appendChild(b);
  }
  body.appendChild(tabs);
  const plot = r.plotAt(args.x, args.z);
  if (!plot) { body.appendChild(el('p', 'hint', 'There is no room for a plot that size here.')); return { title: 'A new plot', body }; }
  const c = r.cost(plot.tiles.length), cost = [];
  cost.push(`<span class="cost${g.money < c.koku ? ' short' : ' full'}">${ui.iconHTML('icons:koku', 'icon tiny')}${c.koku}</span>`);
  for (const id of ['stone', 'wood']) cost.push(`<span class="cost${g.count(id) < c[id] ? ' short' : ' full'}">${ui.iconHTML(ITEMS[id].icon, 'icon tiny')}${g.count(id)}/${c[id]}</span>`);
  const row = el('div', 'row project');
  row.innerHTML = `${ui.iconHTML('icons3:earth')}<span class="name">${plot.tiles.length} tiles of new land<small class="needs">${cost.join('')}</small><small>Ready in ${duration(plotMs(plot.tiles.length))}, finished even while you are away. Sand at first, grass by the next day.</small></span>`;
  body.appendChild(row);
  const why = r.why(plot);
  if (why) body.appendChild(el('p', 'hint', why));
  const go = el('button', 'btn big go start', 'Fill it in');
  go.disabled = !!why;
  go.onclick = () => { if (r.start(plot)) ui.closeModal(); };
  body.appendChild(go);
  return { title: 'A new plot', body };
}

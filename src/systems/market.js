// The shop: Hana's buying and selling prices, selling and buying, the daily demand and specials, and where she stands.
// Selling and buying are `sell` / `buy` events (the stats system counts the koku); the day's pick is the market contributor of the daily roll.
import { defineSystem } from '../core/system.js';

export const DEMAND_BONUS = 1.5;
export const SPECIAL_DISCOUNT = 0.7;
export const SELLABLE_KINDS = new Set(['produce', 'fish', 'forage', 'dish', 'bug']);
const DEMAND_KINDS = new Set(['produce', 'fish', 'forage']); // what Hana may pay extra for (the daily roll's base draw) // things Hana buys (and the "sell all" button sells)

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'market';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };
const field = (name) => ({ get() { return this.core.use(NAME)[name]; }, set(v) { this.core.use(NAME)[name] = v; } });

export default defineSystem({
  name: NAME,
  needs: ['daily', 'shrine', 'props'],
  facade: {
    merchantCell: field('cell'),
    isMerchant: call('isMerchant'),
    sellPrice: call('sellPrice'),
    buyPrice: call('buyPrice'),
    sell: call('sell'),
    sellAll: call('sellAll'),
    buy: call('buy'),
  },
  api(ctx) {
    const s = Object.assign(ctx.state, { cell: null }); // the tile Hana stands on, set when the stall is placed
    const items = () => ctx.content.itemMap();
    const day = () => ctx.use('daily').state;
    const refresh = () => ctx.invalidate('ui');

    const api = {
      get cell() { return s.cell; },
      set cell(v) { s.cell = v; },
      isMerchant: (x, z) => !!s.cell && s.cell.x === x && s.cell.z === z,

      sellPrice: (id) => Math.round(items().get(id).sell * (day()?.demand === id ? DEMAND_BONUS : 1)),
      buyPrice: (id) => { const it = items().get(id); return day()?.specials.includes(id) ? Math.round(it.buy * SPECIAL_DISCOUNT) : it.buy; },

      sell(id, n = ctx.inv.count(id)) {
        const it = items().get(id);
        if (!it.sell || n <= 0) return;
        const total = api.sellPrice(id) * n;
        ctx.inv.take(id, n, { reason: 'sell' });
        refresh();
        ctx.money.add(total, 'sell');
        ctx.bus.emit('sell', { item: id, n, total });
        ctx.sfx('coin');
        ctx.say(`Sold ${n} ${it.name.toLowerCase()} for ${total} koku.`, 'icons:koku');
      },

      sellAll() {
        const all = items(), sold = [];
        let total = 0;
        for (const [id, n] of [...ctx.inv.map]) {
          const it = all.get(id);
          if (it && SELLABLE_KINDS.has(it.kind)) {
            const t = api.sellPrice(id) * n;
            total += t;
            ctx.inv.take(id, n, { reason: 'sell' });
            refresh();
            sold.push({ item: id, n, total: t });
          }
        }
        ctx.money.add(total, 'sell');
        for (const e of sold) ctx.bus.emit('sell', e);
        if (total) ctx.sfx('coin');
        ctx.say(total ? `Sold the harvest for ${total} koku!` : 'Nothing to sell yet.', 'icons:koku');
      },

      buy(id) {
        const it = items().get(id), price = api.buyPrice(id);
        if (!ctx.money.spend(price, 'buy')) { ctx.say('Not enough koku.'); return; }
        ctx.inv.give(id, 1, { reason: 'buy' });
        refresh();
        ctx.bus.emit('buy', { item: id, n: 1, total: price });
        ctx.sfx('coin');
        ctx.say(`Bought ${it.name.toLowerCase()}.`, it.icon);
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    ctx.resolvers.add({
      id: 'shop', priority: 100,
      fn(t) {
        const p = ctx.use('props').at(t.x, t.z);
        return ctx.state.api.isMerchant(t.x, t.z) || (p && p.type === 'stall') ? { kind: 'shop', t, icon: 'icons:koku', label: 'Shop' } : null;
      },
    });
    ctx.actions.add('shop', { queueable: true, button: true, perform: () => ctx.bus.emit('openSheet', { name: 'shop' }) });
    // the day's demand (one sellable) and specials (two decorations); draws from the day's stream in this order
    ctx.daily.contribute({
      id: 'market', order: 20, base: true,
      roll(rnd, c, { pick, shuffle }) {
        const shrine = ctx.use('shrine');
        const all = [...ctx.content.itemMap()];
        const open = (it) => !it.unlock || shrine.isAwake(it.unlock);
        const sellables = all.filter(([, it]) => DEMAND_KINDS.has(it.kind) && open(it)).map(([id]) => id);
        const decor = all.filter(([, it]) => it.kind === 'prop' && open(it)).map(([id]) => id);
        return { demand: pick(sellables), specials: shuffle(decor).slice(0, 2) };
      },
    });
  },
});

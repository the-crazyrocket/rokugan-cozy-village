// Daily rhythm. Each village day (seeded by the date) brings three small requests from Hana, one thing she pays extra for,
// two decorations on special and wild greens to find around the island. Unfinished requests are simply replaced by fresh ones.
// The behaviour lives in systems/{daily,requests,market,forage}.js; `game.daily` is the one object the UI and the tests have always used.
export { DEMAND_BONUS, SPECIAL_DISCOUNT } from '../systems/market.js';

/** The old Daily surface over the four systems' apis. */
export function dailyView(core) {
  const d = core.use('daily'), r = core.use('requests'), m = core.use('market'), f = core.use('forage');
  return {
    get state() { return d.state; },
    set state(v) { d.state = v; },
    get key() { return d.key; },
    load: (s) => d.load(s),
    serialize: () => d.serialize(),
    ensure: (now) => d.ensure(now),
    poll: () => d.poll(),
    roll: (key) => d.roll(key),

    progress: (q) => r.progress(q),
    ready: (q) => r.ready(q),
    claimable: () => r.claimable(),
    describe: (q) => r.describe(q),
    note: (kind, id, n) => r.note(kind, id, n),

    sellPrice: (id) => m.sellPrice(id),
    buyPrice: (id) => m.buyPrice(id),

    forageAt: (x, z) => f.at(x, z),
    visibleForage: () => f.visible(),
    forageLeft: () => f.left(),
  };
}

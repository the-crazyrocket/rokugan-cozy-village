// Lifetime counters (the v3 `stats` save): what was harvested and foraged, requests handed in, koku earned. They count events, so
// nothing else has to call bump(). `caught` is counted by the fishing system, which shares its table (Game points stats.caught at it).
import { defineSystem } from '../core/system.js';
import { PRIO } from '../core/bus.js';

const fresh = () => ({ harvested: {}, caught: {}, foraged: {}, requests: 0, earned: 0 });

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'stats';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };

export default defineSystem({
  name: NAME,
  needs: [],
  facade: {
    stats: { get() { return this.core.use(NAME).data; }, set(v) { this.core.use(NAME).data = v; } },
    bump: call('bump'),
  },
  api(ctx) {
    const s = Object.assign(ctx.state, { data: fresh() });
    const api = {
      get data() { return s.data; },
      set data(v) { s.data = v; },
      bump(table, id, n = 1) { s.data[table][id] = (s.data[table][id] || 0) + n; },
      get: (table, id) => s.data[table][id] || 0,
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const api = ctx.state.api, opts = { priority: PRIO.STATE };
    ctx.bus.on('harvest', (p) => api.bump('harvested', p.crop, p.n), opts);
    ctx.bus.on('forage', (p) => api.bump('foraged', p.item, p.n), opts);
    ctx.bus.on('sell', (p) => { ctx.state.data.earned += p.total; }, opts);
    ctx.bus.on('requestClaimed', (p) => { ctx.state.data.requests++; ctx.state.data.earned += p.reward; }, opts);
  },
});

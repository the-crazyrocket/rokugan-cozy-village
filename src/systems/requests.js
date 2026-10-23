// Hana's daily requests: making them (the requests contributor of the daily roll), counting progress from what happens
// (harvest, catch and forage events), describing them and handing them in. Handing one in emits `requestClaimed`.
// The requests themselves live in the day's state (systems/daily.js); this system owns the rules.
import { defineSystem } from '../core/system.js';
import { PRIO } from '../core/bus.js';
import { hashString } from '../core/rng.js';

const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

// what a `catch` request asks for: label, icon, which fish count, koku per fish
const waterOf = (d) => d.water ?? d.when?.water; // the Wave 2 fish keep theirs in `when` (stream and pond are fresh water too)
const FISH_TARGETS = (fish) => ({
  any: { label: (n) => (n > 1 ? `${n} fish` : 'a fish'), icon: 'icons:rod', match: () => true, value: 55 },
  fresh: { label: (n) => `${n} river or pond fish`, icon: 'icons:ayu', match: (f) => waterOf(fish.get(f)) !== 'sea', value: 45 },
  sea: { label: (n) => `${n} sea fish`, icon: 'icons:tai', match: (f) => waterOf(fish.get(f)) === 'sea', value: 90 },
  koi: { label: () => 'a koi', icon: 'icons:koi', match: (f) => f === 'koi', value: 65 },
  tai: { label: () => 'a tai', icon: 'icons:tai', match: (f) => f === 'tai', value: 75 },
});
const BONUSES = [
  { item: 'seed_tea', n: 2 }, { item: 'seed_rice', n: 3 }, { item: 'seed_daikon', n: 4 },
  { item: 'prop_pot', n: 1 }, { item: 'prop_crate', n: 1 }, { item: 'prop_fence', n: 3 }, { item: 'prop_toro', n: 1 },
];
const GIFTS = ['prop_toro', 'prop_sakura', 'prop_pine', 'prop_bamboo', 'prop_well'];

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'requests';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };

export default defineSystem({
  name: NAME,
  needs: ['daily'],
  facade: {
    requestsDone: call('announce'),
    claimRequest: call('claim'),
  },
  api(ctx) {
    const items = () => ctx.content.itemMap();
    const targets = () => FISH_TARGETS(ctx.content.fish);
    const day = () => ctx.use('daily').state;
    const give = (id, n = 1) => { ctx.inv.give(id, n, { reason: 'request' }); ctx.invalidate('ui'); };

    const api = {
      makeRequest(kind, rnd, { int, pick }) {
        const all = items(), r = { kind, have: 0, claimed: false };
        if (kind === 'harvest') {
          r.item = pick(['daikon', 'daikon', 'rice', 'rice', 'tea']);
          r.n = { daikon: 4 + int(5), rice: 4 + int(4), tea: 3 + int(3) }[r.item];
          r.value = r.n * all.get(r.item).sell;
        } else if (kind === 'catch') {
          r.item = pick(['any', 'any', 'fresh', 'sea', 'koi', 'tai']);
          r.n = ['koi', 'tai'].includes(r.item) ? 1 : 2 + int(2);
          r.value = r.n * targets()[r.item].value;
        } else if (kind === 'deliver') {
          r.item = pick(['rice', 'daikon', 'tea', 'ayu', 'koi', 'tai', 'wildflower', 'warabi']);
          r.n = all.get(r.item).kind === 'fish' ? 1 + int(2) : 2 + int(3);
          r.value = r.n * all.get(r.item).sell;
        } else {
          r.item = 'forage';
          r.n = 2 + int(3);
          r.value = r.n * 18;
        }
        r.reward = round5(r.value * 1.6 + 10);
        if (rnd() < 0.45) r.bonus = pick(BONUSES);
        return r;
      },

      progress: (r) => (r.kind === 'deliver' ? Math.min(r.n, ctx.inv.count(r.item)) : Math.min(r.n, r.have)),
      ready: (r) => !r.claimed && api.progress(r) >= r.n,
      claimable: () => (day()?.requests || []).filter((r) => api.ready(r)).length,

      describe(r) {
        const all = items();
        const name = (id, n) => (n > 1 || all.get(id).kind === 'produce' ? all.get(id).name.toLowerCase() : `a ${all.get(id).name.toLowerCase()}`);
        if (r.kind === 'harvest') return { text: `Harvest ${r.n} ${all.get(r.item).name.toLowerCase()}`, icon: all.get(r.item).icon };
        if (r.kind === 'catch') return { text: `Catch ${targets()[r.item].label(r.n)}`, icon: targets()[r.item].icon };
        if (r.kind === 'deliver') return { text: `Bring Hana ${r.n > 1 ? `${r.n} ` : ''}${name(r.item, r.n)}`, icon: all.get(r.item).icon };
        return { text: `Find ${r.n} wild greens`, icon: 'vegetation:fern' };
      },

      /** Progress from gameplay. Returns the requests that just became ready. */
      note(kind, id, n = 1) {
        const done = [], t = targets();
        for (const r of day()?.requests || []) {
          if (r.claimed || r.kind === 'deliver' || r.have >= r.n) continue;
          const hit = (kind === 'harvest' && r.kind === 'harvest' && r.item === id)
            || (kind === 'catch' && r.kind === 'catch' && t[r.item].match(id))
            || (kind === 'forage' && r.kind === 'forage');
          if (!hit) continue;
          r.have = Math.min(r.n, r.have + n);
          if (r.have >= r.n) done.push(r);
        }
        return done;
      },

      /** Tell the player that these requests were just completed. */
      announce(done) {
        if (!done.length) return;
        ctx.say(done.length > 1 ? 'Requests ready to hand in!' : `Request ready: ${api.describe(done[0]).text}`, 'icons:koku');
        ctx.sfx('ready');
        ctx.invalidate('ui');
      },

      /** Hand in request i. Returns { reward, bonus, gift } or null. */
      claim(i) {
        const st = day(), r = st?.requests[i];
        if (!r || !api.ready(r)) return null;
        if (r.kind === 'deliver') {
          if (!ctx.inv.take(r.item, r.n, { reason: 'request' })) return null;
          ctx.invalidate('ui');
        }
        r.claimed = true;
        ctx.money.add(r.reward, 'request');
        if (r.bonus) give(r.bonus.item, r.bonus.n);
        let gift = null;
        if (!st.gift && st.requests.every((q) => q.claimed)) {
          gift = GIFTS[hashString(st.key + 'gift') % GIFTS.length];
          st.gift = gift;
          give(gift);
        }
        const all = items();
        ctx.sfx(gift ? 'fanfare' : 'claim');
        ctx.bus.emit('haptic', { ms: 25 });
        const bonus = r.bonus ? ` + ${r.bonus.n > 1 ? `${r.bonus.n} ` : ''}${all.get(r.bonus.item).name.toLowerCase()}` : '';
        ctx.say(`Hana thanks you: ${r.reward} koku${bonus}!`, 'icons:koku');
        if (gift) ctx.say(`All done for today! Hana gives you a ${all.get(gift).name.toLowerCase()}.`, all.get(gift).icon);
        ctx.bus.emit('requestClaimed', { index: i, kind: r.kind, reward: r.reward, gift });
        ctx.invalidate('ui');
        return { reward: r.reward, bonus: r.bonus, gift };
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const api = ctx.state.api;
    ctx.daily.contribute({
      id: 'requests', order: 10, base: true,
      roll(rnd, c, draw) {
        const kinds = draw.shuffle(['harvest', 'catch', 'deliver', 'forage']).slice(0, 3);
        return { requests: kinds.map((k) => api.makeRequest(k, rnd, draw)) };
      },
    });
    const opts = { priority: PRIO.STATE };
    ctx.bus.on('harvest', (p) => api.announce(api.note('harvest', p.crop, p.n)), opts);
    ctx.bus.on('catch', (p) => { if (p.kind === 'fish') api.announce(api.note('catch', p.id)); }, opts);
    ctx.bus.on('forage', (p) => api.announce(api.note('forage', p.item, p.n)), opts);
  },
});

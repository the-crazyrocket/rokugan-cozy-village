// Daily rhythm. Each village day (seeded by the date) brings three small
// requests from Hana, one thing she pays extra for, two decorations on special
// and wild greens to find around the island. Nothing is lost when a day ends:
// unfinished requests are simply replaced by fresh ones.
import { mulberry32, W, H, T } from './world.js';
import { ITEMS, FISH, FORAGE, PROPS, SELLABLE_KINDS } from './data.js';
import { dayKey, hashString } from './clock.js';

export const DEMAND_BONUS = 1.5;
export const SPECIAL_DISCOUNT = 0.7;
const FORAGE_PER_DAY = 6;
const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

const FISH_TARGETS = {
  any: { label: (n) => (n > 1 ? `${n} fish` : 'a fish'), icon: 'icons:rod', match: () => true, value: 55 },
  fresh: { label: (n) => `${n} river or pond fish`, icon: 'icons:ayu', match: (f) => FISH[f].water === 'fresh', value: 45 },
  sea: { label: (n) => `${n} sea fish`, icon: 'icons:tai', match: (f) => FISH[f].water === 'sea', value: 90 },
  koi: { label: () => 'a koi', icon: 'icons:koi', match: (f) => f === 'koi', value: 65 },
  tai: { label: () => 'a tai', icon: 'icons:tai', match: (f) => f === 'tai', value: 75 },
};
const BONUSES = [
  { item: 'seed_tea', n: 2 }, { item: 'seed_rice', n: 3 }, { item: 'seed_daikon', n: 4 },
  { item: 'prop_pot', n: 1 }, { item: 'prop_crate', n: 1 }, { item: 'prop_fence', n: 3 }, { item: 'prop_toro', n: 1 },
];
const GIFTS = ['prop_toro', 'prop_sakura', 'prop_pine', 'prop_bamboo', 'prop_well'];

export class Daily {
  constructor(game) {
    this.game = game;
    this.state = null;
  }

  load(s) { this.state = s && s.key && Array.isArray(s.requests) ? s : null; }
  serialize() { return this.state; }
  get key() { return this.state?.key; }

  /** Roll a new day when the date has changed. Returns true on a new day. */
  ensure(now = this.game.now()) {
    const key = dayKey(now);
    if (this.state?.key === key) return false;
    this.state = this.roll(key);
    return true;
  }

  roll(key) {
    const rnd = mulberry32(hashString(key));
    const int = (n) => Math.floor(rnd() * n);
    const pick = (a) => a[int(a.length)];
    const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const kinds = shuffle(['harvest', 'catch', 'deliver', 'forage']).slice(0, 3);
    const requests = kinds.map((k) => this.makeRequest(k, rnd, int, pick));
    const sellables = Object.keys(ITEMS).filter((id) => SELLABLE_KINDS.has(ITEMS[id].kind));
    const decor = Object.keys(ITEMS).filter((id) => ITEMS[id].kind === 'prop');
    return {
      key, requests, demand: pick(sellables), specials: shuffle(decor).slice(0, 2),
      forage: this.spawnForage(rnd), seen: false, gift: null,
    };
  }

  makeRequest(kind, rnd, int, pick) {
    const r = { kind, have: 0, claimed: false };
    if (kind === 'harvest') {
      r.item = pick(['daikon', 'daikon', 'rice', 'rice', 'tea']);
      r.n = { daikon: 4 + int(5), rice: 4 + int(4), tea: 3 + int(3) }[r.item];
      r.value = r.n * ITEMS[r.item].sell;
    } else if (kind === 'catch') {
      r.item = pick(['any', 'any', 'fresh', 'sea', 'koi', 'tai']);
      r.n = ['koi', 'tai'].includes(r.item) ? 1 : 2 + int(2);
      r.value = r.n * FISH_TARGETS[r.item].value;
    } else if (kind === 'deliver') {
      r.item = pick(['rice', 'daikon', 'tea', 'ayu', 'koi', 'tai', 'wildflower', 'warabi']);
      r.n = ITEMS[r.item].kind === 'fish' ? 1 + int(2) : 2 + int(3);
      r.value = r.n * ITEMS[r.item].sell;
    } else {
      r.item = 'forage';
      r.n = 2 + int(3);
      r.value = r.n * 18;
    }
    r.reward = round5(r.value * 1.6 + 10);
    if (rnd() < 0.45) r.bonus = pick(BONUSES);
    return r;
  }

  /** Wildflowers on open grass, warabi near trees and bamboo. */
  spawnForage(rnd) {
    const g = this.game, out = [];
    const open = [], shady = [];
    const nearTree = (x, z) => {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const p = g.props.at(x + dx, z + dz);
        if (p && (PROPS[p.type].canopy || PROPS[p.type].sprite)) return true;
      }
      return false;
    };
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      if (!this.canGrow(x, z)) continue;
      (nearTree(x, z) ? shady : open).push({ x, z });
    }
    const take = (list) => { if (!list.length) return null; const i = Math.floor(rnd() * list.length); return list.splice(i, 1)[0]; };
    for (let k = 0; k < FORAGE_PER_DAY; k++) {
      const item = k % 2 ? 'warabi' : 'wildflower';
      const t = FORAGE[item].where === 'trees' ? take(shady) || take(open) : take(open) || take(shady);
      if (!t) break;
      // keep them apart so they read as separate finds
      for (const list of [open, shady]) for (let i = list.length - 1; i >= 0; i--) if (Math.max(Math.abs(list[i].x - t.x), Math.abs(list[i].z - t.z)) < 3) list.splice(i, 1);
      out.push({ ...t, item, taken: false });
    }
    return out;
  }

  canGrow(x, z) {
    const g = this.game;
    return g.world.get(x, z) === T.GRASS && !g.props.at(x, z) && !g.crop(x, z) && !g.isMerchant(x, z)
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => g.walkable(x + dx, z + dz));
  }

  /** Forage still waiting at (x,z) (hidden if something was built or dug there). */
  forageAt(x, z) {
    const f = this.state?.forage.find((f) => !f.taken && f.x === x && f.z === z);
    return f && this.game.world.get(x, z) === T.GRASS && !this.game.props.at(x, z) ? f : null;
  }
  visibleForage() { return (this.state?.forage || []).filter((f) => this.forageAt(f.x, f.z)); }
  forageLeft() { return this.visibleForage().length; }

  // ------------------------------------------------------------------ requests
  progress(r) { return r.kind === 'deliver' ? Math.min(r.n, this.game.count(r.item)) : Math.min(r.n, r.have); }
  ready(r) { return !r.claimed && this.progress(r) >= r.n; }
  claimable() { return (this.state?.requests || []).filter((r) => this.ready(r)).length; }

  describe(r) {
    const name = (id, n) => (n > 1 || ITEMS[id].kind === 'produce' ? ITEMS[id].name.toLowerCase() : `a ${ITEMS[id].name.toLowerCase()}`);
    if (r.kind === 'harvest') return { text: `Harvest ${r.n} ${ITEMS[r.item].name.toLowerCase()}`, icon: ITEMS[r.item].icon };
    if (r.kind === 'catch') return { text: `Catch ${FISH_TARGETS[r.item].label(r.n)}`, icon: FISH_TARGETS[r.item].icon };
    if (r.kind === 'deliver') return { text: `Bring Hana ${r.n > 1 ? `${r.n} ` : ''}${name(r.item, r.n)}`, icon: ITEMS[r.item].icon };
    return { text: `Find ${r.n} wild greens`, icon: 'vegetation:fern' };
  }

  /** Progress from gameplay events. Returns the requests that just became ready. */
  note(kind, id, n = 1) {
    const done = [];
    for (const r of this.state?.requests || []) {
      if (r.claimed || r.kind === 'deliver' || r.have >= r.n) continue;
      const hit = (kind === 'harvest' && r.kind === 'harvest' && r.item === id)
        || (kind === 'catch' && r.kind === 'catch' && FISH_TARGETS[r.item].match(id))
        || (kind === 'forage' && r.kind === 'forage');
      if (!hit) continue;
      r.have = Math.min(r.n, r.have + n);
      if (r.have >= r.n) done.push(r);
    }
    return done;
  }

  /** Hand in request i. Returns { reward, bonus, gift } or null. */
  claim(i) {
    const g = this.game, r = this.state?.requests[i];
    if (!r || !this.ready(r)) return null;
    if (r.kind === 'deliver' && !g.take(r.item, r.n)) return null;
    r.claimed = true;
    g.money += r.reward;
    if (r.bonus) g.give(r.bonus.item, r.bonus.n);
    let gift = null;
    if (!this.state.gift && this.state.requests.every((q) => q.claimed)) {
      gift = GIFTS[hashString(this.state.key + 'gift') % GIFTS.length];
      this.state.gift = gift;
      g.give(gift);
    }
    return { reward: r.reward, bonus: r.bonus, gift };
  }

  // ------------------------------------------------------------------ shop
  sellPrice(id) { return Math.round(ITEMS[id].sell * (this.state?.demand === id ? DEMAND_BONUS : 1)); }
  buyPrice(id) { return this.state?.specials.includes(id) ? Math.round(ITEMS[id].buy * SPECIAL_DISCOUNT) : ITEMS[id].buy; }
}

// Game data: frozen views of the content registries (base content, then packs) plus the few constants that are not content yet.
import { content } from '../content/index.js';
import { deriveItems } from '../core/content-check.js';

// materials are registered for later work packages and are not part of the shipped item list yet
const items = (() => {
  const { map, from } = deriveItems(content);
  return Object.freeze(Object.fromEntries([...map].filter(([id]) => !from.get(id).startsWith('materials.')).map(([id, it]) => [id, Object.freeze(it)])));
})();

export const ITEMS = items;
export const PROPS = content.props.view();
export const CROPS = content.crops.view();
export const FISH = content.fish.view();
export const FORAGE = content.forage.view();
export const FORTUNES = content.fortunes.view();

export const RIPE = 3; // stages: 0 planted seed, 1 sprout, 2 growing, 3 ripe
export const BAIT_RARE = 3; // rare fish weight multiplier while you carry bait

/** Is fish `f` biting at local hour `h`? */
export function fishBiting(f, h) {
  if (!f.hours) return true;
  const [a, b] = f.hours;
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

// the order of the hotbar registry (systems register the entries); the saved v3 `slot` indexes this list
export const HOTBAR = Object.freeze(['hand', 'hoe', 'can', 'rod', ...content.crops.all().map(([, def]) => def.seed)]);

/** Things Hana buys (and the "sell all" button sells). */
export const SELLABLE_KINDS = new Set(['produce', 'fish', 'forage']);

export const START_INVENTORY = Object.freeze({
  seed_rice: 4, seed_daikon: 8, seed_tea: 2,
  prop_crate: 2, prop_pot: 2, prop_toro: 1, prop_fence: 6, prop_sakura: 1, prop_bamboo: 2,
});
export const START_MONEY = 120;

// Game data: items, prices, crops, fish, placeable props.
export const PROPS = {
  // asset: painted blockout used for the mesh; canopy: billboard foliage; sprite: billboard-only prop
  crate: { name: 'Crate', asset: 'crate', price: 20 },
  pot: { name: 'Clay pot', asset: 'pot', price: 15 },
  toro: { name: 'Stone lantern', asset: 'toro', price: 60, light: true },
  fence: { name: 'Fence', asset: 'fence', price: 8 },
  minka: { name: 'Minka house', asset: 'minka', price: 320 },
  torii: { name: 'Torii gate', asset: 'torii', price: 200 },
  well: { name: 'Well', asset: 'well', price: 120 },
  bridge: { name: 'Arched bridge', asset: 'bridge', price: 90 },
  sakura: { name: 'Sakura tree', asset: 'trunk', canopy: 'sakura', price: 45, footprint: [1, 1], icon: 'canopy:sakura_a' },
  pine: { name: 'Pine tree', asset: 'trunk', canopy: 'pine', price: 35, footprint: [1, 1], icon: 'canopy:pine_a' },
  bamboo: { name: 'Bamboo', sprite: 'bamboo', price: 25, footprint: [1, 1], icon: 'vegetation:bamboo' },
  stall: { name: 'Merchant stall', asset: 'stall', price: 0, fixed: true },
};

export const CROPS = {
  rice: { name: 'Rice', seed: 'seed_rice', stageMs: 60_000, yield: [2, 3], sprite: 'rice', height: [0.45, 0.75, 0.95] },
  daikon: { name: 'Daikon', seed: 'seed_daikon', stageMs: 90_000, yield: [1, 2], sprite: 'daikon', height: [0.4, 0.6, 0.8] },
  tea: { name: 'Tea', seed: 'seed_tea', stageMs: 120_000, yield: [2, 3], sprite: 'tea', height: [0.4, 0.6, 0.85], regrow: true },
};
export const RIPE = 3; // stages: 0 planted seed, 1 sprout, 2 growing, 3 ripe

export const FISH = {
  ayu: { name: 'Ayu', water: 'fresh', weight: 6, window: 950, sell: 30 },
  koi: { name: 'Koi', water: 'fresh', weight: 4, window: 780, sell: 65 },
  tai: { name: 'Tai', water: 'sea', weight: 6, window: 850, sell: 75 },
  fugu: { name: 'Fugu', water: 'sea', weight: 3, window: 650, sell: 120 },
};

// icon: 'sheet:cell' in the painted icon atlas, or 'asset:name' for painted prop icons
export const ITEMS = {
  hand: { name: 'Hand', kind: 'tool', icon: 'icons:hand', hint: 'Harvest, talk, interact' },
  hoe: { name: 'Hoe', kind: 'tool', icon: 'icons:hoe', hint: 'Till grass into soil' },
  can: { name: 'Watering can', kind: 'tool', icon: 'icons:can', hint: 'Water crops: they grow twice as fast' },
  rod: { name: 'Fishing rod', kind: 'tool', icon: 'icons:rod', hint: 'Face water and cast' },
  seed_rice: { name: 'Rice seeds', kind: 'seed', crop: 'rice', icon: 'icons:seed_rice', buy: 5 },
  seed_daikon: { name: 'Daikon seeds', kind: 'seed', crop: 'daikon', icon: 'icons:seed_daikon', buy: 8 },
  seed_tea: { name: 'Tea seeds', kind: 'seed', crop: 'tea', icon: 'icons:seed_tea', buy: 14 },
  rice: { name: 'Rice', kind: 'produce', icon: 'icons:rice', sell: 18 },
  daikon: { name: 'Daikon', kind: 'produce', icon: 'icons:daikon', sell: 30 },
  tea: { name: 'Tea leaves', kind: 'produce', icon: 'icons:tea', sell: 26 },
  ...Object.fromEntries(Object.entries(FISH).map(([k, f]) => [k, { name: f.name, kind: 'fish', icon: `icons:${k}`, sell: f.sell }])),
  ...Object.fromEntries(Object.entries(PROPS).filter(([, p]) => !p.fixed).map(([k, p]) => [`prop_${k}`, {
    name: p.name, kind: 'prop', prop: k, icon: p.icon || `asset:${p.asset}`, buy: p.price, sell: Math.floor(p.price / 2),
  }])),
};

export const HOTBAR = ['hand', 'hoe', 'can', 'rod', 'seed_rice', 'seed_daikon', 'seed_tea'];

export const START_INVENTORY = {
  seed_rice: 6, seed_daikon: 4, seed_tea: 2,
  prop_crate: 2, prop_pot: 2, prop_toro: 1, prop_fence: 6, prop_sakura: 1, prop_bamboo: 2,
};
export const START_MONEY = 120;

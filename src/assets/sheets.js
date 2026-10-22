// Painted sprite / texture sheets. Shared by the pipeline (guide images + Codex
// prompts + slicing) and the game (atlas lookup). Cells are row-major.
export const SHEETS = {
  vegetation: {
    cols: 4, rows: 2, width: 1536, height: 1024, cell: 256,
    subject: 'billboard vegetation sprites for a cosy isometric game',
    cells: [
      ['grass_a', 'a small tuft of soft green grass blades'],
      ['grass_b', 'a wider clump of grass with a few clover leaves'],
      ['flowers_pink', 'a little clump of green leaves with pink and vermilion wildflowers'],
      ['flowers_white', 'a little clump of green leaves with cream white and soft gold wildflowers'],
      ['bamboo', 'a tall cluster of three green bamboo stalks with leaves at the top, reaching the top of the cell'],
      ['bush', 'a round mossy green shrub with a few tiny flowers'],
      ['reeds', 'tall water reeds and cattails, green and straw coloured'],
      ['fern', 'a lush green fern / hosta plant'],
    ],
  },
  crops: {
    cols: 3, rows: 3, width: 1024, height: 1024, cell: 256,
    subject: 'farm crop growth stage sprites for a cosy isometric game (each row is one crop, left to right: young sprout, growing, ripe and ready to harvest)',
    cells: [
      ['rice_1', 'tiny rice seedling sprouts'],
      ['rice_2', 'a green rice plant clump, knee high'],
      ['rice_3', 'a ripe rice plant with drooping golden grain heads'],
      ['daikon_1', 'a tiny daikon sprout with two round leaves'],
      ['daikon_2', 'a leafy green daikon radish plant'],
      ['daikon_3', 'a big ripe daikon radish, white root half out of the soil, lush leaves'],
      ['tea_1', 'a tiny tea bush seedling'],
      ['tea_2', 'a small rounded tea bush'],
      ['tea_3', 'a full rounded tea bush covered in fresh bright green leaf tips'],
    ],
  },
  canopy: {
    cols: 2, rows: 2, width: 1024, height: 1024, cell: 512,
    subject: 'tree canopy foliage clumps (no trunks) used as billboards on low-poly trees in a cosy isometric game',
    cells: [
      ['sakura_a', 'a large round fluffy clump of pink cherry blossom (sakura) foliage'],
      ['sakura_b', 'a smaller cloud-like clump of pink cherry blossoms'],
      ['pine_a', 'a large Japanese black pine foliage cloud pad, layered, deep green'],
      ['pine_b', 'a smaller flat Japanese pine foliage pad, deep green'],
    ],
  },
  tiles: {
    cols: 3, rows: 2, width: 1536, height: 1024, cell: 512, tile: true,
    subject: 'top-down seamless tileable ground textures for a cosy isometric game, each texture filling its whole square edge to edge with no border',
    cells: [
      ['grass', 'soft lush grass meadow seen from above'],
      ['sand', 'warm beach sand with a few tiny pebbles'],
      ['path', 'packed earth path with flat stepping stones'],
      ['soil', 'tilled dark brown farm soil in furrows'],
      ['water', 'calm clear blue-teal water surface with gentle ripples'],
      ['cliff', 'earthy brown cliff / dirt bank with roots and small stones'],
    ],
  },
  icons: {
    cols: 4, rows: 4, width: 1024, height: 1024, cell: 256,
    subject: 'inventory item icons for a cosy game, each a single centred object',
    cells: [
      ['hand', 'an open hand (palm) gesture'],
      ['hoe', 'a farming hoe with a wooden handle'],
      ['can', 'a wooden watering can / pail with water drops'],
      ['rod', 'a bamboo fishing rod with line and red bobber'],
      ['seed_rice', 'a small cloth seed pouch with rice grains'],
      ['seed_daikon', 'a small paper seed packet with a daikon drawing'],
      ['seed_tea', 'a small cloth pouch of tea seeds'],
      ['rice', 'a bundle of harvested golden rice'],
      ['daikon', 'a fresh white daikon radish with green leaves'],
      ['tea', 'a handful of fresh green tea leaves'],
      ['koi', 'an orange and white koi fish'],
      ['ayu', 'a small slender silver-green ayu sweetfish'],
      ['tai', 'a pink-red sea bream (tai) fish'],
      ['fugu', 'a round puffer fish (fugu)'],
      ['koku', 'a gold koku coin (oval Japanese koban coin)'],
      ['basket', 'a woven bamboo basket'],
    ],
  },
};

export function cellIndex(sheet, name) {
  return SHEETS[sheet].cells.findIndex((c) => c[0] === name);
}

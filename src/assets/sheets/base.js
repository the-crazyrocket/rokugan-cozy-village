// Painted sprite / texture sheets of the base game. Cells are row-major.
import { defineSheet } from './registry.js';

defineSheet('vegetation', {
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
});
defineSheet('crops', {
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
});
defineSheet('canopy', {
  cols: 2, rows: 2, width: 1024, height: 1024, cell: 512,
  subject: 'tree canopy foliage clumps (no trunks) used as billboards on low-poly trees in a cosy isometric game',
  cells: [
    ['sakura_a', 'a large round fluffy clump of pink cherry blossom (sakura) foliage'],
    ['sakura_b', 'a smaller cloud-like clump of pink cherry blossoms'],
    ['pine_a', 'a large Japanese black pine foliage cloud pad, layered, deep green'],
    ['pine_b', 'a smaller flat Japanese pine foliage pad, deep green'],
  ],
});
defineSheet('tiles', {
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
});
defineSheet('icons', {
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
});
defineSheet('icons2', {
  cols: 4, rows: 2, width: 1024, height: 512, cell: 256,
  subject: 'inventory item icons for a cosy game (sea fish caught from a pier, bait and shrine items), each a single centred object',
  cells: [
    ['aji', 'a small silver-blue horse mackerel (aji) fish with a yellow stripe'],
    ['saba', 'a blue-green mackerel (saba) fish with dark wavy stripes on its back'],
    ['ika', 'a pale cream-pink squid (ika) with big eyes and short tentacles'],
    ['tako', 'a round red octopus (tako) curling its tentacles'],
    ['kintai', 'a rare shining golden sea bream fish with sparkles around it'],
    ['bait', 'a small clay pot of fishing bait with a few tiny shrimps'],
    ['bell', 'a golden Shinto shrine bell (suzu) hanging from a red and white rope'],
    ['ebisu', 'a smiling round-faced fortune charm of Ebisu holding a red sea bream'],
  ],
});
defineSheet('icons3', {
  cols: 4, rows: 2, width: 1024, height: 512, cell: 256,
  subject: 'inventory item icons for a cosy island game (a digging tool and raw building materials), each a single centred object',
  cells: [
    ['shovel', 'a sturdy wooden-handled iron spade with a rounded blade and a bit of dark earth on it'],
    ['earth', 'a woven straw basket heaped with rich dark brown earth'],
    ['stone', 'a small pile of three rounded grey granite stones'],
    ['wood', 'a neat bundle of three split pine logs tied with straw rope'],
    ['clay', 'a smooth lump of reddish-orange potter’s clay with a thumbprint'],
    ['shell', 'a pale pink and cream scallop seashell with a small spiral shell beside it'],
    ['fibre', 'a coiled hank of golden plant fibre twine'],
    ['mushroom', 'two plump brown shiitake mushrooms with cream stems'],
  ],
});
defineSheet('gather', {
  cols: 4, rows: 2, width: 1024, height: 512, cell: 256,
  subject: 'small billboard sprites of things to gather on the ground of a cosy isometric island game, each sitting on the bottom edge of its cell',
  cells: [
    ['rock_a', 'a knee-high rounded grey granite boulder with a little moss and a crack across it'],
    ['rock_b', 'two smaller mossy grey rocks leaning together with a tuft of grass'],
    ['branch_a', 'a fallen pine branch lying on the ground, brown bark with a few green needles'],
    ['branch_b', 'a small heap of dry twigs and a short split log'],
    ['clay', 'a low mound of wet reddish-orange clay on a riverbank with a few pebbles'],
    ['shells', 'a few pale pink and cream seashells and a spiral shell scattered on a little patch of sand'],
    ['driftwood', 'a sun-bleached silver-grey piece of driftwood'],
    ['stump', 'a low cut tree stump with pale rings and a tiny green shoot'],
  ],
});
defineSheet('crops2', {
  cols: 3, rows: 4, width: 768, height: 1024, cell: 256,
  subject: 'farm crop growth stage sprites for a cosy isometric game (each row is one crop, left to right: young sprout, growing, ripe and ready to harvest)',
  cells: [
    ['nasu_1', 'a small eggplant seedling with two soft leaves'],
    ['nasu_2', 'a bushy eggplant plant with purple-veined leaves and a few violet flowers'],
    ['nasu_3', 'a lush eggplant plant hung with glossy dark purple Japanese eggplants'],
    ['kabocha_1', 'a tiny squash seedling with round leaves'],
    ['kabocha_2', 'a sprawling pumpkin vine with big leaves and a yellow flower'],
    ['kabocha_3', 'a ripe dark green Japanese kabocha pumpkin sitting among broad leaves'],
    ['edamame_1', 'a little soybean sprout'],
    ['edamame_2', 'a leafy green soybean plant, knee high'],
    ['edamame_3', 'a full soybean plant covered in fuzzy green edamame pods'],
    ['satsuma_imo_1', 'a sweet potato slip with a few heart-shaped leaves'],
    ['satsuma_imo_2', 'a spreading sweet potato vine with heart-shaped leaves'],
    ['satsuma_imo_3', 'a sweet potato vine with two purple-red sweet potatoes showing at its base'],
  ],
});
defineSheet('crops3', {
  cols: 3, rows: 3, width: 768, height: 768, cell: 256,
  subject: 'farm crop growth stage sprites for a cosy isometric game (each row is one crop, left to right: young sprout, growing, ripe and ready to harvest)',
  cells: [
    ['shiso_1', 'a small seedling of green perilla (shiso) with serrated leaves'],
    ['shiso_2', 'a bushy shiso herb plant with crinkled serrated green leaves'],
    ['shiso_3', 'a big lush shiso herb plant with layers of fragrant serrated green leaves and tiny flower spikes'],
    ['wasabi_1', 'a tiny wasabi plant with two round heart-shaped leaves'],
    ['wasabi_2', 'a clump of wasabi with round heart-shaped leaves on long stems'],
    ['wasabi_3', 'a mature wasabi plant with a thick green knobbly rhizome showing under round leaves'],
    ['lotus_1', 'a couple of small round lotus pads floating flat on water'],
    ['lotus_2', 'a cluster of round lotus pads with a closed pink bud on a stem'],
    ['lotus_3', 'lotus pads with a big open pink and white lotus flower standing above them'],
  ],
});
defineSheet('icons4', {
  cols: 4, rows: 4, width: 1024, height: 1024, cell: 256,
  subject: 'inventory item icons for a cosy Japanese farming game (harvested vegetables and their seed packets), each a single centred object',
  cells: [
    ['nasu', 'two glossy dark purple Japanese eggplants (nasu) with green caps'],
    ['kabocha', 'a dark green Japanese kabocha pumpkin with a slice showing orange flesh'],
    ['edamame', 'a small bundle of fuzzy green edamame pods'],
    ['satsuma_imo', 'two purple-red Japanese sweet potatoes (satsuma imo)'],
    ['shiso', 'a little stack of fresh green serrated shiso leaves'],
    ['wasabi', 'a fresh green knobbly wasabi root with a couple of leaves'],
    ['lotus', 'a sliced lotus root (renkon) showing its holes, with a pink lotus petal'],
    ['compost', 'a small wooden bucket of rich dark compost with a sprout on top'],
    ['seed_nasu', 'a small paper seed packet with an eggplant drawing'],
    ['seed_kabocha', 'a small paper seed packet with a pumpkin drawing'],
    ['seed_edamame', 'a small cloth pouch of pale green soybeans'],
    ['seed_satsuma_imo', 'a small bundle of sweet potato slips tied with straw'],
    ['seed_shiso', 'a small paper seed packet with a green leaf drawing'],
    ['seed_wasabi', 'a tiny wasabi plantlet in a clay pot'],
    ['seed_lotus', 'a few dark lotus seeds in a small lacquered dish'],
    ['kakei', 'a short length of green bamboo pipe dripping water'],
  ],
});
defineSheet('icons5', {
  cols: 4, rows: 4, width: 1024, height: 1024, cell: 256,
  subject: 'inventory item icons for a cosy Japanese fishing game, each a single centred fish seen from the side, painted with care for its real colours and markings',
  cells: [
    ['iwana', 'a char trout (iwana) with an olive-brown back and pale cream spots'],
    ['yamame', 'a slender masu trout (yamame) with soft violet parr marks along its silver side'],
    ['unagi', 'a long dark olive-brown freshwater eel (unagi) curled in an S'],
    ['sakuramasu', 'a cherry salmon (sakuramasu) with a silver body blushed pink, a sakura petal beside it'],
    ['funa', 'a deep-bodied golden-bronze crucian carp (funa)'],
    ['namazu', 'a dark grey Japanese catfish (namazu) with long whiskers and a wide smiling mouth'],
    ['kingyo', 'a little red and white fancy goldfish (kingyo) with a flowing tail'],
    ['dojo', 'a small brown spotted pond loach (dojo) with tiny whiskers'],
    ['kisu', 'a slim pale silver-sand whiting (kisu)'],
    ['haze', 'a small mottled sandy-brown goby (haze) with big eyes and a round head'],
    ['mebaru', 'a dark red-brown rockfish (mebaru) with very large eyes'],
    ['hirame', 'a flat olive-brown flounder (hirame) seen from above, both eyes on top'],
    ['isaki', 'a grunt fish (isaki) with three faint brown stripes along its olive-grey body'],
    ['buri', 'a big yellowtail (buri) with a blue-green back and a yellow stripe'],
    ['katsuo', 'a skipjack tuna (katsuo) with dark blue back and dark stripes on its silver belly'],
    ['maguro', 'a huge bluefin tuna (maguro), dark navy back and silver belly, with a little golden sparkle'],
  ],
});
defineSheet('visitors', {
  cols: 3, rows: 2, width: 768, height: 512, cell: 256,
  subject: 'cute billboard sprites of animal and yokai visitors for a cosy isometric Japanese island game, each standing on the bottom edge of its cell, seen slightly from above, facing three-quarters toward the viewer',
  cells: [
    ['tsuru', 'a tall elegant red-crowned Japanese crane standing on one leg, white plumage with black neck and tail feathers and a red cap'],
    ['kitsune', 'a sitting orange-red fox with a white chest and a bushy white-tipped tail, a little red bib round its neck'],
    ['kappa', 'a small friendly green kappa river yokai with a turtle shell on its back and a water dish on its head, holding a cucumber'],
    ['tanuki', 'a round fluffy tanuki raccoon-dog sitting up, brown and grey fur with a dark mask, wearing a tiny straw hat'],
    ['neko', 'a plump calico cat (white with orange and black patches) curled loaf-style, eyes half closed'],
    ['shika', 'a gentle sika deer with a spotted chestnut coat and small antlers, standing'],
  ],
});
defineSheet('dishes', {
  cols: 4, rows: 4, width: 1024, height: 1024, cell: 256,
  subject: 'inventory item icons for a cosy Japanese farming and cooking game (milled ingredients and home-cooked dishes in simple pottery), each a single centred object',
  cells: [
    ['daikoku', 'a portrait of Daikoku, the jolly Japanese god of plenty, round smiling face, a black cap, holding a little golden mallet, sitting on a rice bale'],
    ['komeko', 'a small cloth sack of white rice flour, open at the top, with a wooden scoop'],
    ['matcha', 'a small lidded tin of bright green matcha powder with a bamboo scoop'],
    ['kinako', 'a little wooden bowl of golden-beige roasted soybean flour'],
    ['onigiri', 'two triangular rice balls wrapped with a green shiso leaf on a bamboo leaf'],
    ['mochi', 'three soft round white mochi on a small wooden plate'],
    ['kinako_dango', 'a skewer of three dango dumplings dusted with golden kinako'],
    ['usucha', 'a rustic tea bowl of frothy whisked green matcha tea with a bamboo whisk beside it'],
    ['dengaku', 'grilled eggplant halves glazed with dark sweet miso on a long plate'],
    ['kabocha_nimono', 'simmered wedges of kabocha squash in a small blue ceramic bowl'],
    ['yaki_imo', 'a roasted Japanese sweet potato split open showing golden flesh, purple skin'],
    ['zunda_mochi', 'mochi covered in bright green sweet edamame paste in a little dish'],
    ['unadon', 'a lacquered box of rice topped with glazed grilled eel'],
    ['taimeshi', 'an iron pot of rice with a whole red sea bream cooked on top'],
    ['sashimi', 'slices of deep red tuna sashimi with a mound of green wasabi on a white plate'],
    ['zosui', 'a homely clay bowl of rice porridge stew with daikon and herbs'],
  ],
});
defineSheet('bugs', {
  cols: 5, rows: 2, width: 1280, height: 512, cell: 256,
  subject: 'small insect icons for a cosy Japanese island game (also used as tiny sprites fluttering in the world), each a single centred creature drawn cute and clear, seen slightly from above',
  cells: [
    ['monshiro', 'a small white cabbage butterfly with grey wing tips, wings open'],
    ['ageha', 'a big yellow-and-black swallowtail butterfly, wings open, with blue and orange spots on the tails'],
    ['hotaru', 'a firefly with a softly glowing yellow-green tail and dark wings'],
    ['tonbo', 'a bright red dragonfly (akatombo) with four clear wings spread'],
    ['semi', 'a brown and green cicada with clear veined wings folded'],
    ['suzumushi', 'a small dark bell cricket with long antennae'],
    ['kabutomushi', 'a glossy dark brown Japanese rhinoceros beetle with a big forked horn'],
    ['tentomushi', 'a round red ladybird with black spots'],
    ['yukimushi', 'a tiny pale blue-white snow fly, a fluffy white woolly aphid with little wings'],
    ['net', 'a Japanese bug-catching net: a round green mesh net on a long bamboo handle'],
  ],
});
defineSheet('icons6', {
  cols: 4, rows: 1, width: 1024, height: 256, cell: 256,
  subject: 'inventory item icons for a cosy Japanese island game (a woodcutting tool and young trees to plant), each a single centred object',
  cells: [
    ['axe', 'a small Japanese woodcutter\'s axe (ono) with a curved wooden handle wrapped in cord near the end and a dark iron head with a bright edge'],
    ['sapling_sakura', 'a young cherry tree sapling with a few pink blossoms and small leaves, its roots wrapped in a burlap ball tied with straw rope'],
    ['sapling_pine', 'a young Japanese black pine sapling with tufts of dark green needles, its roots wrapped in a burlap ball tied with straw rope'],
    ['stump', 'a sawn-off tree stump with a pale cut top showing its rings, a little moss at its foot'],
  ],
});

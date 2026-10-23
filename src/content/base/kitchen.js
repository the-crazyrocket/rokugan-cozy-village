// Daikoku's chapter: the mill turns a harvest into flour, matcha and kinako over a few minutes; the kitchen cooks dishes. A dish
// is discovered by putting exactly its ingredients in the pot (the kitchen shows its hint before that); anything else becomes a
// humble village stew. Dishes sell well and make good presents.
import { addBase } from '../../core/content.js';

const MIN = 60e3;
// what the mill makes (kind 'craft' items: ingredients, not sold at the stall)
addBase('items', 'komeko', { name: 'Rice flour', kind: 'craft', icon: 'dishes:komeko', hint: 'Milled rice, for mochi and dango' });
addBase('items', 'matcha', { name: 'Matcha', kind: 'craft', icon: 'dishes:matcha', hint: 'Stone-ground green tea' });
addBase('items', 'kinako', { name: 'Kinako', kind: 'craft', icon: 'dishes:kinako', hint: 'Roasted soybean flour, sweet and nutty' });

const mill = (name, inputs, out, mins, hint) => ({ name, kind: 'process', bench: 'mill', inputs, out, timeMs: mins * MIN, hint });
addBase('recipes', 'mill_komeko', mill('Rice flour', { rice: 3 }, { komeko: 2 }, 4, 'Three bundles of rice make two bags of flour'));
addBase('recipes', 'mill_matcha', mill('Matcha', { tea: 3 }, { matcha: 1 }, 8, 'Tea leaves ground slowly between the stones'));
addBase('recipes', 'mill_kinako', mill('Kinako', { edamame: 3 }, { kinako: 2 }, 4, 'Roasted beans, ground fine'));

const dish = (name, inputs, icon, sell, hint) => ({ name, kind: 'dish', bench: 'kitchen', inputs, out: {}, discover: true, item: { icon: `dishes:${icon}`, sell }, hint });
const DISHES = {
  onigiri: dish('Onigiri', { rice: 2, shiso: 1 }, 'onigiri', 70, 'Rice pressed by hand, with a fragrant green leaf'),
  mochi: dish('Mochi', { komeko: 2 }, 'mochi', 80, 'Nothing but rice flour, pounded soft'),
  kinako_dango: dish('Kinako dango', { komeko: 1, kinako: 1 }, 'kinako_dango', 110, 'Rice dumplings rolled in something nutty'),
  usucha: dish('Usucha', { matcha: 1 }, 'usucha', 140, 'Ume says it needs only one thing, whisked'),
  dengaku: dish('Nasu dengaku', { nasu: 2 }, 'dengaku', 90, 'Two purple vegetables, grilled and glazed'),
  kabocha_nimono: dish('Kabocha nimono', { kabocha: 1 }, 'kabocha_nimono', 120, 'One big squash, simmered sweet'),
  yaki_imo: dish('Yaki imo', { satsuma_imo: 1 }, 'yaki_imo', 70, 'A sweet potato, roasted in the embers'),
  zunda_mochi: dish('Zunda mochi', { komeko: 1, edamame: 2 }, 'zunda_mochi', 130, 'Rice flour with a bright green bean paste'),
  unadon: dish('Unadon', { unagi: 1, rice: 2 }, 'unadon', 260, 'A river fish of the night over a bowl of rice'),
  taimeshi: dish('Taimeshi', { tai: 1, rice: 2 }, 'taimeshi', 220, 'A whole lucky sea fish cooked in the rice'),
  sashimi: dish('Maguro sashimi', { maguro: 1, wasabi: 1 }, 'sashimi', 900, 'The king of the deep, with something sharp from the stream'),
  zosui: { ...dish('Village stew', { daikon: 1, rice: 1 }, 'zosui', 40, 'What any pot of odds and ends turns into'), discover: false },
};
for (const [id, r] of Object.entries(DISHES)) addBase('recipes', id, { ...r, out: { [id]: 1 } });

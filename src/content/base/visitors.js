// Visitors: creatures that come when the island is arranged the way they like (`arrive`, tested at a tile beside the first prop
// it names) and at the right time (`when`), stay a while (stayMs) and leave a gift. Their rules are found through the hint, which
// the scrapbook shows before the first visit. Billboards from the `visitors` sheet.
import { addBase } from '../../core/content.js';

const H = 3600e3;
const v = (id, name, sprite, height, rig, arrive, when, stayMs, gifts, hint) => addBase('visitors', id, {
  name, body: { sprite, rig, height }, arrive, ...(when && { when }), stayMs, gifts, hint, icon: `visitors:${sprite}`, chance: 0.35,
});

v('tsuru', 'Tsuru the crane', 'tsuru', 1.25, 'bird', { near: [{ prop: 'toro', r: 2 }, { prop: 'pot', r: 2 }, { water: 'fresh', r: 2 }] }, { hour: [5, 18] }, [2 * H, 5 * H], ['seed_lotus', 'shell'],
  'Cranes stop where a lantern and a pot stand by fresh water.');
v('kitsune', 'Kitsune the fox', 'kitsune', 0.8, 'quad', { near: [{ prop: 'torii', r: 2 }, { prop: 'toro', r: 3 }] }, { hour: [17, 6] }, [2 * H, 4 * H], ['seed_shiso', 'herb'],
  'Foxes come to a torii with a lantern lit beside it, at dusk.');
v('kappa', 'Kappa', 'kappa', 0.8, 'biped', { near: [{ prop: 'crate', r: 1 }, { water: 'stream', r: 1 }] }, null, [1 * H, 3 * H], ['bait', 'clay'],
  'Something in the stream likes a crate of cucumbers left on the bank.');
v('tanuki', 'Tanuki', 'tanuki', 0.75, 'quad', { near: [{ prop: 'crate', r: 2, n: 2 }] }, { hour: [19, 5] }, [3 * H, 6 * H], ['mushroom', 'wood'],
  'Crates stacked together draw a round, curious visitor at night.');
v('neko', 'Neko the cat', 'neko', 0.55, 'quad', { near: [{ prop: 'pier', r: 2 }, { prop: 'pot', r: 2 }] }, null, [1 * H, 4 * H], ['aji'],
  'A cat will wait by the pier if there is a pot to curl up beside.');
v('shika', 'Shika the deer', 'shika', 1.0, 'quad', { near: [{ prop: 'bamboo', r: 2, n: 3 }, { prop: 'toro', r: 3 }] }, { hour: [5, 10] }, [1 * H, 3 * H], ['fibre', 'herb'],
  'Deer step out of a bamboo grove in the early morning, if a lantern shows the way.');

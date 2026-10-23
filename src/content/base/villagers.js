// The island's residents. Kenji the carpenter lives here from the start (he builds the village projects); Ume the tea master moves
// in once her house is built (home.project). schedule `at`: 'home' / 'home.door', 'site' (Kenji's project, when one is building),
// or { near: { prop } }; the first entry whose hours (and `when`) hold and whose place exists is where they are. `do`: idle, work,
// sweep, sleep (indoors: not on the map). likes / dislikes: item ids, and item kinds in `tags`. hearts: rewards at a friendship level.
import { addBase } from '../../core/content.js';

addBase('villagers', 'kenji', {
  name: 'Kenji', title: 'Carpenter', icon: 'asset:workbench',
  body: { blockout: 'char_kenji', rig: 'biped', height: 1.05 },
  look: { robe: '#7a5236', sash: '#d9b65a', hair: '#2a2420', hat: false, pants: '#4a3a30' },
  likes: { items: ['wood', 'bamboo', 'tai', 'unagi', 'unadon', 'onigiri', 'taimeshi'], tags: ['fish', 'dish'] }, dislikes: { items: ['shell', 'funa'] },
  schedule: [
    { hours: [5, 7], at: 'home.door', do: 'idle' },
    { hours: [7, 12], at: 'site', do: 'work' },
    { hours: [7, 12], at: { near: { prop: 'workbench' } }, do: 'work' },
    { hours: [12, 13], at: { near: { prop: 'well' } }, do: 'idle' },
    { hours: [13, 18], at: 'site', do: 'work' },
    { hours: [13, 18], at: { near: { prop: 'noticeboard' } }, do: 'idle' },
    { hours: [18, 21], at: { near: { prop: 'stall' } }, do: 'idle' },
    { hours: [21, 5], at: 'home', do: 'sleep' },
  ],
  hearts: [
    { n: 1, unlock: { items: { wood: 6 } } },
    { n: 2, unlock: { flag: 'kenji_quick' } },
    { n: 4, unlock: { items: { prop_toro: 2 } } },
  ],
  dialogue: [
    { id: 'hello', once: true, lines: ['Kenji. I build things. The board by the plaza says what the village needs; bring what it asks and I start the same day.'] },
    { id: 'site', when: { flag: 'building' }, lines: ['Mind the scaffolding. It will be done before you know it.', 'Good timber, this. The island gives what we need if we ask nicely.'] },
    { id: 'grove', when: { flag: 'project_grove' }, lines: ['The bamboo took well. Ume would like it there, I think.', 'Bamboo grows a hand a day in summer. Try shaking one: they drop a cane or two.'] },
    { id: 'rain', when: { weather: 'rain' }, lines: ['Rain on a new roof. Best sound there is.'] },
    { id: 'hill', when: { flag: 'project_hill' }, lines: ['From the top of the hill you can see the whole island. Worth every stone.'] },
    { id: 'islet', when: { flag: 'project_islet' }, lines: ['The bridge to the islet creaks a little. That means it is happy.'] },
    { id: 'idle', lines: ['Stone from the rocks, wood from under the trees. The island hands them out every morning.', 'A workbench saves a lot of koku. Fences, crates, lanterns: make them yourself.', 'Hana says the river fish bite best early.', 'The sea round here is shallow. With enough stone we could fill a bit more of it in.'] },
  ],
});

addBase('villagers', 'ume', {
  name: 'Ume', title: 'Tea master', icon: 'icons:tea',
  body: { blockout: 'char_ume', rig: 'biped', height: 0.95 },
  look: { robe: '#5f7f5a', sash: '#c9584c', hair: '#d9d4cc', hat: false, pants: '#3d3a40' },
  home: { project: 'ume_house' },
  likes: { items: ['tea', 'shiso', 'wasabi', 'sakuramasu', 'usucha', 'kinako_dango', 'mochi'], tags: ['forage', 'dish'] }, dislikes: { items: ['fugu', 'dojo'] },
  schedule: [
    { hours: [5, 8], at: 'home.door', do: 'sweep' },
    { hours: [8, 12], at: { near: { prop: 'bamboo' } }, do: 'idle' },
    { hours: [12, 15], at: { near: { prop: 'sakura' } }, do: 'idle' },
    { hours: [15, 18], at: { near: { prop: 'toro' } }, do: 'idle' },
    { hours: [18, 21], at: 'home.door', do: 'idle' },
    { hours: [21, 5], at: 'home', do: 'sleep' },
  ],
  hearts: [
    { n: 1, unlock: { items: { seed_tea: 4 } } },
    { n: 2, unlock: { items: { seed_shiso: 3, seed_wasabi: 2 } } },
    { n: 4, unlock: { items: { prop_kakei: 1 } } },
  ],
  dialogue: [
    { id: 'hello', once: true, lines: ['So this is the island. The bamboo sounds just as I hoped. I am Ume; I grow tea, slowly.'] },
    { id: 'tea', lines: ['Tea likes a little height. Bushes on a hill taste better; I cannot tell you why.', 'Wasabi wants cold running water beside it. Plant it by a stream.', 'A kakei keeps a field wet all day. Kenji can show you how to make one.'] },
    { id: 'spring', when: { season: 'spring' }, lines: ['The first tea of spring is the best of the year.'] },
    { id: 'night', when: { hour: [18, 21] }, lines: ['The lanterns come on one by one. I never tire of it.'] },
    { id: 'lanterns', when: { near: { prop: 'toro', r: 3, n: 3 } }, lines: ['So many lanterns here! Someone has a gentle eye.'] },
    { id: 'kitchen', when: { flag: 'cooked' }, lines: ['I smelled something good from the kitchen. Ume approves.'] },
  ],
});

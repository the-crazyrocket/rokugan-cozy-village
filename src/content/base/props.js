// Placeable props. asset: painted blockout used for the mesh; canopy: billboard foliage; sprite: billboard-only prop.
import { addBase } from '../../core/content.js';

addBase('props', 'crate', { name: 'Crate', asset: 'crate', price: 20 });
addBase('props', 'pot', { name: 'Clay pot', asset: 'pot', price: 15 });
addBase('props', 'toro', { name: 'Stone lantern', asset: 'toro', price: 60, light: true });
addBase('props', 'fence', { name: 'Fence', asset: 'fence', price: 8 });
addBase('props', 'minka', { name: 'Minka house', asset: 'minka', price: 320 });
addBase('props', 'torii', { name: 'Torii gate', asset: 'torii', price: 200 });
addBase('props', 'well', { name: 'Well', asset: 'well', price: 120 });
addBase('props', 'bridge', { name: 'Arched bridge', asset: 'bridge', price: 90 });
addBase('props', 'sakura', { name: 'Sakura tree', asset: 'trunk', canopy: 'sakura', price: 45, footprint: [1, 1], icon: 'canopy:sakura_a' });
addBase('props', 'pine', { name: 'Pine tree', asset: 'trunk', canopy: 'pine', price: 35, footprint: [1, 1], icon: 'canopy:pine_a' });
addBase('props', 'bamboo', { name: 'Bamboo', sprite: 'bamboo', price: 25, footprint: [1, 1], icon: 'vegetation:bamboo' });
addBase('props', 'stairs', { name: 'Stone stairs', asset: 'stairs', price: 30, stairs: { dir: 'up' } });
addBase('props', 'stall', { name: 'Merchant stall', asset: 'stall', price: 0, fixed: true });
// landmarks: always where the story puts them, never sold or moved
addBase('props', 'shrine_old', { name: 'Quiet shrine', asset: 'shrine_old', price: 0, fixed: true });
addBase('props', 'shrine', { name: 'Ebisu’s shrine', asset: 'shrine', price: 0, fixed: true });
addBase('props', 'pier', { name: 'Ebisu’s pier', asset: 'pier', price: 0, fixed: true });
addBase('props', 'stone', { name: 'Sleeping stone', asset: 'stone', price: 0, fixed: true });
// making things: the workbench is bought or given; the project board and the scaffolding belong to the village's projects
addBase('props', 'workbench', { name: 'Workbench', asset: 'workbench', price: 80 });
addBase('props', 'noticeboard', { name: 'Project board', asset: 'noticeboard', price: 0, fixed: true });
addBase('props', 'scaffold', { name: 'Scaffolding', asset: 'scaffold', price: 0, fixed: true });
// farm helpers: a kakei keeps the crops around it watered, a scarecrow adds one to every harvest within two tiles
addBase('props', 'kakei', { name: 'Bamboo water pipe', asset: 'kakei', price: 60, tags: ['farm', 'water'] });
addBase('props', 'mill', { name: 'Stone mill', asset: 'mill', price: 400, unlock: 'daikoku', tags: ['daikoku'] });
addBase('props', 'kitchen', { name: 'Kitchen', asset: 'kitchen', price: 500, unlock: 'daikoku', tags: ['daikoku'] });
addBase('props', 'scarecrow', { name: 'Scarecrow', asset: 'scarecrow', price: 70, tags: ['farm'] });

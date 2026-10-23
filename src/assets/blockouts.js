// Single source of truth for every prop/building shape, as a facade over assets/blockouts/*.
// Each blockout is a list of simple primitives (tile units: 1 unit = 1 grid tile,
// y = 0 is the ground, origin = footprint centre). The SAME data is used by
//  - the game (merged into one geometry per asset, projection-mapped with paint)
//  - the art pipeline (rendered grey from the isometric paint cameras).
import { BLOCKOUTS } from './blockouts/registry.js';
import './blockouts/base/village.js';
import './blockouts/base/crossings.js';
import './blockouts/base/shrine.js';

export { BLOCKOUTS, defineBlockout } from './blockouts/registry.js';
export { BRIDGE_LEN, BRIDGE_DECK } from './blockouts/base/crossings.js';
export { PIER_DECK } from './blockouts/base/shrine.js';
export { TREE_CANOPIES } from './blockouts/base/canopies.js';
export { buildBlockoutGeometry } from './blockouts/geometry.js';

export const PAINTED_ASSETS = Object.keys(BLOCKOUTS);

// story landmarks (anchor cells): the shrine faces the village across the river,
// Daikoku's stone sleeps beside it, Ebisu's pier carries the south road out to sea
import { legacy } from '../../world/coords.js';

export const LANDMARKS = { shrine: { x: 22, z: 9 }, stone: { x: 25, z: 10 }, pier: { x: 20, z: 35 } };
// where the village starts: the player's first tile, and the one every reachability rule measures from
export const HOME = legacy(17, 23);

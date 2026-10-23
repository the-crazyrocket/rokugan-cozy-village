// story landmarks (anchor cells): the shrine faces the village across the river,
// Daikoku's stone sleeps beside it, Ebisu's pier carries the south road out to sea
import { legacy } from '../../world/coords.js';

export const LANDMARKS = { shrine: legacy(22, 9), stone: legacy(25, 10), pier: legacy(20, 35) };
// where the village starts: the player's first tile, and the one every reachability rule measures from
export const HOME = legacy(17, 23);

// Where the ground is: terrain level plus the decks (bridges and the pier) standing on it. [P]
import { BRIDGE_DECK } from '../assets/blockouts/base/crossings.js';
import { PIER_DECK } from '../assets/blockouts/base/shrine.js';
import { LEVEL_Y, STAIR_DIRS } from './coords.js';

const HALF_PI = Math.PI / 2;

/** Height of a stair above its tile's level at (fx, fz) inside the tile: a ramp up one level towards the tile it climbs onto. */
export function stairY(world, x, z, fx, fz) {
  const [dx, dz] = STAIR_DIRS[(world.stairsAt(x, z) - 1) & 3];
  if (world.heightAt(x + dx, z + dz) !== world.heightAt(x, z) + 1) return 0; // nothing above to climb to
  const along = dx > 0 ? fx : dx < 0 ? 1 - fx : dz > 0 ? fz : 1 - fz;
  return LEVEL_Y * Math.max(0, Math.min(1, along));
}

/** Height of a deck prop (bridge or pier) under a world position, above the tile's own level. */
export function deckY(p, px, pz) {
  if (p.type === 'pier') return PIER_DECK + 0.04;
  const th = -p.rot * HALF_PI;
  const dx = px - p.cx, dz = pz - p.cz;
  const lz = -dx * Math.sin(th) + dz * Math.cos(th);
  return BRIDGE_DECK(lz) + 0.04;
}

/**
 * The walking surface. `props` answers isBridge(x, z) and at(x, z) (the placed-prop index);
 * groundY(x, z) is continuous and includes decks, canStep(x0, z0, x1, z1) is the terrain's step rule.
 */
export function createSurface(world, props) {
  return {
    groundY(px, pz) {
      const x = Math.floor(px), z = Math.floor(pz);
      const level = world.levelY(px, pz);
      if (!props.isBridge(x, z)) return level;
      if (world.stairsAt(x, z)) return level + stairY(world, x, z, px - x, pz - z);
      return level + deckY(props.at(x, z), px, pz);
    },
    canStep: (x0, z0, x1, z1) => world.canStep(x0, z0, x1, z1),
  };
}

// Where the ground is: terrain level plus the decks (bridges and the pier) standing on it. [P]
import { BRIDGE_DECK } from '../assets/blockouts/base/crossings.js';
import { PIER_DECK } from '../assets/blockouts/base/shrine.js';

const HALF_PI = Math.PI / 2;

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
      return level + deckY(props.at(x, z), px, pz);
    },
    canStep: (x0, z0, x1, z1) => world.canStep(x0, z0, x1, z1),
  };
}

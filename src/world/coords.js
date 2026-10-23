// Grid constants and coordinate helpers. [P]
// Authored coordinates (landmarks, the starting layout, test taps) are written in the 40x40 island's frame and go through
// legacy(); LEGACY_OFF is how far that island sits from the world's origin (0 until the world grows).
export const WORLD_W = 64, WORLD_H = 64;
export const LEGACY_OFF = 12; // (64 - 40) / 2: the old island sits in the middle, with open sea all round to grow into
export const CHUNK = 16;        // tiles per chunk side (dirty tracking)
export const MAX_HEIGHT = 4;    // height levels; a level is LEVEL_Y high
export const LEVEL_Y = 0.5;
export const WATER_Y = -0.32;   // water surface relative to the tile's level
/** Which way a stair (on the lower tile) climbs, per prop rotation: world.stairs holds rot + 1, 0 = no stair. */
export const STAIR_DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];

/** An authored (legacy island) coordinate in world tiles; fractions pass through (22.5 stays a tile centre). */
export const legacy = (x, z) => ({ x: x + LEGACY_OFF, z: z + LEGACY_OFF });

export const tileIndex = (w, x, z) => z * w + x;
export const tileX = (w, i) => i % w;
export const tileZ = (w, i) => Math.floor(i / w);
export const inBounds = (w, h, x, z) => x >= 0 && z >= 0 && x < w && z < h;
export const chunkCols = (w) => Math.ceil(w / CHUNK);
export const chunkIndex = (w, x, z) => Math.floor(z / CHUNK) * chunkCols(w) + Math.floor(x / CHUNK);

// Village projects: Kenji builds them in real time once they are paid for, and they finish while you are away. Each grows a new
// piece of the island out of the open sea around the old one (world tiles of the 64x64 world). A project's `shape` is drawn by
// shapeOf() below: { tiles: [{ x, z, kind, height }], props: [{ type, x, z, rot }], scaffold: [{ x, z }] }.
import { addBase } from '../../core/content.js';
import { T } from '../../world/kinds.js';

const HOUR = 3600e3;
const hash = (x, z, s = 0) => { let h = (x * 374761393 + z * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** An organic blob: land where the (noisy) ellipse distance is under 1, a sand rim near the edge. */
function blob(cx, cz, rx, rz, { rim = 0.82, seed = 1 } = {}) {
  const tiles = [];
  for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (z + 0.5 - cz) / rz) + (hash(x, z, seed) - 0.5) * 0.18;
    if (d < 1) tiles.push({ x, z, d, kind: d > rim ? T.SAND : T.GRASS, height: 0 });
  }
  // the noise may leave a crumb off the edge: keep the biggest connected piece
  const at = new Map(tiles.map((t) => [`${t.x},${t.z}`, t]));
  let best = [];
  const seen = new Set();
  for (const t of tiles) {
    if (seen.has(t)) continue;
    const piece = [t];
    seen.add(t);
    for (let i = 0; i < piece.length; i++) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = at.get(`${piece[i].x + dx},${piece[i].z + dz}`);
        if (n && !seen.has(n)) { seen.add(n); piece.push(n); }
      }
    }
    if (piece.length > best.length) best = piece;
  }
  return tiles.filter((t) => best.includes(t));
}

const SHAPES = {
  // west: a bamboo grove with a path through it, joined to the west shore
  grove() {
    const tiles = blob(16.5, 27, 5.2, 6.4, { seed: 3 });
    const props = [];
    for (const t of tiles) {
      if (t.z === 27 && t.x >= 13) { t.kind = T.PATH; continue; }
      if (t.kind === T.GRASS && t.d < 0.78 && hash(t.x, t.z, 7) < 0.5) props.push({ type: 'bamboo', x: t.x, z: t.z, rot: 0 });
    }
    props.push({ type: 'toro', x: 14, z: 26, rot: 0 });
    return { tiles, props, scaffold: [{ x: 18, z: 25 }, { x: 15, z: 29 }, { x: 13, z: 25 }] };
  },
  // north: a hill rising to level 3, stairs up its south face, a lookout of lanterns and a sakura on top
  hill() {
    const cx = 31, cz = 12;
    const tiles = blob(cx + 0.5, cz + 0.5, 6.4, 5.9, { seed: 5, rim: 0.86 });
    for (const t of tiles) {
      const d = Math.max(Math.abs(t.x - cx), Math.abs(t.z - cz));
      t.height = t.kind === T.SAND ? 0 : d <= 1 ? 3 : d <= 2 ? 2 : d <= 3 ? 1 : 0;
    }
    const props = [
      { type: 'stairs', x: cx, z: cz + 4, rot: 0 }, { type: 'stairs', x: cx, z: cz + 3, rot: 0 }, { type: 'stairs', x: cx, z: cz + 2, rot: 0 },
      { type: 'sakura', x: cx, z: cz - 1, rot: 0 }, { type: 'toro', x: cx - 1, z: cz + 1, rot: 0 }, { type: 'toro', x: cx + 1, z: cz + 1, rot: 0 },
      { type: 'pine', x: cx - 3, z: cz - 2, rot: 1 }, { type: 'pine', x: cx + 3, z: cz - 1, rot: 2 }, { type: 'pine', x: cx - 4, z: cz + 2, rot: 3 },
    ];
    return { tiles, props, scaffold: [{ x: cx - 2, z: cz + 3 }, { x: cx + 2, z: cz + 3 }, { x: cx, z: cz }] };
  },
  // east: a little islet across a two-tile channel, with a bridge over, pines and a lantern
  islet() {
    const tiles = blob(54, 31.5, 3.8, 3.4, { seed: 9, rim: 0.7 });
    const props = [
      { type: 'bridge', x: 47, z: 31, rot: 1, anchors: true },
      { type: 'pine', x: 54, z: 30, rot: 0 }, { type: 'pine', x: 55, z: 32, rot: 2 }, { type: 'toro', x: 52, z: 31, rot: 0 }, { type: 'sakura', x: 53, z: 32, rot: 0 },
    ];
    return { tiles, props, scaffold: [{ x: 51, z: 31 }, { x: 55, z: 30 }] };
  },
  // Ume's house: a minka among the bamboo, with a lantern by the door (no new land; `near` props find room around their spot)
  ume_house() {
    return { tiles: [], props: [{ type: 'minka', x: 16, z: 24, rot: 0, near: true }, { type: 'toro', x: 18, z: 26, rot: 0, near: true }], scaffold: [{ x: 16, z: 24 }, { x: 17, z: 25 }] };
  },
};

/** The drawn shape of a project (fresh each call). */
export const shapeOf = (id) => SHAPES[id]?.() ?? null;

addBase('projects', 'grove', {
  name: 'The bamboo grove', icon: 'vegetation:bamboo', buildMs: 2 * HOUR,
  cost: { koku: 250, items: { wood: 6, stone: 4 } }, requires: {}, unlocks: [],
  hint: 'Kenji fills in the shallows off the west shore and plants a grove of bamboo, with a path through it.',
});
addBase('projects', 'hill', {
  name: 'The north hill', icon: 'icons3:earth', buildMs: 6 * HOUR,
  cost: { koku: 600, items: { stone: 16, earth: 10, wood: 8 } }, requires: { flag: 'project_grove' }, unlocks: [],
  hint: 'A hill rises from the north shore, three levels high, with stone stairs and lanterns at the top: the best view of the island.',
});
addBase('projects', 'islet', {
  name: 'The islet', icon: 'icons3:shell', buildMs: 10 * HOUR,
  cost: { koku: 1000, items: { wood: 16, stone: 10, clay: 4 } }, requires: { flag: 'project_hill' }, unlocks: [],
  hint: 'A small island off the east shore, reached by a bridge. Shells wash up on its beach.',
});
addBase('projects', 'ume_house', {
  name: 'Ume\u2019s house', icon: 'asset:minka', buildMs: 4 * HOUR,
  cost: { koku: 450, items: { wood: 12, stone: 6, bamboo: 4 } }, requires: { flag: 'project_grove' }, unlocks: [],
  hint: 'Ume, a tea master from the mainland, would come to live on the island if she had a house among the bamboo.',
});

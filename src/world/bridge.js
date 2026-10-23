// Bridge spans and the load-time fix-up for bridges saved with the old 1x3 footprint. Pure: no DOM, no three. [P]
import { T } from './kinds.js';

export const BRIDGE_CELLS = 4;
const HALF_PI = Math.PI / 2;

/** The cells of a bridge anchored at (x,z): the same arithmetic as propCells for a 1x4 footprint, in order along the span. */
export function bridgeCells(x, z, rot) {
  const rd = BRIDGE_CELLS, odd = rot % 2 === 1;
  const cx = x + (odd ? 1 : 0.5), cz = z + (odd ? 0.5 : 1);
  const c = Math.cos(rot * HALF_PI), s = Math.sin(rot * HALF_PI);
  const cells = [];
  for (let j = 0; j < rd; j++) {
    const oz = j - (rd - 1) / 2;
    cells.push({ x: Math.round(cx + oz * s - 0.5), z: Math.round(cz + oz * c - 0.5) });
  }
  return cells;
}

/** A span is sound when everything between the ends is water and the ends match: both on land (soil does not count) or both in open water. */
export function spanOk(world, cells) {
  const n = cells.length;
  if (n < 3 || !cells.every((c) => world.inBounds(c.x, c.z))) return false;
  for (let i = 1; i < n - 1; i++) if (!world.isWater(cells[i].x, cells[i].z)) return false;
  const [a, b] = [cells[0], cells[n - 1]];
  const wa = world.isWater(a.x, a.z), wb = world.isWater(b.x, b.z);
  if (wa !== wb) return false;
  return wa || (world.get(a.x, a.z) !== T.SOIL && world.get(b.x, b.z) !== T.SOIL);
}

/**
 * Check every saved bridge. One that is not land-water...water-land is shifted by one tile along its axis,
 * or reported as 'bag' (return it to the bag). Returns the corrected list (bagged bridges dropped) and a report.
 * `cellsOf(prop)` lists the cells of any other prop so a shifted bridge never lands on one; without it only bridges are checked.
 */
export function fixBridges(propsList, world, cellsOf = null) {
  const taken = new Map();
  const claim = (p, cells) => { for (const c of cells) taken.set(c.z * 1000 + c.x, p.id); };
  const free = (id, cells) => cells.every((c) => (taken.get(c.z * 1000 + c.x) ?? id) === id);
  for (const p of propsList) if (p.type !== 'bridge' && cellsOf) claim(p, cellsOf(p));
  const sound = (p) => spanOk(world, bridgeCells(p.x, p.z, p.rot));
  for (const p of propsList) if (p.type === 'bridge' && sound(p)) claim(p, bridgeCells(p.x, p.z, p.rot)); // sound bridges keep their place
  const props = [], report = [];
  for (const p of propsList) {
    if (p.type !== 'bridge' || sound(p)) { props.push(p); continue; }
    const axis = p.rot % 2 ? [1, 0] : [0, 1];
    let fixed = null;
    for (const d of [1, -1]) {
      const x = p.x + axis[0] * d, z = p.z + axis[1] * d;
      const cells = bridgeCells(x, z, p.rot);
      if (spanOk(world, cells) && free(p.id, cells)) { fixed = { x, z, cells }; break; }
    }
    if (!fixed) { report.push({ id: p.id, action: 'bag', from: [p.x, p.z] }); continue; }
    claim(p, fixed.cells);
    props.push({ ...p, x: fixed.x, z: fixed.z });
    report.push({ id: p.id, action: 'moved', from: [p.x, p.z], to: [fixed.x, fixed.z] });
  }
  return { props, report };
}

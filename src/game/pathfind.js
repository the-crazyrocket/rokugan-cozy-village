// A* on the tile grid (8 directions, no corner cutting).
export function findPath(start, goal, walkable, W, H, maxNodes = 4000) {
  const key = (x, z) => z * W + x;
  const open = [{ x: start.x, z: start.z, g: 0, f: 0 }];
  const came = new Map();
  const gScore = new Map([[key(start.x, start.z), 0]]);
  const h = (x, z) => Math.hypot(x - goal.x, z - goal.z);
  let n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.x === goal.x && cur.z === goal.z) {
      const path = [{ x: cur.x, z: cur.z }];
      let k = key(cur.x, cur.z);
      while (came.has(k)) { const p = came.get(k); path.unshift(p); k = key(p.x, p.z); }
      return path;
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cur.x + dx, nz = cur.z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H || !walkable(nx, nz)) continue;
      if (dx && dz && (!walkable(cur.x + dx, cur.z) || !walkable(cur.x, cur.z + dz))) continue;
      const g = cur.g + (dx && dz ? 1.414 : 1);
      const k = key(nx, nz);
      if (g < (gScore.get(k) ?? Infinity)) {
        gScore.set(k, g);
        came.set(k, { x: cur.x, z: cur.z });
        const ex = open.find((o) => o.x === nx && o.z === nz);
        if (ex) { ex.g = g; ex.f = g + h(nx, nz); } else open.push({ x: nx, z: nz, g, f: g + h(nx, nz) });
      }
    }
  }
  return null;
}

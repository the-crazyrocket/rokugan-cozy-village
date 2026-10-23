// A* on the tile grid (8 directions, no corner cutting). [P]
// `step(x0, z0, x1, z1)`, when given, judges every move on top of `walkable`: false forbids it, true allows it,
// a number (>= 1) multiplies the move's cost. Diagonals also need both of their orthogonal legs to be steppable.
export function findPath(start, goal, walkable, W, H, maxNodes = 12000, step = null) {
  const limit = maxNodes ?? 12000;
  const key = (x, z) => z * W + x;
  const open = [{ x: start.x, z: start.z, g: 0, f: 0 }];
  const came = new Map();
  const gScore = new Map([[key(start.x, start.z), 0]]);
  const h = (x, z) => Math.hypot(x - goal.x, z - goal.z);
  const cost = (x0, z0, x1, z1) => (step ? step(x0, z0, x1, z1) : true);
  let n = 0;
  while (open.length && n++ < limit) {
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
      let k1 = cost(cur.x, cur.z, nx, nz);
      if (k1 === false || k1 === null || k1 === undefined) continue;
      if (dx && dz && (!cost(cur.x, cur.z, cur.x + dx, cur.z) || !cost(cur.x, cur.z, cur.x, cur.z + dz))) continue;
      if (typeof k1 !== 'number') k1 = 1;
      const g = cur.g + (dx && dz ? 1.414 : 1) * k1;
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

/**
 * Every tile reachable from `start` with the moves findPath makes (8 directions, no corner cutting, `step` judging each move),
 * as a Uint8Array over z * W + x with 1 on reached tiles. One flood fill, at most `limit` tiles. An unwalkable start reaches nothing.
 */
export function reach(start, walkable, W, H, step = null, limit = W * H) {
  const seen = new Uint8Array(W * H);
  if (start.x < 0 || start.z < 0 || start.x >= W || start.z >= H || !walkable(start.x, start.z)) return seen;
  const queue = [start.z * W + start.x];
  seen[queue[0]] = 1;
  const ok = (x0, z0, x1, z1) => { if (!step) return true; const k = step(x0, z0, x1, z1); return k !== false && k !== null && k !== undefined; };
  for (let head = 0; head < queue.length && head < limit; head++) {
    const cx = queue[head] % W, cz = (queue[head] - cx) / W;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H || seen[nz * W + nx] || !walkable(nx, nz)) continue;
      if (dx && dz && (!walkable(cx + dx, cz) || !walkable(cx, cz + dz) || !ok(cx, cz, cx + dx, cz) || !ok(cx, cz, cx, cz + dz))) continue;
      if (!ok(cx, cz, nx, nz)) continue;
      seen[nz * W + nx] = 1;
      queue.push(nz * W + nx);
    }
  }
  return seen;
}

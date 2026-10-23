// Pure helpers and constants shared by game.js and the extracted modules.

/** Hana stands at the front-right corner of the stall, turned towards the plaza. */
export function merchantSpot(s) {
  const th = s.rot * Math.PI / 2, lx = 1.3, lz = 0.25;
  const x = s.cx + lx * Math.cos(th) + lz * Math.sin(th), z = s.cz - lx * Math.sin(th) + lz * Math.cos(th);
  return { x, z, th, cell: { x: Math.floor(x), z: Math.floor(z) } };
}

export { WATER_Y } from '../world/coords.js';
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
export const SHRINE_TYPES = new Set(['shrine_old', 'shrine']);

/** A hotbar entry for the tool `id`: its name, icon and hint come from the item of the same id. */
export function hotbarEntry(ctx, id, order, compact = true) {
  const it = ctx.content.itemMap().get(id);
  return { id, order, compact, icon: it.icon, name: it.name, ...(it.hint && { hint: it.hint }) };
}

/** Puts a prop down on the nearest free spot within r tiles of (cx, cz) (the props api's canPlace decides), trying each rotation. -> the prop or null */
export function placeNear(props, type, cx, cz, { r = 5, rots = [0, 1, 2, 3], via = 'load' } = {}) {
  const spots = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) spots.push({ x: cx + dx, z: cz + dz, d: Math.hypot(dx, dz) });
  spots.sort((a, b) => a.d - b.d);
  for (const s of spots) for (const rot of rots) if (props.canPlace(type, s.x, s.z, rot, { via })) return props.add(type, s.x, s.z, rot, 0, { via });
  return null;
}

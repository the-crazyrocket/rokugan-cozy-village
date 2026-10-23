// Villages from before Wave 1 lived on a 40x40 grid; the world is now 64x64 with that island in its middle. A save without a `size`
// was made on the old grid: every coordinate and tile index in it moves LEGACY_OFF tiles over, once, as it is loaded.
import { LEGACY_OFF } from '../world/coords.js';
import { rleDecode, rleEncode } from '../core/rle.js';

export const OLD_W = 40, OLD_H = 40;

/** The save as it reads on a W x H grid (a new object; a save that has a size is returned as it is). */
export function growSave(s, W, H) {
  if (!s || s.size) return s;
  const O = LEGACY_OFF;
  const at = (i) => (Math.floor(i / OLD_W) + O) * W + (i % OLD_W) + O; // an old tile index on the new grid
  const out = { ...s, size: [W, H] };
  out.tiles = (s.tiles || []).filter(([i]) => Number.isInteger(i) && i >= 0 && i < OLD_W * OLD_H).map(([i, t]) => [at(i), t]);
  out.props = (s.props || []).map((p) => ({ ...p, x: p.x + O, z: p.z + O }));
  out.farm = (s.farm || []).map((c) => ({ ...c, x: c.x + O, z: c.z + O }));
  out.wetSoil = (s.wetSoil || []).map(([i, t]) => [at(i), t]);
  if (Array.isArray(s.player)) out.player = [s.player[0] + O, s.player[1] + O, s.player[2]];
  if (s.daily?.forage) out.daily = { ...s.daily, forage: s.daily.forage.map((f) => ({ ...f, x: f.x + O, z: f.z + O })) };
  if (s.heights) {
    try {
      const old = rleDecode(s.heights, OLD_W * OLD_H), h = new Uint8Array(W * H);
      old.forEach((v, i) => { h[at(i)] = v; });
      out.heights = rleEncode(h);
    } catch { delete out.heights; }
  }
  return out;
}

/** A 40x40 tile array placed in the middle of a W x H one, `fill` all round (the open sea). */
export function growArray(a, W, H, fill = 0) {
  const out = new Uint8Array(W * H).fill(fill), O = LEGACY_OFF;
  for (let z = 0; z < OLD_H; z++) for (let x = 0; x < OLD_W; x++) out[(z + O) * W + x + O] = a[z * OLD_W + x];
  return out;
}

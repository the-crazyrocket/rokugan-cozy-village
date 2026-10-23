// v3 (one flat object) -> v4 envelope of slices. Slice shapes at version 1:
//   core      { money, inv: [[key, n]], player: [x, z, facing], stats, tool: id, time: { carry }, flags: {} }
//   world     { w, h, kind, height, water }  each array run-length coded (core/rle.js)
//   props     { list: [{ id, type, x, z, rot }] }
//   farming   { crops: [{ type, x, z, progress, last, wet }], wet: [[x, z, until]] }
//   daily     the v3 `daily` object, or null before the first roll
//   shrine    the v3 `shrine` object, or null
//   scheduler { seq, entries }     away { pending }
// Old 1x3 bridges are re-anchored by the props slice migration (1 -> 2), which needs the world.
import { legacyArrays, LEGACY_W } from '../../world/legacy40.js';
import { rleEncode } from '../rle.js';

/** The v3 HOTBAR order: the saved `slot` indexes this list. */
export const LEGACY_HOTBAR = Object.freeze(['hand', 'hoe', 'can', 'rod', 'seed_rice', 'seed_daikon', 'seed_tea']);

const need = (ok, what) => { if (!ok) throw new Error(`v3 save has no valid ${what}`); };

export function v3ToV4(s) {
  need(Array.isArray(s.props), 'props');
  need(Array.isArray(s.inv), 'inventory');
  need(Array.isArray(s.farm), 'farm');
  need(Array.isArray(s.player) && s.player.length >= 2, 'player');
  need(Number.isFinite(s.money), 'money');
  const carry = s.timeOffset || 0;
  const arrays = legacyArrays(s.tiles);
  const wet = (s.wetSoil || []).filter(([i]) => Number.isInteger(i) && i >= 0 && i < arrays.w * arrays.h)
    .map(([i, until]) => [i % LEGACY_W, Math.floor(i / LEGACY_W), until]);
  const slices = {
    core: { v: 1, d: {
      money: s.money, inv: s.inv, player: s.player, stats: s.stats || {},
      tool: LEGACY_HOTBAR[s.slot] ?? LEGACY_HOTBAR[0], time: { carry }, flags: {},
    } },
    world: { v: 1, d: { w: arrays.w, h: arrays.h, kind: rleEncode(arrays.kind), height: rleEncode(arrays.height), water: rleEncode(arrays.water) } },
    props: { v: 1, d: { list: s.props } },
    farming: { v: 1, d: { crops: s.farm, wet } },
    daily: { v: 1, d: s.daily ?? null },
    shrine: { v: 1, d: s.shrine ?? null },
    scheduler: { v: 1, d: { seq: 0, entries: [] } },
    away: { v: 1, d: { pending: null } },
  };
  return { v: 4, savedAt: s.savedAt, timeOffset: carry, slices };
}

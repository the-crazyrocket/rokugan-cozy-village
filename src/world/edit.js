// The one way a tile changes: applyEdit(ctx, edit, { dryRun }) (docs/ARCHITECTURE.md section 4). [P]
// Terraform, water digging, reclaim, paving and project patches never touch the world themselves; this does, once, so what stood
// on the tiles, the invariants and the events exist in one place.
//
//   edit = { kind: 'raise'|'lower'|'dig'|'fill'|'reclaim'|'pave'|'patch', x, z, w = 1, h = 1,
//            from: { kind?, height?, water? }, to: { kind?, height?, water? }, by: 'player'|'project'|'system', project?, via? }
//   -> { ok, reason?, changed: [{ x, z }], bagged: { item: n }, lost: [{ what, item, x, z }], moved: { player?: { x, z } } }
//
// `from` is checked against every tile of the rect (stale edits fail), `to` is what each tile becomes (fields left out stay). Order:
// stale check, guards (ctx.guards, one call per edit with the edit as payload, so a guard looks at the whole rect), the player's
// tile, then the cleanup of what stood on the changed tiles, the player stepping aside, the mutation and the events. Every refusal
// comes before the first change (atomic). dryRun stops after the checks and reports what would be bagged and where the player would go.
//
// It reaches the other systems with ctx.use(): props and player always, farming and daily when booted. A system that calls it lists
// EDIT_NEEDS in its own `needs`.
import { validate } from '../core/schema.js';
import { EDIT } from '../core/events.js';
import { HOME } from '../content/base/landmarks.js';
import { T } from './kinds.js';
import { reach } from './pathfind.js';

export const EDIT_NEEDS = Object.freeze(['props', 'player', 'farming', 'daily']);
/** Which guard registry judges an edit kind. */
export const GUARD_KIND = Object.freeze({ raise: 'terraform', lower: 'terraform', pave: 'terraform', patch: 'terraform', dig: 'dig', fill: 'dig', reclaim: 'reclaim' });

const FIELDS = ['kind', 'height', 'water'];
const notBooted = (e) => /booted/.test(e?.message || '');

/** The api of a booted system; with `optional`, null when it is not booted (a permission error still throws). */
function use(ctx, name, optional = false) {
  try { return ctx.use(name); } catch (e) { if (optional && notBooted(e)) return null; throw e; }
}

/** The edit with its defaults filled in, or an Error when it is not shaped like one. */
export function normalizeEdit(edit) {
  const errs = validate(EDIT, edit, 'edit');
  if (errs.length) throw new TypeError(errs.join('; '));
  return { ...edit, w: edit.w ?? 1, h: edit.h ?? 1 };
}

export const stateAt = (world, x, z) => ({ kind: world.kindAt(x, z), height: world.heightAt(x, z), water: world.waterKind(x, z) });
/** What a tile in state `cur` becomes under the edit. */
export const afterOf = (e, cur) => ({ kind: e.to.kind ?? cur.kind, height: e.to.height ?? cur.height, water: e.to.water ?? cur.water });
const same = (a, b) => FIELDS.every((f) => a[f] === b[f]);

export function rectTiles(e) {
  const out = [];
  for (let z = e.z; z < e.z + e.h; z++) for (let x = e.x; x < e.x + e.w; x++) out.push({ x, z });
  return out;
}

/** The tiles of the rect that really change, row by row. */
export function changedTiles(world, e) {
  return rectTiles(e).filter((t) => { const cur = stateAt(world, t.x, t.z); return !same(cur, afterOf(e, cur)); });
}

/**
 * The terrain as it will be once the edit is done, without doing it: kind/height/water per tile, which tiles can be walked
 * (props that will be bagged no longer block, Hana's spot and decks do as they do now) and the terrain's step rule.
 * `bagged` is a Set of prop ids that leave.
 */
export function viewAfter(ctx, e, bagged = null) {
  const world = ctx.world, props = use(ctx, 'props'), player = use(ctx, 'player');
  const inRect = (x, z) => x >= e.x && z >= e.z && x < e.x + e.w && z < e.z + e.h;
  const field = (f, x, z, cur) => (e.to[f] !== undefined && inRect(x, z) ? e.to[f] : cur);
  const kind = (x, z) => field('kind', x, z, world.kindAt(x, z));
  const height = (x, z) => field('height', x, z, world.heightAt(x, z));
  const water = (x, z) => field('water', x, z, world.waterKind(x, z));
  const walkable = (x, z) => {
    if (!world.inBounds(x, z)) return false;
    if (props.isBridge(x, z)) return true;
    if (kind(x, z) === T.WATER) return false;
    const blocking = props.isBlocked(x, z);
    if (blocking && !bagged?.has(props.at(x, z)?.id)) return false;
    return !(world.isLand(x, z) && !blocking && !player.walkable(x, z)); // something else keeps feet off it (Hana's spot)
  };
  const step = (x0, z0, x1, z1) => world.canStep(x0, z0, x1, z1, height);
  return { inRect, kind, height, water, walkable, step, reach: (start, limit) => reach(start, walkable, world.w, world.h, step, limit) };
}

/** The props an edit would take off these tiles: each once, never a fixed one (the stall, the landmarks). */
export function propsOn(ctx, tiles) {
  const props = use(ctx, 'props'), out = new Map();
  for (const t of tiles) {
    const p = props.at(t.x, t.z);
    if (p && !out.has(p.id) && !ctx.content.props.get(p.type)?.fixed) out.set(p.id, p);
  }
  return [...out.values()];
}

/**
 * Makes room on tiles: props go back to the bag (`remove` with to:'bag'), a crop is taken up and its seed goes to the bag,
 * watered soil dries, wild greens on the tile are gone for the day. With soilToGrass tilled soil also returns to grass (a landmark
 * going up). dryRun only reports. -> { bagged: { item: n }, lost: [{ what: 'forage', item, x, z }] }
 */
export function clearTiles(ctx, tiles, { dryRun = false, soilToGrass = false } = {}) {
  const props = use(ctx, 'props'), farming = use(ctx, 'farming', true), daily = use(ctx, 'daily', true);
  const bagged = {}, lost = [], seen = new Set();
  const bag = (item) => { bagged[item] = (bagged[item] || 0) + 1; };
  const give = (item) => { ctx.inv.give(item); ctx.invalidate('ui'); };
  for (const t of tiles) {
    const p = props.at(t.x, t.z);
    if (p && !seen.has(p.id) && !ctx.content.props.get(p.type)?.fixed) {
      seen.add(p.id);
      bag(`prop_${p.type}`);
      if (!dryRun) { props.remove(p, { to: 'bag' }); give(`prop_${p.type}`); }
    }
    if (farming) {
      if (dryRun) {
        const crop = farming.crop(t.x, t.z);
        if (crop) bag(ctx.content.crops.get(crop.type).seed);
      } else {
        const seed = soilToGrass ? farming.clearTile(t.x, t.z) : farming.uproot(t.x, t.z);
        if (seed) { bag(seed); give(seed); }
      }
    }
    for (const f of daily?.state?.forage || []) {
      if (f.taken || f.x !== t.x || f.z !== t.z) continue;
      lost.push({ what: 'forage', item: f.item, x: t.x, z: t.z });
      if (!dryRun) f.taken = true;
    }
  }
  if (!dryRun && lost.length) ctx.invalidate('veg');
  return { bagged, lost };
}

/** Where the player steps to when their tile changes under a project or system edit: the nearest tile that stays walkable and is reachable from home. */
function playerSpot(view, world, pos) {
  const open = view.walkable(HOME.x, HOME.z) ? view.reach(HOME) : null;
  let best = null, bestD = Infinity;
  for (let z = 0; z < world.h; z++) for (let x = 0; x < world.w; x++) {
    if (view.inRect(x, z) || !view.walkable(x, z) || (open && !open[z * world.w + x])) continue;
    const d = Math.hypot(x + 0.5 - pos.x, z + 0.5 - pos.z);
    if (d < bestD) { best = { x, z }; bestD = d; }
  }
  return best || { x: HOME.x, z: HOME.z };
}

export function applyEdit(ctx, edit, { dryRun = false } = {}) {
  const e = normalizeEdit(edit), world = ctx.world;
  const res = { ok: true, changed: [], bagged: {}, lost: [], moved: {} };
  const refuse = (reason) => ({ ok: false, reason, changed: [], bagged: {}, lost: [], moved: {} });

  if (e.x < 0 || e.z < 0 || e.x + e.w > world.w || e.z + e.h > world.h) return refuse('That is beyond the island.');
  for (const t of rectTiles(e)) {
    const cur = stateAt(world, t.x, t.z);
    if (FIELDS.some((f) => e.from[f] !== undefined && e.from[f] !== cur[f])) return refuse('The ground there has changed.');
  }
  const changed = changedTiles(world, e);
  if (!changed.length) return res;

  const why = ctx.guards?.check(GUARD_KIND[e.kind], e, ctx);
  if (why) return refuse(why);

  const player = use(ctx, 'player', true);
  const cell = player?.cell();
  const standing = !!cell && changed.some((t) => t.x === cell.x && t.z === cell.z);
  if (standing && e.by === 'player') return refuse('You are standing there.');

  const leaving = propsOn(ctx, changed);
  res.changed = changed;
  if (dryRun) Object.assign(res, clearTiles(ctx, changed, { dryRun: true }));
  if (standing) {
    const view = viewAfter(ctx, e, new Set(leaving.map((p) => p.id)));
    res.moved.player = playerSpot(view, world, player.state.pos);
  }
  if (dryRun) return res;

  Object.assign(res, clearTiles(ctx, changed));
  if (res.moved.player) player.warp(res.moved.player.x + 0.5, res.moved.player.z + 0.5);

  const waterRect = { x0: Infinity, z0: Infinity, x1: -1, z1: -1 };
  const events = [];
  for (const t of changed) {
    const from = stateAt(world, t.x, t.z), to = afterOf(e, from);
    if (to.kind !== from.kind) world.setKind(t.x, t.z, to.kind);
    if (to.height !== from.height) world.setHeight(t.x, t.z, to.height);
    if (to.water !== from.water) {
      world.setWater(t.x, t.z, to.water);
      waterRect.x0 = Math.min(waterRect.x0, t.x); waterRect.z0 = Math.min(waterRect.z0, t.z);
      waterRect.x1 = Math.max(waterRect.x1, t.x); waterRect.z1 = Math.max(waterRect.z1, t.z);
    }
    events.push({ x: t.x, z: t.z, from, to, kind: e.kind, by: e.by });
  }
  world.refresh({ x: e.x, z: e.z, w: e.w, h: e.h });

  for (const ev of events) ctx.bus.emit('terraform', ev);
  if (waterRect.x1 >= 0) ctx.bus.emit('waterChange', { rect: { x: waterRect.x0, z: waterRect.z0, w: waterRect.x1 - waterRect.x0 + 1, h: waterRect.z1 - waterRect.z0 + 1 } });
  for (const what of ['terrain', 'veg', 'crops']) ctx.invalidate(what);
  return res;
}

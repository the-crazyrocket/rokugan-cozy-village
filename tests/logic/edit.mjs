// The tile edit contract (world/edit.js) and the shared invariants (systems/terrainrules.js) on a real World, with the real props,
// player, farming and daily systems: stale edits, atomic refusal, bagging, dryRun, the events, the player's tile, the landmark / deck /
// reachability / soft-lock rules, determinism, ensurePlayerWalkable.
import assert from 'node:assert/strict';
import '../../src/content/index.js';
import { createCore } from '../../src/core/core.js';
import { defineSystem } from '../../src/core/system.js';
import { World } from '../../src/world/world.js';
import { T, WK } from '../../src/world/kinds.js';
import { applyEdit, changedTiles, rectTiles, EDIT_NEEDS, clearTiles } from '../../src/world/edit.js';
import { reach } from '../../src/world/pathfind.js';
import { LANDMARKS, HOME } from '../../src/content/base/landmarks.js';
import props from '../../src/systems/props.js';
import player from '../../src/systems/player.js';
import farming from '../../src/systems/farming.js';
import daily from '../../src/systems/daily.js';
import terrainrules from '../../src/systems/terrainrules.js';
import { LEGACY_OFF as O } from '../../src/world/coords.js';

const NOW = Date.UTC(2026, 0, 15, 12);

function boot({ world = new World(), extra = [], rules = true } = {}) {
  const core = createCore({ strict: true, now: () => NOW, mono: () => 0 });
  core.provide('world', world);
  core.boot([props, player, farming, daily, ...(rules ? [terrainrules] : []), ...extra]);
  const log = [];
  core.bus.onAny((p, m) => log.push([m.name, p]));
  const names = () => log.splice(0).map(([n, p]) => (n === 'terraform' ? `terraform:${p.x},${p.z}` : n === 'invalidate' ? `inv:${p.what}` : n === 'remove' ? `remove:${p.prop}:${p.to}`
    : n === 'itemGain' ? `gain:${p.item}` : n === 'waterChange' ? `water:${p.rect.x},${p.rect.z},${p.rect.w},${p.rect.h}` : n));
  return { core, world, log, names, pr: core.use('props'), pl: core.use('player'), f: core.use('farming'), d: core.use('daily'), tr: rules ? core.use('terrainrules') : null };
}

const raise = (x, z, over = {}) => ({ kind: 'raise', x, z, from: { height: 0 }, to: { height: 1 }, by: 'project', ...over });
const dig = (x, z, over = {}) => ({ kind: 'dig', x, z, from: {}, to: { kind: T.WATER, water: WK.POND }, by: 'project', ...over });
const stand = (b, x, z) => b.pl.warp(x + 0.5, z + 0.5);
const snapshot = (b) => JSON.stringify({ kind: [...b.world.kind], height: [...b.world.height], water: [...b.world.water], props: b.pr.serialize(), crops: [...b.f.farm], wet: [...b.f.wetSoil], inv: b.core.inv.serialize(), at: [b.pl.state.pos.x, b.pl.state.pos.z] });

/** A world that is all sea (or `fill`), with land tiles painted in; HOME is land. */
function islet(land = [], { fill = WK.SEA, extra = [] } = {}) {
  const world = new World({ generate: false });
  for (let z = 0; z < world.h; z++) for (let x = 0; x < world.w; x++) world.setWater(x, z, fill);
  const put = (x, z, kind = T.GRASS) => { world.setKind(x, z, kind); world.setWater(x, z, WK.NONE); };
  for (const [x, z, kind] of [[HOME.x, HOME.z, T.PATH], ...land, ...extra]) put(x, z, kind);
  return world;
}
const pond = (world, x, z, wk = WK.POND) => { world.setKind(x, z, T.WATER); world.setWater(x, z, wk); };

function flood() {
  // 8 moves, no corner cutting, `step` judges each move, an unwalkable start reaches nothing, the limit stops the fill
  const open = (x, z) => x >= 0 && z >= 0 && x < 5 && z < 5 && !(x === 2 && z < 4) && !(x === 3 && z === 4);
  const seen = reach({ x: 0, z: 0 }, open, 5, 5);
  assert.deepEqual([seen[0], seen[4 * 5 + 4], seen[0 * 5 + 2], seen[4 * 5 + 2]], [1, 0, 0, 1]);
  assert.equal(reach({ x: 2, z: 0 }, open, 5, 5).reduce((a, b) => a + b, 0), 0);
  assert.equal(reach({ x: 0, z: 0 }, open, 5, 5, (x0, z0, x1) => x1 < 1).reduce((a, b) => a + b, 0), 5, 'a step rule can wall off a column');
  assert.ok(reach({ x: 0, z: 0 }, () => true, 5, 5, null, 3).reduce((a, b) => a + b, 0) < 25);
}

function validation() {
  const b = boot();
  const ok = applyEdit(b.core, raise(14 + O, 22 + O));
  assert.deepEqual([ok.ok, ok.changed, b.world.heightAt(14 + O, 22 + O)], [true, [{ x: 14 + O, z: 22 + O }], 1]);

  // a stale `from` fails and changes nothing
  b.names();
  const before = snapshot(b);
  const stale = applyEdit(b.core, raise(14 + O, 22 + O));
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /changed/);
  assert.deepEqual([stale.changed, stale.bagged, stale.lost, stale.moved], [[], {}, [], {}]);
  assert.equal(snapshot(b), before);
  assert.deepEqual(b.names(), []);
  assert.equal(applyEdit(b.core, { ...raise(14 + O, 22 + O), from: { kind: T.PATH } }).ok, false, 'any field of from counts');
  assert.equal(applyEdit(b.core, { ...raise(14 + O, 22 + O), from: { height: 1 }, to: { height: 2 } }).ok, true);

  // outside the world, and edits that are not edits
  assert.match(applyEdit(b.core, { ...raise(63, 63), w: 2 }).reason, /beyond/);
  assert.equal(applyEdit(b.core, raise(-1, 3)).ok, false);
  assert.throws(() => applyEdit(b.core, { ...raise(3, 3), kind: 'melt' }), /edit.kind/);
  assert.throws(() => applyEdit(b.core, { ...raise(3, 3), by: 'cat' }), /edit.by/);
  assert.throws(() => applyEdit(b.core, { ...raise(3, 3), to: { height: 9 } }), /edit.to.height/);
  assert.throws(() => applyEdit(b.core, { ...raise(3, 3), extra: 1 }), /extra/);
  assert.throws(() => applyEdit(b.core, { ...raise(3, 3), w: 0 }), /edit.w/);

  // nothing to change: ok, no events
  b.names();
  const noop = applyEdit(b.core, { ...raise(15 + O, 22 + O), to: { height: 0 } });
  assert.deepEqual([noop.ok, noop.changed], [true, []]);
  assert.deepEqual(b.names(), []);

  // a partial `to` leaves the other fields alone; a rect changes every tile
  const rect = applyEdit(b.core, { kind: 'pave', x: 15 + O, z: 23 + O, w: 2, h: 2, from: { kind: T.GRASS }, to: { kind: T.GRAVEL }, by: 'player' });
  assert.equal(rect.changed.length, 4);
  assert.deepEqual([[15 + O, 23 + O], [16 + O, 24 + O]].map(([x, z]) => [b.world.kindAt(x, z), b.world.heightAt(x, z)]), [[T.GRAVEL, 0], [T.GRAVEL, 0]]);
  assert.deepEqual(changedTiles(b.world, { x: 15 + O, z: 23 + O, w: 2, h: 2, to: { kind: T.GRAVEL } }), [], 'already done');
}

function atomic() {
  // the second tile of the rect is under the shrine's footprint: nothing at all happens
  const b = boot();
  const L = LANDMARKS.shrine;
  const crate = b.pr.add('crate', L.x - 1, L.z);
  b.names();
  const before = snapshot(b);
  const res = applyEdit(b.core, { ...raise(L.x - 1, L.z), w: 2 });
  assert.equal(res.ok, false);
  assert.match(res.reason, /shrine/);
  assert.equal(snapshot(b), before);
  assert.deepEqual(b.names(), []);
  assert.ok(b.pr.get(crate.id), 'the crate on the first tile was not bagged');
  assert.equal(b.core.inv.count('prop_crate'), 0);

  // the same through dryRun
  assert.equal(applyEdit(b.core, { ...raise(L.x - 1, L.z), w: 2 }, { dryRun: true }).ok, false);
}

function guards() {
  const b = boot({ rules: false });
  const seen = [];
  b.core.guards.add('terraform', (e) => { seen.push(['terraform', e]); return e.x === 3 ? 'No raising at 3.' : null; });
  b.core.guards.add('dig', (e) => { seen.push(['dig', e.kind]); return null; });
  b.core.guards.add('reclaim', (e) => { seen.push(['reclaim', e.kind]); return null; });
  const res = applyEdit(b.core, raise(14 + O, 22 + O));
  assert.equal(res.ok, true);
  assert.deepEqual(seen[0][1], { ...raise(14 + O, 22 + O), w: 1, h: 1 }, 'a guard gets the edit itself, defaults filled, once per edit');
  assert.equal(seen.length, 1);
  assert.deepEqual(applyEdit(b.core, { ...raise(3, 22), w: 2 }), { ok: false, reason: 'No raising at 3.', changed: [], bagged: {}, lost: [], moved: {} });
  seen.length = 0;
  applyEdit(b.core, { kind: 'fill', x: 12 + O, z: 12 + O, from: {}, to: { kind: T.GRASS, water: 0 }, by: 'system' });
  applyEdit(b.core, { kind: 'reclaim', x: 15 + O, z: 22 + O, from: {}, to: { kind: T.PATH }, by: 'system' });
  applyEdit(b.core, { kind: 'lower', x: 16 + O, z: 22 + O, from: {}, to: { height: 0, kind: T.PATH }, by: 'system' });
  applyEdit(b.core, { kind: 'patch', x: 17 + O, z: 24 + O, from: {}, to: { kind: T.PATH }, by: 'project', project: 'ume_house' });
  assert.deepEqual(seen.map((s) => s[0]), ['dig', 'reclaim', 'terraform', 'terraform']);

  // a system reaches applyEdit through its own ctx: it must list what the edit uses
  let ctx;
  const probe = defineSystem({ name: 'probe', needs: [...EDIT_NEEDS], init(c) { ctx = c; } });
  const lazy = defineSystem({ name: 'lazy', needs: ['props'], init() {} });
  const c2 = boot({ extra: [probe] });
  assert.equal(applyEdit(ctx, raise(14 + O, 22 + O)).ok, true);
  assert.equal(c2.world.heightAt(14 + O, 22 + O), 1);
  let ctx2;
  const c3 = boot({ extra: [defineSystem({ name: 'tight', needs: ['props'], init(c) { ctx2 = c; } }), lazy] });
  assert.throws(() => applyEdit(ctx2, raise(14 + O, 22 + O)), /does not list it in needs/);
  assert.equal(c3.world.heightAt(14 + O, 22 + O), 0);
}

function cleanup() {
  const b = boot();
  const now = b.core.now();
  const at = (x, z) => z * b.world.w + x;
  // two crates (one tile each), a minka (several tiles, touched on one), a crop with wet soil, a wet empty tile, forage
  const c1 = b.pr.add('crate', 14 + O, 22 + O), c2 = b.pr.add('crate', 15 + O, 22 + O);
  const house = b.pr.add('minka', 10 + O, 25 + O);
  const [hx, hz] = [house.cells[0].x, house.cells[0].z];
  b.f.farm.set(at(14 + O, 23 + O), { type: 'rice', x: 14 + O, z: 23 + O, progress: 1, last: now, wet: true });
  b.f.wetSoil.set(at(15 + O, 23 + O), now + 1e6);
  b.world.setKind(14 + O, 23 + O, T.SOIL); b.world.setKind(15 + O, 23 + O, T.SOIL);
  b.d.state = { key: 'k', requests: [], forage: [{ x: 16 + O, z: 23 + O, item: 'wildflower', taken: false }, { x: 17 + O, z: 20 + O, item: 'warabi', taken: false }, { x: 16 + O, z: 22 + O, item: 'warabi', taken: true }] };
  b.core.inv.give('seed_rice', 0);
  b.names();

  const edit = { kind: 'raise', x: 14 + O, z: 22 + O, w: 3, h: 2, from: { height: 0 }, to: { height: 1 }, by: 'project' };
  const before = snapshot(b);
  const dry = applyEdit(b.core, edit, { dryRun: true });
  assert.deepEqual([dry.ok, dry.bagged, dry.lost, dry.changed.length], [true, { prop_crate: 2, seed_rice: 1 }, [{ what: 'forage', item: 'wildflower', x: 16 + O, z: 23 + O }], 6]);
  assert.equal(snapshot(b), before, 'dryRun changes nothing');
  assert.deepEqual(b.names(), [], 'and says nothing');
  assert.equal(b.d.state.forage[0].taken, false);

  const res = applyEdit(b.core, edit);
  assert.deepEqual([res.ok, res.bagged, res.lost, res.changed.length], [dry.ok, dry.bagged, dry.lost, 6], 'what dryRun reported is what happened');
  assert.deepEqual([b.pr.get(c1.id), b.pr.get(c2.id)], [null, null]);
  assert.deepEqual([b.core.inv.count('prop_crate'), b.core.inv.count('seed_rice')], [2, 1]);
  assert.deepEqual([b.f.crop(14 + O, 23 + O), b.f.wetSoil.size, b.f.farm.size], [undefined, 0, 0]);
  assert.deepEqual(b.d.state.forage.map((f) => f.taken), [true, false, true]);
  assert.deepEqual(rectTiles({ x: 14 + O, z: 22 + O, w: 3, h: 2 }).map((t) => b.world.heightAt(t.x, t.z)), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual([b.world.kindAt(14 + O, 23 + O), b.world.kindAt(15 + O, 23 + O)], [T.SOIL, T.SOIL], 'the ground keeps its kind unless the edit says so');
  const out = b.names();
  assert.deepEqual(out.filter((e) => e.startsWith('remove')), ['remove:crate:bag', 'remove:crate:bag']);
  assert.deepEqual(out.filter((e) => e.startsWith('terraform')), [`terraform:${14 + O},${22 + O}`, `terraform:${15 + O},${22 + O}`, `terraform:${16 + O},${22 + O}`, `terraform:${14 + O},${23 + O}`, `terraform:${15 + O},${23 + O}`, `terraform:${16 + O},${23 + O}`]);
  assert.deepEqual(out.slice(-3), ['inv:terrain', 'inv:veg', 'inv:crops']);
  assert.ok(out.indexOf('remove:crate:bag') < out.indexOf(`terraform:${14 + O},${22 + O}`), 'the cleanup comes before the change');

  // a prop that is only touched on one of its tiles goes whole and frees the others
  assert.ok(b.pr.get(house.id));
  const touch = applyEdit(b.core, { ...raise(hx, hz), from: {}, to: { height: 2 } });
  assert.equal(touch.ok, true);
  assert.deepEqual([b.pr.get(house.id), touch.bagged], [null, { prop_minka: 1 }]);
  assert.ok(house.cells.every((c) => !b.pr.at(c.x, c.z) && !b.pr.isBlocked(c.x, c.z)), 'every tile of the house is free');
  assert.equal(b.core.inv.count('prop_minka'), 1);

  // clearTiles on its own (what the shrine uses): tilled soil goes back to grass
  b.f.farm.set(at(15 + O, 23 + O), { type: 'daikon', x: 15 + O, z: 23 + O, progress: 0, last: now, wet: false });
  const cl = clearTiles(b.core, [{ x: 15 + O, z: 23 + O }], { soilToGrass: true });
  assert.deepEqual([cl.bagged, b.world.kindAt(15 + O, 23 + O), b.core.inv.count('seed_daikon')], [{ seed_daikon: 1 }, T.GRASS, 1]);
}

function fixedProps() {
  // without the terrain rules the stall is not bagged; with them the edit is refused outright
  const free = boot({ rules: false });
  const stall = free.pr.add('stall', 19 + O, 18 + O);
  const [sx, sz] = [stall.cells[0].x, stall.cells[0].z];
  const res = applyEdit(free.core, raise(sx, sz));
  assert.deepEqual([res.ok, res.bagged, !!free.pr.get(stall.id), free.core.inv.count('prop_stall')], [true, {}, true, 0]);
  const rules = boot();
  const s2 = rules.pr.add('stall', 19 + O, 18 + O);
  assert.match(applyEdit(rules.core, raise(s2.cells[0].x, s2.cells[0].z)).reason, /not yours/);
}

function events() {
  const b = boot();
  const hooked = [];
  const off = b.world.registerDerived((w, r) => hooked.push(r));
  b.names();
  const res = applyEdit(b.core, { kind: 'dig', x: 9 + O, z: 24 + O, w: 2, h: 1, from: { kind: T.GRASS }, to: { kind: T.WATER, water: WK.POND }, by: 'player' });
  assert.equal(res.ok, true);
  assert.deepEqual(b.names(), [`terraform:${9 + O},${24 + O}`, `terraform:${10 + O},${24 + O}`, `water:${9 + O},${24 + O},2,1`, 'inv:terrain', 'inv:veg', 'inv:crops']);
  assert.deepEqual(hooked, [{ x: 9 + O, z: 24 + O, w: 2, h: 1 }], 'derived arrays are refreshed once per edit');
  assert.deepEqual([b.world.isFresh(9 + O, 24 + O), b.world.wet[(24 + O) * 64 + 11 + O], b.world.wet[(25 + O) * 64 + 9 + O]], [true, 1, 1], 'fresh and wet follow');
  assert.ok(b.world.takeDirty().length > 0);
  off();

  // per tile payloads
  const seen = [];
  b.core.bus.on('terraform', (p) => seen.push(p));
  applyEdit(b.core, { kind: 'pave', x: 20 + O, z: 25 + O, from: {}, to: { kind: T.GRAVEL }, by: 'system' });
  assert.deepEqual(seen, [{ x: 20 + O, z: 25 + O, from: { kind: T.PATH, height: 0, water: 0 }, to: { kind: T.GRAVEL, height: 0, water: 0 }, kind: 'pave', by: 'system' }]);
  // no water change, no waterChange
  assert.ok(!b.names().some((e) => e.startsWith('water')));
}

function playerTile() {
  const b = boot();
  stand(b, 14 + O, 22 + O);
  const before = snapshot(b);
  const res = applyEdit(b.core, raise(14 + O, 22 + O, { by: 'player' }));
  assert.deepEqual([res.ok, res.reason], [false, 'You are standing there.']);
  assert.equal(snapshot(b), before);
  // the rect only needs to cover the tile if the tile changes
  assert.equal(applyEdit(b.core, { ...raise(13 + O, 22 + O, { by: 'player' }), w: 3, to: { height: 0 } }).ok, true);
  assert.equal(applyEdit(b.core, raise(15 + O, 22 + O, { by: 'player' })).ok, true, 'a tile next to it is fine');

  // a project or system edit moves the player to the nearest tile that stays walkable
  for (const by of ['project', 'system']) {
    const c = boot();
    stand(c, 14 + O, 22 + O);
    const dry = applyEdit(c.core, { ...raise(14 + O, 22 + O, { by }), w: 2, h: 2 }, { dryRun: true });
    assert.equal(c.pl.cell().x, 14 + O, 'dryRun does not move them');
    const res2 = applyEdit(c.core, { ...raise(14 + O, 22 + O, { by }), w: 2, h: 2 });
    assert.deepEqual(dry.moved, res2.moved);
    const m = res2.moved.player;
    assert.ok(m && (m.x < 14 + O || m.x > 15 + O || m.z < 22 + O || m.z > 23 + O), 'outside the rect');
    assert.deepEqual([c.pl.cell().x, c.pl.cell().z], [m.x, m.z]);
    assert.ok(c.pl.canStand());
    assert.deepEqual([m.x, m.z], [14 + O, 21 + O], 'the nearest, and of equals the first row by row');
  }

  // a tile that stops being land: the player does not end up in the water
  const w = boot();
  stand(w, 9 + O, 24 + O);
  const r = applyEdit(w.core, dig(9 + O, 24 + O, { to: { kind: T.WATER, water: WK.POND } }));
  assert.equal(r.ok, true);
  assert.ok(w.pl.canStand() && w.world.isLand(w.pl.cell().x, w.pl.cell().z));

  // away from the rect: nobody moves
  const e = boot();
  stand(e, 20 + O, 26 + O);
  assert.deepEqual(applyEdit(e.core, raise(14 + O, 22 + O)).moved, {});
  assert.deepEqual([e.pl.cell().x, e.pl.cell().z], [20 + O, 26 + O]);

  // a project patch over the player's belongings: props to the bag, the crop's seed back, the player steps aside
  const p = boot();
  p.pr.add('toro', 14 + O, 22 + O);
  p.f.farm.set((23 + O) * 64 + 14 + O, { type: 'tea', x: 14 + O, z: 23 + O, progress: 0, last: p.core.now(), wet: false });
  stand(p, 15 + O, 23 + O);
  const patch = applyEdit(p.core, { kind: 'patch', x: 14 + O, z: 22 + O, w: 2, h: 2, from: {}, to: { kind: T.PLAZA }, by: 'project', project: 'ume_house' });
  assert.deepEqual([patch.ok, patch.bagged, !!patch.moved.player], [true, { prop_toro: 1, seed_tea: 1 }, true]);
  assert.deepEqual([p.world.kindAt(14 + O, 22 + O), p.world.kindAt(15 + O, 23 + O)], [T.PLAZA, T.PLAZA]);
  assert.equal(p.core.inv.count('prop_toro'), 1);
}

function landmarksAndDecks() {
  const b = boot();
  const L = LANDMARKS;
  // the footprint is reserved before the landmark prop exists, and whatever the kind of edit
  for (const [type, at] of [['shrine', L.shrine], ['shrine_old', L.shrine], ['stone', L.stone], ['pier', L.pier]]) {
    const cells = b.pr.cells(type, at.x, at.z, 0).cells;
    assert.ok(cells.length >= 1);
    for (const c of cells) {
      for (const e of [raise(c.x, c.z), dig(c.x, c.z), { kind: 'reclaim', x: c.x, z: c.z, from: {}, to: { kind: T.SAND, water: 0 }, by: 'player' }]) {
        const res = applyEdit(b.core, e);
        assert.equal(res.ok, false, `${type} ${JSON.stringify(e)}`);
        assert.match(res.reason, /shrine/);
      }
    }
  }
  b.pr.add('shrine_old', L.shrine.x, L.shrine.z);
  assert.equal(applyEdit(b.core, raise(L.shrine.x + 1, L.shrine.z + 1)).ok, false);
  assert.equal(applyEdit(b.core, raise(L.shrine.x + 2, L.shrine.z)).ok, true, 'beside it is fine');

  // a bridge deck: its ends and the water it spans
  const br = b.pr.add('bridge', 25 + O, 15 + O, 0);
  assert.deepEqual(br.cells.map((c) => c.z), [14 + O, 15 + O, 16 + O, 17 + O]);
  for (const z of [14 + O, 15 + O, 16 + O, 17 + O]) assert.match(applyEdit(b.core, raise(25 + O, z, { from: {} })).reason, /bridge/);
  const fill = { kind: 'fill', x: 25 + O, z: 15 + O, from: { water: WK.STREAM }, to: { kind: T.GRASS, water: WK.NONE }, by: 'player' };
  assert.equal(b.world.waterKind(25 + O, 15 + O), WK.STREAM);
  assert.match(applyEdit(b.core, fill).reason, /bridge/, 'no fill of the water a deck spans');
  assert.equal(applyEdit(b.core, { ...fill, x: 26 + O }).ok, true, 'beside the deck it can be filled');
}

/** Digs across the west neck of the village: x 8..9 at z 13 is the only way round the pond to the north without a bridge. */
const NECK = { kind: 'dig', x: 8 + O, z: 13 + O, w: 2, h: 1, from: { height: 0 }, to: { kind: T.WATER, water: WK.POND }, by: 'project' };

function reachability() {
  const b = boot();
  const L = LANDMARKS;
  b.pr.add('stall', 19 + O, 18 + O);
  b.pr.add('shrine_old', L.shrine.x, L.shrine.z);
  const names = b.tr.anchors().map((a) => a.name);
  assert.deepEqual(names, ['home', 'the stall', 'the shrine']);
  const open = reach(HOME, (x, z) => b.pl.walkable(x, z), 64, 64, (a, c, d, e) => b.world.canStep(a, c, d, e));
  assert.equal(open[(L.shrine.z + 2) * 64 + L.shrine.x], 1, 'the shrine can be reached today, the long way round');

  const before = snapshot(b);
  const cut = applyEdit(b.core, NECK);
  assert.deepEqual([cut.ok, cut.reason], [false, 'That would cut the path to the shrine.']);
  assert.equal(snapshot(b), before);
  assert.equal(applyEdit(b.core, { ...NECK, kind: 'lower', from: {}, to: { height: 0, kind: T.WATER, water: WK.POND } }, { dryRun: true }).ok, false, 'dryRun gives the same answer');
  // raising the whole neck cuts it too: one level up is a wall without stairs; one tile of the two is fine
  assert.equal(applyEdit(b.core, { ...NECK, kind: 'raise', to: { height: 1 } }).reason, 'That would cut the path to the shrine.');
  assert.equal(applyEdit(b.core, { ...NECK, kind: 'raise', to: { height: 1 }, w: 1 }).ok, true);
  assert.equal(b.world.heightAt(8 + O, 13 + O), 1);
  assert.equal(applyEdit(b.core, { ...NECK, x: 9 + O, w: 1, kind: 'raise', to: { height: 1 } }).ok, false, 'the second would close it');
}

function reachabilityTwoWays() {
  // a bridge is a second way across: with it the neck can go
  const b = boot();
  b.pr.add('shrine_old', LANDMARKS.shrine.x, LANDMARKS.shrine.z);
  b.pr.add('bridge', 25 + O, 15 + O, 0);
  assert.equal(applyEdit(b.core, NECK).ok, true);
  assert.equal(b.world.isWater(8 + O, 13 + O), true);
  // a village that is already cut in two does not make every edit impossible
  const c = boot();
  c.pr.add('shrine_old', LANDMARKS.shrine.x, LANDMARKS.shrine.z);
  assert.equal(applyEdit(c.core, NECK).ok, false);
  const cut = boot();
  cut.pr.add('shrine_old', LANDMARKS.shrine.x, LANDMARKS.shrine.z);
  cut.world.load({ ...cut.world.serialize() }); // same arrays
  for (const [x, z] of [[8 + O, 13 + O], [9 + O, 13 + O]]) { cut.world.setKind(x, z, T.WATER); cut.world.setWater(x, z, WK.POND); }
  assert.equal(applyEdit(cut.core, raise(14 + O, 22 + O)).ok, true, 'nothing left to lose up there');
  assert.equal(applyEdit(cut.core, { kind: 'raise', x: 12 + O, z: 8 + O, from: {}, to: { height: 1 }, by: 'system' }).ok, true, 'and the north can be edited');

  // other systems add what must stay reachable
  const d = boot();
  const off = d.tr.addAnchors(() => [{ name: 'Ume’s door', x: 14 + O, z: 10 + O }]);
  assert.deepEqual(d.tr.anchors().map((a) => a.name), ['home', 'Ume’s door']);
  assert.equal(applyEdit(d.core, NECK).reason, 'That would cut the path to Ume’s door.');
  off();
  assert.equal(applyEdit(d.core, NECK).ok, true);
}

function homeAndStall() {
  // the home tile itself must stay walkable
  const h = boot();
  assert.equal(applyEdit(h.core, dig(HOME.x, HOME.z)).reason, 'That would cut the path to home.');
  assert.equal(h.world.isLand(HOME.x, HOME.z), true);

  // the stall counts when anyone can stand next to Hana's spot: a one-tile corridor leads to it
  const b = boot({ world: islet([]) });
  for (const [x, z] of [[18 + O, 23 + O], [19 + O, 23 + O], [20 + O, 23 + O], [21 + O, 23 + O], [21 + O, 22 + O], [22 + O, 22 + O], [23 + O, 22 + O], [24 + O, 22 + O]]) { b.world.setKind(x, z, T.GRASS); b.world.setWater(x, z, WK.NONE); }
  b.pr.add('stall', 22 + O, 23 + O);
  assert.deepEqual(b.tr.anchors().map((a) => [a.name, a.x, a.z, a.adjacent]), [['home', HOME.x, HOME.z, false], ['the stall', 24 + O, 23 + O, true]]);
  for (const e of [dig(19 + O, 23 + O), raise(19 + O, 23 + O, { from: {} }), dig(23 + O, 22 + O)]) assert.equal(applyEdit(b.core, e).reason, 'That would cut the path to the stall.', JSON.stringify(e));
  assert.equal(applyEdit(b.core, dig(18 + O, 23 + O)).ok, false, 'the corridor starts at home');
  assert.equal(applyEdit(b.core, raise(24 + O, 22 + O)).ok, true, '(23,22) already stands beside Hana, the last tile is a spare');
}

function softLocks() {
  // the last reachable fresh water
  const fresh = (extra = []) => {
    const world = islet([[HOME.x + 1, HOME.z, T.GRASS], [HOME.x - 1, HOME.z, T.PATH]]);
    pond(world, HOME.x, HOME.z + 1);
    for (const [x, z] of extra) pond(world, x, z);
    return boot({ world });
  };
  const fill = (x, z, from) => ({ kind: 'fill', x, z, from, to: { kind: T.GRASS, water: WK.NONE }, by: 'project' });
  let b = fresh();
  assert.equal(b.world.isFresh(HOME.x, HOME.z + 1), true);
  assert.equal(applyEdit(b.core, fill(HOME.x, HOME.z + 1, { water: WK.POND })).reason, 'That would leave no fresh water to fish in.');
  assert.equal(b.world.isFresh(HOME.x, HOME.z + 1), true);
  // water that nobody can reach does not count as a spare
  b = fresh([[HOME.x + 8, HOME.z + 8]]);
  assert.equal(applyEdit(b.core, fill(HOME.x, HOME.z + 1, { water: WK.POND })).ok, false);
  // a second reachable one does
  b = fresh([[HOME.x + 1, HOME.z + 1]]);
  assert.equal(applyEdit(b.core, fill(HOME.x, HOME.z + 1, { water: WK.POND })).ok, true);
  assert.equal(applyEdit(b.core, fill(HOME.x + 1, HOME.z + 1, { water: WK.POND })).ok, false, 'but not both, one after the other');

  // the last reachable sea shore: the islet sits in a pond-filled world with one sea tile beside it
  const shore = () => {
    const world = islet([[HOME.x + 1, HOME.z, T.GRASS]], { fill: WK.POND });
    world.setWater(HOME.x + 2, HOME.z, WK.SEA);
    return boot({ world });
  };
  b = shore();
  assert.equal(applyEdit(b.core, fill(HOME.x + 2, HOME.z, { water: WK.SEA })).reason, 'That would leave no shore to fish the sea from.');
  assert.equal(applyEdit(b.core, fill(HOME.x + 3, HOME.z, { water: WK.POND })).ok, true, 'the pond is not the sea');

  // the last reachable tillable tile (paving it over, or flooding it)
  const soil = () => boot({ world: islet([[HOME.x + 1, HOME.z, T.GRASS]]) });
  b = soil();
  assert.equal(applyEdit(b.core, { kind: 'pave', x: HOME.x + 1, z: HOME.z, from: {}, to: { kind: T.GRAVEL }, by: 'player' }).reason, 'That would leave no soil to till.');
  assert.equal(applyEdit(b.core, dig(HOME.x + 1, HOME.z)).reason, 'That would leave no soil to till.');
  // a prop on the tile does not make it tillable
  b = soil();
  b.pr.add('crate', HOME.x + 1, HOME.z);
  assert.equal(b.world.kindAt(HOME.x + 1, HOME.z), T.GRASS);
  assert.equal(applyEdit(b.core, { kind: 'pave', x: HOME.x + 1, z: HOME.z, from: {}, to: { kind: T.GRAVEL }, by: 'player' }).ok, true, 'there was no soil to lose');
  // soil, sand and tilled soil all count; a second one frees the first
  b = boot({ world: islet([[HOME.x + 1, HOME.z, T.GRASS], [HOME.x - 1, HOME.z, T.SAND]]) });
  assert.equal(applyEdit(b.core, { kind: 'pave', x: HOME.x + 1, z: HOME.z, from: {}, to: { kind: T.GRAVEL }, by: 'player' }).ok, true);
  assert.equal(applyEdit(b.core, { kind: 'pave', x: HOME.x - 1, z: HOME.z, from: {}, to: { kind: T.GRAVEL }, by: 'player' }).ok, false);
  // an edit that adds soil while taking soil away is fine
  b = soil();
  assert.equal(applyEdit(b.core, { kind: 'pave', x: HOME.x + 1, z: HOME.z, from: {}, to: { kind: T.SOIL }, by: 'player' }).ok, true);
}

function determinism() {
  const run = () => {
    const b = boot();
    b.pr.add('crate', 14 + O, 22 + O); b.pr.add('toro', 16 + O, 22 + O);
    b.f.farm.set((23 + O) * 64 + 15 + O, { type: 'rice', x: 15 + O, z: 23 + O, progress: 0, last: b.core.now(), wet: false });
    stand(b, 15 + O, 22 + O);
    const out = [applyEdit(b.core, { kind: 'raise', x: 14 + O, z: 22 + O, w: 3, h: 2, from: {}, to: { height: 1 }, by: 'system' }, { dryRun: true }),
      applyEdit(b.core, { kind: 'raise', x: 14 + O, z: 22 + O, w: 3, h: 2, from: {}, to: { height: 1 }, by: 'system' }),
      applyEdit(b.core, NECK)];
    return JSON.stringify([out, snapshot(b), b.log.map(([n, p]) => [n, p])]);
  };
  assert.equal(run(), run());
}

function ensureWalkable() {
  const b = boot();
  assert.equal(b.pl.ensureWalkable(), null, 'the start is fine');
  assert.deepEqual([b.pl.state.pos.x, b.pl.state.pos.z], [17.5 + O, 22.5 + O]);

  // in the sea, in a house: the nearest tile that can be walked and reached from home
  stand(b, 5 + O, 5 + O);
  assert.equal(b.pl.canStand(), false);
  const wet = b.pl.ensureWalkable();
  assert.ok(wet && b.pl.canStand() && b.world.isLand(wet.x, wet.z));
  assert.ok(Math.hypot(wet.x + 0.5 - 5.5 - O, wet.z + 0.5 - 5.5 - O) < 8, 'the nearest land, not home');
  const h = b.pr.add('minka', 10 + O, 25 + O);
  b.pl.warp(h.cx, h.cz);
  assert.equal(b.pl.canStand(), false);
  const moved = b.pl.ensureWalkable();
  assert.ok(moved && b.pl.canStand());
  assert.ok(Math.hypot(moved.x + 0.5 - h.cx, moved.z + 0.5 - h.cz) < 4, 'close by');

  // walkable but cut off from home (an islet): home it is, or the nearest tile on the home side
  const world = islet([[HOME.x + 1, HOME.z, T.GRASS], [HOME.x + 6, HOME.z, T.GRASS], [HOME.x + 7, HOME.z, T.GRASS]]);
  const c = boot({ world });
  stand(c, HOME.x + 7, HOME.z);
  assert.equal(c.pl.canStand(), true);
  assert.deepEqual(c.pl.ensureWalkable(), { x: HOME.x + 1, z: HOME.z });
  assert.deepEqual([c.pl.cell().x, c.pl.cell().z], [HOME.x + 1, HOME.z]);

  // start() does it after a load: core.start runs the system's start
  const d = boot();
  stand(d, 3, 3);
  assert.equal(d.pl.canStand(), false);
  d.core.start();
  assert.equal(d.pl.canStand(), true);
  assert.ok(d.pl.cell().x > 5);
  const e = boot();
  stand(e, 18 + O, 22 + O);
  e.core.start({ fresh: true });
  assert.deepEqual([e.pl.state.pos.x, e.pl.state.pos.z], [18.5 + O, 22.5 + O], 'a good spot is left alone');
}

export default function () {
  flood();
  validation();
  atomic();
  guards();
  cleanup();
  fixedProps();
  events();
  playerTile();
  landmarksAndDecks();
  reachability();
  reachabilityTwoWays();
  homeAndStall();
  softLocks();
  determinism();
  ensureWalkable();
}

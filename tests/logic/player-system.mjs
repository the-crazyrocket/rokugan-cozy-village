// The player system in a strict core: walkable tiles (props, bridges, other blockers), the position helpers, walking to a tile, the
// per-frame move, its events (playerMove each frame while moving, arrive once) and the place guard.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import player from '../../src/systems/player.js';
import props from '../../src/systems/props.js';
import { createCore } from '../../src/core/core.js';
import { World } from '../../src/game/world.js';
import { LEGACY_OFF as O } from '../../src/world/coords.js';

function boot() {
  const world = new World();
  const core = createCore({ strict: true, now: () => 1e12, mono: () => 0 });
  core.provide('world', world);
  core.provide('groundY', () => 0.5);
  core.boot([props, player]);
  const log = [];
  core.bus.onAny((p, m) => log.push([m.name, p]));
  return { core, world, log, pl: core.use('player'), pr: core.use('props'), st: core.use('player').state };
}
const names = (log) => log.splice(0).map(([n, p]) => (n === 'say' ? `say:${p.text}` : n === 'playerMove' ? `move:${p.manual}` : n));
const stand = (b, x, z) => b.st.pos.set(x + 0.5, 0, z + 0.5);

/** A land tile with open land for `n` tiles to the west and water east of it. */
function shore(world, n = 3) {
  for (let z = 2; z < world.h - 2; z++) for (let x = n + 1; x < world.w - 2; x++) {
    if (Array.from({ length: n + 1 }, (_, k) => world.isLand(x - k, z)).every(Boolean) && world.isWater(x + 1, z) && world.isLand(x - 1, z - 1) && world.isLand(x - 1, z + 1)) return { x, z };
  }
  throw new Error('no shore');
}

function state() {
  const b = boot();
  assert.equal(b.core.systems.get('player').spec.needs.join(), 'props');
  assert.ok(b.st.pos instanceof THREE.Vector3);
  assert.deepEqual([b.st.pos.x, b.st.pos.y, b.st.pos.z], [17.5 + O, 0, 22.5 + O]);
  assert.deepEqual({ ...b.st, pos: null }, { pos: null, facing: Math.PI * 0.25, path: null, pending: null, swing: 0, swingT: 0, moving: false });
  assert.equal(b.pl.state, b.st);
  assert.deepEqual(b.pl.cell(), { x: 17 + O, z: 22 + O });
  assert.deepEqual(b.pl.playerCell(), { x: 17 + O, z: 22 + O });
  b.pl.warp(3.2, 4.9);
  assert.deepEqual([b.st.pos.x, b.st.pos.y, b.st.pos.z], [3.2, 0, 4.9]);
  // two cores, two players
  const other = boot();
  assert.notEqual(other.st, b.st);
  assert.equal(other.st.pos.x, 17.5 + O);
}

function facing() {
  const b = boot();
  stand(b, 10 + O, 10 + O);
  for (const [a, dir, tile] of [
    [0, { x: 0, z: 1 }, { x: 10 + O, z: 11 + O }],
    [Math.PI / 2, { x: 1, z: 0 }, { x: 11 + O, z: 10 + O }],
    [Math.PI, { x: 0, z: -1 }, { x: 10 + O, z: 9 + O }],
    [-Math.PI / 2, { x: -1, z: 0 }, { x: 9 + O, z: 10 + O }],
    [Math.PI / 4, null, { x: 11 + O, z: 11 + O }],
    [-Math.PI * 0.75, null, { x: 9 + O, z: 9 + O }],
  ]) {
    b.st.facing = a;
    const d = b.pl.facing();
    if (dir) { assert.ok(Math.abs(d.x - dir.x) < 1e-9 && Math.abs(d.z - dir.z) < 1e-9, `facing ${a}`); }
    assert.deepEqual(b.pl.target(), tile, `target at ${a}`);
  }
  // face(): the angle towards the middle of a tile; a tile under the feet changes nothing
  b.pl.face({ x: 14 + O, z: 10 + O });
  assert.ok(Math.abs(b.st.facing - Math.atan2(4, 0)) < 1e-9);
  b.pl.face({ x: 10 + O, z: 13 + O });
  assert.ok(Math.abs(b.st.facing - 0) < 1e-9);
  const keep = b.st.facing;
  b.pl.warp(10.5 + O, 10.5 + O);
  b.pl.face({ x: 10 + O, z: 10 + O });
  assert.equal(b.st.facing, keep);
}

function walkable() {
  const b = boot();
  const { world, pl, pr } = b;
  const s = shore(world);
  assert.ok(pl.walkable(s.x, s.z) && pl.walkable(s.x - 1, s.z));
  assert.equal(pl.walkable(s.x + 1, s.z), false, 'water');
  for (const [x, z] of [[-1, 5], [5, -1], [world.w, 5], [5, world.h]]) assert.equal(pl.walkable(x, z), false, `out of the world ${x},${z}`);

  // a blocking prop closes its tiles, a crate (block) too, a decoration without footprint block does not need to
  const open = { x: s.x - 2, z: s.z };
  assert.ok(pl.walkable(open.x, open.z));
  pr.add('well', open.x, open.z, 0);
  assert.equal(pl.walkable(open.x, open.z), false, 'a well');

  // a bridge is walkable over water
  const bridge = pr.add('bridge', 25 + O, 15 + O, 0);
  const deck = bridge.cells.filter((c) => pr.isBridge(c.x, c.z));
  assert.ok(deck.length >= 3);
  assert.ok(deck.every((c) => pl.walkable(c.x, c.z)), 'deck');
  assert.ok(deck.some((c) => world.isWater(c.x, c.z)), 'the bridge covers water');
  pr.remove(bridge);
  assert.ok(!pr.isBridge(deck[0].x, deck[0].z));

  // other blockers: block(fn) returns the way to take it back
  const free = { x: s.x - 1, z: s.z - 1 };
  assert.ok(pl.walkable(free.x, free.z));
  const off = pl.block((x, z) => x === free.x && z === free.z);
  assert.equal(pl.walkable(free.x, free.z), false);
  assert.ok(pl.walkable(free.x + 1, free.z));
  off(); off();
  assert.ok(pl.walkable(free.x, free.z));

  // the body is a ring of points: standing half on the water is not allowed, the middle of the last land tile is
  assert.ok(pl.walkablePos(s.x + 0.5, s.z + 0.5));
  assert.equal(pl.walkablePos(s.x + 1 - 0.1, s.z + 0.5), false, 'close to the water');
  assert.ok(pl.walkablePos(s.x + 1 - 0.3, s.z + 0.5), '0.3 from the edge is far enough');
  stand(b, s.x, s.z);
  assert.ok(pl.canStand());
  b.pl.warp(s.x + 1.5, s.z + 0.5);
  assert.equal(pl.canStand(), false);
}

function input() {
  const { pl } = boot();
  const k = (...c) => new Set(c);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const dir = (got, x, z, speed = 1) => assert.ok(near(got.x, x) && near(got.z, z) && got.speed === speed, JSON.stringify(got));
  assert.equal(pl.input(k(), null), null);
  assert.equal(pl.input(k('KeyX'), { x: 1, y: 0, m: 0 }), null, 'a stick at rest');
  dir(pl.input(k('KeyW'), null), -Math.SQRT1_2, -Math.SQRT1_2);
  dir(pl.input(k('ArrowRight'), null), Math.SQRT1_2, -Math.SQRT1_2);
  dir(pl.input(k('KeyS'), null), Math.SQRT1_2, Math.SQRT1_2);
  dir(pl.input(k('ArrowLeft'), null), -Math.SQRT1_2, Math.SQRT1_2);
  assert.equal(pl.input(k('KeyW', 'KeyS'), null), null, 'opposite keys cancel');
  const d = pl.input(k('KeyW', 'KeyD'), null);
  assert.ok(near(d.x, 0) && near(d.z, -1), 'W+D goes up-right on screen = -z');
  assert.equal(pl.input(k('KeyW'), { x: 1, y: 0, m: 1 }).speed, 1, 'keys win over the stick');
  const a = pl.input(k(), { x: 1, y: 0, m: 0.5 });
  assert.ok(near(a.x, Math.SQRT1_2) && near(a.z, -Math.SQRT1_2) && a.speed === 0.5, 'stick right = world (1,-1)');
  const down = pl.input(k(), { x: 0, y: 1, m: 1 });
  assert.ok(near(down.x, down.z) && down.x > 0, 'stick down = world (1,1)');
}

function walking() {
  const b = boot();
  const { pl, st, log, world } = b;
  const s = shore(world);
  stand(b, s.x - 3, s.z);
  const goal = { x: s.x, z: s.z };
  const act = { kind: 'harvest', t: { x: s.x, z: s.z - 1 } };
  assert.equal(pl.walkTo(goal, act), true);
  assert.equal(st.pending, act);
  assert.deepEqual(st.dest, goal);
  assert.ok(st.path.length === 3 && st.path.every((p) => p instanceof THREE.Vector2));
  assert.deepEqual([st.path[2].x, st.path[2].y], [goal.x + 0.5, goal.z + 0.5]);
  assert.deepEqual(names(log), []);

  // frame by frame: playerMove every frame (manual false), arrive once at the end, facing the action's tile
  let frames = 0;
  while (st.path) { pl.move(1 / 60, null); frames++; assert.ok(frames < 600, 'arrives'); }
  const seen = names(log);
  assert.equal(seen.at(-1), 'arrive');
  assert.ok(seen.slice(0, -1).every((n) => n === 'move:false'), seen.join());
  assert.equal(seen.filter((n) => n === 'arrive').length, 1);
  assert.ok(frames > 40, 'about three tiles at 3.6 tiles/s');
  assert.equal(st.pending, null);
  assert.deepEqual(pl.cell(), goal);
  assert.ok(Math.abs(st.pos.x - (goal.x + 0.5)) < 0.1 && Math.abs(st.pos.z - (goal.z + 0.5)) < 0.1);
  assert.equal(st.pos.y, 0.5, 'standing at groundY');
  assert.ok(Math.abs(st.facing - Math.atan2(act.t.x + 0.5 - st.pos.x, act.t.z + 0.5 - st.pos.z)) < 1e-9, 'turned to the action tile');
  pl.move(1 / 60, null);
  assert.equal(st.moving, false);
  assert.deepEqual(names(log), [], 'standing still says nothing');

  // arrive carries the action object itself
  const hand = [];
  b.core.bus.on('arrive', (p) => hand.push(p.action));
  stand(b, s.x - 2, s.z);
  pl.walkTo({ x: s.x - 1, z: s.z }, act);
  while (st.path) pl.move(1 / 30, null);
  assert.deepEqual(hand, [act]);
  assert.equal(hand[0], act);
  names(log);

  // already there: arrives at once, only if something is waiting
  pl.walkTo(pl.cell(), act);
  assert.deepEqual(names(log), ['arrive']);
  assert.equal(st.path, null);
  pl.walkTo(pl.cell());
  assert.deepEqual(names(log), []);

  // no way: say so when an action is waiting, unless quiet; nothing changes
  const water = { x: s.x + 5, z: s.z };
  assert.ok(world.isWater(water.x, water.z));
  const before = { path: st.path, pending: st.pending };
  assert.equal(pl.walkTo(water), false);
  assert.deepEqual(names(log), []);
  assert.equal(pl.walkTo(water, act), false);
  assert.deepEqual(names(log), ["say:Can't reach that spot."]);
  assert.equal(pl.walkTo(water, act, { quiet: true }), false);
  assert.deepEqual(names(log), []);
  assert.deepEqual({ path: st.path, pending: st.pending }, before);

  // walkNear: a blocked tile sends you next to it, the nearest open tile first
  stand(b, s.x - 3, s.z);
  assert.equal(pl.walkNear({ x: s.x + 2, z: s.z }), true, 'two tiles out at sea: the shore is within reach');
  assert.ok(pl.walkable(st.dest.x, st.dest.z) && Math.max(Math.abs(st.dest.x - (s.x + 2)), Math.abs(st.dest.z - s.z)) <= 2, 'a walkable tile close to the target');
  const lone = { x: 0, z: 0 };
  assert.ok(world.isWater(lone.x, lone.z));
  assert.equal(pl.walkNear(lone), false, 'nothing walkable near the corner');

  // stop() drops the path but not the waiting action
  pl.walkTo({ x: s.x, z: s.z }, act);
  pl.stop();
  assert.equal(st.path, null);
  assert.equal(st.pending, act);
}

function moving() {
  const b = boot();
  const { pl, st, log, world } = b;
  const s = shore(world);

  // keyboard input takes the controls: the path and the waiting action go, once per frame the event says manual
  stand(b, s.x - 3, s.z);
  pl.walkTo({ x: s.x, z: s.z }, { kind: 'till', t: { x: s.x, z: s.z } });
  names(log);
  pl.move(0.1, { x: 0, z: 1, speed: 1 });
  assert.equal(st.path, null);
  assert.equal(st.pending, null);
  assert.equal(st.moving, true);
  assert.deepEqual(names(log), ['move:true']);
  assert.ok(Math.abs(st.pos.z - (s.z + 0.5 + 0.36)) < 0.02 || st.pos.z > s.z + 0.5, 'moved 0.36 towards +z');

  // facing turns smoothly towards the direction of travel
  st.facing = 0;
  pl.move(0.01, { x: 1, z: 0, speed: 1 });
  assert.ok(st.facing > 0 && st.facing < Math.PI / 2);
  for (let i = 0; i < 60; i++) pl.move(1 / 60, { x: 1, z: 0, speed: 1 });
  assert.ok(Math.abs(st.facing - Math.PI / 2) < 1e-3);

  // collision: walking into the sea stops at the edge, a long frame does not tunnel through, half speed is half the distance
  stand(b, s.x - 2, s.z);
  pl.move(10, { x: 1, z: 0, speed: 1 });
  assert.ok(st.pos.x < s.x + 1 && st.pos.x > s.x + 0.5, `stopped at the shore, x=${st.pos.x}`);
  assert.ok(pl.canStand());
  stand(b, s.x - 3, s.z);
  const x0 = st.pos.x;
  pl.move(0.1, { x: 1, z: 0, speed: 0.5 });
  assert.ok(Math.abs(st.pos.x - x0 - 3.6 * 0.5 * 0.1) < 1e-9);

  // sliding along a wall: blocked on x, free on z
  stand(b, s.x, s.z);
  st.pos.x = s.x + 1 - 0.26; // the body touches the water
  const z0 = st.pos.z;
  pl.move(0.1, { x: Math.SQRT1_2, z: Math.SQRT1_2, speed: 1 });
  assert.ok(st.pos.x <= s.x + 1 - 0.24 + 1e-9);
  assert.ok(st.pos.z > z0 + 0.1, 'kept sliding');

  // the swing runs out by itself
  pl.swing();
  assert.equal(st.swingT, 0.35);
  pl.move(0.2, null);
  assert.ok(Math.abs(st.swingT - 0.15) < 1e-9);
  pl.move(0.2, null);
  assert.equal(st.swingT, 0);

  // a path never overshoots a node: one huge frame lands on the node, not past it
  stand(b, s.x - 3, s.z);
  st.path = [new THREE.Vector2(s.x - 2 + 0.5, s.z + 0.5)];
  pl.move(5, null);
  assert.ok(Math.abs(st.pos.x - (s.x - 2 + 0.5)) < 1e-9);
}

function guard() {
  const b = boot();
  const { pr, pl } = b;
  const s = shore(b.world);
  stand(b, s.x - 2, s.z);
  assert.equal(pr.check('crate', s.x - 2, s.z, 0), 'player', 'not on the player');
  assert.equal(pr.canPlace('crate', s.x - 3, s.z, 0), true);
  pl.warp(s.x - 3.5, s.z + 0.5);
  assert.equal(pr.canPlace('crate', s.x - 2, s.z, 0), true, 'free again once they step off');
  const owners = b.core.guards.get('place').map((e) => e.owner);
  assert.deepEqual(owners, ['player']);
}

function arrival() {
  // arrive() on its own: nothing waiting, nothing said; a waiting action turns the player and is handed over once
  const b = boot();
  const { pl, st, log } = b;
  pl.arrive();
  assert.deepEqual(names(log), []);
  st.pending = { kind: 'shop', t: { x: 20 + O, z: 17 + O } };
  pl.arrive();
  assert.deepEqual(names(log), ['arrive']);
  assert.equal(st.pending, null);
  pl.arrive();
  assert.deepEqual(names(log), []);
  // a bad payload is the emitter's bug: strict mode throws
  assert.throws(() => b.core.bus.emit('arrive', { action: 4 }), /action/);
  assert.throws(() => b.core.bus.emit('playerMove', {}), /manual/);
}

export default function () {
  state();
  facing();
  walkable();
  input();
  walking();
  moving();
  guard();
  arrival();
}

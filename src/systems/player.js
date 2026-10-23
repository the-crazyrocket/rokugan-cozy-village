// The player: where they stand and face, which tiles can be walked, walking to a tile along a path, per-frame movement. [T]
// Owns the player state { pos (Vector3), facing (radians), path, pending, dest, swing, swingT, moving }; Game reads it as `game.player`.
// Props decide which tiles are blocked or bridges; anything else that blocks a tile (Hana's spot) says so with block(fn). Taking the
// controls is `playerMove { manual }` (once per frame while moving, so whoever has a line out or a queue drops it) and reaching the
// end of a path with an action waiting is `arrive { action }` (interact performs it). Nothing is built on the player (a place guard).
// start() runs after a load or a new game and puts the player on a walkable tile reachable from home (ensureWalkable).
import * as THREE from 'three';
import { defineSystem } from '../core/system.js';
import { findPath, reach } from '../world/pathfind.js';
import { HOME } from '../content/base/landmarks.js';
import { cheb } from './shared.js';

const SPEED = 3.6;
const RADIUS = 0.24;
const DIRS = { up: [-1, -1], down: [1, 1], left: [-1, 1], right: [1, -1] }; // screen -> world (camera at +x+z)
const SIN_EL = Math.sin((35.264 * Math.PI) / 180); // screen-vertical foreshortening of the ground
const SWING_S = 0.35; // seconds a swing lasts
const BODY = [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS], [RADIUS * 0.7, RADIUS * 0.7], [-RADIUS * 0.7, RADIUS * 0.7], [RADIUS * 0.7, -RADIUS * 0.7], [-RADIUS * 0.7, -RADIUS * 0.7]];

// Game's side of the facade: `this` is the Game, which reads the api ungated
const NAME = 'player';
const call = (name) => function (...args) { return this.core.use(NAME)[name](...args); };

export default defineSystem({
  name: NAME,
  needs: ['props'],
  facade: {
    player: { get() { return this.core.use(NAME).state; } },
    walkable: call('walkable'),
    walkablePos: call('walkablePos'),
    playerCell: call('cell'),
    facingDir: call('facing'),
    targetTile: call('target'),
    moveInput() { return this.core.use(NAME).input(this.keys, this.analog); },
    walkTo: call('walkTo'),
    walkNear: call('walkNear'),
    arrive: call('arrive'),
    face: call('face'),
    swing: call('swing'),
    movePlayer: call('move'),
  },
  api(ctx) {
    const pl = ctx.state.player = {
      pos: new THREE.Vector3(17.5, 0, 22.5), facing: Math.PI * 0.25, path: null, pending: null,
      swing: 0, swingT: 0, moving: false,
    };
    const blockers = [];
    let props = null;
    const P = () => props ??= ctx.use('props');

    const api = {
      get state() { return pl; },

      /** Something else that keeps feet out of a tile: fn(x, z) -> bool. Returns the way to take it back. */
      block(fn) {
        blockers.push(fn);
        return () => { const i = blockers.indexOf(fn); if (i >= 0) blockers.splice(i, 1); };
      },

      walkable(x, z) {
        const world = ctx.world;
        if (x < 0 || z < 0 || x >= world.w || z >= world.h) return false;
        if (P().isBridge(x, z)) return true;
        for (const fn of blockers) if (fn(x, z)) return false;
        return world.isLand(x, z) && !P().isBlocked(x, z);
      },
      walkablePos(px, pz) {
        for (const [ox, oz] of BODY) if (!api.walkable(Math.floor(px + ox), Math.floor(pz + oz))) return false;
        return true;
      },
      /** Is the player standing somewhere walkable? */
      canStand: () => api.walkablePos(pl.pos.x, pl.pos.z),
      warp(x, z) { pl.pos.set(x, 0, z); },

      /**
       * Standing somewhere walkable that can be reached from home, or else on the nearest tile that is (at home when there is none).
       * For after a load, a catch-up (a patch or an edit may have changed the ground) or a re-centred world. -> the tile moved to, or null.
       */
      ensureWalkable() {
        const world = ctx.world, c = api.cell();
        const open = api.walkable(HOME.x, HOME.z) ? reach(HOME, api.walkable, world.w, world.h, (a, b, x, z) => world.canStep(a, b, x, z), 4096) : null;
        const ok = (x, z) => api.walkable(x, z) && (!open || open[z * world.w + x] === 1);
        if (api.canStand() && ok(c.x, c.z)) return null;
        let best = null, bestD = Infinity;
        for (let z = 0; z < world.h; z++) for (let x = 0; x < world.w; x++) {
          if (!ok(x, z)) continue;
          const d = Math.hypot(x + 0.5 - pl.pos.x, z + 0.5 - pl.pos.z);
          if (d < bestD) { best = { x, z }; bestD = d; }
        }
        const at = best || { x: HOME.x, z: HOME.z };
        api.warp(at.x + 0.5, at.z + 0.5);
        return at;
      },

      cell() { return { x: Math.floor(pl.pos.x), z: Math.floor(pl.pos.z) }; },
      playerCell() { return api.cell(); },
      facing() { return { x: Math.sin(pl.facing), z: Math.cos(pl.facing) }; },
      /** The tile in front of the player. */
      target() {
        const c = api.cell(), d = api.facing();
        const sx = Math.abs(d.x) > 0.38 ? Math.sign(d.x) : 0, sz = Math.abs(d.z) > 0.38 ? Math.sign(d.z) : 0;
        return { x: c.x + sx, z: c.z + sz };
      },

      /** Keys held (a Set of codes) or the touch stick ({ x, y, m } on screen) as a world direction: { x, z, speed } or null. */
      input(keys, analog) {
        let x = 0, z = 0;
        const add = ([dx, dz]) => { x += dx; z += dz; };
        if (keys.has('KeyW') || keys.has('ArrowUp')) add(DIRS.up);
        if (keys.has('KeyS') || keys.has('ArrowDown')) add(DIRS.down);
        if (keys.has('KeyA') || keys.has('ArrowLeft')) add(DIRS.left);
        if (keys.has('KeyD') || keys.has('ArrowRight')) add(DIRS.right);
        let l = Math.hypot(x, z);
        if (l) return { x: x / l, z: z / l, speed: 1 };
        const a = analog;
        if (!a || a.m <= 0) return null;
        // screen right = world (1,-1), screen down = world (1,1) foreshortened by sin(elevation)
        const sy = a.y / SIN_EL;
        x = a.x + sy; z = -a.x + sy;
        l = Math.hypot(x, z);
        return l ? { x: x / l, z: z / l, speed: a.m } : null;
      },

      /** Walk to tile t; `pending` is the action to perform on arrival. False when there is no way (and says so, unless quiet). */
      walkTo(t, pending = null, { quiet = false } = {}) {
        const start = api.cell();
        const path = findPath(start, t, (x, z) => api.walkable(x, z), ctx.world.w, ctx.world.h);
        if (!path) { if (pending && !quiet) ctx.say("Can't reach that spot."); return false; }
        pl.pending = pending;
        pl.path = path.slice(1).map((c) => new THREE.Vector2(c.x + 0.5, c.z + 0.5));
        pl.dest = { x: t.x, z: t.z };
        if (!pl.path.length) { pl.path = null; api.arrive(); }
        return true;
      },

      /** Tapped somewhere blocked: walk to the closest reachable tile next to it. */
      walkNear(t) {
        const pc = api.cell();
        const cands = [];
        for (let r = 1; r <= 4 && !cands.length; r++) {
          for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            if (cheb({ x: dx, z: dz }, { x: 0, z: 0 }) !== r) continue;
            const x = t.x + dx, z = t.z + dz;
            if (api.walkable(x, z)) cands.push({ x, z, d: Math.hypot(dx, dz) + Math.hypot(x - pc.x, z - pc.z) * 0.1 });
          }
        }
        cands.sort((a, b) => a.d - b.d);
        for (const c of cands.slice(0, 8)) if (api.walkTo(c)) return true;
        return false;
      },

      /** The end of a walk: turn to the waiting action's tile and hand it over. */
      arrive() {
        const a = pl.pending;
        pl.pending = null;
        if (a) { api.face(a.t); ctx.bus.emit('arrive', { action: a }); }
      },

      /** Stop following a path (the action waiting stays). */
      stop() { pl.path = null; },

      face(t) {
        const dx = t.x + 0.5 - pl.pos.x, dz = t.z + 0.5 - pl.pos.z;
        if (dx || dz) pl.facing = Math.atan2(dx, dz);
      },

      swing() { pl.swingT = SWING_S; },

      /** One frame: keyboard / stick input (a direction from input()) or following the tapped path, then the swing running out. */
      move(dt, input) {
        let move = null;
        if (input) { pl.path = null; pl.pending = null; move = input; }
        else if (pl.path && pl.path.length) {
          const target = pl.path[0];
          const dx = target.x - pl.pos.x, dz = target.y - pl.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.08) { pl.path.shift(); if (!pl.path.length) { pl.path = null; api.arrive(); } }
          else move = { x: dx / d, z: dz / d, max: d };
        }
        pl.moving = !!move;
        if (move) {
          ctx.bus.emit('playerMove', { manual: !!input });
          // sub-stepped so low frame rates don't tunnel through collisions
          const dist = Math.min(SPEED * (move.speed ?? 1) * dt, move.max ?? Infinity); // never overshoot a path node
          const n = Math.max(1, Math.ceil(dist / 0.09)), step = dist / n;
          for (let i = 0; i < n; i++) {
            const nx = pl.pos.x + move.x * step, nz = pl.pos.z + move.z * step;
            if (api.walkablePos(nx, pl.pos.z)) pl.pos.x = nx;
            if (api.walkablePos(pl.pos.x, nz)) pl.pos.z = nz;
          }
          const target = Math.atan2(move.x, move.z);
          let da = target - pl.facing;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          pl.facing += da * Math.min(1, dt * 14);
        }
        pl.pos.y = ctx.groundY(pl.pos.x, pl.pos.z);
        pl.swingT = Math.max(0, pl.swingT - dt);
      },
    };
    ctx.state.api = api;
    return api;
  },
  start(ctx) { ctx.state.api.ensureWalkable(); },
  init(ctx) {
    // nothing is built on the player; asked last, after the guards that explain more
    ctx.guards.add('place', (p) => {
      const c = ctx.state.api.cell();
      return p.cells.some((q) => q.x === c.x && q.z === c.z) ? 'player' : null;
    }, { priority: 10 });
  },
});

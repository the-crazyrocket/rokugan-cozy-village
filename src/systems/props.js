// Props: the placed-prop store without any scene (footprints, occupancy, blocked and bridge cells, placement rules, the list) as a system. [T]
// Placing and removing emit `place` / `remove`; other systems veto a placement with ctx.guards.add('place', (p) => reason|null), where
// p = { prop, x, z, rot, via, cells, ignoreId }. Meshes are a view: game/props.js (PropManager) listens to the two events.
import { defineSystem } from '../core/system.js';
import { content } from '../content/index.js';
import { BLOCKOUTS } from '../assets/blockouts.js';
import { hash2 } from '../core/rng.js';
import { T } from '../world/kinds.js';
import { spanOk } from '../world/bridge.js';
import { deckY } from '../world/surface.js';

const PROPS = content.props.view();
const HALF_PI = Math.PI / 2;

export function propFootprint(type) {
  const p = PROPS[type];
  return p.footprint || BLOCKOUTS[p.asset].footprint;
}

/** Cells covered by a prop whose anchor (cursor) cell is (x,z). */
export function propCells(type, x, z, rot) {
  const [w, d] = propFootprint(type);
  const def = PROPS[type].asset ? BLOCKOUTS[PROPS[type].asset] : {};
  const rw = rot % 2 ? d : w, rd = rot % 2 ? w : d;
  const cx = x + (rw % 2 ? 0.5 : 1), cz = z + (rd % 2 ? 0.5 : 1);
  const th = rot * HALF_PI, c = Math.cos(th), s = Math.sin(th);
  const cells = [];
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const ox = i - (w - 1) / 2, oz = j - (d - 1) / 2;
    const rx = ox * c + oz * s, rz = -ox * s + oz * c;
    const block = def.walkable ? 0 : def.block ? def.block[j][i] : 1;
    cells.push({ x: Math.round(cx + rx - 0.5), z: Math.round(cz + rz - 0.5), block });
  }
  return { cells, cx, cz };
}

export class PropIndex {
  constructor(world) {
    this.world = world;
    this.w = world.w;
    this.h = world.h;
    this.list = [];
    this.nextId = 1;
    this.byId = new Map();
    this.occ = new Int32Array(this.w * this.h); // prop id per cell
    this.blocked = new Uint8Array(this.w * this.h);
    this.bridge = new Uint8Array(this.w * this.h); // walkable deck over water
    this.version = 0; // bumped on every add/remove (lantern glows etc. resync)
  }

  /**
   * Why a prop cannot stand here: 'bounds' | 'occupied' | 'soil' | 'water' | 'span', or whatever `guard(cells)` returns
   * (asked last, once the footprint and the terrain are fine); null when it fits.
   */
  reason(type, x, z, rot, { ignoreId = 0, guard = null } = {}) {
    const { cells } = propCells(type, x, z, rot);
    const def = PROPS[type].asset ? BLOCKOUTS[PROPS[type].asset] : {};
    let water = 0;
    for (const c of cells) {
      if (c.x < 0 || c.z < 0 || c.x >= this.w || c.z >= this.h) return 'bounds';
      const i = c.z * this.w + c.x;
      if (this.occ[i] && this.occ[i] !== ignoreId) return 'occupied';
      const t = this.world.get(c.x, c.z);
      if (t === T.WATER) water++;
      else if (t === T.SOIL) return 'soil';
    }
    if (def.onWater) {
      // bridges: land-water...water-land (or open water at both ends); the pier only needs water in the middle
      const mid = cells[Math.floor(cells.length / 2)];
      if (type === 'bridge') { if (!spanOk(this.world, cells)) return 'span'; }
      else if (!this.world.isWater(mid.x, mid.z)) return 'water';
    } else if (water) return 'water';
    return (guard && guard(cells)) || null;
  }

  canPlace(type, x, z, rot, opts) { return this.reason(type, x, z, rot, opts) === null; }

  /** Records a prop (no mesh yet) and marks its cells. */
  add(type, x, z, rot = 0, id = 0) {
    const prop = { id: id || this.nextId++, type, x, z, rot };
    this.nextId = Math.max(this.nextId, prop.id + 1);
    const { cells, cx, cz } = propCells(type, x, z, rot);
    prop.cells = cells; prop.cx = cx; prop.cz = cz;
    prop.seed = hash2(x, z, prop.id);
    for (const c of cells) {
      const i = c.z * this.w + c.x;
      this.occ[i] = prop.id;
      if (c.block) this.blocked[i] = 1;
      if (BLOCKOUTS[PROPS[type].asset]?.walkable) this.bridge[i] = 1;
    }
    this.list.push(prop);
    this.byId.set(prop.id, prop);
    this.version++;
    return prop;
  }

  remove(prop) {
    for (const c of prop.cells) {
      const i = c.z * this.w + c.x;
      if (this.occ[i] === prop.id) { this.occ[i] = 0; this.blocked[i] = 0; this.bridge[i] = 0; }
    }
    this.list = this.list.filter((p) => p !== prop);
    this.byId.delete(prop.id);
    this.version++;
  }

  at(x, z) {
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return null;
    const id = this.occ[z * this.w + x];
    return id ? this.byId.get(id) || null : null;
  }

  isBlocked(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h && this.blocked[z * this.w + x] === 1; }
  isBridge(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h && this.bridge[z * this.w + x] === 1; }

  /** Height of a bridge deck under a world position (0 if none). */
  deckHeight(px, pz) {
    const x = Math.floor(px), z = Math.floor(pz);
    return this.isBridge(x, z) ? deckY(this.at(x, z), px, pz) : 0;
  }

  serialize() { return this.list.map((p) => ({ id: p.id, type: p.type, x: p.x, z: p.z, rot: p.rot })); }
}

const fail = () => { throw new Error("props: the core has no world (core.provide('world', world) first)"); };

export default defineSystem({
  name: 'props',
  needs: [],
  api(ctx) {
    // the store is made on first use, so a core can boot this system before (or without) a world
    const store = () => ctx.state.index ??= new PropIndex(ctx.world ?? fail());
    const api = {
      get list() { return store().list; },
      get version() { return store().version; },
      get nextId() { return store().nextId; },
      set nextId(v) { store().nextId = v; },
      get occ() { return store().occ; },
      get blocked() { return store().blocked; },
      get bridge() { return store().bridge; },
      footprint: propFootprint,
      cells: propCells,
      get: (id) => store().byId.get(id) || null,
      at: (x, z) => store().at(x, z),
      isBlocked: (x, z) => store().isBlocked(x, z),
      isBridge: (x, z) => store().isBridge(x, z),
      deckHeight: (px, pz) => store().deckHeight(px, pz),
      serialize: () => store().serialize(),

      /** null when the prop fits, else why not: the footprint's own reason, or the first place guard's. */
      check(type, x, z, rot, { ignoreId = 0, via = 'build' } = {}) {
        const guard = (cells) => ctx.guards.check('place', { prop: type, x, z, rot, via, cells, ignoreId }, ctx);
        return store().reason(type, x, z, rot, { ignoreId, guard });
      },
      canPlace: (type, x, z, rot, opts) => api.check(type, x, z, rot, opts) === null,

      /** Puts a prop down (the caller has checked canPlace, or is restoring one) and says so. */
      add(type, x, z, rot = 0, id = 0, { via = 'build' } = {}) {
        const prop = store().add(type, x, z, rot, id);
        ctx.bus.emit('place', { prop: type, id: prop.id, x, z, rot, via });
        return prop;
      },
      remove(prop, { to = 'gone' } = {}) {
        store().remove(prop);
        ctx.bus.emit('remove', { prop: prop.type, id: prop.id, x: prop.x, z: prop.z, to });
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const api = ctx.state.api;
    ctx.provide('props', api); // conditions read props.list
    // bridges and the pier are for walking on; anything else standing there is looked at
    ctx.resolvers.add({ id: 'prop-inspect', priority: 40, fn(t) { const p = api.at(t.x, t.z); return p && !api.isBridge(t.x, t.z) ? { kind: 'inspect', t, prop: p } : null; } });
  },
});

// Placeable props: footprints on the grid, occupancy, painted meshes, ghosts.
// PropManager is the old one-object surface: the props system (systems/props.js, no scene) plus a PropsView (render/views/props-view.js, meshes).
// Meshes follow the system's `place` and `remove` events, so whoever places a prop through ctx.use('props') gets one.
import * as THREE from 'three';
import propsSystem, { propCells, propFootprint } from '../systems/props.js';
import { PropsView } from '../render/views/props-view.js';
import { createCore } from '../core/core.js';
import { PRIO } from '../core/bus.js';
import { PROPS } from './data.js';

export { propCells, propFootprint };

const HALF_PI = Math.PI / 2;

export class PropManager {
  /** `core` has the world provided and the props system booted (Game does); without one the manager boots a private core. */
  constructor(scene, painted, world, core = null) {
    if (!core) {
      core = createCore();
      core.provide('world', world);
      core.boot([propsSystem]);
    }
    this.scene = scene;
    this.world = world;
    this.painted = painted;
    this.core = core;
    this.api = core.use('props');
    this.view = new PropsView(scene, painted);
    this.group = this.view.group;
    this.geos = this.view.geos;
    this.mats = this.view.mats;
    this.onChange = () => {};
    const meshed = new Map(); // id -> prop with a mesh (the remove event no longer has the prop itself)
    const opts = { priority: PRIO.VIEW, owner: 'props-view' };
    core.bus.on('place', ({ id }) => {
      const prop = this.api.get(id);
      if (!prop) return;
      this.view.attach(prop);
      meshed.set(id, prop);
      this.onChange();
    }, opts);
    core.bus.on('remove', ({ id }) => {
      const prop = meshed.get(id);
      if (!prop) return;
      meshed.delete(id);
      this.view.detach(prop);
      this.onChange();
    }, opts);
  }

  get list() { return this.api.list; }
  get nextId() { return this.api.nextId; }
  set nextId(v) { this.api.nextId = v; }
  get occ() { return this.api.occ; }
  get blocked() { return this.api.blocked; }
  get bridge() { return this.api.bridge; }
  get version() { return this.api.version; }

  geometry(asset) { return this.view.geometry(asset); }
  paintFor(asset) { return this.view.paintFor(asset); }
  material(asset) { return this.view.material(asset); }
  makeMesh(type) { return this.view.makeMesh(type); }

  /** Only `ignoreId` and `via` count: the player and the crops veto through place guards (a legacy `playerCell` / `farm` is ignored). */
  canPlace(type, x, z, rot, opts = {}) { return this.api.canPlace(type, x, z, rot, { ignoreId: opts.ignoreId, via: opts.via }); }

  add(type, x, z, rot = 0, id = 0, opts) { return this.api.add(type, x, z, rot, id, opts); }
  remove(prop, opts) { this.api.remove(prop, opts); }

  at(x, z) { return this.api.at(x, z); }
  isBlocked(x, z) { return this.api.isBlocked(x, z); }
  isBridge(x, z) { return this.api.isBridge(x, z); }
  deckHeight(px, pz) { return this.api.deckHeight(px, pz); }
  billboards() { return this.view.billboards(this.api.list); }
  serialize() { return this.api.serialize(); }
}

/** Translucent placement preview + footprint squares. */
export class Ghost {
  constructor(scene, props) {
    this.props = props;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.okMat = new THREE.MeshLambertMaterial({ color: 0xb6f0a0, emissive: 0x2f6a2a, transparent: true, opacity: 0.6, depthWrite: false });
    this.badMat = new THREE.MeshLambertMaterial({ color: 0xff8a7a, emissive: 0x7a1e14, transparent: true, opacity: 0.6, depthWrite: false });
    this.cellOk = new THREE.MeshBasicMaterial({ color: 0x9fe08a, transparent: true, opacity: 0.35, depthWrite: false });
    this.cellBad = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.35, depthWrite: false });
    this.cellGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-HALF_PI);
    this.type = null;
    this.body = null;
    this.cells = [];
  }

  setType(type) {
    if (type === this.type) return;
    this.type = type;
    if (this.body) this.group.remove(this.body);
    this.body = null;
    if (!type) return;
    const def = PROPS[type];
    if (def.asset) {
      this.body = new THREE.Mesh(this.props.geometry(def.asset), this.okMat);
      if (def.canopy) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), this.okMat);
        blob.position.y = 1.9; this.body.add(blob);
      }
    } else {
      this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 8).translate(0, 1.1, 0), this.okMat);
    }
    this.body.renderOrder = 5;
    this.group.add(this.body);
  }

  show(type, x, z, rot, ok) {
    this.setType(type);
    this.group.visible = !!type;
    if (!type) return;
    const { cells, cx, cz } = propCells(type, x, z, rot);
    this.lastCells = cells;
    this.body.position.set(cx, 0.02, cz);
    this.body.rotation.y = rot * HALF_PI;
    const mat = ok ? this.okMat : this.badMat;
    this.body.material = mat;
    this.body.children.forEach((c) => (c.material = mat));
    while (this.cells.length < cells.length) {
      const m = new THREE.Mesh(this.cellGeo, this.cellOk); m.renderOrder = 4; this.group.add(m); this.cells.push(m);
    }
    this.cells.forEach((m, i) => {
      m.visible = i < cells.length;
      if (!m.visible) return;
      const c = cells[i];
      const y = this.props.world.isWater(c.x, c.z) ? -0.28 : 0.03;
      m.position.set(c.x + 0.5, y, c.z + 0.5);
      m.material = ok ? this.cellOk : this.cellBad;
    });
  }

  hide() { this.group.visible = false; }
  /** Footprint cells of the visible preview (used to detect taps/drags on it). */
  cellsAt() { return this.group.visible && this.lastCells ? this.lastCells : []; }
}

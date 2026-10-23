// Placeable props: footprints on the grid, occupancy, painted meshes, ghosts.
import * as THREE from 'three';
import { BLOCKOUTS, buildBlockoutGeometry, TREE_CANOPIES, BRIDGE_DECK } from '../assets/blockouts.js';
import { makePaintedMaterial } from '../render/materials.js';
import { PROPS } from './data.js';
import { W, H, T, hash2 } from './world.js';

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

export class PropManager {
  constructor(scene, painted, world) {
    this.scene = scene;
    this.world = world;
    this.painted = painted;
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);
    this.list = [];
    this.nextId = 1;
    this.occ = new Int32Array(W * H); // prop id per cell
    this.blocked = new Uint8Array(W * H);
    this.bridge = new Uint8Array(W * H); // walkable deck over water
    this.geos = {};
    this.mats = {};
    this.version = 0; // bumped on every add/remove (lantern glows etc. resync)
    this.onChange = () => {};
  }

  geometry(asset) {
    if (!this.geos[asset]) this.geos[asset] = buildBlockoutGeometry(asset);
    return this.geos[asset];
  }
  material(asset) {
    if (!this.mats[asset]) this.mats[asset] = makePaintedMaterial(this.painted.assets[asset]);
    return this.mats[asset];
  }

  makeMesh(type) {
    const p = PROPS[type];
    if (p.asset) {
      const m = new THREE.Mesh(this.geometry(p.asset), this.material(p.asset));
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }
    return new THREE.Group(); // billboard-only prop (bamboo)
  }

  canPlace(type, x, z, rot, { ignoreId = 0, playerCell = null, farm = null } = {}) {
    const { cells } = propCells(type, x, z, rot);
    const def = PROPS[type].asset ? BLOCKOUTS[PROPS[type].asset] : {};
    let water = 0;
    for (const c of cells) {
      if (c.x < 0 || c.z < 0 || c.x >= W || c.z >= H) return false;
      const i = c.z * W + c.x;
      if (this.occ[i] && this.occ[i] !== ignoreId) return false;
      if (playerCell && playerCell.x === c.x && playerCell.z === c.z) return false;
      if (farm && farm.has(i)) return false;
      const t = this.world.get(c.x, c.z);
      if (t === T.WATER) water++;
      else if (t === T.SOIL) return false;
    }
    if (def.onWater) {
      // bridges: the middle must be water, ends may rest on land
      const mid = cells[Math.floor(cells.length / 2)];
      return this.world.isWater(mid.x, mid.z);
    }
    return water === 0;
  }

  add(type, x, z, rot = 0, id = 0) {
    const prop = { id: id || this.nextId++, type, x, z, rot };
    this.nextId = Math.max(this.nextId, prop.id + 1);
    const { cells, cx, cz } = propCells(type, x, z, rot);
    prop.cells = cells; prop.cx = cx; prop.cz = cz;
    prop.seed = hash2(x, z, prop.id);
    for (const c of cells) {
      const i = c.z * W + c.x;
      this.occ[i] = prop.id;
      if (c.block) this.blocked[i] = 1;
      if (BLOCKOUTS[PROPS[type].asset]?.walkable) this.bridge[i] = 1;
    }
    const mesh = this.makeMesh(type);
    mesh.position.set(cx, 0, cz);
    mesh.rotation.y = rot * HALF_PI;
    if (PROPS[type].canopy) mesh.scale.setScalar(0.92 + prop.seed * 0.2);
    mesh.userData.propId = prop.id;
    this.group.add(mesh);
    prop.mesh = mesh;
    this.list.push(prop);
    this.version++;
    this.onChange();
    return prop;
  }

  remove(prop) {
    for (const c of prop.cells) {
      const i = c.z * W + c.x;
      if (this.occ[i] === prop.id) { this.occ[i] = 0; this.blocked[i] = 0; this.bridge[i] = 0; }
    }
    this.group.remove(prop.mesh);
    this.list = this.list.filter((p) => p !== prop);
    this.version++;
    this.onChange();
  }

  at(x, z) {
    if (x < 0 || z < 0 || x >= W || z >= H) return null;
    const id = this.occ[z * W + x];
    return id ? this.list.find((p) => p.id === id) : null;
  }

  isBlocked(x, z) { return x >= 0 && z >= 0 && x < W && z < H && this.blocked[z * W + x] === 1; }
  isBridge(x, z) { return x >= 0 && z >= 0 && x < W && z < H && this.bridge[z * W + x] === 1; }

  /** Height of a bridge deck under a world position (0 if none). */
  deckHeight(px, pz) {
    const x = Math.floor(px), z = Math.floor(pz);
    if (!this.isBridge(x, z)) return 0;
    const p = this.at(x, z);
    const th = -p.rot * HALF_PI;
    const dx = px - p.cx, dz = pz - p.cz;
    const lz = -dx * Math.sin(th) + dz * Math.cos(th);
    return BRIDGE_DECK(lz) + 0.04;
  }

  /** Billboard items for tree canopies and bamboo, plus blob shadows. */
  billboards() {
    const canopy = [], veg = [], shadows = [];
    for (const p of this.list) {
      const def = PROPS[p.type];
      if (def.canopy) {
        const s = p.mesh.scale.x, th = p.rot * HALF_PI;
        TREE_CANOPIES[def.canopy].forEach((c, k) => {
          const [ox, oy, oz] = c.pos;
          const rx = ox * Math.cos(th) + oz * Math.sin(th), rz = -ox * Math.sin(th) + oz * Math.cos(th);
          canopy.push({
            x: p.cx + rx * s, y: (oy - c.size * 0.45) * s, z: p.cz + rz * s, sprite: c.sprite, height: c.size * s,
            sway: 0.035, phase: p.seed * 6 + k, shade: 0.9 + ((p.seed * 7 + k * 0.3) % 1) * 0.18, lean: k === 0 ? 0 : 0.05, flip: (p.seed + k * 0.37) % 1 > 0.5,
          });
        });
        shadows.push({ x: p.cx + 0.25, z: p.cz + 0.25, r: 1.0 * s });
      } else if (def.sprite) {
        for (let k = 0; k < 3; k++) {
          const a = p.seed * 6.28 + k * 2.1;
          veg.push({ x: p.cx + Math.cos(a) * 0.22, z: p.cz + Math.sin(a) * 0.22, sprite: def.sprite, height: 2.0 + ((p.seed * 13 + k) % 1) * 0.7, sway: 0.06, phase: a, shade: 0.9 + k * 0.05, flip: k === 1 });
        }
        shadows.push({ x: p.cx, z: p.cz, r: 0.5 });
      }
    }
    return { canopy, veg, shadows };
  }

  serialize() { return this.list.map((p) => ({ id: p.id, type: p.type, x: p.x, z: p.z, rot: p.rot })); }
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

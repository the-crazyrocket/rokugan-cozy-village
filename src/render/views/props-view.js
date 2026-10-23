// The meshes of the props: geometry and material caches, one mesh per prop in a group, billboard items for canopies and bamboo.
import * as THREE from 'three';
import { content } from '../../content/index.js';
import { buildBlockoutGeometry, TREE_CANOPIES } from '../../assets/blockouts.js';
import { makePaintedMaterial, makeVertexMaterial } from '../materials.js';
import { geomHash } from '../../assets/geomhash.js';

const PROPS = content.props.view();
const HALF_PI = Math.PI / 2;

export class PropsView {
  constructor(scene, painted) {
    this.scene = scene;
    this.painted = painted;
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);
    this.geos = {};
    this.mats = {};
    this.baseY = () => 0; // the ground level a prop stands on (PropManager hands in the world's)
  }

  geometry(asset) {
    if (!this.geos[asset]) this.geos[asset] = buildBlockoutGeometry(asset);
    return this.geos[asset];
  }
  /** The paint for this asset, or null when it is missing or was made for other geometry (manifest geomHash). */
  paintFor(asset) {
    const a = this.painted.assets?.[asset];
    if (!a || !a.angles || a.angles.length < 2 || !a.angles.slice(0, 2).every((g) => g.tex && g.depthTex && g.camera)) return null;
    return !a.geomHash || a.geomHash === geomHash(this.geometry(asset)) ? a : null;
  }
  material(asset) {
    if (!this.mats[asset]) {
      const a = this.paintFor(asset);
      this.mats[asset] = a ? makePaintedMaterial(a) : makeVertexMaterial();
    }
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

  /** Builds the mesh of an indexed prop and puts it in the scene. */
  attach(prop) {
    const { type, cx, cz, rot } = prop;
    const mesh = this.makeMesh(type);
    mesh.position.set(cx, this.baseY(prop), cz);
    mesh.rotation.y = rot * HALF_PI;
    if (PROPS[type].canopy) mesh.scale.setScalar(0.92 + prop.seed * 0.2);
    mesh.userData.propId = prop.id;
    this.group.add(mesh);
    prop.mesh = mesh;
  }

  detach(prop) { this.group.remove(prop.mesh); }

  /** Billboard items for tree canopies and bamboo, plus blob shadows. */
  billboards(list) {
    const canopy = [], veg = [], shadows = [];
    for (const p of list) {
      const def = PROPS[p.type], y0 = this.baseY(p);
      if (def.canopy) {
        const s = p.mesh.scale.x, th = p.rot * HALF_PI;
        TREE_CANOPIES[def.canopy].forEach((c, k) => {
          const [ox, oy, oz] = c.pos;
          const rx = ox * Math.cos(th) + oz * Math.sin(th), rz = -ox * Math.sin(th) + oz * Math.cos(th);
          canopy.push({
            x: p.cx + rx * s, y: y0 + (oy - c.size * 0.45) * s, z: p.cz + rz * s, sprite: c.sprite, height: c.size * s,
            sway: 0.035, phase: p.seed * 6 + k, shade: 0.9 + ((p.seed * 7 + k * 0.3) % 1) * 0.18, lean: k === 0 ? 0 : 0.05, flip: (p.seed + k * 0.37) % 1 > 0.5,
          });
        });
        shadows.push({ x: p.cx + 0.25, y: y0, z: p.cz + 0.25, r: 1.0 * s });
      } else if (def.sprite) {
        for (let k = 0; k < 3; k++) {
          const a = p.seed * 6.28 + k * 2.1;
          veg.push({ x: p.cx + Math.cos(a) * 0.22, y: y0, z: p.cz + Math.sin(a) * 0.22, sprite: def.sprite, height: 2.0 + ((p.seed * 13 + k) % 1) * 0.7, sway: 0.06, phase: a, shade: 0.9 + k * 0.05, flip: k === 1 });
        }
        shadows.push({ x: p.cx, y: y0, z: p.cz, r: 0.5 });
      }
    }
    return { canopy, veg, shadows };
  }
}

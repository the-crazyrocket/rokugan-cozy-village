// Felling a tree, drawn: from the first stroke the tree is a stand-in (the trunk mesh and its own canopy cut-outs in `fellLayer`)
// that shudders at each stroke, then topples away from the player (gravity ease, a little bounce), lands in a puff of dust and
// leaves, lies a moment and shrinks away. Driven by the trees system's chopHit / treeFell / chopStop events; updateWoodcut(dt)
// steps it each frame.
import * as THREE from 'three';
import { defineSystem } from '../../core/system.js';
import { TREE_CANOPIES } from '../../assets/blockouts.js';

const FALL_S = 0.8; // from upright to the ground
const LIE_S = 0.45; // lying there
const GONE_S = 0.4; // shrinking away
const LEAVES = { sakura: '#f6c3cf', pine: '#6f8a43' };
const UP = new THREE.Vector3(0, 1, 0);

export default defineSystem({
  name: 'woodcutView',
  needs: [],
  facade: {
    /** A stroke: the tree becomes the stand-in (first stroke) and shudders. */
    woodcutHit({ id, dir }) {
      this.felled ||= new Map();
      let f = this.felled.get(id);
      if (!f) {
        const p = this.props.api.get(id);
        if (!p?.mesh) return;
        const def = this.core.content.props.get(p.type);
        const mesh = new THREE.Mesh(p.mesh.geometry, p.mesh.material);
        mesh.castShadow = true;
        mesh.scale.copy(p.mesh.scale);
        this.scene.add(mesh);
        const s = p.mesh.scale.x, th = p.rot * Math.PI / 2;
        const clumps = TREE_CANOPIES[def.canopy].map((c, k) => {
          const [ox, oy, oz] = c.pos;
          return { k, sprite: c.sprite, size: c.size * s, at: new THREE.Vector3(ox * Math.cos(th) + oz * Math.sin(th), oy - c.size * 0.45, -ox * Math.sin(th) + oz * Math.cos(th)).multiplyScalar(s), seed: p.seed };
        });
        f = { id, type: p.type, mesh, rotY: p.mesh.rotation.y, base: new THREE.Vector3(p.cx, this.props.baseY(p), p.cz), clumps, size: s, wob: 0, t: 0, phase: 'stand', angle: 0 };
        // the axis it falls about: level, square to the way it falls
        f.axis = new THREE.Vector3(dir.x, 0, dir.z).cross(UP).normalize().negate();
        f.dir = new THREE.Vector3(dir.x, 0, dir.z);
        p.felling = true; p.mesh.visible = false;
        this.felled.set(id, f);
        this.dirty.veg = true; // its canopy leaves the shared layer
      }
      f.wob = 1;
    },

    /** Down it comes. */
    woodcutFell({ id }) {
      const f = this.felled?.get(id);
      if (!f) return;
      f.phase = 'fall'; f.t = 0;
    },

    /** The player walked off: the tree stands again. */
    woodcutStop({ id }) {
      const f = this.felled?.get(id);
      if (!f) return;
      this.scene.remove(f.mesh);
      this.felled.delete(id);
      const p = this.props.api.get(id);
      if (p?.mesh) { p.felling = false; p.mesh.visible = true; }
      this.dirty.veg = true;
    },

    updateWoodcut(dt) {
      if (!this.felled?.size) { if (this.fellLayer.geometry.instanceCount) this.fellLayer.set([]); return; }
      const items = [], q = new THREE.Quaternion(), wq = new THREE.Quaternion(), spin = new THREE.Quaternion(), v = new THREE.Vector3();
      for (const [id, f] of this.felled) {
        f.t += dt;
        let shrink = 1;
        if (f.phase === 'stand') {
          f.wob *= Math.exp(-dt * 5);
          f.angle = f.wob * 0.05 * Math.sin(f.t * 32); // a shudder toward the fall
        } else if (f.phase === 'fall') {
          const k = Math.min(1, f.t / FALL_S);
          f.angle = k * k * (Math.PI / 2 - 0.04); // slow to start, then quicker: gravity
          if (k >= 1) { f.phase = 'lie'; f.t = 0; this.woodcutLand(f); }
        } else if (f.phase === 'lie') {
          f.angle = Math.PI / 2 - 0.04 - 0.09 * Math.sin(Math.min(f.t, 0.3) / 0.3 * Math.PI) * Math.exp(-f.t * 4); // a bounce
          if (f.t >= LIE_S) { f.phase = 'gone'; f.t = 0; }
        } else {
          shrink = Math.max(0, 1 - f.t / GONE_S);
          if (shrink <= 0) { this.scene.remove(f.mesh); this.felled.delete(id); continue; }
        }
        wq.setFromAxisAngle(f.axis, f.angle);
        spin.setFromAxisAngle(UP, f.rotY);
        q.copy(wq).multiply(spin);
        f.mesh.position.copy(f.base);
        f.mesh.quaternion.copy(q);
        f.mesh.scale.setScalar(f.size * shrink);
        const fallen = f.angle / (Math.PI / 2);
        for (const c of f.clumps) {
          v.copy(c.at).applyQuaternion(wq).multiplyScalar(shrink).add(f.base);
          const size = c.size * (1 - 0.3 * Math.max(0, fallen)) * shrink; // the crown reads smaller lying down
          items.push({ x: v.x, y: v.y, z: v.z, sprite: c.sprite, height: size, sway: 0, shade: 0.95, lean: (0.6 + c.k * 0.05) * f.size, flip: (c.seed + c.k * 0.37) % 1 > 0.5 });
        }
      }
      this.fellLayer.set(items);
    },

    /** It hits the ground: dust along the trunk, a burst of leaves where the crown lands, a thud. */
    woodcutLand(f) {
      const y = f.base.y + 0.15;
      for (const d of [0.6, 1.2, 1.8]) this.particles.burst(f.base.x + f.dir.x * d, y, f.base.z + f.dir.z * d, { color: '#cdb79a', n: 8, up: 0.5 });
      const leaves = LEAVES[f.type] || '#7a9a4a';
      this.particles.burst(f.base.x + f.dir.x * 2, y + 0.3, f.base.z + f.dir.z * 2, { color: leaves, n: 22, up: 1.1 });
      this.core.sfx('thud');
      this.core.bus.emit('haptic', { ms: 35 });
    },
  },
});

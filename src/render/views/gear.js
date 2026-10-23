// Meshes the player carries or draws on the ground: tools in the hand, tile cursor, destination ring, fishing gear.
import * as THREE from 'three';
import { defineSystem } from '../../core/system.js';
import { makeBrushMaterial } from '../materials.js';
import { PALETTE } from '../../assets/palette.js';

export default defineSystem({
  name: 'gearView',
  needs: [],
  facade: {
    makeTools() {
      const wood = makeBrushMaterial(PALETTE.wood), metal = makeBrushMaterial('#8c8f96'), bamboo = makeBrushMaterial('#9bb05a');
      const hoe = new THREE.Group();
      hoe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).translate(0, -0.15, 0), wood));
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), metal); blade.position.set(0, -0.45, 0.06); hoe.add(blade);
      hoe.rotation.x = Math.PI * 0.5;
      const can = new THREE.Group();
      can.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 10), wood));
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.18, 6), wood); sp.position.set(0, 0.02, 0.12); sp.rotation.x = 1.1; can.add(sp);
      can.position.y = -0.06;
      const rod = new THREE.Group();
      rod.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.1, 6).translate(0, 0.55, 0), bamboo));
      rod.rotation.x = Math.PI * 0.32;
      this.rodTip = new THREE.Object3D(); this.rodTip.position.set(0, 1.1, 0); rod.add(this.rodTip);
      const axe = new THREE.Group();
      axe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.55, 6).translate(0, -0.12, 0), wood));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.17), metal); head.position.set(0, -0.36, 0.06); axe.add(head);
      axe.rotation.x = Math.PI * 0.5;
      this.toolMeshes = { hoe, can, rod, axe };
      for (const m of Object.values(this.toolMeshes)) { m.visible = false; m.traverse((o) => (o.castShadow = true)); this.char.parts.hand.add(m); }
    },

    makeCursor() {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      ctx.strokeStyle = '#fff6dc'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
      ctx.strokeRect(5, 5, 54, 54);
      const tex = new THREE.CanvasTexture(c);
      this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
      this.cursor.renderOrder = 3;
      this.scene.add(this.cursor);
      this.destMarker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }));
      this.destMarker.renderOrder = 3;
      this.destMarker.visible = false;
      this.scene.add(this.destMarker);
    },

    makeFishingGear() {
      this.bobber = new THREE.Group();
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), makeBrushMaterial(PALETTE.vermilion));
      const bot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), makeBrushMaterial(PALETTE.paper));
      this.bobber.add(top, bot);
      this.bobber.visible = false;
      this.scene.add(this.bobber);
      this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: 0xf4ead2, transparent: true, opacity: 0.8 }));
      this.line.frustumCulled = false;
      this.line.visible = false;
      this.scene.add(this.line);
      this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xf4ead2, transparent: true, opacity: 0, depthWrite: false }));
      this.scene.add(this.ripple);
    },
  },
});

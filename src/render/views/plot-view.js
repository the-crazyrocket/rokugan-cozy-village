// New land, drawn on the water: the plot the sheet is offering (or, on desktop, the one under the basket) marked out tile by tile in
// a pale rope-and-chalk outline; the plot the village is filling, sandy and breathing, with earth tipped in here and there.
import * as THREE from 'three';
import { defineSystem } from '../../core/system.js';

const CAP = 64;
const OFFER = new THREE.Color('#fff6dc'), FILLING = new THREE.Color('#e4c48a');

function tileTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(4, 4, 56, 56);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3; g.setLineDash([7, 5]);
  g.strokeRect(4, 4, 56, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default defineSystem({
  name: 'plotView',
  needs: [],
  facade: {
    makePlotMarks() {
      const mat = new THREE.MeshBasicMaterial({ map: tileTexture(), transparent: true, depthWrite: false, opacity: 0.9, color: OFFER });
      this.plotMarks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), mat, CAP);
      this.plotMarks.frustumCulled = false; this.plotMarks.count = 0; this.plotMarks.renderOrder = 2;
      this.scene.add(this.plotMarks);
      this.plotSplash = 0;
    },

    /** The tiles to mark this frame, and how: { tiles, filling } | null. */
    plotShown() {
      const r = this.core.use('reclaim');
      if (r.active) return { tiles: r.active.tiles, filling: true };
      const ui = this.ui;
      if (ui?.modal === 'plot' && ui.sheetArgs) return { tiles: r.plotAt(ui.sheetArgs.x, ui.sheetArgs.z)?.tiles ?? [], filling: false };
      const ix = this.core.use('interact'), t = this.hoverTile;
      if (this.mode !== 'play' || ui?.modal || ix.kit !== 'dig' || ix.tool() !== 'earth' || !t || !r.shore(t.x, t.z)) return null;
      const k = `${t.x},${t.z},${r.size},${r.plots},${this.props.version}`;
      if (this.plotHover?.k !== k) this.plotHover = { k, tiles: r.plotAt(t.x, t.z)?.tiles ?? [] };
      return { tiles: this.plotHover.tiles, filling: false };
    },

    /** While the plot sheet is open, the camera looks at the plot, lifted into the part of the screen the sheet leaves free. */
    plotFocus() {
      const ui = this.ui;
      if (ui?.modal !== 'plot' || !ui.sheetArgs) return null;
      const tiles = this.core.use('reclaim').plotAt(ui.sheetArgs.x, ui.sheetArgs.z)?.tiles;
      const at = tiles?.length ? tiles : [ui.sheetArgs];
      const x = at.reduce((a, q) => a + q.x, 0) / at.length + 0.5, z = at.reduce((a, q) => a + q.z, 0) / at.length + 0.5;
      // the free part of the screen is above the card: aim for the middle of that
      const sheet = document.getElementById('panel')?.firstElementChild;
      const top = sheet ? sheet.getBoundingClientRect().top : window.innerHeight;
      const lift = Math.max(0, Math.min(0.42, 0.5 - top / 2 / window.innerHeight));
      return { x, z, lift };
    },

    updatePlot(dt, t) {
      if (!this.plotMarks) this.makePlotMarks();
      const shown = this.plotShown(), m = this.plotMarks;
      if (!shown?.tiles.length) { m.count = 0; return; }
      const o = new THREE.Object3D(), n = Math.min(CAP, shown.tiles.length);
      for (let i = 0; i < n; i++) {
        const q = shown.tiles[i];
        o.position.set(q.x + 0.5, this.world.waterY(q.x, q.z) + 0.03, q.z + 0.5);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      m.material.color.copy(shown.filling ? FILLING : OFFER);
      m.material.opacity = shown.filling ? 0.55 + 0.2 * Math.sin(t * 2.2) : 0.85 + 0.1 * Math.sin(t * 4);
      // the crew at work: earth tipped in, a splash
      if (shown.filling && (this.plotSplash -= dt) <= 0) {
        this.plotSplash = 0.9 + Math.random() * 0.9;
        const q = shown.tiles[Math.floor(Math.random() * n)], y = this.world.waterY(q.x, q.z);
        this.particles.burst(q.x + 0.5, y + 0.05, q.z + 0.5, { color: '#d8c08a', n: 10, up: 0.7 });
        this.particles.burst(q.x + 0.5, y + 0.05, q.z + 0.5, { color: '#e8f4f0', n: 8, up: 0.9 });
      }
    },
  },
});

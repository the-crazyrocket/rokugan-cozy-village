// Grass, reeds, forage and prop billboards, rebuilt from the world and the props.
import { defineSystem } from '../../core/system.js';
import { T, hash2 } from '../../game/world.js';
import { FORAGE } from '../../game/data.js';
import { LEGACY_OFF as O } from '../../world/coords.js';
import { NODES } from '../../systems/gather.js'; // decoration is hashed in the old island's frame, so it stays put

export default defineSystem({
  name: 'vegetationView',
  needs: [],
  facade: {
    rebuildVegetation() {
      const items = [];
      const occ = (x, z) => this.props.at(x, z);
      for (let z = 0; z < this.world.h; z++) for (let x = 0; x < this.world.w; x++) {
        const t = this.world.get(x, z);
        if (occ(x, z)) continue;
        if (t === T.GRASS) {
          const r = hash2(x - O, z - O, 3);
          const n = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
          for (let k = 0; k < n; k++) {
            const a = hash2(x - O, z - O, 10 + k), b = hash2(x - O, z - O, 20 + k), s = hash2(x - O, z - O, 30 + k);
            const sprite = s < 0.08 ? 'flowers_pink' : s < 0.16 ? 'flowers_white' : s < 0.2 ? 'fern' : s < 0.6 ? 'grass_a' : 'grass_b';
            const big = sprite === 'fern' ? 0.6 : sprite.startsWith('flowers') ? 0.5 : 0.42;
            items.push({ x: x + 0.15 + a * 0.7, z: z + 0.15 + b * 0.7, sprite, height: big * (0.8 + s * 0.5), sway: 0.08, phase: a * 6, shade: 0.92 + b * 0.14, flip: a > 0.5 });
          }
          if (hash2(x - O, z - O, 4) < 0.025) items.push({ x: x + 0.5, z: z + 0.5, sprite: 'bush', height: 0.8, sway: 0.02, shade: 1 });
        } else if (t === T.SAND && hash2(x - O, z - O, 5) < 0.06) {
          items.push({ x: x + 0.5, z: z + 0.5, sprite: 'grass_b', height: 0.35, sway: 0.08, shade: 0.9 });
        }
        // reeds along fresh water
        if (t !== T.WATER && t !== T.SOIL && t !== T.PATH) {
          let nearFresh = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.world.isFresh(x + dx, z + dz)) nearFresh = true;
          if (nearFresh && hash2(x - O, z - O, 6) < 0.45) items.push({ x: x + 0.3 + hash2(x - O, z - O, 7) * 0.4, z: z + 0.3 + hash2(x - O, z - O, 8) * 0.4, sprite: 'reeds', height: 0.95, sway: 0.1, shade: 1 });
        }
      }
      for (const f of this.daily.visibleForage()) {
        const def = FORAGE[f.item];
        for (let k = 0; k < 2; k++) {
          items.push({ x: f.x + 0.38 + k * 0.24, z: f.z + 0.5 - k * 0.12, sprite: def.sprite, height: def.height * (1 - k * 0.15), sway: 0.07, phase: k * 2, shade: 1.15, flip: k === 1 });
        }
      }
      const finds = this.core.use('gather').visible().map((s) => {
        const n = NODES[s.kind], j = hash2(s.x, s.z, 9);
        return { x: s.x + 0.4 + j * 0.2, z: s.z + 0.55, sprite: n.sprites[s.v % n.sprites.length], height: n.height, sway: 0, shade: 1.08, flip: j > 0.5 };
      });
      for (const it of items.concat(finds)) it.y = this.world.levelY(it.x, it.z); // on raised ground
      this.gatherLayer.set(finds);
      const guests = this.core.use('visitors').here.map((h) => {
        const d = this.core.content.visitors.get(h.id), j = hash2(h.x, h.z, 11);
        return { x: h.x + 0.5, z: h.z + 0.55, y: this.world.levelY(h.x + 0.5, h.z + 0.5), sprite: d.body.sprite, height: d.body.height, sway: 0.015, shade: 1.05, flip: j > 0.5 };
      });
      this.visitorLayer.set(guests);
      this.bugLayer.set(this.core.use('bugs').out().map((b) => {
        const j = hash2(b.x, b.z, 13);
        return { x: b.x + 0.3 + j * 0.4, z: b.z + 0.5, y: this.world.levelY(b.x + 0.5, b.z + 0.5) + 0.3 + j * 0.25, sprite: b.id, height: 0.26, sway: 0.25, phase: j * 6, shade: 1.1, flip: j > 0.5 };
      }));
      const pb = this.props.billboards();
      this.veg.set(items.concat(pb.veg));
      this.canopy.set(pb.canopy);
      this.blobs.set(pb.shadows);
      this.particles.petalSources = this.props.list.filter((p) => p.type === 'sakura').map((p) => ({ x: p.cx, z: p.cz }));
      this.placeMerchant();
    },
  },
});

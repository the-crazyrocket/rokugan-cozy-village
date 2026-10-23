// Grass, reeds, forage and prop billboards, rebuilt from the world and the props.
import { defineSystem } from '../../core/system.js';
import { T, hash2 } from '../../game/world.js';
import { FORAGE } from '../../game/data.js';

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
          const r = hash2(x, z, 3);
          const n = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
          for (let k = 0; k < n; k++) {
            const a = hash2(x, z, 10 + k), b = hash2(x, z, 20 + k), s = hash2(x, z, 30 + k);
            const sprite = s < 0.08 ? 'flowers_pink' : s < 0.16 ? 'flowers_white' : s < 0.2 ? 'fern' : s < 0.6 ? 'grass_a' : 'grass_b';
            const big = sprite === 'fern' ? 0.6 : sprite.startsWith('flowers') ? 0.5 : 0.42;
            items.push({ x: x + 0.15 + a * 0.7, z: z + 0.15 + b * 0.7, sprite, height: big * (0.8 + s * 0.5), sway: 0.08, phase: a * 6, shade: 0.92 + b * 0.14, flip: a > 0.5 });
          }
          if (hash2(x, z, 4) < 0.025) items.push({ x: x + 0.5, z: z + 0.5, sprite: 'bush', height: 0.8, sway: 0.02, shade: 1 });
        } else if (t === T.SAND && hash2(x, z, 5) < 0.06) {
          items.push({ x: x + 0.5, z: z + 0.5, sprite: 'grass_b', height: 0.35, sway: 0.08, shade: 0.9 });
        }
        // reeds along fresh water
        if (t !== T.WATER && t !== T.SOIL && t !== T.PATH) {
          let nearFresh = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.world.isFresh(x + dx, z + dz)) nearFresh = true;
          if (nearFresh && hash2(x, z, 6) < 0.45) items.push({ x: x + 0.3 + hash2(x, z, 7) * 0.4, z: z + 0.3 + hash2(x, z, 8) * 0.4, sprite: 'reeds', height: 0.95, sway: 0.1, shade: 1 });
        }
      }
      for (const f of this.daily.visibleForage()) {
        const def = FORAGE[f.item];
        for (let k = 0; k < 2; k++) {
          items.push({ x: f.x + 0.38 + k * 0.24, z: f.z + 0.5 - k * 0.12, sprite: def.sprite, height: def.height * (1 - k * 0.15), sway: 0.07, phase: k * 2, shade: 1.15, flip: k === 1 });
        }
      }
      const pb = this.props.billboards();
      this.veg.set(items.concat(pb.veg));
      this.canopy.set(pb.canopy);
      this.blobs.set(pb.shadows);
      this.particles.petalSources = this.props.list.filter((p) => p.type === 'sakura').map((p) => ({ x: p.cx, z: p.cz }));
      this.placeMerchant();
    },
  },
});

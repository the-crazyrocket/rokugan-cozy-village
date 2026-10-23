// Crop billboards, rebuilt from game.farm whenever it changes.
import { defineSystem } from '../../core/system.js';
import { CROPS, RIPE } from '../../game/data.js';

export default defineSystem({
  name: 'cropsView',
  needs: [],
  facade: {
    rebuildCrops() {
      const bySheet = Object.fromEntries(Object.keys(this.cropLayers).map((k) => [k, []]));
      for (const c of this.farm.values()) {
        const def = CROPS[c.type], s = this.stage(c), items = bySheet[def.sheet || 'crops'];
        const y = def.kind === 'pond' ? this.world.waterY(c.x + 0.5, c.z + 0.5) - 0.02 : this.world.levelY(c.x, c.z);
        const sprite = `${def.sprite}_${Math.max(1, s)}`;
        const h = s === 0 ? 0.28 : def.height[s - 1];
        const n = c.type === 'rice' ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const ox = n > 1 ? [-0.2, 0.18, 0.0][k] : 0, oz = n > 1 ? [0.15, 0.1, -0.2][k] : 0;
          items.push({ x: c.x + 0.5 + ox, y, z: c.z + 0.5 + oz, sprite, height: h * (n > 1 ? 0.85 : 1), sway: 0.05, phase: c.x * 1.3 + c.z + k, shade: s >= RIPE ? 1.08 : 1, flip: (c.x + c.z + k) % 2 === 0 });
        }
      }
      for (const [k, items] of Object.entries(bySheet)) this.cropLayers[k].set(items);
    },
  },
});

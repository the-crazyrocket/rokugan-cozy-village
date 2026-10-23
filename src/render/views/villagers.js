// The villagers' bodies: one character per villager on the map (painted from its blockout, or render/character.js until it is), placed from
// systems/villagers.js each frame and animated by what they are doing (walk, idle, sweep, work; sleeping ones are indoors).
import { defineSystem } from '../../core/system.js';
import { buildCharacter, animateCharacter } from '../character.js';
import { buildPaintedCharacter } from '../painted-character.js';

export default defineSystem({
  name: 'villagersView',
  needs: [],
  facade: {
    updateVillagers(t) {
      const vs = this.core.use('villagers');
      this.villagerMeshes ||= new Map();
      for (const [id, c] of this.villagerMeshes) if (!vs.where(id)) { this.scene.remove(c.root); this.villagerMeshes.delete(id); }
      for (const id of vs.present()) {
        const v = vs.where(id);
        if (!v) continue;
        let c = this.villagerMeshes.get(id);
        if (!c) {
          const d = this.core.content.villagers.get(id);
          c = (d.body?.blockout && buildPaintedCharacter(d.body.blockout, this.painted)) || buildCharacter(d.look || {});
          c.root.scale.setScalar(d.body?.height || 1);
          c.phase = (id.length * 1.7) % 6;
          this.scene.add(c.root);
          this.villagerMeshes.set(id, c);
        }
        c.root.visible = !v.indoors;
        if (v.indoors) continue;
        c.root.position.set(v.x, this.core.groundY(v.x, v.z), v.z);
        const turn = v.facing - c.root.rotation.y, wrap = Math.atan2(Math.sin(turn), Math.cos(turn));
        c.root.rotation.y += wrap * 0.2;
        const tt = t + c.phase;
        const swing = v.moving ? 0 : v.do === 'work' ? Math.max(0, Math.sin(tt * 5)) * 1.4 : v.do === 'sweep' ? 0.5 + Math.sin(tt * 3) * 0.35 : 0;
        animateCharacter(c, tt, { moving: v.moving, speed: 0.8, swing });
        if (v.do === 'sweep' && !v.moving) c.rig.rotation.y = Math.sin(tt * 3) * 0.3; else c.rig.rotation.y = 0;
      }
    },
  },
});

// The bobber, ripple and line while a line is in the water: draws the fishing system's cast, `this` is the Game.
import * as THREE from 'three';
import { defineSystem } from '../../core/system.js';

export default defineSystem({
  name: 'fishingView',
  needs: [],
  facade: {
    updateFishing(t) {
      const fishing = this.core.use('fishing');
      // the bite state machine is the fishing system's; this draws what it finds (touch screens get a little grace for tap latency)
      const now = fishing.tick(this.touchInput ? 150 : 0);
      if (now === null) {
        if (this.bobber.visible) { this.bobber.visible = this.line.visible = false; this.ripple.material.opacity = 0; }
        return;
      }
      const f = fishing.cast;
      this.bobber.visible = this.line.visible = true;
      this.bobber.position.x = f.x; this.bobber.position.z = f.z;
      const bob = Math.sin(t * 3) * 0.015;
      let dip = 0;
      if (f.phase === 'bite') {
        dip = -0.07 - Math.abs(Math.sin(t * 22)) * 0.04;
        const k = 1 - (f.biteEnd - now) / f.window;
        this.ripple.material.opacity = 0.7 * (1 - k);
        this.ripple.scale.setScalar(1 + k * 3);
      } else {
        const k = ((now - f.t0) % 1600) / 1600;
        this.ripple.material.opacity = 0.35 * (1 - k);
        this.ripple.scale.setScalar(1 + k * 2);
      }
      const wy = this.world.waterY(f.x, f.z);
      this.bobber.position.y = wy + 0.02 + bob + dip;
      this.ripple.position.set(f.x, wy + 0.01, f.z);
      const tip = this.rodTip.getWorldPosition(new THREE.Vector3());
      const pts = this.line.geometry.attributes.position;
      pts.setXYZ(0, tip.x, tip.y, tip.z);
      pts.setXYZ(1, this.bobber.position.x, this.bobber.position.y + 0.05, this.bobber.position.z);
      pts.needsUpdate = true;
    },
  },
});

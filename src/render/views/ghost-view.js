// The build preview: the translucent ghost over the cursor tile, and the tile cursor's colour while storing props.
// A view: what to show comes from the build system's preview(tile); the Ghost meshes are game/props.js.
import { defineSystem } from '../../core/system.js';

export default defineSystem({
  name: 'ghostView',
  needs: [],
  facade: {
    updateGhost() {
      const build = this.core.use('build');
      if (build.mode !== 'build') { this.ghost.hide(); return; }
      const t = build.cursor || this.hoverTile || this.targetTile();
      const p = build.preview(t);
      if (!p || p.pickup) {
        this.ghost.hide();
        if (p) this.cursorColor(p.ok ? 0x9fe08a : 0xffffff);
        return;
      }
      this.ghost.show(p.type, t.x, t.z, p.rot, p.ok);
    },

    cursorColor(c) { this.cursor.material.color.setHex(c); },
  },
});

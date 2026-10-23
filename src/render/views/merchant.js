// The merchant's character mesh. Where she stands is decided by merchantSpot() in systems/shared.js.
import { defineSystem } from '../../core/system.js';
import { buildCharacter } from '../character.js';
import { PALETTE } from '../../assets/palette.js';

export default defineSystem({
  name: 'merchantView',
  needs: [],
  facade: {
    placeMerchantMesh({ x, z, th }) {
      if (!this.merchant) {
        this.merchant = buildCharacter({ robe: PALETTE.vermilion, sash: PALETTE.indigo, hat: false, hair: '#4a3a30' });
        this.scene.add(this.merchant.root);
      }
      this.merchant.root.position.set(x, 0, z);
      this.merchant.root.rotation.y = th + 0.5;
    },
  },
});

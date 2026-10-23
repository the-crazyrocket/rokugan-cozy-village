// Blockouts: crossings over water.
import { defineBlockout } from '../registry.js';

const D = Math.PI / 180;

/** Bridge: 4 tiles long (land, water, water, land over the 2-wide river), local z from -2 to 2. */
export const BRIDGE_LEN = 4;
/** Bridge deck centre height along its local z axis (used for walking on it). */
export const BRIDGE_DECK = (z) => 0.08 + 0.32 * Math.cos((Math.max(-2.07, Math.min(2.07, z)) / 2.07) * Math.PI * 0.5);

function bridge() {
  const p = [];
  const n = 9, len = BRIDGE_LEN;
  const deckY = BRIDGE_DECK;
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * (len / n);
    const z2 = z + len / n * 0.5;
    const z1 = z - len / n * 0.5;
    const ang = Math.atan2(deckY(z2) - deckY(z1), len / n) / D;
    p.push({ shape: 'box', size: [0.95, 0.08, len / n + 0.02], pos: [0, deckY(z), z], rot: [-ang, 0, 0], part: 'woodLight' });
  }
  for (const x of [-0.47, 0.47]) {
    for (let i = 0; i <= 6; i++) {
      const z = -1.8 + i * 0.6;
      p.push({ shape: 'box', size: [0.08, 0.42, 0.08], pos: [x, deckY(z) + 0.2, z], part: 'lacquer' });
      p.push({ shape: 'sphere', r: 0.055, pos: [x, deckY(z) + 0.44, z], part: 'gold', seg: 8 });
    }
    for (let i = 0; i < 6; i++) {
      const za = -1.8 + i * 0.6, zb = za + 0.6;
      const ya = deckY(za) + 0.36, yb = deckY(zb) + 0.36;
      const ang = Math.atan2(yb - ya, 0.6) / D;
      p.push({ shape: 'box', size: [0.06, 0.06, 0.64], pos: [x, (ya + yb) / 2, (za + zb) / 2], rot: [-ang, 0, 0], part: 'lacquer' });
    }
    p.push({ shape: 'box', size: [0.06, 0.18, 3.9], pos: [x, 0.0, 0], part: 'woodDark' });
  }
  return p;
}

defineBlockout('bridge', {
  label: 'Arched bridge', footprint: [1, BRIDGE_LEN], onWater: true, walkable: true, parts: bridge(),
  desc: 'small arched wooden footbridge with light wood plank deck and vermilion lacquered railings with golden post caps',
});

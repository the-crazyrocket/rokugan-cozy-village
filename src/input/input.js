// Input: keyboard, mouse and touch gestures + screen -> tile picking (see pick.js, gestures.js, keys.js).
import { createPicker } from './pick.js';
import { setupGestures } from './gestures.js';
import { setupKeys } from './keys.js';

export function setupInput({ canvas, camera, game, ui, view }) {
  const picker = createPicker({ canvas, camera, game });
  const gestures = setupGestures({ canvas, game, ui, view, picker });
  setupKeys({ game, ui, view });
  return { pick: picker.pick, groundTile: picker.groundTile, toScreen: picker.toScreen, debug: gestures.debug };
}

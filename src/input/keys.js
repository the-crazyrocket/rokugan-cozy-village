// Keyboard: the cards and build mode are the UI's; the rest (action, tool numbers, rotate ...) are bound by the systems through ctx.keys.
const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function setupKeys({ game, ui, view }) {
  const keys = game.core.as('input').keys;
  keys.bind('KeyB', () => { ui.closeModal(); game.toggleBuild(); });
  keys.bind('KeyI', () => (ui.modal === 'bag' ? ui.closeModal() : ui.openBag()));
  keys.bind('KeyT', () => (ui.modal === 'today' ? ui.closeModal() : ui.openToday()));
  keys.bind('Escape', () => {
    if (ui.dialogOpen()) ui.closeDialog(false);
    else if (ui.modalOpen()) ui.closeModal();
    else if (game.mode === 'build') game.toggleBuild(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (BLOCK_KEYS.has(e.code)) e.preventDefault();
    ui.hideHelp();
    if (e.repeat && !MOVE_KEYS.includes(e.code)) return;
    game.touchInput = false; ui.setTouch(false);
    game.setKey(e.code, true);
    game.core.keys.press(e.code, game.core);
  });
  window.addEventListener('keyup', (e) => game.setKey(e.code, false));
  window.addEventListener('blur', () => { game.keys.clear(); view.hold = false; });
}

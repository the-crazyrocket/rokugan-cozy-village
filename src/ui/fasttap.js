/**
 * Touch buttons fire on pointerup instead of waiting for the browser's click
 * (instant, and it still works when a slow frame stretches the tap past the
 * browser's long-press threshold). The native click that may follow is eaten,
 * wherever it lands: a sheet the tap just opened may now be under the finger.
 */
export function installFastTap() {
  const SEL = 'button:not(#btn-action), .row.tappable, .bag-item.clickable';
  let down = null, eat = null, eatUntil = 0, eatX = 0, eatY = 0;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { down = null; return; }
    const t = e.target.closest?.(SEL);
    down = t ? { el: t, x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  }, true);
  document.addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || e.pointerId !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest(SEL);
    if (t !== d.el) return;
    eat = d.el; eatUntil = performance.now() + 1500; eatX = e.clientX; eatY = e.clientY;
    d.el.click();
  }, true);
  document.addEventListener('pointercancel', () => { down = null; }, true);
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !eat || performance.now() > eatUntil) return;
    const here = Math.hypot(e.clientX - eatX, e.clientY - eatY) < 24;
    if (here || e.target === eat || eat.contains(e.target) || !eat.isConnected) { e.stopPropagation(); e.preventDefault(); eat = null; }
  }, true);
}

export const fasttapMixin = { installFastTap };

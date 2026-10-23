// The browser end of ctx.say / ctx.sfx / ctx.fx: toasts, sounds and particles are events, and this is the only listener.
// Systems never touch ui, sound or particles. Subscribes at PRIO.VIEW so state settles before a toast, and ignores events
// that carry meta.away (a catch-up has its own summary). `host` is read lazily: { ui, sound, particles, ghost, haptic }.
// Also here: haptic, bubble (the "!" over the player), invalidate('ui') (a UI refresh), buildMode (closes the prop menu, hides the ghost)
// and wake (closes the open sheet, then the wake card after the camera tour; host.focusQ says whether there is a tour). fx kinds: burst, sparkle.
// Taps: openSheet (the shop, shrine or bag card), floatLabel, queueChange (the queue chips) and buildSelect (the build bar's choice). The `ui.modalOpen`
// filter answers whether a card is open. itemGain flies the item's icon to the bag (not for buying, crafting or gifts).
import { PRIO } from '../core/bus.js';

const NO_FLY = new Set(['buy', 'craft', 'gift', 'request', 'project', 'load']); // item gains that did not come out of the world
const SHEETS = { shop: 'openShop', shrine: 'openShrine', bag: 'openBag' }; // sheet name -> the ui method that opens it

export function attachFeedback(core, host) {
  const opts = { priority: PRIO.VIEW, owner: 'feedback' };
  const offs = [
    core.bus.on('say', (p, m) => { if (!m.away) host.ui?.toast(p.text, p.icon); }, opts),
    core.bus.on('sfx', (p, m) => { if (!m.away) host.sound?.play(p.name, p.opts); }, opts),
    core.bus.on('fx', (p, m) => {
      if (m.away) return;
      if (p.kind === 'burst') host.particles?.burst(p.x, p.y, p.z, p.opts);
      else if (p.kind === 'sparkle') host.particles?.sparkle(p.x, p.y, p.z);
    }, opts),
    core.bus.on('itemGain', (p, m) => { if (!m.away && !NO_FLY.has(p.reason)) host.ui?.flyToBag?.(p.item); }, opts),
    core.bus.on('haptic', (p, m) => { if (!m.away) host.haptic?.(p.ms); }, opts),
    core.bus.on('bubble', (p, m) => { if (!m.away) host.ui?.bubble(p.text); }, opts),
    core.bus.on('invalidate', (p, m) => { if (!m.away && p.what === 'ui') host.ui?.refresh(); }, opts),
    core.bus.on('wake', (p, m) => { if (m.away) return; host.ui?.closeModal(); host.ui?.celebrate?.(p.fortune, host.focusQ?.length ? 4700 : 0); }, opts),
    core.bus.on('openSheet', (p, m) => { if (m.away) return; if (SHEETS[p.name]) host.ui?.[SHEETS[p.name]]?.(); else host.ui?.openModal?.(p.name, undefined, p.args); }, opts),
    core.bus.on('floatLabel', (p, m) => { if (!m.away) host.ui?.floatLabel(p.text, p.x, p.z); }, opts),
    core.bus.on('queueChange', (p, m) => { if (!m.away) host.ui?.refreshQueue?.(); }, opts),
    core.bus.on('buildSelect', (p, m) => { if (!m.away) host.ui?.selectBuild(p.index); }, opts),
    core.bus.filter('ui.modalOpen', (open) => open || !!host.ui?.modalOpen(), opts),
    core.bus.on('buildMode', (p, m) => { if (m.away) return; if (!p.on) host.ghost?.hide(); host.ui?.closePropMenu?.(); }, opts),
  ];
  return () => offs.forEach((off) => off());
}

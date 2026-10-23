// The HUD slots (ctx.hud): which entries show in a slot and how a slot's box is kept in step with them. No `ui` or `document` needed beyond the box.

/** The entries of `slot` whose `when` holds, in order. */
export function visibleEntries(core, slot) {
  return core.hud.slot(slot).filter((e) => !e.when || core.cond.evaluate(e.when, core.condCtx()));
}

/**
 * Renders the entries into `box` (render(ui, core) returns an element, or nothing to hide that entry). An element whose markup did not change
 * since last time stays in the box, so a refresh in the middle of a tap does not swap the button under the finger. `cache` is per box.
 */
export function syncSlot(box, entries, ui, core, cache) {
  const els = [];
  for (const e of entries) {
    let node = null;
    try { node = e.render(ui, core); } catch (err) { console.error(`hud ${e.id}: render failed`, err); }
    if (!node) { cache.delete(e.id); continue; }
    const html = node.outerHTML, prev = cache.get(e.id);
    if (prev && prev.html === html) node = prev.node; else cache.set(e.id, { html, node });
    els.push(node);
  }
  for (const id of [...cache.keys()]) if (!entries.some((e) => e.id === id)) cache.delete(id);
  const cur = [...box.children];
  if (cur.length !== els.length || els.some((n, i) => cur[i] !== n)) box.replaceChildren(...els);
  box.classList.toggle('hidden', !els.length);
  return els;
}

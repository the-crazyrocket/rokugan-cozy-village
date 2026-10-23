import { decodeSave, writeSave } from '../../game/save.js';
import { el } from '../dom.js';

export function render(ui) {
  const g = ui.game;
  const body = el('div', 'backup');
  body.appendChild(el('p', null, 'Paste a village code from <b>Back up</b>. It replaces the village in this browser.'));
  const ta = el('textarea', 'code');
  ta.placeholder = 'RCV2z:…';
  body.appendChild(ta);
  const ok = el('button', 'btn big restore', 'Restore village');
  ok.onclick = async () => {
    let data;
    try { data = await decodeSave(ta.value); } catch (e) { ui.toast(e.message || 'That code didn’t work.'); return; }
    if (!(await ui.confirm('Replace the village in this browser with the one from the code?', 'Restore'))) return;
    g.frozen = true; // don't let the unload save overwrite the restored village
    writeSave(data, { backup: true });
    location.reload();
  };
  body.appendChild(ok);
  return { title: 'Restore a village', body };
}

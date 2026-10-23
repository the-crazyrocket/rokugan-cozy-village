import { encodeSave } from '../../game/save.js';
import { el } from '../dom.js';

export function render(ui) {
  const g = ui.game;
  const body = el('div', 'backup');
  body.appendChild(el('p', null, 'This code holds your whole village. Keep it somewhere safe, like a note or a message to yourself. Paste it into <b>Restore</b> in any browser (or the installed app) to carry on there.'));
  const ta = el('textarea', 'code');
  ta.readOnly = true;
  ta.value = 'Packing your village…';
  body.appendChild(ta);
  const row = el('div', 'set-row');
  const copy = el('button', 'btn big', 'Copy code');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(ta.value); ui.toast('Village code copied.'); } catch { ta.select(); ui.toast('Select the code and copy it.'); }
  };
  row.appendChild(copy);
  if (navigator.share) {
    const share = el('button', 'btn', 'Share…');
    share.onclick = () => navigator.share({ title: 'Rokugan Cozy Village backup', text: ta.value }).catch(() => {});
    row.appendChild(share);
  }
  const dl = el('button', 'btn', 'Save as file');
  dl.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ta.value], { type: 'text/plain' }));
    a.download = `rokugan-village-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  row.appendChild(dl);
  body.appendChild(row);
  g.save();
  encodeSave(g.serialize()).then((code) => { ta.value = code; ta.dataset.ready = '1'; });
  return { title: 'Back up your village', body };
}

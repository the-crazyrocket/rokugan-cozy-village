import { $ } from './dom.js';

export const dialogsMixin = {
  confirm(text, okLabel = 'OK') {
    const d = $('#dialog');
    d.querySelector('.dlg-text').textContent = text;
    d.querySelector('.dlg-ok').textContent = okLabel;
    d.classList.remove('hidden');
    return new Promise((resolve) => {
      this.dialogResolve = resolve;
      d.querySelector('.dlg-ok').onclick = () => this.closeDialog(true);
      d.querySelector('.dlg-cancel').onclick = () => this.closeDialog(false);
    });
  },
  dialogOpen() { return !$('#dialog').classList.contains('hidden'); },
  closeDialog(v) { $('#dialog').classList.add('hidden'); const r = this.dialogResolve; this.dialogResolve = null; r?.(v); },
};

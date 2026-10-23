import { el } from './dom.js';

export const toastMixin = {
  toast(msg, icon) {
    const t = el('div', 'toast', (icon ? this.iconHTML(icon, 'icon small') : '') + `<span>${msg}</span>`);
    this.toasts.appendChild(t);
    const max = this.compact() ? 2 : 4;
    while (this.toasts.children.length > max) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  },

  bubble(text) {
    this.bubbleText = text;
    this.bubbleEl.textContent = text || '';
    this.bubbleEl.classList.toggle('hidden', !text);
  },
};

// The "to do" ribbon: the most pressing entry of ctx.todo (a project being built, an offering ready...) as one tappable line under
// the purse. Redrawn a few times a second from update(); hidden while a sheet is open.
import { el } from './dom.js';

export const todoMixin = {
  renderTodo() {
    const core = this.game?.core;
    if (!core) return;
    if (!this.todoEl) {
      this.todoEl = el('button', 'todo-ribbon hidden');
      this.todoEl.id = 'todo';
      this.todoEl.onclick = () => this.todoTop?.onTap?.();
      document.body.appendChild(this.todoEl);
    }
    const top = this.modal ? null : core.todo.collect(core)[0] || null;
    this.todoTop = top;
    this.todoEl.classList.toggle('hidden', !top);
    if (!top) return;
    const html = `${top.icon ? this.iconHTML(top.icon, 'icon tiny') : ''}<span>${top.text}</span>`;
    if (this.todoEl.dataset.html !== html) { this.todoEl.innerHTML = html; this.todoEl.dataset.html = html; }
  },
};

import { $ } from './dom.js';

export const actionButtonMixin = {
  bindActionButton() {
    const game = this.game;
    // pointerdown so reeling in reacts instantly on touch screens
    const act = $('#btn-action');
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); game.touchInput = e.pointerType !== 'mouse'; game.action(); this.actionT = 0; });
    act.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  },

  /** The context button: Reel while fishing, Place in desktop build mode, else what a tap on the target tile would do (nothing: hidden, or the land tool while digging on desktop). */
  updateAction() {
    const g = this.game;
    const btn = $('#btn-action');
    let html = null, cls = '';
    if (g.fishing) {
      html = '<span class="lbl">Reel!</span>';
      cls = g.fishing.phase === 'bite' ? 'reel bite' : 'reel';
    } else if (g.mode === 'build') {
      html = this.touch ? null : '<span class="lbl">Place</span>';
    } else if (!this.modalOpen()) {
      const a = g.resolve(g.targetTile());
      if (g.core.actions.get(a.kind)?.button) html = `${this.iconHTML(a.icon, 'icon act')}<span class="lbl">${a.label}</span>`;
      else if (!this.touch && g.kit === 'dig') html = `${this.iconHTML(this.toolInfo(g.tool).icon, 'icon act')}<span class="lbl">Use</span>`;
    }
    btn.classList.toggle('hidden', !html);
    if (html && btn.dataset.html !== html) { btn.innerHTML = html; btn.dataset.html = html; }
    btn.className = btn.className.replace(/\b(reel|bite)\b/g, '').trim() + (cls ? ` ${cls}` : '');
    btn.classList.toggle('hidden', !html);
  },
};

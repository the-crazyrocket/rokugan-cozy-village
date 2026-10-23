import { $ } from './dom.js';

export const buildBarMixin = {
  bindBuildBar() {
    const game = this.game;
    $('#btn-build').onclick = () => game.toggleBuild();
    $('#btn-rotate').onclick = () => game.rotate();
    $('#bb-place').onclick = () => game.confirmBuild();
    $('#bb-rotate').onclick = () => game.rotate();
    $('#bb-cancel').onclick = () => game.cancelBuildPreview();
  },

  /** The touch confirm bar (place / rotate / cancel) shows while a build preview is down. */
  updateBuildBar() {
    const g = this.game;
    const show = g.mode === 'build' && this.touch && g.buildSel !== 'pickup' && !!g.buildCursor;
    $('#build-bar').classList.toggle('hidden', !show);
  },
};

// Desktop: the mouse cursor shows what a click will do there — the icon of the action under it (the action button's), or of the
// land tool while digging; plain ground keeps the arrow. Each icon is drawn once onto a little cream badge and kept as a data URL.
import { assetUrl } from '../render/assets.js';

const SIZE = 40; // css px; drawn at 2x for sharp screens
const HOT = 3; // the click point: the badge's top-left tip

const images = new Map(); // url -> Promise<HTMLImageElement>
const loadImage = (url) => {
  if (!images.has(url)) images.set(url, new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; }));
  return images.get(url);
};

/** The source rectangle of icon `spec` ('sheet:cell' or 'asset:name'): { url, sx, sy, sw, sh } (fractions of the image), or null. */
function source(painted, spec) {
  const [kind, name] = String(spec).split(':');
  if (kind === 'asset') return painted?.assets?.[name] ? { url: assetUrl(`assets/painted/icons/${name}.png`), sx: 0, sy: 0, sw: 1, sh: 1 } : null;
  const sheet = painted?.sheets?.[kind], c = sheet?.cells?.[name];
  if (!c?.uv || !sheet.atlas) return null;
  const [u0, v0, u1, v1] = c.uv;
  return { url: assetUrl(sheet.atlas), sx: u0, sy: 1 - v1, sw: u1 - u0, sh: v1 - v0 };
}

/** Draws the cursor for `spec` at `scale`: a pointer tip, a cream badge, the icon on it. -> data URL */
function draw(img, src, scale) {
  const s = SIZE * scale, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  // the tip, so the click point reads
  g.beginPath(); g.moveTo(1, 1); g.lineTo(13, 5); g.lineTo(5, 13); g.closePath();
  g.fillStyle = '#48311f'; g.fill();
  // the badge
  g.beginPath(); g.arc(23, 23, 15.5, 0, Math.PI * 2);
  g.fillStyle = '#fbf3df'; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#48311f'; g.stroke();
  g.beginPath(); g.arc(23, 23, 13.5, 0, Math.PI * 2);
  g.lineWidth = 1; g.strokeStyle = 'rgba(220,174,82,.9)'; g.stroke();
  const W = img.naturalWidth, H = img.naturalHeight;
  g.drawImage(img, src.sx * W, src.sy * H, src.sw * W, src.sh * H, 9, 9, 28, 28);
  return c.toDataURL('image/png');
}

export const cursorMixin = {
  /** Per frame (cheap: works only when the tile or what it resolves to changes). */
  updateCursor(canvas) {
    const g = this.game;
    let spec = null;
    const t = g.hoverTile;
    if (!this.touch && t && g.mode === 'play' && !g.fishing && !this.modalOpen()) {
      const key = `${t.x},${t.z},${g.kit},${this.actionTick}`; // and again on the action button's beat (a crop ripens, a bug lands)
      if (key === this.cursorKey) return;
      this.cursorKey = key;
      const a = g.resolve(t);
      if (g.core.actions.get(a.kind)?.button && a.icon) spec = a.icon;
      else if (g.kit === 'dig') spec = this.toolInfo(g.tool).icon;
    } else this.cursorKey = null;
    if (spec === this.cursorSpec) return;
    this.cursorSpec = spec;
    if (!spec) { canvas.style.cursor = ''; return; }
    this.cursorURLs ??= new Map();
    const set = () => { if (this.cursorSpec !== spec) return; const [a, b] = this.cursorURLs.get(spec); canvas.style.cursor = `url(${a}) ${HOT} ${HOT}, pointer`; canvas.style.cursor = `image-set(url(${a}) 1x, url(${b}) 2x) ${HOT} ${HOT}, pointer`; };
    if (this.cursorURLs.has(spec)) { set(); return; }
    const src = source(this.painted, spec);
    if (!src) { canvas.style.cursor = 'pointer'; return; }
    loadImage(src.url).then((img) => { this.cursorURLs.set(spec, [draw(img, src, 1), draw(img, src, 2)]); set(); }, () => { if (this.cursorSpec === spec) canvas.style.cursor = 'pointer'; });
  },
};

import { assetUrl } from '../render/assets.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The neutral glyph (a dashed tile with a diamond, see .icon.missing) for a spec whose sheet, cell or painted asset does not exist. */
export const missingIcon = (spec, cls = 'icon') => `<span class="${cls} missing" data-missing="${esc(spec)}"></span>`;

/** Icon markup for a spec like 'icons:basket' (sheet cell) or 'asset:minka' (single painted icon); anything unknown draws the placeholder glyph. */
export function iconHTML(painted, spec, cls = 'icon') {
  const [kind, name] = String(spec).split(':');
  if (kind === 'asset' && painted?.assets?.[name]) return `<span class="${cls}" style="background-image:url('${assetUrl(`assets/painted/icons/${name}.png`)}');background-size:contain"></span>`;
  const sheet = kind === 'asset' ? null : painted?.sheets?.[kind];
  const c = sheet?.cells?.[name];
  if (!c?.uv || !sheet.atlas) return missingIcon(spec, cls);
  const [u0, v0, u1, v1] = c.uv;
  const cw = u1 - u0, ch = v1 - v0;
  const px = cw < 1 ? (u0 / (1 - cw)) * 100 : 0, py = ch < 1 ? ((1 - v1) / (1 - ch)) * 100 : 0;
  return `<span class="${cls}" style="background-image:url('${assetUrl(sheet.atlas)}');background-size:${100 / cw}% ${100 / ch}%;background-position:${px}% ${py}%"></span>`;
}

export const iconMixin = {
  iconHTML(spec, cls = 'icon') { return iconHTML(this.painted, spec, cls); },
};

#!/usr/bin/env python3
"""Step 3b of the art pipeline: post-process Codex paintings into game textures.

For every asset/angle:
  * key out the magenta background, bounding-box-fit the painting onto the
    blockout's alpha mask (generated images can drift a few pixels),
  * fill any remaining holes inside the mask (and bleed colour outside it) with
    a push-pull fill, downscale to 512 px and save as WebP,
  * min-pool the packed depth pass to 512 px (used in-game for occlusion),
  * cut a small RGBA icon.
If an asset/angle was NOT painted by Codex, a procedural brushy texture is made
from the flat colour pass instead, and the manifest says so.

Sprite sheets are keyed, sliced per grid cell, re-anchored and packed into atlases;
tile textures are made seamless. Writes assets/painted/** and the manifests.
Requires: Python 3, Pillow, numpy.
"""
import json
import zlib
import os
import sys
import subprocess
from datetime import datetime, timezone

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RENDERS = os.path.join(ROOT, 'pipeline/out/renders')
RAW = os.path.join(ROOT, 'pipeline/out/painted_raw')
POST = os.path.join(ROOT, 'pipeline/out/post')
DEST = os.path.join(ROOT, 'assets/painted')
OUT_SIZE = 512
MIN_IOU = 0.55  # below this the painting is considered misaligned -> procedural fallback


def load_defs():
    """Read asset + sheet definitions from the shared JS modules via node."""
    js = (
        "const b = await import('./src/assets/blockouts.js');"
        "const s = await import('./src/assets/sheets.js');"
        "const j = await import('./pipeline/jobs.mjs');"
        "console.log(JSON.stringify({assets: Object.fromEntries(Object.entries(b.BLOCKOUTS).map(([k,v])=>[k,{label:v.label,footprint:v.footprint}])),"
        "sheets: s.SHEETS, azimuths: j.AZIMUTHS}))"
    )
    out = subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT)
    return json.loads(out)


# ----------------------------------------------------------------- helpers
def magenta_score(rgb):
    r, g, b = rgb[..., 0].astype(np.int32), rgb[..., 1].astype(np.int32), rgb[..., 2].astype(np.int32)
    return np.minimum(r, b) - g  # high for magenta-ish pixels


def key_alpha(rgb, lo=45, hi=110):
    """Soft alpha from magenta-ness: 1 = subject, 0 = background."""
    m = magenta_score(rgb)
    a = np.clip((hi - m) / float(hi - lo), 0.0, 1.0)
    return a


def despill(rgb, alpha):
    out = rgb.astype(np.float32)
    m = np.clip(magenta_score(rgb), 0, None).astype(np.float32)
    k = (1.0 - alpha) * 0.9 + 0.1
    sub = m * k
    out[..., 0] -= sub
    out[..., 2] -= sub
    return np.clip(out, 0, 255)


def push_pull(rgb, w):
    """Fill pixels with low weight from their weighted neighbourhood (recursive pyramid)."""
    h, wd = w.shape
    if h <= 2 or wd <= 2:
        tot = w.sum()
        mean = (rgb * w[..., None]).sum((0, 1)) / max(tot, 1e-6)
        return np.where(w[..., None] > 0, rgb, mean)
    ph, pw = h + (h % 2), wd + (wd % 2)
    c = np.zeros((ph, pw, 3), np.float32)
    ww = np.zeros((ph, pw), np.float32)
    c[:h, :wd] = rgb * w[..., None]
    ww[:h, :wd] = w
    cs = c.reshape(ph // 2, 2, pw // 2, 2, 3).sum((1, 3))
    ws = ww.reshape(ph // 2, 2, pw // 2, 2).sum((1, 3))
    low = push_pull(cs / np.maximum(ws, 1e-6)[..., None], np.minimum(ws, 1.0))
    up = low.repeat(2, 0).repeat(2, 1)[:h, :wd]
    wc = np.clip(w, 0, 1)[..., None]
    return rgb * wc + up * (1 - wc)


def bbox(mask):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def label_components(mask, f):
    """4-connected components on a max-pooled (factor f) mask; returns full-res
    label image and {label: (area, cx, cy)} with centroids in full-res pixels."""
    from collections import deque
    h, w = mask.shape
    sm = mask[:h - h % f, :w - w % f].reshape(h // f, f, w // f, f).max((1, 3))
    sh, sw = sm.shape
    lab = np.zeros((sh, sw), np.int32)
    comps = {}
    n = 0
    for y in range(sh):
        for x in range(sw):
            if not sm[y, x] or lab[y, x]:
                continue
            n += 1
            lab[y, x] = n
            q = deque([(y, x)])
            area = sx = sy = 0
            while q:
                cy, cx = q.popleft()
                area += 1; sx += cx; sy += cy
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < sh and 0 <= nx < sw and sm[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
            comps[n] = (area, (sx / area + 0.5) * f, (sy / area + 0.5) * f)
    full = np.zeros((h, w), np.int32)
    full[:sh * f, :sw * f] = lab.repeat(f, 0).repeat(f, 1)
    return full, comps


def clean_mask(mask_bool, size=5):
    im = Image.fromarray((mask_bool * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
    return np.asarray(im) > 127


def fit_to_bbox(img, src_box, dst_box, size):
    """Affine-map img so src_box lands on dst_box (independent x/y scale)."""
    sx0, sy0, sx1, sy1 = src_box
    dx0, dy0, dx1, dy1 = dst_box
    ax = (sx1 - sx0) / float(dx1 - dx0)
    ay = (sy1 - sy0) / float(dy1 - dy0)
    # output (x,y) -> input (ax*x + bx, ay*y + by)
    coeffs = (ax, 0, sx0 - ax * dx0, 0, ay, sy0 - ay * dy0)
    return img.transform((size, size), Image.AFFINE, coeffs, resample=Image.BICUBIC, fillcolor=(255, 0, 255))


def decode_depth(arr):
    d = arr[..., 0].astype(np.float32) / 255.0 + arr[..., 1].astype(np.float32) / 255.0 / 255.0
    d[arr[..., 2] < 128] = 1.0  # background sentinel
    return d


def encode_depth(d):
    bg = d >= 0.99999
    dc = np.clip(d, 0, 0.99998)
    hi = np.floor(dc * 255.0)
    lo = np.round((dc * 255.0 - hi) * 255.0)
    out = np.zeros(d.shape + (3,), np.uint8)
    out[..., 0] = hi
    out[..., 1] = np.clip(lo, 0, 255)
    out[..., 2] = 255
    out[bg] = (255, 255, 0)
    return out


def min_pool(d, f):
    h, w = d.shape
    return d.reshape(h // f, f, w // f, f).min((1, 3))


def brush_noise(shape, seed, strokes=1400):
    """Cheap brush-stroke luminance field for the procedural fallback."""
    rng = np.random.default_rng(seed)
    h, w = shape
    field = Image.new('L', (w, h), 128)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(field)
    for _ in range(strokes):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        ang = rng.normal(0.35, 0.5)
        ln = rng.uniform(10, 40)
        v = int(rng.uniform(95, 165))
        dr.line([(x, y), (x + np.cos(ang) * ln, y + np.sin(ang) * ln)], fill=v, width=int(rng.uniform(4, 10)))
    field = field.filter(ImageFilter.GaussianBlur(1.6))
    return (np.asarray(field).astype(np.float32) - 128.0) / 128.0


def procedural_paint(color_rgb, outline_l, mask_bool, seed):
    n = brush_noise(mask_bool.shape, seed)
    col = color_rgb.astype(np.float32) * (1.0 + 0.16 * n[..., None])
    ink = np.array([60, 40, 30], np.float32)
    line = 1.0 - outline_l.astype(np.float32) / 255.0
    col = col * (1 - 0.55 * line[..., None]) + ink * 0.55 * line[..., None]
    return np.clip(col, 0, 255)


def save_webp(arr, path, q=84):
    Image.fromarray(arr.astype(np.uint8)).save(path, 'WEBP', quality=q, method=6)


# ----------------------------------------------------------------- assets
def process_asset(name, az, status):
    job = f'{name}_a{az}'
    rd = os.path.join(RENDERS, name)
    mask_im = Image.open(os.path.join(rd, f'{job}_mask.png')).convert('L')
    size = mask_im.width
    mask_f = np.asarray(mask_im).astype(np.float32) / 255.0
    mask = mask_f > 0.5
    raw = os.path.join(RAW, f'{job}_painted.png')
    info = {'job': job, 'azimuth': az, 'codexPainted': False, 'source': 'procedural'}
    painted = None
    if os.path.exists(raw) and status.get(job, {}).get('painted'):
        img = Image.open(raw).convert('RGB')
        if img.size != (size, size):
            img = img.resize((size, size), Image.LANCZOS)
        rgb = np.asarray(img)
        fg = clean_mask(key_alpha(rgb) > 0.5)
        sb, db = bbox(fg), bbox(mask)
        if sb and db:
            aligned = np.asarray(fit_to_bbox(img, sb, db, size))
            afg = key_alpha(aligned) > 0.5
            iou = float((afg & mask).sum()) / float(max((afg | mask).sum(), 1))
            raw_iou = float((fg & mask).sum()) / float(max((fg | mask).sum(), 1))
            aligned_used = iou >= raw_iou
            if not aligned_used:  # stray brush marks can inflate the bbox: keep the raw framing then
                aligned, iou = rgb, raw_iou
            info.update({'iouBeforeAlign': round(raw_iou, 3), 'iouAfterAlign': round(iou, 3), 'alignApplied': bool(aligned_used),
                         'alignScale': [round((sb[2] - sb[0]) / (db[2] - db[0]), 4), round((sb[3] - sb[1]) / (db[3] - db[1]), 4)],
                         'alignOffsetPx': [int(sb[0] - db[0]), int(sb[1] - db[1])]})
            if iou >= MIN_IOU:
                a = key_alpha(aligned)
                valid = (a * mask_f).astype(np.float32)
                painted = despill(aligned, a)
                painted = push_pull(painted, valid)
                info.update({'codexPainted': True, 'source': 'codex'})
            else:
                info['note'] = f'Codex painting rejected: silhouette IoU {iou:.2f} < {MIN_IOU}; procedural fallback used'
    if painted is None:
        color = np.asarray(Image.open(os.path.join(rd, f'{job}_color.png')).convert('RGB'))
        outline = np.asarray(Image.open(os.path.join(rd, f'{job}_outline.png')).convert('L'))
        painted = procedural_paint(color, outline, mask, seed=zlib.crc32(job.encode()) & 0xffff)
        painted = push_pull(painted, mask_f)
    small = np.asarray(Image.fromarray(painted.astype(np.uint8)).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS))
    tex_path = os.path.join(DEST, f'{job}.webp')
    save_webp(small, tex_path)
    # depth (min-pooled so occluders stay conservative)
    darr = np.asarray(Image.open(os.path.join(rd, f'{job}_depth.png')).convert('RGB'))
    d = min_pool(decode_depth(darr), size // OUT_SIZE)
    depth_path = os.path.join(DEST, f'{job}_depth.png')
    Image.fromarray(encode_depth(d)).save(depth_path, optimize=True)
    # preview with alpha (for the README contact sheet / icons)
    rgba = np.dstack([painted.astype(np.uint8), (mask_f * 255).astype(np.uint8)])
    Image.fromarray(rgba).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS).save(os.path.join(POST, f'{job}_rgba.png'))
    if az == 45:
        icon = Image.fromarray(rgba)
        icon = icon.crop(icon.getbbox())
        icon.thumbnail((112, 112), Image.LANCZOS)
        canvas = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        canvas.paste(icon, ((128 - icon.width) // 2, (128 - icon.height) // 2), icon)
        canvas.save(os.path.join(DEST, 'icons', f'{name}.png'), optimize=True)
    cam = json.load(open(os.path.join(rd, f'{job}_camera.json')))
    info.update({
        'texture': os.path.relpath(tex_path, ROOT),
        'depth': os.path.relpath(depth_path, ROOT),
        'camera': {k: cam[k] for k in ('viewProjectionMatrix', 'viewMatrix', 'projectionMatrix', 'viewDir', 'cameraPosition', 'frustum', 'azimuth', 'elevation')},
    })
    return info


# ----------------------------------------------------------------- sheets
def process_sheet(name, s, status):
    raw = os.path.join(RAW, f'{name}_painted.png')
    guide = os.path.join(RENDERS, 'sheets', f'{name}_guide.png')
    by_codex = os.path.exists(raw) and status.get(name, {}).get('painted')
    img = Image.open(raw if by_codex else guide).convert('RGB').resize((s['width'], s['height']), Image.LANCZOS)
    info = {'sheet': name, 'codexPainted': bool(by_codex), 'source': 'codex' if by_codex else 'procedural (canvas guide sketch)', 'cells': {}}
    cols, rows = s['cols'], s['rows']
    cw, ch = s['width'] // cols, s['height'] // rows
    if s.get('tile'):
        os.makedirs(os.path.join(DEST, 'tiles'), exist_ok=True)
        for i, (cid, _) in enumerate(s['cells']):
            c, r = i % cols, i // cols
            inset = int(cw * 0.03)  # avoid bleeding from the neighbouring cell
            cell = np.asarray(img.crop((c * cw + inset, r * ch + inset, (c + 1) * cw - inset, (r + 1) * ch - inset)).resize((512, 512), Image.LANCZOS)).astype(np.float32)
            # seamless: cross-fade with a half-offset copy towards the borders
            rolled = np.roll(np.roll(cell, 256, 0), 256, 1)
            yy, xx = np.mgrid[0:512, 0:512] / 511.0
            wgt = (np.sin(np.pi * xx) * np.sin(np.pi * yy)) ** 0.6
            out = cell * wgt[..., None] + rolled * (1 - wgt[..., None])
            p = os.path.join(DEST, 'tiles', f'{cid}.webp')
            save_webp(out, p, q=82)
            info['cells'][cid] = os.path.relpath(p, ROOT)
        return info
    rgb = np.asarray(img)
    alpha = key_alpha(rgb)
    rgb = despill(rgb, alpha)
    is_icon = name == 'icons'
    scale = 0.5 if s['width'] >= 1024 else 1.0
    ocw, och = int(cw * scale), int(ch * scale)
    atlas_rgb = np.zeros((och * rows, ocw * cols, 3), np.float32)
    atlas_a = np.zeros((och * rows, ocw * cols), np.float32)
    # connected components on the whole sheet: sprites that overflow their cell
    # stay whole, and fragments of neighbours don't leak into a cell
    labels, comps = label_components(alpha > 0.5, 4)
    owner = {}
    for lab, (area, cxm, cym) in comps.items():
        if area < 6:
            continue
        owner.setdefault(min(cols - 1, int(cxm // cw)) + min(rows - 1, int(cym // ch)) * cols, []).append(lab)
    for i, (cid, _) in enumerate(s['cells']):
        c, r = i % cols, i // cols
        labs = owner.get(i)
        if not labs:
            continue
        m = np.isin(labels, labs) & (alpha > 0.02)
        b = bbox(m)
        bx0, by0, bx1, by1 = b
        crop_rgb = rgb[by0:by1, bx0:bx1]
        crop_a = alpha[by0:by1, bx0:bx1] * m[by0:by1, bx0:bx1]
        bw, bh = bx1 - bx0, by1 - by0
        fit = min(1.0, (cw * 0.96) / bw, (ch * 0.96) / bh) * scale
        nw, nh = max(1, int(bw * fit)), max(1, int(bh * fit))
        cr = np.asarray(Image.fromarray(crop_rgb.astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(np.float32)
        ca = np.asarray(Image.fromarray((crop_a * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(np.float32) / 255.0
        ox = c * ocw + (ocw - nw) // 2
        oy = r * och + ((och - nh) // 2 if is_icon else och - nh - int(och * 0.02))
        atlas_rgb[oy:oy + nh, ox:ox + nw] = cr
        atlas_a[oy:oy + nh, ox:ox + nw] = ca
        info['cells'][cid] = {
            'uv': [c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows],  # u0,v0,u1,v1 (GL, v up)
            'aspect': ocw / och,
            'fill': [nw / ocw, nh / och],
        }
    filled = push_pull(atlas_rgb, atlas_a)
    rgba = np.dstack([filled, atlas_a * 255]).astype(np.uint8)
    p = os.path.join(DEST, f'{name}_atlas.png')
    Image.fromarray(rgba).save(p, optimize=True)
    info['atlas'] = os.path.relpath(p, ROOT)
    info['size'] = [ocw * cols, och * rows]
    return info


def contact_sheet(manifest, path):
    """Grey blockout render vs. projection-ready painting, for every asset/angle."""
    names = list(manifest['assets'].keys())
    cw = 150
    sheet = Image.new('RGB', (cw * 4, cw * len(names)), (238, 228, 205))
    for i, n in enumerate(names):
        for j, ang in enumerate(manifest['assets'][n]['angles']):
            job = ang['job']
            grey = Image.open(os.path.join(RENDERS, n, f'{job}_grey.png')).convert('RGB').resize((cw, cw), Image.LANCZOS)
            pim = Image.open(os.path.join(POST, f'{job}_rgba.png')).resize((cw, cw), Image.LANCZOS)
            sheet.paste(grey, (j * 2 * cw, i * cw))
            sheet.paste(pim, (j * 2 * cw + cw, i * cw), pim)
    sheet.save(path, quality=82)


def main():
    defs = load_defs()
    os.makedirs(os.path.join(DEST, 'icons'), exist_ok=True)
    os.makedirs(POST, exist_ok=True)
    status_path = os.path.join(ROOT, 'pipeline/out/paint_status.json')
    status = json.load(open(status_path)) if os.path.exists(status_path) else {}
    only = sys.argv[1:]
    man_path = os.path.join(DEST, 'manifest.json')
    manifest = json.load(open(man_path)) if (only and os.path.exists(man_path)) else {'assets': {}, 'sheets': {}}
    for name, a in defs['assets'].items():
        if only and name not in only:
            continue
        angles = [process_asset(name, az, status) for az in defs['azimuths']]
        manifest['assets'][name] = {
            'label': a['label'], 'footprint': a['footprint'], 'angles': angles,
            'codexPainted': all(x['codexPainted'] for x in angles),
            'icon': f'assets/painted/icons/{name}.png',
        }
        print(name, ['codex' if x['codexPainted'] else 'procedural' for x in angles], [x.get('iouAfterAlign') for x in angles])
    for name, s in defs['sheets'].items():
        if only and name not in only:
            continue
        manifest['sheets'][name] = process_sheet(name, s, status)
        print('sheet', name, manifest['sheets'][name]['source'])
    manifest['generated'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    json.dump(manifest, open(man_path, 'w'), indent=1)
    # pipeline-facing manifest with call statistics
    calls = []
    log = os.path.join(ROOT, 'pipeline/out/log/codex_calls.jsonl')
    if os.path.exists(log):
        calls = [json.loads(l) for l in open(log) if l.strip()]
    summary = {
        'generated': manifest['generated'],
        'codexCalls': {'total': len(calls), 'succeeded': sum(1 for c in calls if c['ok']), 'failed': sum(1 for c in calls if not c['ok'])},
        'assets': {k: {'label': v['label'], 'codexPainted': v['codexPainted'],
                       'angles': [{kk: x.get(kk) for kk in ('azimuth', 'codexPainted', 'source', 'iouBeforeAlign', 'iouAfterAlign', 'alignApplied', 'alignScale', 'alignOffsetPx', 'note', 'texture', 'depth')} for x in v['angles']],
                       'icon': v['icon']} for k, v in manifest['assets'].items()},
        'sheets': {k: {'codexPainted': v['codexPainted'], 'source': v['source'], 'atlas': v.get('atlas'), 'cells': list(v['cells'].keys())} for k, v in manifest['sheets'].items()},
    }
    json.dump(summary, open(os.path.join(ROOT, 'pipeline/out/manifest.json'), 'w'), indent=1)
    if not only:
        contact_sheet(manifest, os.path.join(ROOT, 'pipeline/out/contact_sheet.jpg'))
    print('codex calls', summary['codexCalls'])


if __name__ == '__main__':
    main()

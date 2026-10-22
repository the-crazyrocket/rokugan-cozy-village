// Paint job definitions: one consistent style prompt for every Codex call.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKOUTS } from '../src/assets/blockouts.js';
import { SHEETS } from '../src/assets/sheets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => path.join(ROOT, 'pipeline/out/renders', ...p);
export const AZIMUTHS = [45, 225];

export const STYLE = 'STYLE: hand-painted cosy fantasy game art set in Rokugan (Legend of the Five Rings, feudal-Japan inspired). '
  + 'Soft gouache and watercolor brushwork with visible but gentle brush strokes, Studio Ghibli-like warmth, slightly stylised and cute. '
  + 'Warm palette: vermilion red, indigo blue, moss green, cream, soft gold, warm wood browns. '
  + 'Soft warm daylight from the upper left, gentle painted ambient occlusion, subtle dark-brown painted edge lines. '
  + 'No text, no letters, no signature, no watermark.';

const MAGENTA_BG = 'Keep the background a plain, flat, solid magenta #FF00FF everywhere outside the painted subjects (no gradient, no texture, no vignette).';

function assetPrompt(name, az) {
  const d = BLOCKOUTS[name];
  return (out) => [
    'Use your image generation tool to edit/repaint the first attached image into a hand-painted game asset.',
    `The first attached image is a grey, untextured 3D blockout render of a ${d.desc}, seen from a fixed isometric game camera (azimuth ${az} degrees).`,
    'The second attached image is the line/outline pass of the same render, for reference of every edge.',
    STYLE,
    'Keep the EXACT silhouette, framing, camera angle, perspective, proportions and position of the object so that the painting overlays the original render pixel-for-pixel. Do not move, rotate, crop, zoom, simplify or add parts; every part of the blockout must still be there in the same place.',
    'No ground plane, no cast shadow on the ground, no border, no text.',
    MAGENTA_BG,
    'Output a square 1024x1024 image.',
    `Save the resulting PNG to ${out} (copy it from the generated images folder) and reply with the path.`,
  ].join(' ');
}

function sheetPrompt(name) {
  const s = SHEETS[name];
  const list = s.cells.map(([, desc], i) => `(${i + 1}) row ${Math.floor(i / s.cols) + 1}, column ${(i % s.cols) + 1}: ${desc}`).join('; ');
  const layout = `The attached guide image is a ${s.cols} columns x ${s.rows} rows grid (${s.width}x${s.height} pixels, cells of ${s.width / s.cols}x${s.height / s.rows}) with a rough coloured placeholder sketch in each cell.`;
  const rules = s.tile
    ? 'Each cell must be completely filled edge to edge with its texture, seamless and tileable, painted from straight above with no perspective, no objects casting shadows, no borders, gaps or grid lines between cells.'
    : `Each sprite must stay entirely inside its own cell with a generous empty margin, centred horizontally and standing on the bottom area of its cell, never touching the cell edges or other sprites, seen from a slightly elevated isometric 3/4 view. No ground, no grid lines, no shadows on the ground. ${MAGENTA_BG}`;
  return (out) => [
    `Use your image generation tool to paint a sprite sheet of ${s.subject}, using the attached guide image as the exact layout reference.`,
    layout,
    `Repaint every cell (row by row, left to right): ${list}.`,
    rules,
    STYLE,
    `Output a ${s.width}x${s.height} image with exactly the same grid layout.`,
    `Save the resulting PNG to ${out} (copy it from the generated images folder) and reply with the path.`,
  ].join(' ');
}

export const JOBS = [
  ...Object.keys(BLOCKOUTS).flatMap((asset) => AZIMUTHS.map((az) => ({
    name: `${asset}_a${az}`, kind: 'asset', asset, az,
    images: [R(asset, `${asset}_a${az}_grey.png`), R(asset, `${asset}_a${az}_outline.png`)],
    prompt: assetPrompt(asset, az),
  }))),
  ...Object.keys(SHEETS).map((sheet) => ({
    name: sheet, kind: 'sheet', asset: sheet,
    images: [R('sheets', `${sheet}_guide.png`)],
    prompt: sheetPrompt(sheet),
  })),
];

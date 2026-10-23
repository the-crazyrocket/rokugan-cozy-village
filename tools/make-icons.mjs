// Renders assets/icons/icon.svg to the PNG app icons the web manifest and iOS
// need (headless Chrome, same launcher as the tests). Run: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../pipeline/chrome.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/icons');
const svg = `data:image/svg+xml;base64,${fs.readFileSync(path.join(DIR, 'icon.svg')).toString('base64')}`;

// name, size, corner radius (fraction; "any" icons get soft corners), content scale (maskable safe zone)
const ICONS = [
  ['icon-192.png', 192, 0.2, 1],
  ['icon-512.png', 512, 0.2, 1],
  ['icon-maskable-512.png', 512, 0, 0.8],
  ['apple-touch-icon.png', 180, 0, 1], // iOS rounds it itself and wants no transparency
];

const browser = await launchChrome();
try {
  for (const [name, size, radius, scale] of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inner = Math.round(size * scale), off = Math.round((size - inner) / 2);
    await page.setContent(`<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${radius * size}px;overflow:hidden;background:#efc99a;position:relative">
        ${scale < 1 ? `<img src="${svg}" style="position:absolute;inset:0;width:100%;height:100%;filter:blur(${size / 16}px);transform:scale(1.3)">` : ''}
        <img src="${svg}" style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">
      </div></body></html>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    await page.screenshot({ path: path.join(DIR, name), omitBackground: radius > 0 });
    await page.close();
    console.log('wrote', name);
  }
} finally {
  await browser.close();
}

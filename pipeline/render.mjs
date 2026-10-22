// Step 2 of the art pipeline: render every blockout from the isometric paint
// cameras (grey, colour, mask, normal, depth, outline + camera JSON) and the
// sprite-sheet guide images. Output: pipeline/out/renders/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tools/serve.mjs';
import { launchChrome } from './chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'pipeline/out/renders');
const only = process.argv.slice(2);

const writeDataURL = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));

const srv = await startServer({ root: ROOT });
const browser = await launchChrome();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(srv.url + 'pipeline/render.html');
  await page.waitForFunction(() => window.pipelineReady === true, null, { timeout: 60000 });
  const assets = await page.evaluate(() => window.pipeline.assets());
  const azimuths = await page.evaluate(() => window.pipeline.azimuths());
  const cameras = {};
  for (const asset of assets) {
    if (only.length && !only.includes(asset)) continue;
    const dir = path.join(OUT, asset);
    fs.mkdirSync(dir, { recursive: true });
    cameras[asset] = {};
    for (const az of azimuths) {
      const r = await page.evaluate(([a, z]) => window.pipeline.renderAsset(a, z), [asset, az]);
      const base = path.join(dir, `${asset}_a${az}`);
      for (const pass of ['grey', 'color', 'mask', 'normal', 'depth', 'outline']) writeDataURL(`${base}_${pass}.png`, r[pass]);
      fs.writeFileSync(`${base}_camera.json`, JSON.stringify(r.camera, null, 2));
      cameras[asset][az] = r.camera;
      console.log('rendered', asset, 'az', az);
    }
  }
  const sheetDir = path.join(OUT, 'sheets');
  fs.mkdirSync(sheetDir, { recursive: true });
  for (const sheet of await page.evaluate(() => window.pipeline.sheets())) {
    if (only.length && !only.includes(sheet)) continue;
    writeDataURL(path.join(sheetDir, `${sheet}_guide.png`), await page.evaluate((s) => window.pipeline.renderSheetGuide(s), sheet));
    console.log('guide', sheet);
  }
  if (!only.length) fs.writeFileSync(path.join(OUT, 'cameras.json'), JSON.stringify(cameras, null, 1));
} finally {
  await browser.close();
  await srv.close();
}

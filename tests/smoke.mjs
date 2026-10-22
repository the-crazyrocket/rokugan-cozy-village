// Smoke test: serve the site under a GitHub-Pages-like sub-path, play it with
// real keyboard / mouse input in headless Chrome (SwiftShader WebGL) and assert
// there are no console or page errors. Screenshots go to /workspace/screens/.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tools/serve.mjs';
import { launchChrome } from '../pipeline/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = process.env.SCREENS_DIR || '/workspace/screens';
fs.mkdirSync(SCREENS, { recursive: true });

const errors = [];
const log = (...a) => console.log('[smoke]', ...a);
const srv = await startServer({ root: ROOT, base: '/rokugan-cozy-village/' });
const browser = await launchChrome();
let ok = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

  log('loading', srv.url);
  await page.goto(srv.url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 5, null, { timeout: 120000 });
  const G = (fn, arg) => page.evaluate(fn, arg);

  // welcome card is shown on a new game; close it
  assert.equal(await G(() => !document.getElementById('help').classList.contains('hidden')), true, 'welcome card visible');
  await page.click('#help-close');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENS, '01-village.png') });
  log('01-village.png');

  // ---- walking (keyboard)
  const p0 = await G(() => ({ x: __game.game.player.pos.x, z: __game.game.player.pos.z }));
  await page.keyboard.down('KeyD');
  await page.waitForFunction((p) => Math.hypot(__game.game.player.pos.x - p.x, __game.game.player.pos.z - p.z) > 1.0, p0, { timeout: 20000 });
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyS');
  const p1 = await G(() => ({ x: __game.game.player.pos.x, z: __game.game.player.pos.z }));
  log('walked from', p0, 'to', p1);
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.0, 'player walked');

  // ---- click-to-move
  const target = await G(() => {
    const g = __game.game, c = g.playerCell();
    for (let r = 2; r < 6; r++) for (const [dx, dz] of [[-r, 0], [0, -r], [r, 0], [0, r]]) {
      if (g.walkable(c.x + dx, c.z + dz) && !g.props.at(c.x + dx, c.z + dz) && !g.crop(c.x + dx, c.z + dz)) return { x: c.x + dx, z: c.z + dz };
    }
    return null;
  });
  assert.ok(target, 'found a walkable tile to click');
  let s = await G((t) => __game.tileToScreen(t.x, t.z), target);
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction((t) => { const c = __game.game.playerCell(); return c.x === t.x && c.z === t.z && !__game.game.player.path; }, target, { timeout: 30000 });
  log('click-to-move reached', target);

  // ---- build mode: place + rotate a prop with the mouse
  const nProps = await G(() => __game.game.props.list.length);
  await page.keyboard.press('KeyB');
  assert.equal(await G(() => __game.game.mode), 'build');
  await page.click('#hotbar .slot[data-item="prop_toro"]');
  await page.keyboard.press('KeyR');
  const spot = await G(() => {
    const g = __game.game, c = g.playerCell();
    for (let r = 2; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.props.canPlace('toro', c.x + dx, c.z + dz, g.buildRot, { playerCell: c, farm: g.farm })) return { x: c.x + dx, z: c.z + dz };
    }
    return null;
  });
  assert.ok(spot, 'found a free spot to build');
  s = await G((t) => __game.tileToScreen(t.x, t.z), spot);
  await page.mouse.move(s.x, s.y);
  await page.waitForTimeout(300);
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction((n) => __game.game.props.list.length === n + 1, nProps, { timeout: 10000 });
  const placed = await G(() => { const p = __game.game.props.list.at(-1); return { type: p.type, x: p.x, z: p.z, rot: p.rot }; });
  log('placed', placed);
  assert.equal(placed.type, 'toro');
  assert.equal(placed.rot, 1, 'rotation applied');
  // show a ghost preview of a bigger item for the screenshot (minka from the shop)
  await G(() => { __game.game.give('prop_minka', 1); __game.game.buildSel = 'prop_minka'; __game.ui.refresh(); });
  const ghostSpot = await G(() => {
    const g = __game.game, c = g.playerCell();
    for (let r = 3; r < 9; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.props.canPlace('minka', c.x + dx, c.z + dz, g.buildRot, { playerCell: c, farm: g.farm })) return { x: c.x + dx, z: c.z + dz };
    }
    return null;
  });
  s = await G((t) => __game.tileToScreen(t.x, t.z), ghostSpot);
  await page.mouse.move(s.x, s.y);
  await page.waitForTimeout(900);
  assert.equal(await G(() => __game.game.ghost.group.visible), true, 'ghost preview visible');
  await page.screenshot({ path: path.join(SCREENS, '02-build.png') });
  log('02-build.png');
  // pick the lantern back up
  await page.click('#hotbar .slot[data-item="pickup"]');
  s = await G((t) => __game.tileToScreen(t.x, t.z, 0.3), placed);
  const toroBefore = await G(() => __game.game.count('prop_toro'));
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction((n) => __game.game.count('prop_toro') === n + 1, toroBefore, { timeout: 10000 });
  log('picked the lantern back up');
  await page.keyboard.press('KeyB');
  assert.equal(await G(() => __game.game.mode), 'play');

  // ---- farming: walk next to the starter field, till grass, plant, water
  const field = await G(() => {
    const g = __game.game;
    for (const [x, z] of [[15, 27], [15, 28], [10, 26], [10, 27], [15, 26], [12, 25]]) {
      if (g.world.get(x, z) === 1 && !g.props.at(x, z)) return { x, z };
    }
    return null;
  });
  assert.ok(field, 'grass tile next to the field');
  await page.keyboard.press('Digit2'); // hoe
  s = await G((t) => __game.tileToScreen(t.x, t.z), field);
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction((t) => __game.game.world.get(t.x, t.z) === 4, field, { timeout: 40000 });
  log('tilled', field);
  await page.keyboard.press('Digit5'); // rice seeds
  await page.keyboard.press('Space'); // player is facing the tilled tile
  await page.waitForFunction((t) => !!__game.game.crop(t.x, t.z), field, { timeout: 10000 });
  await page.keyboard.press('Digit3'); // watering can
  await page.keyboard.press('Space');
  await page.waitForFunction((t) => __game.game.crop(t.x, t.z).wet === true, field, { timeout: 10000 });
  log('planted + watered rice');
  // harvest the ripe daikon of the starter field with a click
  const daikonBefore = await G(() => __game.game.count('daikon'));
  await page.keyboard.press('Digit1');
  s = await G(() => __game.tileToScreen(14, 26));
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction((n) => __game.game.count('daikon') > n, daikonBefore, { timeout: 30000 });
  log('harvested daikon');

  // ---- fishing: click a nearby water tile with the rod, wait for the bite, press Space
  await page.keyboard.press('Digit4');
  const water = await G(() => {
    const g = __game.game, c = g.playerCell();
    let best = null, bd = 1e9;
    for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) {
      if (!g.world.isWater(x, z) || g.props.isBridge(x, z)) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => g.walkable(x + dx, z + dz));
      const d = Math.hypot(x - c.x, z - c.z);
      if (nb && d < bd) { bd = d; best = { x, z }; }
    }
    return best;
  });
  let caught = false;
  for (let attempt = 1; attempt <= 4 && !caught; attempt++) {
    const before = await G(() => ['ayu', 'koi', 'tai', 'fugu'].reduce((n, f) => n + __game.game.count(f), 0));
    s = await G((t) => __game.tileToScreen(t.x, t.z, -0.32), water);
    await page.mouse.click(s.x, s.y);
    await page.waitForFunction(() => !!__game.game.fishing, null, { timeout: 40000 });
    if (attempt === 1) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SCREENS, '03-farm-fish.png') });
      log('03-farm-fish.png (line cast)');
    }
    await page.waitForFunction(() => !__game.game.fishing || __game.game.fishing.phase === 'bite', null, { timeout: 15000 });
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const after = await G(() => ['ayu', 'koi', 'tai', 'fugu'].reduce((n, f) => n + __game.game.count(f), 0));
    caught = after > before;
    log(`fishing attempt ${attempt}:`, caught ? `caught a ${await G(() => __game.game.lastCatch)}` : 'missed');
  }
  assert.ok(caught, 'caught a fish');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENS, '04-catch.png') });

  // ---- sell at the merchant + save round trip
  await G(() => __game.ui.openShop());
  await page.click('.btn.big');
  const money = await G(() => __game.game.money);
  log('koku after selling', money);
  await G(() => __game.ui.closeModal());
  await G(() => __game.game.save());
  const saved = await G(() => JSON.parse(localStorage.getItem('rokugan-cozy-village/save/v1')));
  assert.ok(saved && saved.props.length > 10 && saved.farm.length > 0, 'saved to localStorage');
  assert.ok(!JSON.stringify(saved).match(/stamina|energy|fatigue/i), 'no energy system in the save');
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 2, null, { timeout: 120000 });
  assert.equal(await G(() => __game.game.money), money, 'money restored from save');
  assert.equal(await G(() => document.getElementById('help').classList.contains('hidden')), true, 'no welcome card when loading a save');

  assert.deepEqual(errors, [], 'no console/page errors');
  ok = true;
} catch (e) {
  console.error('[smoke] FAILED:', e.message);
  if (errors.length) console.error('[smoke] errors:', errors);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

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
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  /** Wait until the follow-camera has stopped moving (screen positions are stable). */
  const settled = async () => {
    let prev = null;
    for (let i = 0; i < 60; i++) {
      const p = await G(() => __game.tileToScreen(20, 20));
      if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 0.5) return;
      prev = p;
      await page.waitForTimeout(250);
    }
  };

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
      if (g.walkable(c.x + dx, c.z + dz) && !g.props.at(c.x + dx, c.z + dz) && !g.crop(c.x + dx, c.z + dz) && !g.daily.forageAt(c.x + dx, c.z + dz)) return { x: c.x + dx, z: c.z + dz };
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
      if (g.world.get(x, z) === 1 && !g.props.at(x, z) && !g.daily.forageAt(x, z)) return { x, z };
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

  // ---- sweep: drag the mouse along the empty bottom row of the field -> plants each tile
  await page.waitForFunction(() => !__game.game.isBusy() && !__game.game.player.moving, null, { timeout: 30000 });
  await settled();
  const seeds0 = await G(() => __game.game.count('seed_rice'));
  const row = await G(() => [11, 12, 13, 14].map((x) => __game.tileToScreen(x, 28)));
  await page.mouse.move(row[0].x, row[0].y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { const k = i / 12; await page.mouse.move(row[0].x + (row[3].x - row[0].x) * k, row[0].y + (row[3].y - row[0].y) * k); await page.waitForTimeout(30); }
  await page.mouse.up();
  const expected = Math.min(seeds0, 4);
  await page.waitForFunction((n) => [11, 12, 13, 14].filter((x) => __game.game.crop(x, 28)).length >= n, expected, { timeout: 60000 });
  log(`sweep planted ${expected} tiles`);

  // ---- real-time growth: skip the clock 40 min -> the new rice is ripe (watered one sooner)
  assert.ok(await G(() => __game.game.timeToRipe(__game.game.crop(11, 28)) > 30 * 60e3), 'rice takes ~36 min');
  await G(() => __game.skip(40 * 60e3));
  assert.equal(await G(() => __game.game.stage(__game.game.crop(11, 28))), 3, 'rice ripe after 40 minutes');
  log('time skip ripened the rice');

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
    // a Space that arrived after the fish got away starts a new cast; clear it so the click casts
    await G(() => __game.game.cancelFishing());
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

  // ---- sell at the merchant
  await G(() => __game.ui.openShop());
  await page.click('.btn.big');
  log('koku after selling', await G(() => __game.game.money));
  await G(() => __game.ui.closeModal());

  // ---- daily requests: Today sheet (T), finish one, claim it
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => __game.ui.modal === 'today', null, { timeout: 5000 });
  assert.equal(await page.locator('#panel .req').count(), 3, 'three requests today');
  const req = await G(() => { const d = __game.game.daily, r = d.state.requests.find((q) => q.kind !== 'deliver'); r.have = r.n; __game.ui.refresh(); return { i: d.state.requests.indexOf(r), reward: r.reward }; });
  const m0 = await G(() => __game.game.money);
  await page.click(`#panel .req[data-req="${req.i}"] .claim`);
  await page.waitForFunction((m) => __game.game.money === m, m0 + req.reward, { timeout: 5000 });
  log('claimed a request for', req.reward, 'koku');
  await page.keyboard.press('KeyT');

  // ---- a new day: skip a day -> fresh requests, wild greens and a "welcome back" card
  const day0 = await G(() => __game.game.daily.key);
  await G(() => { const a = __game.skip(24 * 3600e3); __game.ui.openToday(a); });
  assert.notEqual(await G(() => __game.game.daily.key), day0, 'day rolled over');
  await page.waitForSelector('#panel .away', { timeout: 5000 });
  assert.ok(await G(() => __game.game.daily.forageLeft()) > 0, 'wild greens spawned');
  await page.screenshot({ path: path.join(SCREENS, '05-today.png') });
  await G(() => __game.ui.closeModal());

  // ---- save v2 + reload round trip
  const money = await G(() => __game.game.money);
  await G(() => __game.game.save());
  const saved = await G(() => JSON.parse(localStorage.getItem('rokugan-cozy-village/save/v1')));
  assert.ok(saved && saved.v === 2 && saved.props.length > 10 && saved.farm.length > 0 && saved.daily?.requests?.length === 3, 'saved v2 to localStorage');
  assert.ok(!JSON.stringify(saved).match(/stamina|energy|fatigue/i), 'no energy system in the save');
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 2, null, { timeout: 120000 });
  assert.equal(await G(() => __game.game.money), money, 'money restored from save');
  assert.equal(await G(() => document.getElementById('help').classList.contains('hidden')), true, 'no welcome card when loading a save');

  // ---- backup code -> restore round trip
  await G(() => __game.ui.openBackup());
  await page.waitForSelector('#panel textarea.code[data-ready="1"]', { timeout: 10000 });
  const code = await page.locator('#panel textarea.code').inputValue();
  assert.match(code, /^RCV2z?:/, 'backup code');
  await G(() => { __game.game.money = 7; __game.game.save(); __game.ui.closeModal(); __game.ui.openRestore(); });
  await page.fill('#panel textarea.code', code);
  await page.click('#panel .restore');
  await page.click('#dialog .dlg-ok');
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 2 && __game.game.money !== 7, null, { timeout: 120000 });
  assert.equal(await G(() => __game.game.money), money, 'village restored from the backup code');
  log('backup code restored', code.length, 'chars');

  // ---- an old v1 save still loads (crop growth converted to stages)
  await G(() => {
    __game.game.frozen = true;
    const s = JSON.parse(localStorage.getItem('rokugan-cozy-village/save/v1'));
    const v1 = { ...s, v: 1, farm: [{ type: 'rice', x: 11, z: 26, growth: 150000, last: Date.now(), wet: false }] };
    delete v1.daily; delete v1.timeOffset; delete v1.stats;
    localStorage.setItem('rokugan-cozy-village/save/v1', JSON.stringify(v1));
    localStorage.removeItem('rokugan-cozy-village/save/backup');
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 2, null, { timeout: 120000 });
  assert.equal(await G(() => __game.game.stage(__game.game.crop(11, 26))), 2, 'v1 crop migrated (2.5 of 3 stages)');
  log('v1 save migrated');

  // ---- offline: the service worker serves the cached game
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 });
  assert.deepEqual(errors, [], 'no console/page errors before going offline');
  await page.context().setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 2, null, { timeout: 120000 });
  await page.context().setOffline(false);
  log('loaded offline from the service worker cache');

  assert.deepEqual(errors, [], 'no console/page errors');
  ok = true;
} catch (e) {
  console.error('[smoke] FAILED:', e.message);
  if (errors.length) console.error('[smoke] errors:', errors);
  const state = await page?.evaluate(() => ({
    toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent),
    player: __game.game.playerCell(), busy: __game.game.isBusy(), queue: __game.game.queue.map((a) => `${a.kind}@${a.t.x},${a.t.z}`),
  })).catch(() => null);
  if (state) console.error('[smoke] state:', JSON.stringify(state));
  await page?.screenshot({ path: path.join(SCREENS, 'smoke-fail.png') }).catch(() => {});
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

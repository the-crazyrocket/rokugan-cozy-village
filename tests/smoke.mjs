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
      const p = await G(() => __game.tileToScreen(20 + __game.O, 20 + __game.O));
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
    for (const [x, z] of [[15, 27], [15, 28], [10, 26], [10, 27], [15, 26], [12, 25]].map(([x, z]) => [x + __game.O, z + __game.O])) {
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
  await page.keyboard.press(`Digit${await G(() => document.querySelector('#hotbar .slot[data-item="seed_rice"] .key').textContent)}`); // rice seeds
  await page.keyboard.press('Space'); // player is facing the tilled tile
  await page.waitForFunction((t) => !!__game.game.crop(t.x, t.z), field, { timeout: 10000 });
  await page.keyboard.press('Digit3'); // watering can
  await page.keyboard.press('Space');
  await page.waitForFunction((t) => __game.game.crop(t.x, t.z).wet === true, field, { timeout: 10000 });
  log('planted + watered rice');
  // harvest the ripe daikon of the starter field with a click
  const daikonBefore = await G(() => __game.game.count('daikon'));
  await page.keyboard.press('Digit1');
  s = await G(() => __game.tileToScreen(14 + __game.O, 26 + __game.O));
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction((n) => __game.game.count('daikon') > n, daikonBefore, { timeout: 30000 });
  log('harvested daikon');

  // ---- sweep: drag the mouse along the empty bottom row of the field -> plants each tile
  await page.waitForFunction(() => !__game.game.isBusy() && !__game.game.player.moving, null, { timeout: 30000 });
  await settled();
  const seeds0 = await G(() => __game.game.count('seed_rice'));
  const row = await G(() => [11, 12, 13, 14].map((x) => __game.tileToScreen(x + __game.O, 28 + __game.O)));
  await page.mouse.move(row[0].x, row[0].y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { const k = i / 12; await page.mouse.move(row[0].x + (row[3].x - row[0].x) * k, row[0].y + (row[3].y - row[0].y) * k); await page.waitForTimeout(30); }
  await page.mouse.up();
  const expected = Math.min(seeds0, 4);
  await page.waitForFunction((n) => [11, 12, 13, 14].filter((x) => __game.game.crop(x + __game.O, 28 + __game.O)).length >= n, expected, { timeout: 60000 });
  log(`sweep planted ${expected} tiles`);

  // ---- real-time growth: skip the clock 40 min -> the new rice is ripe (watered one sooner)
  assert.ok(await G(() => __game.game.timeToRipe(__game.game.crop(11 + __game.O, 28 + __game.O)) > 30 * 60e3), 'rice takes ~36 min');
  await G(() => __game.skip(40 * 60e3));
  assert.equal(await G(() => __game.game.stage(__game.game.crop(11 + __game.O, 28 + __game.O))), 3, 'rice ripe after 40 minutes');
  log('time skip ripened the rice');

  // ---- fishing: click a nearby water tile with the rod, wait for the bite, press Space
  await page.keyboard.press('Digit4');
  const water = await G(() => {
    const g = __game.game, c = g.playerCell();
    let best = null, bd = 1e9;
    for (let z = 0; z < g.world.h; z++) for (let x = 0; x < g.world.w; x++) {
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

  // ---- shrine chapter 1: offerings -> Ebisu wakes -> pier, deep-sea fish, bait
  const landmarks = () => G(() => __game.game.props.list.map((p) => p.type).filter((t) => ['shrine_old', 'shrine', 'stone', 'pier'].includes(t)).sort());
  assert.deepEqual(await landmarks(), ['shrine_old', 'stone'], 'a new island has the quiet shrine and the sleeping stone');
  await G(() => { const g = __game.game; g.cancelFishing(); g.queue.length = 0; g.player.path = null; g.player.pending = null; g.player.pos.set(22.5 + __game.O, 0, 12.5 + __game.O); g.give('rice', 3); g.give('daikon', 2); g.give('ayu', 1); });
  await settled();
  const shrineAt = await G(() => __game.tileToScreen(22.5 + __game.O, 9.5 + __game.O, 0.7));
  await page.mouse.click(shrineAt.x, shrineAt.y);
  await page.waitForFunction(() => __game.ui.modal === 'shrine', null, { timeout: 60000 });
  await page.click('#panel [data-offering="harvest"] .offer');
  await page.click('#panel [data-offering="river"] .offer');
  const part = await G(() => ({ given: __game.game.shrine.given, done: __game.game.shrine.doneCount('ebisu'), rice: __game.game.count('rice') }));
  assert.equal(part.done, 1, 'harvest offering complete');
  assert.deepEqual(part.given['ebisu.river'], { ayu: 1 }, 'partial river offering kept');
  await G(() => { const g = __game.game; for (const [k, n] of Object.entries({ koi: 1, tea: 2, wildflower: 2, tai: 1, fugu: 1 })) g.give(k, n); });
  for (const id of ['river', 'grove', 'sea']) await page.click(`#panel [data-offering="${id}"] .offer`);
  assert.equal(await G(() => __game.game.shrine.ready('ebisu')), true, 'all offerings made');
  await page.click('#panel .btn.wake');
  await page.waitForFunction(() => __game.ui.modal === 'wake', null, { timeout: 30000 });
  await page.screenshot({ path: path.join(SCREENS, '06-ebisu-wakes.png') });
  await G(() => __game.ui.closeModal());
  assert.deepEqual(await landmarks(), ['pier', 'shrine', 'stone'], 'shrine restored and pier built');
  assert.equal(await G(() => __game.game.count('bait')), 5, 'Ebisu left bait');
  await G(() => { __game.ui.shopTab = 'seeds'; __game.ui.openShop(); });
  await page.waitForSelector('#panel .row[data-item="bait"]', { timeout: 5000 });
  await G(() => __game.ui.closeModal());
  // walk out on the pier: deep-sea fish bite there, by the hour
  await G(() => { const g = __game.game; g.player.pos.set(20.5 + __game.O, 0, 32.5 + __game.O); g.walkTo({ x: 20 + __game.O, z: 36 + __game.O }); });
  await page.waitForFunction(() => { const g = __game.game; return !g.player.path && Math.floor(g.player.pos.z) === 36 + __game.O; }, null, { timeout: 90000 });
  assert.ok(await G(() => __game.game.player.pos.y) > 0.1, 'standing on the pier deck');
  const pools = await G(() => {
    const g = __game.game, names = (fresh, pier, h) => g.fishPool(fresh, pier, h).map(([k]) => k);
    return { beach: names(false, false, 12), morning: names(false, true, 7), night: names(false, true, 23), river: names(true, true, 12) };
  });
  assert.ok(!pools.beach.includes('aji') && pools.beach.includes('tai'), 'no deep-sea fish from the beach');
  assert.ok(pools.morning.includes('saba') && !pools.morning.includes('ika'), 'saba bites in the morning');
  assert.ok(pools.night.includes('ika') && !pools.night.includes('saba'), 'ika bites at night');
  assert.ok(pools.river.includes('ayu') && !pools.river.some((k) => ['tai', 'aji', 'saba', 'ika'].includes(k)), 'river fish are fresh-water fish');
  await G(() => { const g = __game.game; g.player.facing = Math.PI / 2; g.tap({ x: 21 + __game.O, z: 36 + __game.O }); });
  await page.waitForFunction(() => !!__game.game.fishing, null, { timeout: 10000 });
  await G(() => __game.game.cancelFishing());
  log('Ebisu woke: pier, deep-sea fish, bait');

  // ---- save v3 + reload round trip
  const money = await G(() => __game.game.money);
  await G(() => __game.game.save());
  const saved = await G(() => JSON.parse(localStorage.getItem('rokugan-cozy-village/save/v1')));
  assert.ok(saved && saved.v === 3 && saved.props.length > 10 && saved.farm.length > 0 && saved.daily?.requests?.length === 3, 'saved v3 to localStorage');
  assert.deepEqual(saved.shrine?.awake, ['ebisu'], 'shrine state saved');
  assert.ok(!JSON.stringify(saved).match(/stamina|energy|fatigue/i), 'no energy system in the save');
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 2, null, { timeout: 120000 });
  assert.equal(await G(() => __game.game.money), money, 'money restored from save');
  assert.deepEqual(await landmarks(), ['pier', 'shrine', 'stone'], 'landmarks restored from save');
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
    const v1 = { ...s, v: 1, farm: [{ type: 'rice', x: 11 + __game.O, z: 26 + __game.O, growth: 150000, last: Date.now(), wet: false }] };
    v1.props = s.props.filter((p) => !['shrine_old', 'shrine', 'stone', 'pier'].includes(p.type));
    delete v1.daily; delete v1.timeOffset; delete v1.stats; delete v1.shrine;
    localStorage.setItem('rokugan-cozy-village/save/v1', JSON.stringify(v1));
    localStorage.removeItem('rokugan-cozy-village/save/backup');
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 2, null, { timeout: 120000 });
  assert.equal(await G(() => __game.game.stage(__game.game.crop(11 + __game.O, 26 + __game.O))), 2, 'v1 crop migrated (2.5 of 3 stages)');
  assert.deepEqual(await landmarks(), ['shrine_old', 'stone'], 'old saves get the quiet shrine');
  log('v1 save migrated');

  // ---- missing art: a blockout, a sheet cell and an icon with no paint get placeholders and raise no error (the error list is asserted at the end)
  const art = await G(async () => {
    const THREE = await import('three');
    const at = (f) => import(new URL(f, document.baseURI).href);
    const { defineBlockout } = await at('src/assets/blockouts/registry.js');
    const { defineSheet } = await at('src/assets/sheets/registry.js');
    defineBlockout('mat_test', { label: 'Unpainted', footprint: [1, 1], parts: [{ shape: 'box', size: [0.6, 0.6, 0.6], pos: [0, 0.3, 0], part: 'wood' }], desc: 'a box nobody painted' });
    defineSheet('mat_test', { cols: 1, rows: 1, width: 256, height: 256, cell: 256, subject: 'nothing', cells: [['cell', 'an icon nobody painted']] });
    const g = __game.game, ui = __game.ui;
    const mat = g.props.material('mat_test');
    const mesh = new THREE.Mesh(g.props.geometry('mat_test'), mat);
    const c = g.playerCell();
    mesh.position.set(c.x + 2.5, 0, c.z + 0.5);
    mesh.name = 'mat_test';
    g.props.group.add(mesh);
    const host = document.createElement('div');
    host.innerHTML = ['mat_test:cell', 'mat_test:nope', 'asset:mat_test', 'nosheet:x'].map((i) => ui.iconHTML(i)).join('');
    return { vertex: !!(mat.isMeshLambertMaterial && mat.vertexColors), tris: mesh.geometry.attributes.position.count, icons: host.querySelectorAll('.icon.missing').length };
  });
  assert.deepEqual(art, { vertex: true, tris: art.tris, icons: 4 }, 'an unpainted blockout gets the vertex-colour material and unknown icons the placeholder');
  assert.ok(art.tris > 0);
  const f0 = await G(() => __game.frames);
  await page.waitForFunction((n) => __game.frames > n + 10, f0, { timeout: 20000 });
  await G(() => { const g = __game.game; g.props.group.remove(g.props.group.getObjectByName('mat_test')); });
  log('unpainted blockout, sheet cell and icons: placeholders, no errors');

  // ---- registered tools and ctx.hud slots: a group 'more' tool is inline on desktop (the more slot is for compact bars), and a hud entry follows its condition
  await G(() => {
    const c = __game.game.core;
    c.tools.add('dummy', { use() {}, group: 'more' });
    c.hotbar.add({ id: 'dummy', order: 100, compact: true, icon: 'mat_test:cell', name: 'Dummy', hint: 'does nothing' });
    const chip = (text) => () => { const b = document.createElement('button'); b.className = 'hud-chip'; b.textContent = text; return b; };
    c.hud.add({ id: 'dummy-toolbar', slot: 'toolbar', order: 100, when: { flag: 'hud_test' }, render: chip('Toolbar chip') });
    c.hud.add({ id: 'dummy-corner', slot: 'corner', order: 100, render: chip('Corner chip') });
    __game.ui.refresh();
  });
  assert.equal(await G(() => document.querySelectorAll('#hotbar .slot[data-item="more"]').length), 0, 'no more slot on a wide screen');
  assert.equal(await G(() => document.querySelectorAll('#hotbar .slot[data-item="dummy"] .icon.missing').length), 1, 'the tool has its own slot with the placeholder icon');
  assert.equal(await G(() => document.querySelectorAll('#hotbar .slot').length), (await G(() => __game.ui.bar().length)) + 2, 'one slot per tool, build and bag');
  assert.equal(await G(() => document.querySelector('#hud-corner')?.textContent), 'Corner chip', 'corner slot drawn');
  assert.equal(await G(() => document.querySelector('#hud-toolbar')?.classList.contains('hidden') ?? true), true, 'toolbar entry hidden while its condition fails');
  await G(() => { __game.game.core.flags.set('hud_test', true); });
  await page.waitForFunction(() => document.querySelector('#hud-toolbar')?.textContent === 'Toolbar chip' && !document.querySelector('#hud-toolbar').classList.contains('hidden'), null, { timeout: 5000 });
  assert.equal(await G(() => document.querySelector('#hud-toolbar').nextElementSibling?.id), 'hotbar', 'the toolbar slot sits right above the hotbar');
  await G(() => __game.game.selectSlot(__game.ui.slotOf('dummy')));
  await page.waitForFunction(() => __game.game.tool === 'dummy', null, { timeout: 5000 });
  assert.match(await G(() => document.querySelector('#tool-hint').textContent), /Dummy — does nothing/, 'hint line of a tool that is not an item');
  await page.waitForTimeout(400); // the action button redraws with the tool's icon
  await page.screenshot({ path: path.join(SCREENS, '99-hud-dummy.png') });
  await G(() => {
    const g = __game.game, c = g.core;
    g.selectSlot(0);
    c.hotbar.remove('dummy'); c.tools.remove('dummy'); c.hud.remove('dummy-toolbar'); c.hud.remove('dummy-corner');
    c.flags.set('hud_test', false);
    __game.ui.refresh();
  });
  await page.waitForFunction(() => document.querySelector('#hud-corner').classList.contains('hidden') && document.querySelector('#hud-toolbar').classList.contains('hidden'), null, { timeout: 5000 });
  assert.equal(await G(() => __game.game.tool), 'hand');
  log('more-tool inline on desktop, hud slots follow their registry');

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

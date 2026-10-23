// Mobile test: portrait (390x844) and landscape (844x390) touch phones.
// Uses raw CDP Input.dispatchTouchEvent so drags, long-presses and two-finger
// pinches go through the real pointer-event code paths. Asserts no console /
// page errors. Screenshots go to /workspace/screens/mobile-*.png.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tools/serve.mjs';
import { launchChrome } from '../pipeline/chrome.mjs';
import { LEGACY_OFF as O } from '../src/world/coords.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = process.env.SCREENS_DIR || '/workspace/screens';
fs.mkdirSync(SCREENS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];

async function runViewport(browser, base, vp) {
  const log = (...a) => console.log(`[mobile:${vp.name}]`, ...a);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
  const tap = async (x, y, hold = 60) => { await touch('touchStart', [{ x, y }]); await sleep(hold); await touch('touchEnd', []); await sleep(80); };
  const tapEl = async (sel) => {
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    const b = await page.locator(sel).first().boundingBox();
    assert.ok(b, `element ${sel} visible`);
    await tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  const G = (fn, arg) => page.evaluate(fn, arg);
  const screen = (x, z, y = 0) => G(([x, z, y]) => __game.tileToScreen(x, z, y), [x, z, y]);
  const shot = (n) => page.screenshot({ path: path.join(SCREENS, `mobile-${vp.name}-${n}.png`) });
  const onScreen = (s, m = 50) => s.x > m && s.x < vp.width - m && s.y > m + 40 && s.y < vp.height - 150;
  const settle = () => sleep(1200);
  /** Screen point that picks tile (x,z): tries a few heights so occluders are avoided. */
  const aim = async (x, z, heights = [0.35, 0.2, 0.5, 0.1, 0.65, 0.02]) => {
    await page.waitForFunction(() => !__game.game.player.moving && !__game.game.player.path, null, { timeout: 30000 });
    await sleep(900); // let the follow-camera settle
    for (const y of heights) {
      const sp = await screen(x, z, y);
      if (!onScreen(sp, 10)) continue;
      const t = await G((p) => __game.pick(p.x, p.y, { fuzzy: true }).tile, sp);
      if (t && t.x === x && t.z === z) return sp;
    }
    const dbg = [];
    for (const y of heights) { const sp = await screen(x, z, y); dbg.push([y, sp.x | 0, sp.y | 0, onScreen(sp, 10), await G((p) => __game.pick(p.x, p.y, { fuzzy: true }).tile, sp)]); }
    throw new Error(`tile ${x},${z} not tappable on screen ${JSON.stringify(dbg)} player ${JSON.stringify(await G(() => __game.game.playerCell()))}`);
  };

  try {
    await steps();
  } catch (e) {
    await page.screenshot({ path: `/tmp/mobile-fail-${vp.name}.png` }).catch(() => {});
    log('errors at failure:', errors);
    log('toasts at failure:', await G(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent)).catch(() => []));
    log('state at failure:', JSON.stringify(await G(() => ({
      player: __game.game.playerCell(), busy: __game.game.isBusy(), pending: __game.game.player.pending?.kind, path: __game.game.player.path?.length,
      queue: __game.game.queue.map((a) => `${a.kind}@${a.t.x},${a.t.z}`), modal: __game.ui.modal, mode: __game.game.mode, fishing: !!__game.game.fishing, hold: __game.view.hold, input: __game.input(),
      labels: [...document.querySelectorAll('.float-label')].map((e) => e.textContent),
    })).catch(() => null)));
    throw e;
  }
  async function steps() {
  await page.goto(base);
  await G(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 5, null, { timeout: 120000 });

  if (process.env.DEBUG) {
    page.on('console', (m) => { if (m.text().startsWith('TRACE')) log(m.text()); });
    await G(() => {
      const g = __game.game;
      for (const k of ['give', 'take', 'pickUp', 'rotateProp', 'moveProp', 'sell', 'sellAll', 'newGame', 'load']) {
        const o = g[k].bind(g); g[k] = (...a) => { console.log('TRACE', k, JSON.stringify(a.map((x) => (x && x.type ? x.type + '#' + x.id : x)))); return o(...a); };
      }
      const pr = g.props, rm = pr.remove.bind(pr); pr.remove = (p) => { console.log('TRACE remove', p.type, p.id, new Error().stack.split('\n').slice(2, 5).join(' | ')); return rm(p); };
    });
  }
  // ---- touch help card + layout
  assert.equal(await G(() => document.body.classList.contains('touch')), true, 'body.touch on a touch device');
  assert.equal(await page.locator('.help-touch').isVisible(), true, 'touch help visible');
  assert.equal(await page.locator('.help-desktop').isVisible(), false, 'keyboard help hidden');
  await tapEl('#help-close');
  await page.waitForSelector('#help', { state: 'hidden', timeout: 5000 }); // help closed by tap
  assert.equal(await page.locator('.dpad').count(), 0, 'no d-pad');
  const cam = await G(() => ({ w: __game.camera.right - __game.camera.left, h: __game.camera.top - __game.camera.bottom }));
  const short = Math.min(cam.w, cam.h);
  log('camera view', cam);
  assert.ok(short > 9 && short < 11.5, `short side frames ~10 units (got ${short.toFixed(2)})`);
  // all hotbar slots on screen and >= 44 px
  const slots = await G(() => [...document.querySelectorAll('#hotbar .slot')].map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, w: r.width, h: r.height })));
  assert.ok(slots.length >= 7, 'compact hotbar has its slots');
  for (const r of slots) { assert.ok(r.w >= 44 && r.h >= 44, 'slot >= 44px'); assert.ok(r.l >= 0 && r.r <= vp.width, 'slot on screen'); }
  await settle();
  await shot('01-village');

  // ---- touch layout with the overflow tool: a registered group 'more' tool joins the bar as one more slot and a tools sheet
  const bar = () => G(() => [...document.querySelectorAll('#hotbar .slot')].map((e) => { const r = e.getBoundingClientRect(); return { item: e.dataset.item, special: e.classList.contains('special'), sel: e.classList.contains('sel'), l: r.left, r: r.right, w: r.width, h: r.height, missing: e.querySelectorAll('.icon.missing').length }; }));
  const checkBar = async (what) => {
    const sl = await bar();
    const iw = await G(() => innerWidth);
    for (const r of sl) { assert.ok(r.w >= 44 && r.h >= 44, `${what}: slot ${r.item} >= 44px (${r.w}x${r.h})`); assert.ok(r.l >= 0 && r.r <= iw, `${what}: slot ${r.item} on screen`); }
    return sl;
  };
  const plain = await bar();
  // the shovel and the earth are not compact: they already make a more slot, and the bag moves into its sheet
  assert.equal(plain.filter((r) => r.item === 'more').length, 1, 'the land tools make a more slot');
  assert.ok(!plain.some((r) => r.item === 'bag'), 'the bag is in the more sheet');
  await G(() => {
    const c = __game.game.core;
    c.tools.add('dummy', { use() {}, group: 'more' });
    c.hotbar.add({ id: 'dummy', order: 100, compact: true, icon: 'icons:no_such_icon', name: 'Dummy', hint: 'does nothing' });
    __game.ui.refresh();
  });
  let sl = await checkBar('with the more slot');
  assert.equal(sl.filter((r) => r.item === 'dummy').length, 0, 'the overflow tool has no slot of its own');
  assert.equal(sl.filter((r) => r.item === 'more').length, 1, 'one more slot');
  assert.ok(sl.length <= plain.length, `the bar does not grow (${sl.length} vs ${plain.length})`);
  assert.equal(sl.filter((r) => !r.special && r.item !== 'more').length + 1 <= 6, true, 'at most six tool slots');
  if (vp.name === 'portrait') {
    await page.setViewportSize({ width: 360, height: 740 });
    await sleep(400);
    sl = await checkBar('360px wide');
    assert.ok(sl.length <= 7 && sl.some((r) => r.item === 'more'), `360px: ${sl.length} slots with the more slot`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await sleep(400);
  }
  await tapEl('#hotbar .slot[data-item="more"]');
  await page.waitForFunction(() => __game.ui.modal === 'tools', null, { timeout: 5000 });
  await sleep(400);
  assert.deepEqual(await G(() => [...document.querySelectorAll('#panel .bag-item')].map((e) => e.dataset.item)), ['net', 'shovel', 'earth', 'dummy', 'bag'], 'the tools sheet lists the overflow tools and the bag');
  assert.equal(await G(() => document.querySelectorAll('#panel .bag-item[data-item="dummy"] .icon.missing').length), 1, 'an unknown icon shows the placeholder');
  await shot('01b-tools-sheet');
  await tapEl('#panel .bag-item[data-item="dummy"]');
  await page.waitForFunction(() => __game.game.tool === 'dummy' && !__game.ui.modal, null, { timeout: 5000 });
  sl = await checkBar('dummy in hand');
  const more = sl.find((r) => r.item === 'more');
  assert.ok(more.sel && more.missing === 1, 'the more slot shows the tool in hand');
  await tapEl('#hotbar .slot[data-item="more"]');
  await page.waitForFunction(() => __game.ui.modal === 'tools', null, { timeout: 5000 });
  await sleep(400);
  await tapEl('#panel .bag-item[data-item="bag"]');
  await page.waitForFunction(() => __game.ui.modal === 'bag', null, { timeout: 5000 });
  await G(() => __game.ui.closeModal());
  await tapEl('#hotbar .slot[data-item="hand"]');
  await page.waitForFunction(() => __game.game.tool === 'hand', null, { timeout: 5000 });
  await G(() => { const c = __game.game.core; c.hotbar.remove('dummy'); c.tools.remove('dummy'); __game.ui.refresh(); });
  sl = await checkBar('after the overflow tool is gone');
  assert.deepEqual(sl.map((r) => r.item), plain.map((r) => r.item), 'the bar is back to what it was');
  log('overflow tool: more slot + tools sheet ok');

  // ---- drag to move (floating joystick): finger goes right -> player goes right on screen
  const p0 = await G(() => ({ x: __game.game.player.pos.x, z: __game.game.player.pos.z }));
  const s0 = await screen(p0.x - 0.5, p0.z - 0.5);
  const cx = vp.width / 2, cy = vp.height / 2;
  await touch('touchStart', [{ x: cx, y: cy }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: cx + i * 15, y: cy }]); await sleep(30); }
  await page.waitForSelector('#joy:not(.hidden)', { timeout: 3000 }); // joystick visible while dragging
  await sleep(1200);
  await touch('touchEnd', []);
  await sleep(150);
  const p1 = await G(() => ({ x: __game.game.player.pos.x, z: __game.game.player.pos.z, analog: __game.game.analog }));
  const s1 = await screen(p1.x - 0.5, p1.z - 0.5);
  log('drag moved', p0, '->', p1);
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.8, 'player moved by dragging');
  assert.ok(s1.x - s0.x > Math.abs(s1.y - s0.y), 'moved in the drag direction (right on screen)');
  assert.equal(p1.analog, null, 'joystick released');
  assert.equal(await page.locator('#joy').isHidden(), true, 'joystick hidden after release');

  // ---- smart taps at the starter field (teleport next to it for a deterministic view)
  await G(() => { const g = __game.game; g.player.pos.set(16.5 + __game.O, 0, 27.5 + __game.O); g.player.path = null; });
  await settle();
  // harvest: tap the ripe daikon's leaves (billboard picking, not the ground tile)
  const daikon0 = await G(() => __game.game.count('daikon'));
  let s = await aim(14 + O, 26 + O, [0.45, 0.3, 0.6]);
  await tap(s.x, s.y);
  await page.waitForFunction((n) => __game.game.count('daikon') > n, daikon0, { timeout: 40000 });
  log('tap harvested daikon');
  // queue: tap two dry rice plants quickly -> both get watered in turn
  // the player is busy (e.g. mid-swing): taps made now must queue up and run in turn
  await G(() => { __game.game.actionCooldown = 4; });
  for (const [x, z] of [[11 + O, 26 + O], [12 + O, 26 + O]]) { const a = await aim(x, z); await tap(a.x, a.y); }
  const queued = await G(() => [__game.game.player.pending, ...__game.game.queue].filter(Boolean).length);
  log('queued actions', queued);
  assert.equal(queued, 2, 'both taps queued');
  await page.waitForFunction(() => document.querySelectorAll('.chip:not(.hidden)').length === 2, null, { timeout: 5000 }); // numbered queue chips
  await page.waitForFunction(() => __game.game.crop(11 + __game.O, 26 + __game.O)?.wet && __game.game.crop(12 + __game.O, 26 + __game.O)?.wet, null, { timeout: 60000 });
  log('queue watered both rice plants');
  // plant: tap empty tilled soil with the hand selected
  s = await aim(13 + O, 27 + O, [0, 0.05, 0.15]);
  await tap(s.x, s.y);
  await page.waitForFunction(() => !!__game.game.crop(13 + __game.O, 27 + __game.O), null, { timeout: 40000 });
  log('tap planted', await G(() => __game.game.crop(13 + __game.O, 27 + __game.O).type));
  // long-press inspects
  s = await aim(12 + O, 27 + O);
  await tap(s.x, s.y, 650);
  await page.waitForFunction(() => document.querySelectorAll('.float-label').length > 0, null, { timeout: 5000 });
  log('long-press label:', await page.locator('.float-label').last().textContent());
  await shot('02-farm');

  // ---- swipe across the empty bottom row of the field: every tile passed over gets planted
  const seeds = await G(() => __game.game.count(__game.game.pickSeed()));
  const a0 = await aim(11 + O, 28 + O, [0, 0.05, 0.15]);
  const a1 = await screen(14 + O, 28 + O, 0.05);
  await touch('touchStart', [{ x: a0.x, y: a0.y }]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x: a0.x + ((a1.x - a0.x) * i) / 10, y: a0.y + ((a1.y - a0.y) * i) / 10 }]); await sleep(40); }
  await touch('touchEnd', []);
  assert.equal(await page.locator('#joy').isHidden(), true, 'a field swipe is not a joystick');
  const want = Math.min(seeds, 4);
  await page.waitForFunction((n) => [11, 12, 13, 14].filter((x) => __game.game.crop(x + __game.O, 28 + __game.O)).length >= n, want, { timeout: 60000 });
  log(`swipe planted ${want} tiles`);

  // ---- clock pill opens Today: three requests from Hana
  await tapEl('#btn-today');
  await page.waitForFunction(() => __game.ui.modal === 'today', null, { timeout: 5000 });
  assert.equal(await page.locator('#panel .req').count(), 3, 'three requests today');
  await shot('03-today');
  await tapEl('#panel .close');
  await page.waitForFunction(() => __game.ui.modal === null, null, { timeout: 5000 });

  // ---- the quiet shrine: tap it -> walk up -> offering sheet; offer with a thumb
  const home = await G(() => { const g = __game.game; const p = [g.player.pos.x, g.player.pos.z]; g.player.pos.set(22.5 + __game.O, 0, 12.5 + __game.O); g.give('rice', 3); g.give('daikon', 1); return p; });
  const shrineAt = await aim(22 + O, 10 + O, [0.6, 0.4, 0.8]);
  await tap(shrineAt.x, shrineAt.y);
  await page.waitForFunction(() => __game.ui.modal === 'shrine', null, { timeout: 60000 });
  await tapEl('#panel [data-offering="harvest"] .offer');
  await page.waitForFunction(() => __game.game.shrine.givenOf('ebisu', { id: 'harvest', items: { rice: 3 } }, 'rice') === 3, null, { timeout: 5000 });
  await shot('03b-shrine');
  await tapEl('#panel .close');
  await page.waitForFunction(() => __game.ui.modal === null, null, { timeout: 5000 });
  await G((p) => { const g = __game.game; g.player.path = null; g.player.pending = null; g.player.pos.set(p[0], 0, p[1]); }, home);
  // wait for the follow-camera to come home before picking things on screen
  await page.waitForFunction(() => { const g = __game.game, p = __game.tileToScreen(g.player.pos.x - 0.5, g.player.pos.z - 0.5); return Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2) < 30; }, null, { timeout: 15000 });
  await settle();
  log('offered rice at the shrine');

  // ---- fishing: tap water -> walk to the shore, auto-select the rod, cast; reel on touch-down
  const water = await G(() => {
    const g = __game.game, c = g.playerCell();
    const out = [];
    for (let z = 0; z < g.world.h; z++) for (let x = 0; x < g.world.w; x++) {
      if (!g.world.isWater(x, z) || g.props.isBridge(x, z)) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => g.walkable(x + dx, z + dz))) continue;
      out.push({ x, z, d: Math.hypot(x - c.x, z - c.z) });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, 40);
  });
  let target = null;
  for (const w of water) {
    const sc = await screen(w.x, w.z, -0.32);
    if (!onScreen(sc)) continue;
    const t = await G((p) => __game.pick(p.x, p.y, { fuzzy: true }).tile, sc);
    if (t && t.x === w.x && t.z === w.z) { target = w; break; }
  }
  assert.ok(target, 'a water tile on screen');
  let caught = false;
  for (let attempt = 1; attempt <= 4 && !caught; attempt++) {
    await G(() => __game.game.cancelFishing());
    const before = await G(() => ['ayu', 'koi', 'tai', 'fugu'].reduce((n, f) => n + __game.game.count(f), 0));
    const sc = await aim(target.x, target.z, [-0.32]);
    await tap(sc.x, sc.y);
    await page.waitForFunction(() => !!__game.game.fishing, null, { timeout: 40000 });
    assert.equal(await G(() => __game.game.tool), 'rod', 'rod auto-selected');
    if (attempt === 1) { await sleep(400); await shot('04-fishing'); }
    await page.waitForFunction(() => !__game.game.fishing || __game.game.fishing.phase === 'bite', null, { timeout: 15000 });
    await touch('touchStart', [{ x: vp.width / 2, y: vp.height / 3 }]); // reel on touch-DOWN, anywhere
    const reeledOnDown = await G(() => !__game.game.fishing);
    await touch('touchEnd', []);
    await sleep(200);
    const after = await G(() => ['ayu', 'koi', 'tai', 'fugu'].reduce((n, f) => n + __game.game.count(f), 0));
    caught = after > before;
    log(`fishing attempt ${attempt}:`, caught ? `caught a ${await G(() => __game.game.lastCatch)}` : 'missed', reeledOnDown ? '(reeled on touch-down)' : '');
    if (caught) assert.ok(reeledOnDown, 'reeled on touch-down');
  }
  assert.ok(caught, 'caught a fish by touch');

  // ---- pinch zoom + two-finger pan
  const z0 = await G(() => __game.view.getZoom());
  await touch('touchStart', [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: cx - 40 - i * 14, y: cy, id: 1 }, { x: cx + 40 + i * 14, y: cy, id: 2 }]); await sleep(30); }
  const z1 = await G(() => __game.view.getZoom());
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: cx - 124 + i * 15, y: cy + i * 10, id: 1 }, { x: cx + 124 + i * 15, y: cy + i * 10, id: 2 }]); await sleep(30); }
  await touch('touchEnd', []);
  const pan = await G(() => __game.view.panOffset.length());
  const moved = await G(() => __game.game.player.moving);
  log('pinch zoom', z0.toFixed(2), '->', z1.toFixed(2), 'pan', pan.toFixed(2));
  assert.ok(z1 < z0 * 0.75, 'pinch out zooms in');
  assert.ok(pan > 0.5, 'two-finger drag pans the camera');
  assert.equal(moved, false, 'two-finger gestures do not walk');
  await G(() => { __game.view.setZoom(11); __game.view.panOffset.set(0, 0, 0); });
  await settle();

  // ---- build mode on touch: preview -> drag -> confirm; prop menu rotate / store
  await tapEl('#hotbar .slot[data-item="build"]');
  await page.waitForFunction(() => __game.game.mode === 'build', null, { timeout: 5000 });
  await tapEl('#hotbar .slot[data-item="prop_toro"]');
  await page.waitForFunction(() => __game.game.buildSel === 'prop_toro', null, { timeout: 5000 });
  const free = await G(() => {
    const g = __game.game, c = g.playerCell();
    const out = [];
    for (let r = 1; r < 5; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (g.props.canPlace('toro', c.x + dx, c.z + dz, 0, { playerCell: c, farm: g.farm })
        && g.props.canPlace('toro', c.x + dx + 1, c.z + dz, 0, { playerCell: c, farm: g.farm })) out.push({ x: c.x + dx, z: c.z + dz });
    }
    return out;
  });
  let spot = null;
  for (const f of free) {
    const sc = await screen(f.x, f.z);
    if (!onScreen(sc, 60)) continue;
    const pk = await G((p) => __game.pick(p.x, p.y, { fuzzy: true }), sc);
    // nothing (tree canopy, roof...) in front of the lantern, here or one tile over where it gets dragged
    const hi = await G((p) => __game.pick(p.x, p.y), await screen(f.x, f.z, 0.6));
    const hi2 = await G((p) => __game.pick(p.x, p.y), await screen(f.x + 1, f.z, 0.6));
    if (pk.ground && pk.ground.x === f.x && pk.ground.z === f.z && !pk.prop && !hi.prop && !hi2.prop) { spot = f; break; }
  }
  assert.ok(spot, 'free spot on screen');
  s = await screen(spot.x, spot.z);
  await tap(s.x, s.y);
  const cursor = await G(() => __game.game.buildCursor);
  assert.deepEqual(cursor, spot, 'first tap previews (no placement yet)');
  await sleep(300);
  assert.equal(await G(() => __game.game.ghost.group.visible), true, 'ghost preview visible');
  assert.equal(await page.locator('#build-bar').isVisible(), true, 'confirm bar visible');
  // drag the preview one tile along +x: the ghost follows the finger, lifted above it
  const s2 = await screen(spot.x + 1, spot.z);
  await touch('touchStart', [{ x: s.x, y: s.y }]);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: s.x + ((s2.x - s.x) * i) / 5, y: s.y + ((s2.y - s.y) * i) / 5 + 70 * (i / 5) }]); await sleep(40); }
  await touch('touchEnd', []);
  await sleep(150);
  const dragged = await G(() => __game.game.buildCursor);
  log('ghost dragged to', dragged);
  assert.notDeepEqual(dragged, spot, 'dragging the preview moves it');
  const nProps = await G(() => __game.game.props.list.length);
  await G(() => __game.game.rotate());
  await tapEl('#bb-place');
  await page.waitForFunction((n) => __game.game.props.list.length === n + 1, nProps, { timeout: 10000 });
  const placed = await G(() => { const p = __game.game.props.list.at(-1); return { id: p.id, x: p.x, z: p.z, rot: p.rot }; });
  log('placed lantern', placed);
  assert.equal(placed.rot, 1);
  await sleep(300);
  await shot('05-build');
  // tap the placed lantern -> prop menu -> rotate
  s = await aim(placed.x, placed.z, [0.6, 0.9, 0.4, 0.2, 1.1]);
  await tap(s.x, s.y);
  await page.waitForSelector('#prop-menu:not(.hidden)', { timeout: 5000 });
  await tapEl('#prop-menu [data-act="rotate"]');
  await page.waitForFunction((id) => __game.game.props.list.find((p) => p.id === id)?.rot === 2, placed.id, { timeout: 5000 }); // rotated via prop menu
  // and store it
  const toro0 = await G(() => __game.game.count('prop_toro'));
  await tap(s.x, s.y);
  await page.waitForSelector('#prop-menu:not(.hidden)', { timeout: 5000 });
  await tapEl('#prop-menu [data-act="store"]');
  await page.waitForFunction((n) => __game.game.count('prop_toro') === n + 1, toro0, { timeout: 5000 }); // stored via prop menu
  await tapEl('#hotbar .slot[data-item="done"]');
  await page.waitForFunction(() => __game.game.mode === 'play', null, { timeout: 5000 });

  // ---- shop sheet: tap Hana
  await G(() => { const g = __game.game; g.player.pos.set(21.5 + __game.O, 0, 20.5 + __game.O); g.player.path = null; });
  await settle();
  const mc = await G(() => __game.game.merchantCell);
  s = await aim(mc.x, mc.z, [0.6, 0.8, 0.4, 0.2]);
  await G(() => { const g = __game.game, t = g.tap.bind(g); g.tap = (x) => { window.__lastTap = { t: x, r: g.resolve(x).kind }; return t(x); }; });
  await tap(s.x, s.y);
  try { await page.waitForFunction(() => __game.ui.modal === 'shop', null, { timeout: 30000 }); } catch (e) { log('last tap', JSON.stringify(await G(() => window.__lastTap || null)), 'aimed', JSON.stringify(s)); throw e; }
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !a.effect?.target?.classList?.contains('card')), null, { timeout: 5000 });
  await sleep(100);
  const sheet = await page.locator('#panel .card').boundingBox();
  log('shop sheet', sheet);
  if (vp.name === 'portrait') {
    assert.ok(Math.abs(sheet.y + sheet.height - vp.height) < 4 && sheet.width >= vp.width - 2, 'bottom sheet in portrait');
  } else {
    assert.ok(Math.abs(sheet.x + sheet.width - vp.width) < 4 && sheet.height >= vp.height - 2, 'side sheet in landscape');
  }
  await shot('06-shop');
  const money0 = await G(() => __game.game.money);
  await tapEl('#panel .sell-all');
  await page.waitForFunction((m) => __game.game.money > m, money0, { timeout: 5000 }); // sold by tapping
  if (process.env.DEBUG) log('close btn', await G(() => { const b = document.querySelector('#panel .close').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return [b.x, b.y, b.width, b.height, e.tagName + '.' + e.className]; }));
  await tapEl('#panel .close');
  await page.waitForFunction(() => __game.ui.modal === null, null, { timeout: 5000 }); // sheet closed

  // ---- in-game confirm dialog instead of window.confirm
  await tapEl('#btn-help');
  await page.waitForSelector('#help:not(.hidden)', { timeout: 5000 });
  await tapEl('#btn-reset');
  await page.waitForSelector('#dialog:not(.hidden)', { timeout: 5000 }); // in-game confirm dialog
  await tapEl('#dialog .dlg-cancel');
  await page.waitForSelector('#dialog', { state: 'hidden', timeout: 5000 });
  await tapEl('#help-close');

  assert.deepEqual(errors, [], 'no console/page errors');
  await ctx.close();
  log('OK');
  }
}

const srv = await startServer({ root: ROOT, base: '/rokugan-cozy-village/' });
let ok = true;
for (const vp of VIEWPORTS.filter((v) => !process.env.MOBILE_ONLY || v.name === process.env.MOBILE_ONLY)) {
  const browser = await launchChrome(); // fresh browser per device keeps input timing independent
  try { await runViewport(browser, srv.url, vp); } catch (e) { ok = false; console.error(`[mobile:${vp.name}] FAILED:`, e.message, (e.stack || '').split('\n').find((l) => l.includes('mobile.mjs')) || ''); }
  await browser.close();
}
await srv.close();
console.log('[mobile]', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

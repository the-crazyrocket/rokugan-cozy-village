// Gamepad test: a Steam Deck sized screen (1280x800) and a simulated standard-mapping pad (navigator.getGamepads is replaced
// before the game loads). Walks, switches kit and tool, steers the highlight through a sheet, builds with the cursor, opens
// a plot of new land from the shore, and asserts no console / page errors. Screenshots go to SCREENS_DIR (gamepad-*.png).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tools/serve.mjs';
import { launchChrome } from '../pipeline/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = process.env.SCREENS_DIR || '/workspace/screens';
fs.mkdirSync(SCREENS, { recursive: true });
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const log = (...a) => console.log('[gamepad]', ...a);

const srv = await startServer({ root: ROOT });
const browser = await launchChrome();
const errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    const pad = { id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: { playEffect: () => Promise.resolve('complete') } };
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
  });
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 3, null, { timeout: 90000 });
  const G = (fn, arg) => page.evaluate(fn, arg);
  const frames = async (n = 2) => { const f0 = await G(() => __game.frames); await page.waitForFunction((f) => __game.frames >= f, f0 + n, { timeout: 20000 }); };
  const press = async (b) => { await G((i) => { __pad.buttons[i] = { pressed: true, touched: true, value: 1 }; }, b); await frames(2); await G((i) => { __pad.buttons[i] = { pressed: false, touched: false, value: 0 }; }, b); await frames(2); };
  const stick = async (x, y, n = 6, axis = 0) => { await G(([a, x, y]) => { __pad.axes[a] = x; __pad.axes[a + 1] = y; }, [axis, x, y]); await frames(n); await G((a) => { __pad.axes[a] = 0; __pad.axes[a + 1] = 0; }, axis); await frames(2); };
  const focused = () => G(() => { const f = document.querySelector('.pad-focus'); return f ? (f.dataset.item || f.dataset.tab || f.dataset.size || f.textContent.trim().slice(0, 24)) : null; });

  // the welcome card is open: the pad steers it and B closes it, and the UI shows controller prompts from the first touch
  assert.equal(await G(() => !document.getElementById('help').classList.contains('hidden')), true, 'the help card greets');
  await press(BTN.DOWN);
  assert.equal(await G(() => document.body.classList.contains('pad')), true, 'pad prompts on');
  assert.ok(await focused(), 'something in the help card is highlighted');
  assert.equal(await G(() => getComputedStyle(document.querySelector('.help-pad')).display !== 'none'), true, 'the controller controls are listed');
  await press(BTN.B);
  assert.equal(await G(() => document.getElementById('help').classList.contains('hidden')), true, 'B closed the help');
  assert.match(await G(() => document.getElementById('tool-hint').textContent), /A do what's in front/);

  // walking with the left stick
  const p0 = await G(() => ({ x: __game.game.player.pos.x, z: __game.game.player.pos.z }));
  await stick(1, 0, 10);
  const p1 = await G(() => ({ x: __game.game.player.pos.x, z: __game.game.player.pos.z }));
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.3, `the stick walks (${JSON.stringify(p0)} -> ${JSON.stringify(p1)})`);
  assert.equal(await G(() => __game.game.analog), null, 'the stick let go: standing still');

  // X the dig kit, RB the next tool, X back
  await press(BTN.X);
  assert.equal(await G(() => __game.game.core.use('interact').kit), 'dig');
  const t0 = await G(() => __game.game.tool);
  await press(BTN.RB);
  assert.notEqual(await G(() => __game.game.tool), t0, 'RB took the next tool');
  await press(BTN.X);
  assert.equal(await G(() => __game.game.core.use('interact').kit), 'play');

  // Y the bag: a highlight to steer, B to close; Menu the Today card, LB/RB / A inside it
  await press(BTN.Y);
  await page.waitForFunction(() => __game.ui.modal === 'bag', null, { timeout: 5000 });
  await frames(3);
  const f0 = await focused();
  assert.ok(f0, 'a highlight in the bag');
  await press(BTN.RIGHT);
  await press(BTN.DOWN);
  await page.screenshot({ path: path.join(SCREENS, 'gamepad-bag.png') });
  await press(BTN.B);
  assert.equal(await G(() => __game.ui.modal), null, 'B closed the bag');
  await press(BTN.MENU);
  await page.waitForFunction(() => __game.ui.modal === 'today', null, { timeout: 5000 });
  await press(BTN.MENU);
  assert.equal(await G(() => __game.ui.modal), null, 'Menu again closed Today');

  // View: build mode with a cursor of its own; the stick moves it, the camera follows, B is done
  await G(() => __game.game.give('prop_toro', 1));
  await press(BTN.VIEW);
  assert.equal(await G(() => __game.game.mode), 'build');
  const c0 = await G(() => ({ ...__game.game.hoverTile }));
  await press(BTN.RIGHT); await press(BTN.RIGHT);
  const c1 = await G(() => ({ ...__game.game.hoverTile }));
  assert.notDeepEqual(c1, c0, 'the D-pad moved the build cursor');
  await press(BTN.RB);
  assert.notEqual(await G(() => __game.game.buildSel), 'pickup', 'RB picked something to place');
  await page.screenshot({ path: path.join(SCREENS, 'gamepad-build.png') });
  await press(BTN.B);
  assert.equal(await G(() => __game.game.mode), 'play', 'B left build mode');

  // the plot sheet from the shore: face the sea with the earth basket, A, then steer to the sizes and fill it in
  const shore = await G(() => {
    const g = __game.game, c = g.core, r = c.use('reclaim'), pl = c.use('player');
    for (let z = 2; z < 62; z++) for (let x = 2; x < 62; x++) {
      if (!r.shore(x, z) || (r.plotAt(x, z, 5)?.tiles.length ?? 0) < 12) continue;
      for (const [dx, dz] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) if (pl.walkable(x + dx, z + dz)) { pl.warp(x + dx + 0.5, z + dz + 0.5); pl.face({ x, z }); return { x, z }; }
    }
    return null;
  });
  assert.ok(shore, 'a shore to stand on');
  await G(() => { const c = __game.game.core; c.money.add(1000, 'test'); c.inv.give('stone', 20); c.inv.give('wood', 10); });
  await press(BTN.X);
  for (let i = 0; i < 6 && (await G(() => __game.game.tool)) !== 'earth'; i++) await press(BTN.RB);
  assert.equal(await G(() => __game.game.tool), 'earth');
  await press(BTN.A);
  await page.waitForFunction(() => __game.ui.modal === 'plot', null, { timeout: 5000 });
  await frames(3);
  assert.equal(await focused(), 'Fill it in', 'the main button is highlighted first');
  await press(BTN.UP);
  assert.match(await focused(), /^\d$/, 'up from the button: a size');
  await press(BTN.LEFT);
  await page.screenshot({ path: path.join(SCREENS, 'gamepad-plot.png') });
  await press(BTN.A); // that size
  await frames(3);
  await press(BTN.DOWN); await press(BTN.DOWN);
  assert.equal(await focused(), 'Fill it in');
  await press(BTN.A);
  await frames(3);
  assert.ok(await G(() => !!__game.game.core.use('reclaim').active), 'A on Fill it in started the plot');
  log('plot started from the pad at', shore);

  assert.deepEqual(errors, [], 'no console or page errors');
  console.log('[gamepad] PASS');
} catch (e) {
  console.error('[gamepad] FAILED:', e.message);
  await page?.screenshot({ path: path.join(SCREENS, 'gamepad-fail.png') }).catch(() => {});
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  await srv.close();
}

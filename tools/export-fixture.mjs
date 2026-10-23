// Drives the CURRENT build in headless Chrome and writes save fixtures to tests/fixtures/:
//   save-v3-fresh.json  a new game
//   save-v3-mid.json    some farming, requests part done, fish caught, tool slot changed, a prop moved
//   save-v3-ebisu.json  every Ebisu offering made, Ebisu awake, pier built
//   save-v2.json, save-v1.json  derived from the mid save by undoing the migrations in src/game/save.js
// Time is frozen (UTC, 2026-03-14 10:00) so the files are deterministic. Re-run only when the
// save format changes on purpose.   CHROME_PATH=... node tools/export-fixture.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launchChrome } from '../pipeline/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'tests', 'fixtures'));
const SAVE_KEY = 'rokugan-cozy-village/save/v1';
const FIXED = '2026-03-14T10:00:00Z';
const V1_STAGE_MS = { rice: 60_000, daikon: 90_000, tea: 120_000 }; // inverse of the v1 -> v2 migration

const srv = await startServer({ root: ROOT });
const browser = await launchChrome();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, timezoneId: 'UTC', locale: 'en-GB' });
  await ctx.clock.setFixedTime(new Date(FIXED));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(srv.url + '?nosw');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game?.ready && window.__game.frames > 3, null, { timeout: 120000 });
  const G = (fn, arg) => page.evaluate(fn, arg);
  const read = () => G((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);

  await G(() => __game.game.save());
  const fresh = await read();

  await G(() => {
    const g = __game.game, MIN = 60_000;
    g.skipTime(10 * MIN);
    for (const c of [...g.farm.values()]) if (g.stage(c) >= 3) g.harvest(c);
    // a second field strip: till, plant, water
    for (const x of [15, 16, 17]) {
      const t = { x, z: 28 };
      g.useTool(t, 'hoe'); g.useTool(t, 'seed_daikon'); g.useTool(t, 'can');
    }
    g.useTool({ x: 13, z: 26 }, 'seed_rice');
    g.useTool({ x: 13, z: 26 }, 'can');
    // requests: finish one and claim it, part-finish another
    const rs = g.daily.state.requests;
    const finish = (r, n) => {
      if (r.kind === 'deliver') { g.give(r.item, n); return; }
      if (r.kind === 'harvest') g.daily.note('harvest', r.item, n);
      else if (r.kind === 'catch') { const f = { any: 'ayu', fresh: 'ayu', sea: 'tai', koi: 'koi', tai: 'tai' }[r.item]; g.give(f, n); g.daily.note('catch', f, n); }
      else g.daily.note('forage', 'wildflower', n);
    };
    finish(rs[0], rs[0].n);
    g.claimRequest(0);
    finish(rs[1], Math.max(1, rs[1].n - 1));
    // fish
    for (const [f, n] of [['ayu', 3], ['koi', 1], ['tai', 2]]) { g.give(f, n); g.bump('caught', f, n); }
    g.stats.earned += 40;
    g.selectSlot(3);
    // move a prop (as the touch build bar does)
    const crate = g.props.at(16, 26);
    g.moveProp(crate);
    const spot = [[17, 26], [18, 26], [17, 27], [18, 30]].find(([x, z]) => g.props.canPlace('crate', x, z, 0, { playerCell: g.playerCell(), farm: g.farm }));
    g.buildCursor = { x: spot[0], z: spot[1] };
    g.confirmBuild();
    g.mode = 'play';
    g.save();
  });
  const mid = await read();

  await G(async () => {
    const g = __game.game;
    g.ui.closeModal?.();
    const { FORTUNES } = await import('./src/game/shrine.js');
    for (const o of FORTUNES.ebisu.offerings) {
      for (const [it, n] of Object.entries(o.items)) g.give(it, n);
      g.offer(o.id);
    }
    g.wakeFortune('ebisu');
    g.save();
  });
  const ebisu = await read();
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));

  const checks = [
    [fresh.v === 3 && fresh.props.length > 10 && fresh.daily?.requests?.length === 3, 'fresh save looks wrong'],
    [mid.farm.length >= 5 && mid.stats.requests === 1 && mid.stats.caught.ayu === 3 && mid.slot === 3, 'mid save looks wrong'],
    [ebisu.shrine.awake.join() === 'ebisu' && ebisu.props.some((p) => p.type === 'pier'), 'ebisu save looks wrong'],
  ];
  for (const [ok, msg] of checks) if (!ok) throw new Error(msg);

  const LANDMARK_TYPES = ['shrine_old', 'shrine', 'stone', 'pier'];
  const v2 = { ...mid, v: 2, props: mid.props.filter((p) => !LANDMARK_TYPES.includes(p.type)) };
  delete v2.shrine;
  const v1 = { ...v2, v: 1, farm: v2.farm.map((c) => ({ type: c.type, x: c.x, z: c.z, growth: Math.round(c.progress * V1_STAGE_MS[c.type]), last: c.last, wet: c.wet })) };
  delete v1.timeOffset; delete v1.daily; delete v1.stats;

  fs.mkdirSync(OUT, { recursive: true });
  // one top-level key per line keeps diffs readable without bloating the large arrays
  const dump = (name, s) => {
    const body = Object.entries(s).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
    fs.writeFileSync(path.join(OUT, name), `{\n${body}\n}\n`);
    console.log('wrote', path.join(OUT, name));
  };
  dump('save-v3-fresh.json', fresh);
  dump('save-v3-mid.json', mid);
  dump('save-v3-ebisu.json', ebisu);
  dump('save-v2.json', v2);
  dump('save-v1.json', v1);
} finally {
  await browser.close();
  await srv.close();
}

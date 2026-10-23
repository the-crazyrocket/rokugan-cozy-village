// Core gameplay: player, tools, farming, fishing, build mode, economy, saving.
// No energy / stamina / fatigue anywhere: every action is free and unlimited.
import * as THREE from 'three';
import { World, T } from './world.js';
import { createSurface } from '../world/surface.js';
import { PropManager, Ghost, propCells } from './props.js';
import { RIPE, START_INVENTORY, START_MONEY } from './data.js';
import { dailyView } from './daily.js';
import { fixBridges } from './bridgefix.js';
import { SAVE_VERSION, readSave, writeSave, hasSave, clearSave } from './save.js';
import { MIN } from './clock.js';
import { Ground } from '../render/ground.js';
import { BillboardLayer, BlobShadows } from '../render/vegetation.js';
import { buildCharacter, animateCharacter } from '../render/character.js';
import { Particles } from '../render/particles.js';
import { PALETTE } from '../assets/palette.js';
import { LANDMARKS, HOME } from '../content/base/landmarks.js';
import { LEGACY_OFF } from '../world/coords.js';
import { growSave } from './grow.js';
import { createCore } from '../core/core.js';
import { wrapRng } from '../core/rng.js';
import { PRIO } from '../core/bus.js';
import { attachFeedback } from '../ui/feedback.js';
import { installSystems } from '../systems/install.js';
import { systems } from '../systems/index.js';
import { installViews } from '../render/views/install.js';
import { merchantSpot } from '../systems/shared.js';
import { rleEncode, rleDecode } from '../core/rle.js';

export { LANDMARKS };

const AWAY_MS = 10 * MIN; // gone at least this long -> "while you were away" summary

export class Game {
  constructor({ scene, painted, ui, now = () => Date.now(), sound = null, rng = () => Math.random(), mono = () => performance.now() }) {
    installSystems(this);
    installViews(this);
    this.scene = scene;
    this.painted = painted;
    this.ui = ui;
    this.sound = sound;
    this.rng = rng; // () => [0,1), injectable for tests
    this.mono = mono; // monotonic ms for animation and fishing timers
    // real local time, plus an offset that only the dev time-skip changes
    this.timeOffset = 0;
    this.core = createCore({ now: () => now() + this.timeOffset, mono, rng: wrapRng(rng), strict: false });
    this.now = this.core.now;
    attachFeedback(this.core, this);
    this.core.provide('groundY', (x, z) => this.surface.groundY(x, z));
    this.world = new World();
    this.core.provide('world', this.world);
    this.core.boot(systems);
    // until market (Hana's spot) and fishing (the line) listen themselves
    this.core.use('player').block((x, z) => this.isMerchant(x, z));
    this.core.bus.on('playerMove', () => { if (this.fishing) this.cancelFishing(); }, { priority: PRIO.STATE, owner: 'game' });
    this.daily = dailyView(this.core);
    this.core.use('stats').data.caught = this.core.use('fishing').caught; // the fishing system counts the catches
    // until the slices are registered (S10): offerings, a waking Fortune and a handed-in request are saved at once
    for (const name of ['offer', 'wake', 'requestClaimed']) this.core.bus.on(name, (p, m) => { if (!m.away) this.save(); }, { priority: PRIO.VIEW, owner: 'game' });
    this.core.bus.on('buildMode', () => { this.player.path = null; this.player.pending = null; }, { priority: PRIO.STATE, owner: 'game' });
    this.core.bus.on('invalidate', (p) => { if (p.what === 'veg' || p.what === 'crops' || p.what === 'ground') this.dirty[p.what] = true; else if (p.what === 'terrain') this.dirty.ground = this.dirty.terrain = true; }, { priority: PRIO.STATE, owner: 'game' });
    this.ground = new Ground(this.world, painted.sheets);
    scene.add(this.ground.group);
    this.props = new PropManager(scene, painted, this.world, this.core);
    this.surface = createSurface(this.world, this.props);
    this.ghost = new Ghost(scene, this.props);
    this.veg = new BillboardLayer(painted.sheets.vegetation, { capacity: 5000, name: 'vegetation' });
    this.cropLayer = new BillboardLayer(painted.sheets.crops, { capacity: 1500, name: 'crops' });
    // one layer per crop sheet: { sheet name -> layer }
    this.cropLayers = { crops: this.cropLayer, crops2: new BillboardLayer(painted.sheets.crops2, { capacity: 800, name: 'crops2' }), crops3: new BillboardLayer(painted.sheets.crops3, { capacity: 800, name: 'crops3' }) };
    this.canopy = new BillboardLayer(painted.sheets.canopy, { capacity: 600, name: 'canopy' });
    this.gatherLayer = new BillboardLayer(painted.sheets.gather, { capacity: 200, name: 'gather' });
    this.visitorLayer = new BillboardLayer(painted.sheets.visitors, { capacity: 16, name: 'visitors' });
    this.bugLayer = new BillboardLayer(painted.sheets.bugs, { capacity: 16, name: 'bugs' });
    this.blobs = new BlobShadows(400);
    scene.add(this.veg.mesh, ...Object.values(this.cropLayers).map((l) => l.mesh), this.canopy.mesh, this.gatherLayer.mesh, this.visitorLayer.mesh, this.bugLayer.mesh, this.blobs.mesh);
    this.particles = new Particles(scene);
    for (let z = 0; z < this.world.h; z++) for (let x = 0; x < this.world.w; x++) {
      if (this.world.isLand(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.world.isFresh(x + dx, z + dz))) this.particles.fireflySources.push({ x, z });
    }

    this.dirty = { veg: true, crops: true, ground: false };
    this.keys = new Set();
    this.analog = null; // touch joystick: screen-space unit vector + magnitude
    this.touchInput = false; // last input came from a touch screen
    this.away = null; // summary of what happened since the last visit (shown once)
    this.sparkleT = 0;

    this.char = buildCharacter({ robe: PALETTE.indigo, sash: PALETTE.gold, hat: true });
    this.char.root.name = 'player';
    scene.add(this.char.root);
    this.makeTools();
    this.makeCursor();
    this.makeFishingGear();

    this.props.onChange = () => { this.dirty.veg = true; };
  }

  // ------------------------------------------------------------------ core views
  get inv() { return this.core.inv.map; }
  set inv(entries) { this.core.inv.load([...entries]); }
  get money() { return this.core.money.get(); }
  set money(n) { this.core.money.set(n); }

  // ------------------------------------------------------------------ new / load / save
  newGame() {
    this.money = START_MONEY;
    this.inv = [['hand', 1], ['hoe', 1], ['can', 1], ['rod', 1], ...Object.entries(START_INVENTORY)];
    // the layout is authored on the old 40x40 island, which sits LEGACY_OFF tiles into the world
    const O = LEGACY_OFF;
    const place = (type, x, z, rot = 0) => {
      if (this.props.canPlace(type, x + O, z + O, rot, { via: 'load' })) return this.props.add(type, x + O, z + O, rot, 0, { via: 'load' });
      return null;
    };
    // village layout
    const stall = place('stall', 19, 18, 0);
    this.stall = stall;
    place('minka', 14, 24, 0);
    place('minka', 26, 25, 3);
    place('well', 16, 19);
    place('torii', 20, 31, 0);
    for (const [x, z] of [[19, 26], [22, 26], [19, 23], [22, 23]]) place('toro', x, z);
    // bridge across the river where the north road meets it
    let rz = 0;
    for (let z = 10; z < 20; z++) if (this.world.isWater(25 + O, z + O)) { rz = z; break; }
    if (rz) for (const dz of [0, -1, 1]) if (place('bridge', 25, rz + dz, 0)) break; // the anchor that puts both ends on the banks
    for (const [x, z] of [[12, 30], [17, 28], [23, 16], [29, 21], [9, 24], [27, 29], [15, 16], [18, 13]]) place('sakura', x, z);
    for (const [x, z] of [[8, 15], [31, 26], [14, 33], [24, 33], [32, 17], [7, 27], [20, 9], [28, 10], [11, 10]]) place('pine', x, z, (x + z) % 4);
    for (const [x, z] of [[6, 19], [7, 20], [6, 21], [7, 18], [5, 20], [8, 21]]) place('bamboo', x, z);
    for (let x = 10; x <= 14; x++) place('fence', x, 29, 0);
    place('crate', 16, 26); place('pot', 12, 23); place('pot', 16, 23); place('crate', 21, 17);
    // starter field
    const t0 = this.now();
    for (let x = 11; x <= 14; x++) for (let z = 26; z <= 28; z++) this.world.set(x + O, z + O, T.SOIL);
    // progress is in stages; the starter field has some ready, some growing
    const crop = (type, x, z, stage) => {
      this.farm.set((z + O) * this.world.w + x + O, { type, x: x + O, z: z + O, progress: stage + 0.02, last: t0, wet: false });
    };
    crop('rice', 11, 26, 2); crop('rice', 12, 26, 2); crop('daikon', 13, 26, 3); crop('daikon', 14, 26, 3);
    crop('tea', 11, 27, 1); crop('rice', 12, 27, 1);
    this.player.pos.set(HOME.x + 0.5, 0, HOME.z + 0.5);
    this.ensureLandmarks();
    this.placeMerchant();
    this.daily.ensure();
    this.core.start({ fresh: true });
    this.dirty.veg = this.dirty.crops = this.dirty.ground = this.dirty.terrain = true;
    this.save();
  }

  serialize() {
    return {
      v: SAVE_VERSION, size: [this.world.w, this.world.h], savedAt: this.now(), timeOffset: this.timeOffset,
      money: this.money, inv: [...this.inv], slot: this.slot,
      player: [this.player.pos.x, this.player.pos.z, this.player.facing],
      props: this.props.serialize(), tiles: this.world.diff(),
      ...(this.world.height.some((h) => h) && { heights: rleEncode(this.world.height) }), // raised ground (absent while all flat)
      farm: [...this.farm.values()].map((c) => ({ type: c.type, x: c.x, z: c.z, progress: c.progress, last: c.last, wet: c.wet })),
      wetSoil: [...this.wetSoil],
      daily: this.daily.serialize(), stats: this.stats, shrine: this.shrine.serialize(),
      ext: this.core.saveParts(), // what the newer systems keep (reclaim, projects, ...)
    };
  }

  save() {
    if (this.frozen) return; // a reset / restore is reloading the page
    // the backup slot is refreshed every half hour, so a damaged save loses little
    const backup = !this.lastBackup || this.now() - this.lastBackup > 30 * MIN;
    if (writeSave(this.serialize(), { backup }) && backup) this.lastBackup = this.now();
    this.lastSave = this.now();
  }

  /** Restore from localStorage (or from given save data, e.g. an imported code). */
  load(s = readSave()) {
    if (!s) return false;
    s = growSave(s, this.world.w, this.world.h); // a village from the 40x40 days moves to the middle of the bigger world
    this.timeOffset = s.timeOffset || 0;
    this.money = s.money; this.inv = s.inv; this.slot = s.slot || 0;
    this.shrine.load(s.shrine);
    this.world.applyDiff(s.tiles);
    if (s.heights) this.loadHeights(s.heights);
    // old saves: bridges were 1x3 and may hang over the water
    const fixed = fixBridges(s.props, this.world, (p) => propCells(p.type, p.x, p.z, p.rot).cells);
    for (const r of fixed.report) if (r.action === 'bag') this.give('prop_bridge');
    for (const p of fixed.props) {
      const pr = this.props.add(p.type, p.x, p.z, p.rot, p.id, { via: 'load' });
      if (p.type === 'stall') this.stall = pr;
    }
    for (const c of s.farm) this.farm.set(c.z * this.world.w + c.x, { ...c });
    this.wetSoil = new Map(s.wetSoil || []);
    this.stats = { ...this.stats, ...(s.stats || {}) };
    this.core.use('fishing').caught = this.stats.caught;
    this.player.pos.set(s.player[0], 0, s.player[1]); this.player.facing = s.player[2];
    this.ensureLandmarks();
    this.placeMerchant();
    const before = this.farmSnapshot();
    this.tickCrops(true);
    this.core.loadParts(s.ext);
    this.daily.load(s.daily);
    const newDay = this.daily.ensure();
    this.core.start();
    const awayMs = this.now() - (s.savedAt || this.now());
    if (awayMs > AWAY_MS || newDay) this.away = this.awaySummary(before, awayMs, newDay);
    this.dirty.veg = this.dirty.crops = this.dirty.ground = this.dirty.terrain = true;
    return true;
  }

  /** Raised ground from a save; a damaged array is ignored (the village stays flat rather than not loading). */
  loadHeights(runs) {
    let h;
    try { h = rleDecode(runs, this.world.w * this.world.h); } catch { return; }
    for (let i = 0; i < h.length; i++) if (h[i]) this.world.setHeight(i % this.world.w, Math.floor(i / this.world.w), h[i]);
  }

  static clearSave() { clearSave(); }
  static hasSave() { return hasSave(); }

  /** Crop stages right now (compare after time passes with awaySummary). */
  farmSnapshot() { return new Map([...this.farm].map(([i, c]) => [i, this.stage(c)])); }

  awaySummary(before, awayMs, newDay) {
    const ripe = {};
    let grew = 0;
    for (const [i, c] of this.farm) {
      const s0 = before.get(i), s = this.stage(c);
      if (s0 == null) continue;
      if (s > s0) grew++;
      if (s >= RIPE && s0 < RIPE) ripe[c.type] = (ripe[c.type] || 0) + 1;
    }
    const built = this.core.use('projects').takeFresh().map((id) => this.core.content.projects.get(id).name);
    const visited = this.core.use('visitors').takeFresh().map((id) => this.core.content.visitors.get(id).name);
    return { awayMs, ripe, grew, newDay, forage: newDay ? this.daily.forageLeft() : 0, built, visited };
  }

  /** Back from a long break without reloading (phone app resumed): catch up + summary. */
  resume(hiddenAt, before) {
    this.tickCrops(true);
    this.core.use('projects').check(); // a project that came due while the app was in the background
    this.core.use('visitors').check(true); // and who came by meanwhile
    const newDay = this.daily.ensure();
    if (newDay) this.dirty.veg = true;
    const awayMs = this.now() - hiddenAt;
    return awayMs > AWAY_MS || newDay ? this.awaySummary(before, awayMs, newDay) : null;
  }

  /** Dev: jump the village clock forward (crops grow, days roll over). */
  skipTime(ms) {
    const before = this.farmSnapshot();
    this.timeOffset += ms;
    const away = this.resume(this.now() - ms, before);
    this.save();
    this.ui.refresh();
    return away;
  }

  sfx(name, opts) { this.core.sfx(name, opts); }
  haptic(ms = 15) {
    if (this.touchInput && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* not allowed */ } }
  }

  // ------------------------------------------------------------------ inventory
  count(id) { return this.core.inv.count(id); }
  give(id, n = 1) { this.core.inv.give(id, n); this.ui.refresh(); }
  take(id, n = 1) {
    if (!this.core.inv.take(id, n)) return false;
    this.ui.refresh(); return true;
  }

  // ------------------------------------------------------------------ input-driven
  setKey(code, down) { if (down) this.keys.add(code); else this.keys.delete(code); }

  /** Analog stick input from the touch joystick (screen space: x right, y down, m 0..1). */
  setAnalog(a) { this.analog = a; }

  // ------------------------------------------------------------------ per-frame
  update(dt, t) {
    const pl = this.player;
    this.movePlayer(dt, this.ui.modalOpen() ? null : this.moveInput());
    this.char.root.position.copy(pl.pos);
    this.char.root.rotation.y = pl.facing;
    const swing = pl.swingT > 0 ? Math.sin((1 - pl.swingT / 0.35) * Math.PI) * 1.6 : (this.fishing ? 0.9 : 0);
    animateCharacter(this.char, t, { moving: pl.moving, swing });
    for (const [k, m] of Object.entries(this.toolMeshes)) m.visible = this.mode === 'play' && this.tool === k;

    // cursor on target tile
    const tt = this.mode === 'build' && this.hoverTile ? this.hoverTile : this.targetTile();
    const ty = this.world.isWater(tt.x, tt.z) && !this.props.isBridge(tt.x, tt.z) ? this.world.waterY(tt.x, tt.z) + 0.02 : this.world.levelY(tt.x, tt.z) + 0.025;
    this.cursor.position.set(tt.x + 0.5, ty, tt.z + 0.5);
    this.cursor.visible = !this.fishing && !(this.mode === 'build' && this.buildSel !== 'pickup');
    if (this.mode === 'play') this.cursorColor(0xffffff);
    this.updateGhost();
    this.updateFishing(t);

    this.core.use('interact').tick(dt); // the smart-tap action queue
    // destination marker while walking
    const dm = this.destMarker;
    dm.visible = !!(pl.path && pl.path.length && pl.dest && this.mode === 'play');
    if (dm.visible) {
      const goal = pl.path[pl.path.length - 1];
      dm.position.set(goal.x, this.core.groundY(goal.x, goal.y) + 0.03, goal.y);
      dm.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    }

    if (!this.nextCropTick || t > this.nextCropTick) {
      this.tickCrops();
      this.nextCropTick = t + 0.5;
      this.daily.poll(); // the clock passed 5:00 while playing: a new day, announced
    }
    this.core.update(dt, t); // the systems' own frame work (a project coming due)
    this.shrine.tick(dt); // glitter over the shrine while a Fortune's waking is celebrated
    // little glints so ripe crops and wild greens are easy to spot on a quick look
    this.sparkleT -= dt;
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.35;
      const spots = [...[...this.farm.values()].filter((c) => this.stage(c) >= RIPE), ...this.daily.visibleForage()];
      if (spots.length) {
        const s = spots[Math.floor(this.rng() * spots.length)];
        this.particles.sparkle(s.x + 0.3 + this.rng() * 0.4, 0.35 + this.rng() * 0.4, s.z + 0.3 + this.rng() * 0.4);
      }
    }
    if (this.dirty.terrain) { this.ground.rebuildTerrain(); this.dirty.terrain = false; }
    if (this.dirty.ground) { this.ground.wet = new Set([...[...this.farm.values()].filter((c) => c.wet).map((c) => c.z * this.world.w + c.x), ...this.wetSoil.keys()]); this.ground.updateTypes(); this.dirty.ground = false; }
    if (this.dirty.crops) { this.rebuildCrops(); this.dirty.crops = false; }
    if (this.dirty.veg) { this.rebuildVegetation(); this.dirty.veg = false; }
    this.veg.update(t); for (const l of Object.values(this.cropLayers)) l.update(t); this.canopy.update(t); this.gatherLayer.update(t); this.visitorLayer.update(t); this.bugLayer.update(t); this.ground.update(t);
    this.particles.update(dt);
    if (this.merchant) animateCharacter(this.merchant, t + 3, {});
    this.updateVillagers(t);
    if (!this.lastSave || this.now() - this.lastSave > 10_000) this.save();
  }

  placeMerchant() {
    const s = this.props.list.find((p) => p.type === 'stall');
    if (!s) return;
    const spot = merchantSpot(s);
    this.placeMerchantMesh(spot);
    this.merchantCell = spot.cell;
  }
}

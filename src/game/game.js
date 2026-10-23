// Core gameplay: player, tools, farming, fishing, build mode, economy, saving.
// No energy / stamina / fatigue anywhere: every action is free and unlimited.
import * as THREE from 'three';
import { World, W, H, T, hash2 } from './world.js';
import { PropManager, Ghost, propCells } from './props.js';
import { ITEMS, PROPS, CROPS, RIPE, FISH, FORAGE, HOTBAR, START_INVENTORY, START_MONEY, SELLABLE_KINDS } from './data.js';
import { findPath } from './pathfind.js';
import { Daily } from './daily.js';
import { SAVE_VERSION, readSave, writeSave, hasSave, clearSave } from './save.js';
import { MIN, duration } from './clock.js';
import { Ground, WATER_Y } from '../render/ground.js';
import { BillboardLayer, BlobShadows } from '../render/vegetation.js';
import { buildCharacter, animateCharacter } from '../render/character.js';
import { makeBrushMaterial } from '../render/materials.js';
import { Particles } from '../render/particles.js';
import { PALETTE } from '../assets/palette.js';

const SPEED = 3.6;
const RADIUS = 0.24;
const DIRS = { up: [-1, -1], down: [1, 1], left: [-1, 1], right: [1, -1] }; // screen -> world (camera at +x+z)
const SIN_EL = Math.sin((35.264 * Math.PI) / 180); // screen-vertical foreshortening of the ground
const ACTIONS = new Set(['shop', 'harvest', 'water', 'plant', 'till', 'fish', 'forage']);
const SWEEP_KINDS = new Set(['harvest', 'water', 'plant', 'forage']);
const QUEUE_MAX = 24; // a swipe across a whole field queues one action per tile
const AWAY_MS = 10 * MIN; // gone at least this long -> "while you were away" summary
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

export class Game {
  constructor({ scene, painted, ui, now = () => Date.now(), sound = null }) {
    this.scene = scene;
    this.painted = painted;
    this.ui = ui;
    this.sound = sound;
    // real local time, plus an offset that only the dev time-skip changes
    this.timeOffset = 0;
    this.now = () => now() + this.timeOffset;
    this.world = new World();
    this.ground = new Ground(this.world, painted.sheets);
    scene.add(this.ground.group);
    this.props = new PropManager(scene, painted, this.world);
    this.ghost = new Ghost(scene, this.props);
    this.veg = new BillboardLayer(painted.sheets.vegetation, { capacity: 5000, name: 'vegetation' });
    this.cropLayer = new BillboardLayer(painted.sheets.crops, { capacity: 1500, name: 'crops' });
    this.canopy = new BillboardLayer(painted.sheets.canopy, { capacity: 600, name: 'canopy' });
    this.blobs = new BlobShadows(400);
    scene.add(this.veg.mesh, this.cropLayer.mesh, this.canopy.mesh, this.blobs.mesh);
    this.particles = new Particles(scene);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (this.world.isLand(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.world.isFresh(x + dx, z + dz))) this.particles.fireflySources.push({ x, z });
    }

    this.farm = new Map(); // tile index -> crop
    this.wetSoil = new Map(); // tile index -> wet until (ms) for empty soil
    this.inv = new Map();
    this.money = 0;
    this.slot = 0;
    this.mode = 'play';
    this.buildSel = 'pickup';
    this.buildRot = 0;
    this.hoverTile = null;
    this.fishing = null;
    this.dirty = { veg: true, crops: true, ground: false };
    this.keys = new Set();
    this.analog = null; // touch joystick: screen-space unit vector + magnitude
    this.queue = []; // queued smart-tap actions
    this.actionCooldown = 0;
    this.lastSeed = null;
    this.touchInput = false; // last input came from a touch screen
    this.buildCursor = null; // touch build preview tile
    this.moving = null; // prop being moved (touch build mode), restored on cancel
    this.daily = new Daily(this);
    this.stats = { harvested: {}, caught: {}, foraged: {}, requests: 0, earned: 0 };
    this.away = null; // summary of what happened since the last visit (shown once)
    this.sparkleT = 0;

    this.player = {
      pos: new THREE.Vector3(17.5, 0, 22.5), facing: Math.PI * 0.25, path: null, pending: null,
      swing: 0, swingT: 0, moving: false,
    };
    this.char = buildCharacter({ robe: PALETTE.indigo, sash: PALETTE.gold, hat: true });
    this.char.root.name = 'player';
    scene.add(this.char.root);
    this.makeTools();
    this.makeCursor();
    this.makeFishingGear();

    this.props.onChange = () => { this.dirty.veg = true; };
  }

  // ------------------------------------------------------------------ setup
  makeTools() {
    const wood = makeBrushMaterial(PALETTE.wood), metal = makeBrushMaterial('#8c8f96'), bamboo = makeBrushMaterial('#9bb05a');
    const hoe = new THREE.Group();
    hoe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).translate(0, -0.15, 0), wood));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), metal); blade.position.set(0, -0.45, 0.06); hoe.add(blade);
    hoe.rotation.x = Math.PI * 0.5;
    const can = new THREE.Group();
    can.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 10), wood));
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.18, 6), wood); sp.position.set(0, 0.02, 0.12); sp.rotation.x = 1.1; can.add(sp);
    can.position.y = -0.06;
    const rod = new THREE.Group();
    rod.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.1, 6).translate(0, 0.55, 0), bamboo));
    rod.rotation.x = Math.PI * 0.32;
    this.rodTip = new THREE.Object3D(); this.rodTip.position.set(0, 1.1, 0); rod.add(this.rodTip);
    this.toolMeshes = { hoe, can, rod };
    for (const m of Object.values(this.toolMeshes)) { m.visible = false; m.traverse((o) => (o.castShadow = true)); this.char.parts.hand.add(m); }
  }

  makeCursor() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#fff6dc'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.strokeRect(5, 5, 54, 54);
    const tex = new THREE.CanvasTexture(c);
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
    this.cursor.renderOrder = 3;
    this.scene.add(this.cursor);
    this.destMarker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.destMarker.renderOrder = 3;
    this.destMarker.visible = false;
    this.scene.add(this.destMarker);
  }

  makeFishingGear() {
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), makeBrushMaterial(PALETTE.vermilion));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), makeBrushMaterial(PALETTE.paper));
    this.bobber.add(top, bot);
    this.bobber.visible = false;
    this.scene.add(this.bobber);
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xf4ead2, transparent: true, opacity: 0.8 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.scene.add(this.line);
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf4ead2, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.ripple);
  }

  // ------------------------------------------------------------------ new / load / save
  newGame() {
    this.money = START_MONEY;
    this.inv = new Map([['hand', 1], ['hoe', 1], ['can', 1], ['rod', 1], ...Object.entries(START_INVENTORY)]);
    const place = (type, x, z, rot = 0) => {
      if (this.props.canPlace(type, x, z, rot)) return this.props.add(type, x, z, rot);
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
    for (let z = 10; z < 20; z++) if (this.world.isWater(25, z)) { rz = z; break; }
    if (rz) place('bridge', 25, rz, 0);
    for (const [x, z] of [[12, 30], [17, 28], [23, 16], [29, 21], [9, 24], [27, 29], [15, 16], [18, 13]]) place('sakura', x, z);
    for (const [x, z] of [[8, 15], [31, 26], [14, 33], [24, 33], [32, 17], [7, 27], [20, 9], [28, 10], [11, 10]]) place('pine', x, z, (x + z) % 4);
    for (const [x, z] of [[6, 19], [7, 20], [6, 21], [7, 18], [5, 20], [8, 21]]) place('bamboo', x, z);
    for (let x = 10; x <= 14; x++) place('fence', x, 29, 0);
    place('crate', 16, 26); place('pot', 12, 23); place('pot', 16, 23); place('crate', 21, 17);
    // starter field
    const t0 = this.now();
    for (let x = 11; x <= 14; x++) for (let z = 26; z <= 28; z++) this.world.set(x, z, T.SOIL);
    // progress is in stages; the starter field has some ready, some growing
    const crop = (type, x, z, stage) => {
      this.farm.set(z * W + x, { type, x, z, progress: stage + 0.02, last: t0, wet: false });
    };
    crop('rice', 11, 26, 2); crop('rice', 12, 26, 2); crop('daikon', 13, 26, 3); crop('daikon', 14, 26, 3);
    crop('tea', 11, 27, 1); crop('rice', 12, 27, 1);
    this.player.pos.set(17.5, 0, 23.5);
    this.placeMerchant();
    this.daily.ensure();
    this.dirty.veg = this.dirty.crops = this.dirty.ground = true;
    this.save();
  }

  serialize() {
    return {
      v: SAVE_VERSION, savedAt: this.now(), timeOffset: this.timeOffset,
      money: this.money, inv: [...this.inv], slot: this.slot,
      player: [this.player.pos.x, this.player.pos.z, this.player.facing],
      props: this.props.serialize(), tiles: this.world.diff(),
      farm: [...this.farm.values()].map((c) => ({ type: c.type, x: c.x, z: c.z, progress: c.progress, last: c.last, wet: c.wet })),
      wetSoil: [...this.wetSoil],
      daily: this.daily.serialize(), stats: this.stats,
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
    this.timeOffset = s.timeOffset || 0;
    this.money = s.money; this.inv = new Map(s.inv); this.slot = s.slot || 0;
    this.world.applyDiff(s.tiles);
    for (const p of s.props) {
      const pr = this.props.add(p.type, p.x, p.z, p.rot, p.id);
      if (p.type === 'stall') this.stall = pr;
    }
    for (const c of s.farm) this.farm.set(c.z * W + c.x, { ...c });
    this.wetSoil = new Map(s.wetSoil || []);
    this.stats = { ...this.stats, ...(s.stats || {}) };
    this.player.pos.set(s.player[0], 0, s.player[1]); this.player.facing = s.player[2];
    this.placeMerchant();
    const before = this.farmSnapshot();
    this.tickCrops(true);
    this.daily.load(s.daily);
    const newDay = this.daily.ensure();
    const awayMs = this.now() - (s.savedAt || this.now());
    if (awayMs > AWAY_MS || newDay) this.away = this.awaySummary(before, awayMs, newDay);
    this.dirty.veg = this.dirty.crops = this.dirty.ground = true;
    return true;
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
    return { awayMs, ripe, grew, newDay, forage: newDay ? this.daily.forageLeft() : 0 };
  }

  /** Back from a long break without reloading (phone app resumed): catch up + summary. */
  resume(hiddenAt, before) {
    this.tickCrops(true);
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

  sfx(name, opts) { this.sound?.play(name, opts); }
  haptic(ms = 15) {
    if (this.touchInput && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* not allowed */ } }
  }
  bump(table, id, n = 1) { this.stats[table][id] = (this.stats[table][id] || 0) + n; }

  /** A daily request was completed by what just happened. */
  requestsDone(done) {
    if (!done.length) return;
    this.ui.toast(done.length > 1 ? 'Requests ready to hand in!' : `Request ready: ${this.daily.describe(done[0]).text}`, 'icons:koku');
    this.sfx('ready');
    this.ui.refresh();
  }

  // ------------------------------------------------------------------ inventory
  count(id) { return this.inv.get(id) || 0; }
  give(id, n = 1) { this.inv.set(id, this.count(id) + n); this.ui.refresh(); }
  take(id, n = 1) {
    const c = this.count(id); if (c < n) return false;
    if (c - n <= 0 && ITEMS[id].kind !== 'tool') this.inv.delete(id); else this.inv.set(id, c - n);
    this.ui.refresh(); return true;
  }
  get tool() { return HOTBAR[this.slot]; }
  selectSlot(i) {
    if (this.mode === 'build') { this.ui.selectBuild(i); return; }
    if (i < 0 || i >= HOTBAR.length) return;
    this.slot = i;
    this.cancelFishing();
    this.ui.refresh();
  }

  // ------------------------------------------------------------------ queries
  walkable(x, z) {
    if (x < 0 || z < 0 || x >= W || z >= H) return false;
    if (this.props.isBridge(x, z)) return true;
    if (this.merchantCell && this.merchantCell.x === x && this.merchantCell.z === z) return false;
    return this.world.isLand(x, z) && !this.props.isBlocked(x, z);
  }
  walkablePos(px, pz) {
    for (const [ox, oz] of [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS], [RADIUS * 0.7, RADIUS * 0.7], [-RADIUS * 0.7, RADIUS * 0.7], [RADIUS * 0.7, -RADIUS * 0.7], [-RADIUS * 0.7, -RADIUS * 0.7]]) {
      if (!this.walkable(Math.floor(px + ox), Math.floor(pz + oz))) return false;
    }
    return true;
  }
  playerCell() { return { x: Math.floor(this.player.pos.x), z: Math.floor(this.player.pos.z) }; }
  facingDir() { return { x: Math.sin(this.player.facing), z: Math.cos(this.player.facing) }; }
  targetTile() {
    const c = this.playerCell(), d = this.facingDir();
    const sx = Math.abs(d.x) > 0.38 ? Math.sign(d.x) : 0, sz = Math.abs(d.z) > 0.38 ? Math.sign(d.z) : 0;
    return { x: c.x + sx, z: c.z + sz };
  }
  isMerchant(x, z) { return !!this.merchantCell && this.merchantCell.x === x && this.merchantCell.z === z; }
  crop(x, z) { return this.farm.get(z * W + x); }
  stage(c) { return Math.min(RIPE, Math.floor(c.progress + 1e-9)); }
  /** Real time until the crop is ripe (watering speeds up only the current stage). */
  timeToRipe(c) {
    const sp = CROPS[c.type].stageMs, s = this.stage(c);
    if (s >= RIPE) return 0;
    const cur = (s + 1 - c.progress) * sp;
    return (c.wet ? cur / 2 : cur) + (RIPE - s - 1) * sp;
  }

  // ------------------------------------------------------------------ input-driven
  setKey(code, down) { if (down) this.keys.add(code); else this.keys.delete(code); }

  /** Analog stick input from the touch joystick (screen space: x right, y down, m 0..1). */
  setAnalog(a) { this.analog = a; }

  moveInput() {
    let x = 0, z = 0;
    const k = this.keys;
    const add = ([dx, dz]) => { x += dx; z += dz; };
    if (k.has('KeyW') || k.has('ArrowUp')) add(DIRS.up);
    if (k.has('KeyS') || k.has('ArrowDown')) add(DIRS.down);
    if (k.has('KeyA') || k.has('ArrowLeft')) add(DIRS.left);
    if (k.has('KeyD') || k.has('ArrowRight')) add(DIRS.right);
    let l = Math.hypot(x, z);
    if (l) return { x: x / l, z: z / l, speed: 1 };
    const a = this.analog;
    if (!a || a.m <= 0) return null;
    // screen right = world (1,-1), screen down = world (1,1) foreshortened by sin(elevation)
    const sy = a.y / SIN_EL;
    x = a.x + sy; z = -a.x + sy;
    l = Math.hypot(x, z);
    return l ? { x: x / l, z: z / l, speed: a.m } : null;
  }

  // ------------------------------------------------------------------ smart actions
  /** First seed we can plant: the selected one, the last used one, then any. */
  pickSeed() {
    if (ITEMS[this.tool].kind === 'seed' && this.count(this.tool) > 0) return this.tool;
    if (this.lastSeed && this.count(this.lastSeed) > 0) return this.lastSeed;
    return ['seed_rice', 'seed_daikon', 'seed_tea'].find((s) => this.count(s) > 0) || null;
  }

  /**
   * What tapping / using tile t should do, by context. The selected tool only
   * matters where it clearly applies (hoe on grass, can on soil, a chosen seed).
   */
  resolve(t) {
    const { x, z } = t;
    const p = this.props.at(x, z), c = this.crop(x, z), tile = this.world.get(x, z), tool = this.tool;
    if (this.isMerchant(x, z) || (p && p.type === 'stall')) return { kind: 'shop', t, icon: 'icons:koku', label: 'Shop' };
    const f = this.daily.forageAt(x, z);
    if (f) return { kind: 'forage', t, icon: ITEMS[f.item].icon, label: 'Pick' };
    if (c) {
      if (this.stage(c) >= RIPE) return { kind: 'harvest', t, icon: ITEMS[c.type].icon, label: 'Harvest' };
      if (!c.wet) return { kind: 'water', t, icon: 'icons:can', label: 'Water' };
      return { kind: 'inspect', t, crop: c };
    }
    if (tile === T.SOIL) {
      if (tool === 'can') return { kind: 'water', t, icon: 'icons:can', label: 'Water' };
      const seed = this.pickSeed();
      if (seed) return { kind: 'plant', t, seed, icon: ITEMS[seed].icon, label: 'Plant' };
      return { kind: 'noseed', t };
    }
    if (tile === T.WATER && !this.props.isBridge(x, z)) return { kind: 'fish', t, icon: 'icons:rod', label: 'Fish' };
    if (p) return { kind: 'inspect', t, prop: p };
    if ((tile === T.GRASS || tile === T.SAND) && tool === 'hoe') return { kind: 'till', t, icon: 'icons:hoe', label: 'Till' };
    return { kind: 'walk', t };
  }

  isBusy() { return !!this.player.pending || !!this.fishing || this.actionCooldown > 0 || this.queue.length > 0; }

  /** Space / action button: smart action on the tile in front of the player. */
  action() {
    if (this.ui.modalOpen()) return;
    if (this.fishing) { this.reel(); return; }
    if (this.mode === 'build') {
      if (this.buildCursor && this.buildSel !== 'pickup') { this.confirmBuild(); return; }
      const t = this.hoverTile || this.targetTile(); this.buildAt(t.x, t.z); return;
    }
    const t = this.targetTile();
    const a = this.resolve(t);
    if (ACTIONS.has(a.kind)) { this.queue.length = 0; this.player.path = null; this.face(t); this.perform(a); return; }
    if (a.kind === 'inspect' || a.kind === 'noseed') { this.inspect(a); return; }
    this.useTool(t);
  }

  /** Click / tap on a tile: do the obvious thing there (walking over first). */
  clickTile(t) { return this.tap(t); }

  tap(t) {
    if (this.ui.modalOpen()) return null;
    if (this.fishing) { this.reel(); return null; }
    if (this.mode === 'build') { this.buildAt(t.x, t.z); return null; }
    const a = this.resolve(t);
    if (a.kind === 'walk') {
      this.queue.length = 0;
      this.player.pending = null;
      if (this.walkable(t.x, t.z)) this.walkTo(t); else this.walkNear(t);
    } else if (a.kind === 'inspect' || a.kind === 'noseed') this.inspect(a);
    else this.enqueue(a);
    this.ui.refreshQueue?.();
    return a;
  }

  enqueue(a) {
    if (!this.isBusy()) { this.startAction(a); return true; }
    const same = (b) => b.t.x === a.t.x && b.t.z === a.t.z;
    if ((this.player.pending && same(this.player.pending)) || this.queue.some(same)) return false;
    if (this.queue.length >= QUEUE_MAX) { this.ui.toast('That’s plenty to do for now!'); return false; }
    this.queue.push(a);
    return true;
  }

  /** Swipe across the field: queue the obvious farm action on each tile passed over. */
  sweepTile(t) {
    if (this.mode !== 'play' || this.fishing || this.ui.modalOpen()) return null;
    const a = this.resolve(t);
    if (!SWEEP_KINDS.has(a.kind)) return null;
    if (a.kind === 'plant') {
      // don't queue more plantings than there are seeds
      const planned = [this.player.pending, ...this.queue].filter((q) => q?.kind === 'plant' && q.seed === a.seed).length;
      if (planned >= this.count(a.seed)) return null;
    }
    return this.enqueue(a) ? a : null;
  }

  inspect(a) {
    const { x, z } = a.t;
    if (a.kind === 'noseed') { this.ui.floatLabel('No seeds — Hana sells them', x, z); return; }
    const c = a.crop || this.crop(x, z);
    if (c) {
      const def = CROPS[c.type];
      if (this.stage(c) >= RIPE) { this.ui.floatLabel(`${def.name} · ready!`, x, z); return; }
      this.ui.floatLabel(`${def.name} · ready in ${duration(this.timeToRipe(c))}${c.wet ? ' · watered' : ' · thirsty'}`, x, z);
      return;
    }
    const f = this.daily.forageAt(x, z);
    if (f) { this.ui.floatLabel(`${ITEMS[f.item].name} · tap to pick`, x, z); return; }
    const p = a.prop || this.props.at(x, z);
    if (p) {
      const msg = p.type === 'well' ? 'The well water is cool and clear.' : PROPS[p.type].name;
      this.ui.floatLabel(msg, x, z);
      return;
    }
    const names = { [T.GRASS]: 'Soft grass', [T.SAND]: 'Warm sand', [T.PATH]: 'Village path', [T.SOIL]: 'Tilled soil', [T.WATER]: this.world.isFresh(x, z) ? 'Fresh water' : 'The sea' };
    this.ui.floatLabel(names[this.world.get(x, z)] || '', x, z);
  }

  /** Tile to stand on for an action (fishing can be done from a little further away). */
  standTiles(a) {
    const pc = this.playerCell(), t = a.t;
    const r = a.kind === 'fish' ? 2 : 1;
    const out = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dz) continue;
      const x = t.x + dx, z = t.z + dz;
      if (!this.walkable(x, z)) continue;
      const d = cheb({ x, z }, t) * 2 + Math.hypot(x - pc.x, z - pc.z) * 0.15 + (dx && dz ? 0.3 : 0);
      out.push({ x, z, d });
    }
    return out.sort((p, q) => p.d - q.d);
  }

  startAction(a) {
    const pc = this.playerCell();
    const range = a.kind === 'fish' ? 2 : 1;
    const d = cheb(pc, a.t);
    if (d <= range && d > 0) { this.player.path = null; this.face(a.t); this.perform(a); return; }
    for (const s of this.standTiles(a).slice(0, 10)) {
      if (this.walkTo(s, a, { quiet: true })) return;
    }
    this.ui.toast("Can't reach that spot.");
  }

  perform(a) {
    const { x, z } = a.t;
    switch (a.kind) {
      case 'shop': this.ui.openShop(); break;
      case 'harvest': { const c = this.crop(x, z); if (c && this.stage(c) >= RIPE) this.harvest(c); break; }
      case 'water': this.useTool(a.t, 'can'); break;
      case 'plant': this.lastSeed = a.seed; this.useTool(a.t, a.seed); break;
      case 'till': this.useTool(a.t, 'hoe'); break;
      case 'forage': this.pickForage(x, z); break;
      case 'fish':
        if (this.tool !== 'rod') { this.slot = HOTBAR.indexOf('rod'); this.ui.refresh(); }
        this.startFishing(a.t);
        break;
      default: break;
    }
    this.actionCooldown = 0.3;
  }

  walkTo(t, pending = null, { quiet = false } = {}) {
    const start = this.playerCell();
    const path = findPath(start, t, (x, z) => this.walkable(x, z), W, H);
    if (!path) { if (pending && !quiet) this.ui.toast("Can't reach that spot."); return false; }
    this.player.pending = pending;
    this.player.path = path.slice(1).map((c) => new THREE.Vector2(c.x + 0.5, c.z + 0.5));
    this.player.dest = { x: t.x, z: t.z };
    if (!this.player.path.length) { this.player.path = null; this.arrive(); }
    return true;
  }

  /** Tapped somewhere blocked: walk to the closest reachable tile next to it. */
  walkNear(t) {
    const pc = this.playerCell();
    const cands = [];
    for (let r = 1; r <= 4 && !cands.length; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (cheb({ x: dx, z: dz }, { x: 0, z: 0 }) !== r) continue;
        const x = t.x + dx, z = t.z + dz;
        if (this.walkable(x, z)) cands.push({ x, z, d: Math.hypot(dx, dz) + Math.hypot(x - pc.x, z - pc.z) * 0.1 });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 8)) if (this.walkTo(c)) return true;
    return false;
  }

  goAndAct(t) { this.startAction(this.resolve(t)); }

  arrive() {
    const a = this.player.pending;
    this.player.pending = null;
    if (a) { this.face(a.t); this.perform(a); }
  }

  face(t) {
    const dx = t.x + 0.5 - this.player.pos.x, dz = t.z + 0.5 - this.player.pos.z;
    if (dx || dz) this.player.facing = Math.atan2(dx, dz);
  }

  swing() { this.player.swingT = 0.35; }

  useTool(t, tool = this.tool) {
    const { x, z } = t;
    const p = this.props.at(x, z);
    const c = this.crop(x, z);
    const tile = this.world.get(x, z);
    if ((p && p.type === 'stall') || this.isMerchant(x, z)) { this.ui.openShop(); return; }
    if (p && p.type === 'well' && tool !== 'can') { this.ui.toast('The well water is cool and clear.'); return; }
    if (c && this.stage(c) >= RIPE && tool !== 'can') { this.harvest(c); return; }
    switch (tool) {
      case 'hand':
        if (c) {
          const def = CROPS[c.type];
          this.ui.toast(`${def.name}: ready in ${duration(this.timeToRipe(c))}${c.wet ? ' · watered' : ' · water me!'}`);
        } else if (this.daily.forageAt(x, z)) this.pickForage(x, z);
        else if (p) this.ui.toast(`${PROPS[p.type].name}. Use build mode (B) to move it.`);
        break;
      case 'hoe':
        if (p) { this.ui.toast('Something is in the way.'); break; }
        if (tile === T.GRASS || tile === T.SAND) {
          if (this.daily.forageAt(x, z)) this.pickForage(x, z); // don't dig the greens under
          this.world.set(x, z, T.SOIL);
          this.swing();
          this.sfx('till');
          this.particles.burst(x + 0.5, 0.1, z + 0.5, { color: '#7a5537', n: 14 });
          this.dirty.ground = this.dirty.veg = true;
          this.ui.toast('Tilled the earth.');
        } else if (tile === T.SOIL) this.ui.toast('Already tilled. Plant some seeds!');
        else this.ui.toast("The hoe won't work here.");
        break;
      case 'can':
        if (p && p.type === 'well') { this.ui.toast('Your watering can never runs dry here. ♪'); break; }
        if (tile === T.SOIL) {
          if (c) c.wet = true; else this.wetSoil.set(z * W + x, this.now() + 30 * MIN);
          this.swing();
          this.sfx('water');
          this.particles.burst(x + 0.5, 0.5, z + 0.5, { color: '#9fd3e6', n: 16, up: 0.5 });
          this.dirty.ground = true;
          this.ui.toast(c ? 'Watered! It will grow twice as fast this stage.' : 'Watered the soil.');
        } else this.ui.toast('Water tilled soil or crops.');
        break;
      case 'rod':
        this.startFishing(t);
        break;
      default: {
        const it = ITEMS[tool];
        if (it.kind !== 'seed') break;
        if (tile !== T.SOIL) { this.ui.toast('Till the soil with the hoe first.'); break; }
        if (c) { this.ui.toast('Something is already growing here.'); break; }
        if (!this.take(tool)) { this.ui.toast(`No ${it.name.toLowerCase()} left. Buy more at the stall.`); break; }
        const idx = z * W + x;
        const wet = (this.wetSoil.get(idx) || 0) > this.now();
        this.wetSoil.delete(idx);
        this.farm.set(idx, { type: it.crop, x, z, progress: 0, last: this.now(), wet });
        this.swing();
        this.sfx('plant');
        this.particles.burst(x + 0.5, 0.1, z + 0.5, { color: '#c9a45c', n: 8 });
        this.dirty.crops = this.dirty.ground = true;
        this.ui.toast(`Planted ${CROPS[it.crop].name.toLowerCase()}.`);
      }
    }
  }

  harvest(c) {
    const def = CROPS[c.type];
    const n = def.yield[0] + Math.floor(hash2(c.x, c.z, Math.floor(this.now() / 1000)) * (def.yield[1] - def.yield[0] + 1));
    this.give(c.type, n);
    if (def.regrow) { c.progress = 2; c.last = this.now(); c.wet = false; }
    else this.farm.delete(c.z * W + c.x);
    this.swing();
    this.sfx('harvest');
    this.haptic(12);
    this.particles.burst(c.x + 0.5, 0.5, c.z + 0.5, { color: '#ffe08a', n: 18, up: 1.2 });
    this.dirty.crops = this.dirty.ground = true;
    this.ui.toast(`Harvested ${n} ${ITEMS[c.type].name.toLowerCase()}!`, ITEMS[c.type].icon);
    this.bump('harvested', c.type, n);
    this.requestsDone(this.daily.note('harvest', c.type, n));
  }

  pickForage(x, z) {
    const f = this.daily.forageAt(x, z);
    if (!f) return;
    f.taken = true;
    this.give(f.item);
    this.swing();
    this.sfx('forage');
    this.haptic(10);
    this.particles.burst(x + 0.5, 0.4, z + 0.5, { color: f.item === 'warabi' ? '#b8d67a' : '#f6c3cf', n: 14, up: 0.9 });
    this.dirty.veg = true;
    this.ui.toast(`Found ${ITEMS[f.item].name.toLowerCase()}!`, ITEMS[f.item].icon);
    this.bump('foraged', f.item);
    this.requestsDone(this.daily.note('forage', f.item));
  }

  /** Real-time growth from timestamps (also catches up after the tab was closed). */
  tickCrops(force = false) {
    const now = this.now();
    let changed = false;
    for (const c of this.farm.values()) {
      const sp = CROPS[c.type].stageMs;
      let dt = Math.max(0, now - c.last);
      c.last = now;
      if (c.progress >= RIPE) continue;
      const before = this.stage(c);
      if (c.wet) {
        // watered: the current stage runs at double speed, then the soil dries
        const wetMs = ((before + 1 - c.progress) * sp) / 2;
        if (dt >= wetMs) { c.progress = before + 1; dt -= wetMs; c.wet = false; changed = true; } else { c.progress += (dt * 2) / sp; dt = 0; }
      }
      c.progress = Math.min(RIPE, c.progress + dt / sp);
      if (this.stage(c) !== before) changed = true;
    }
    for (const [i, until] of this.wetSoil) if (until < now) { this.wetSoil.delete(i); changed = true; }
    if (changed || force) { this.dirty.crops = this.dirty.ground = true; }
  }

  // ------------------------------------------------------------------ fishing
  startFishing(t) {
    const d = this.facingDir();
    // look for water in front (up to 3 tiles)
    let spot = null;
    const pc = this.playerCell();
    const dx = Math.sign(t.x - pc.x), dz = Math.sign(t.z - pc.z);
    if (this.world.isWater(t.x, t.z) && !this.props.isBridge(t.x, t.z) && cheb(pc, t) <= 3) spot = { x: t.x, z: t.z };
    for (let k = 1; k <= 3 && !spot; k++) {
      const x = pc.x + dx * k, z = pc.z + dz * k;
      if (this.world.isWater(x, z) && !this.props.isBridge(x, z)) spot = { x, z };
    }
    if (!spot) { this.ui.toast('Face the water to cast your line.'); return; }
    const fresh = this.world.isFresh(spot.x, spot.z);
    const pool = Object.entries(FISH).filter(([, f]) => f.water === (fresh ? 'fresh' : 'sea'));
    let r = Math.random() * pool.reduce((s, [, f]) => s + f.weight, 0);
    let fish = pool[0][0];
    for (const [k, f] of pool) { r -= f.weight; if (r <= 0) { fish = k; break; } }
    const wait = 2000 + Math.random() * 4000;
    this.fishing = { phase: 'wait', t0: performance.now(), biteAt: performance.now() + wait, fish, spot, x: spot.x + 0.5 + d.x * 0.1, z: spot.z + 0.5 + d.z * 0.1 };
    this.face(spot);
    this.player.path = null;
    this.swing();
    this.sfx('cast');
    this.bobber.visible = this.line.visible = true;
    this.bobber.position.set(this.fishing.x, WATER_Y + 0.02, this.fishing.z);
    this.particles.burst(this.fishing.x, WATER_Y + 0.05, this.fishing.z, { color: '#e8f4f0', n: 10, up: 0.6 });
    this.ui.toast(fresh ? 'Cast into fresh water... wait for a bite!' : 'Cast into the sea... wait for a bite!');
  }

  /** Called when the player presses action / clicks during fishing. */
  reel() {
    const f = this.fishing;
    if (!f) return;
    if (f.phase === 'bite') {
      this.give(f.fish);
      this.particles.burst(f.x, WATER_Y + 0.1, f.z, { color: '#bfe6ff', n: 22, up: 1.4 });
      const first = !this.stats.caught[f.fish];
      this.ui.toast(first ? `Your first ${FISH[f.fish].name}!` : `You caught a ${FISH[f.fish].name}!`, ITEMS[f.fish].icon);
      this.sfx(first ? 'fanfare' : 'catch');
      this.haptic(30);
      this.lastCatch = f.fish;
      this.bump('caught', f.fish);
      this.cancelFishing();
      this.requestsDone(this.daily.note('catch', f.fish));
      return;
    }
    this.ui.toast('Too early — the fish swam away.');
    this.sfx('miss');
    this.cancelFishing();
  }

  cancelFishing() {
    if (!this.fishing) return;
    this.fishing = null;
    this.bobber.visible = this.line.visible = false;
    this.ripple.material.opacity = 0;
    this.ui.bubble(null);
  }

  updateFishing(t) {
    const f = this.fishing;
    if (!f) return;
    const now = performance.now();
    const bob = Math.sin(t * 3) * 0.015;
    let dip = 0;
    if (f.phase === 'wait' && now >= f.biteAt) {
      // touch screens get a little grace for tap latency
      f.phase = 'bite'; f.window = FISH[f.fish].window + (this.touchInput ? 150 : 0); f.biteEnd = now + f.window;
      this.ui.bubble('!');
      this.sfx('bite');
      this.haptic(40);
      this.particles.burst(f.x, WATER_Y + 0.05, f.z, { color: '#ffffff', n: 8, up: 0.5 });
    }
    if (f.phase === 'bite') {
      dip = -0.07 - Math.abs(Math.sin(t * 22)) * 0.04;
      const k = 1 - (f.biteEnd - now) / f.window;
      this.ripple.material.opacity = 0.7 * (1 - k);
      this.ripple.scale.setScalar(1 + k * 3);
      if (now > f.biteEnd) { this.ui.toast('It got away...'); this.sfx('miss'); this.cancelFishing(); return; }
    } else {
      const k = ((now - f.t0) % 1600) / 1600;
      this.ripple.material.opacity = 0.35 * (1 - k);
      this.ripple.scale.setScalar(1 + k * 2);
    }
    this.bobber.position.y = WATER_Y + 0.02 + bob + dip;
    this.ripple.position.set(f.x, WATER_Y + 0.01, f.z);
    const tip = this.rodTip.getWorldPosition(new THREE.Vector3());
    const pts = this.line.geometry.attributes.position;
    pts.setXYZ(0, tip.x, tip.y, tip.z);
    pts.setXYZ(1, this.bobber.position.x, this.bobber.position.y + 0.05, this.bobber.position.z);
    pts.needsUpdate = true;
  }

  // ------------------------------------------------------------------ build mode
  toggleBuild(on = this.mode !== 'build') {
    this.cancelFishing();
    if (!on) this.cancelBuildPreview();
    this.mode = on ? 'build' : 'play';
    if (!on) this.ghost.hide();
    this.player.path = null; this.player.pending = null; this.queue.length = 0;
    this.buildCursor = null;
    this.ui.closePropMenu?.();
    this.ui.refresh();
  }
  rotate() {
    if (this.mode !== 'build') return;
    this.buildRot = (this.buildRot + 1) % 4;
    this.ui.toast(`Rotated ${this.buildRot * 90}°`);
  }

  /** Store a placed prop back into the inventory. */
  pickUp(p, { quiet = false } = {}) {
    if (PROPS[p.type].fixed) { this.ui.toast('The merchant would miss their stall!'); return false; }
    const pc = this.playerCell();
    if (p.type === 'bridge' && p.cells.some((c) => c.x === pc.x && c.z === pc.z)) { this.ui.toast('Step off the bridge first.'); return false; }
    this.props.remove(p);
    this.give(`prop_${p.type}`);
    this.sfx('pickup');
    this.particles.burst(p.cx, 0.4, p.cz, { color: '#f4ead2', n: 14, up: 0.8 });
    if (!quiet) this.ui.toast(`Picked up ${PROPS[p.type].name.toLowerCase()}.`, ITEMS[`prop_${p.type}`].icon);
    return true;
  }

  /** Rotate a placed prop in place (if it still fits). */
  rotateProp(p) {
    if (PROPS[p.type].fixed) { this.ui.toast('Hana likes her stall just where it is.'); return false; }
    const rot = (p.rot + 1) % 4;
    if (!this.props.canPlace(p.type, p.x, p.z, rot, { ignoreId: p.id, playerCell: this.playerCell(), farm: this.farm })) {
      this.ui.toast('No room to rotate it here.'); return false;
    }
    const { type, x, z, id } = p;
    this.props.remove(p);
    return this.props.add(type, x, z, rot, id);
  }

  /** Pick a prop up and keep previewing it where it was, ready to be dragged (touch). */
  moveProp(p) {
    const orig = { type: p.type, x: p.x, z: p.z, rot: p.rot, id: p.id };
    if (!this.pickUp(p, { quiet: true })) return false;
    this.moving = orig;
    this.buildSel = `prop_${p.type}`;
    this.buildRot = p.rot;
    this.buildCursor = { x: p.x, z: p.z };
    this.ui.refresh();
    return true;
  }

  /** ✕ on the touch build bar: drop the preview (and put a moved prop back). */
  cancelBuildPreview() {
    const m = this.moving;
    this.moving = null;
    this.buildCursor = null;
    if (m && this.count(`prop_${m.type}`) > 0 && this.props.canPlace(m.type, m.x, m.z, m.rot, { playerCell: this.playerCell(), farm: this.farm })) {
      this.take(`prop_${m.type}`);
      this.props.add(m.type, m.x, m.z, m.rot, m.id);
    }
    this.ui.refresh();
  }

  /** ✓ on the touch build bar / tapping the preview again. */
  confirmBuild() {
    const c = this.buildCursor;
    if (!c) return false;
    const ok = this.buildAt(c.x, c.z);
    if (ok) { this.moving = null; this.buildCursor = null; this.ui.refresh(); }
    return ok;
  }

  buildAt(x, z) {
    if (this.buildSel === 'pickup') {
      const p = this.props.at(x, z);
      if (!p) { this.ui.toast('Nothing to pick up here.'); return false; }
      return this.pickUp(p);
    }
    const id = this.buildSel;
    const type = ITEMS[id]?.prop;
    if (!type || this.count(id) <= 0) { this.ui.toast('You have none left. Buy more at the stall.'); return false; }
    if (!this.props.canPlace(type, x, z, this.buildRot, { playerCell: this.playerCell(), farm: this.farm })) { this.ui.toast("Can't place that here."); return false; }
    this.take(id);
    const p = this.props.add(type, x, z, this.buildRot);
    this.sfx('place');
    this.haptic(12);
    this.particles.burst(p.cx, 0.2, p.cz, { color: '#fff1c4', n: 16, up: 0.7 });
    this.ui.toast(`Placed ${PROPS[type].name.toLowerCase()}.`);
    if (this.count(id) <= 0) { this.buildSel = 'pickup'; this.ui.refresh(); }
    return true;
  }

  updateGhost() {
    if (this.mode !== 'build') { this.ghost.hide(); return; }
    const t = this.buildCursor || this.hoverTile || this.targetTile();
    if (this.buildSel === 'pickup') {
      this.ghost.hide();
      const p = this.props.at(t.x, t.z);
      this.cursorColor(p && !PROPS[p.type].fixed ? 0x9fe08a : 0xffffff);
      return;
    }
    const type = ITEMS[this.buildSel]?.prop;
    if (!type) { this.ghost.hide(); return; }
    const ok = this.props.canPlace(type, t.x, t.z, this.buildRot, { playerCell: this.playerCell(), farm: this.farm });
    this.ghost.show(type, t.x, t.z, this.buildRot, ok);
  }

  cursorColor(c) { this.cursor.material.color.setHex(c); }

  // ------------------------------------------------------------------ economy
  sellPrice(id) { return this.daily.sellPrice(id); }
  buyPrice(id) { return this.daily.buyPrice(id); }

  sell(id, n = this.count(id)) {
    const it = ITEMS[id];
    if (!it.sell || n <= 0) return;
    const total = this.sellPrice(id) * n;
    this.take(id, n);
    this.money += total;
    this.stats.earned += total;
    this.sfx('coin');
    this.ui.toast(`Sold ${n} ${it.name.toLowerCase()} for ${total} koku.`, 'icons:koku');
  }
  sellAll() {
    let total = 0;
    for (const [id, n] of [...this.inv]) {
      const it = ITEMS[id];
      if (it && SELLABLE_KINDS.has(it.kind)) { total += this.sellPrice(id) * n; this.take(id, n); }
    }
    this.money += total;
    this.stats.earned += total;
    if (total) this.sfx('coin');
    this.ui.toast(total ? `Sold the harvest for ${total} koku!` : 'Nothing to sell yet.', 'icons:koku');
  }
  buy(id) {
    const it = ITEMS[id], price = this.buyPrice(id);
    if (this.money < price) { this.ui.toast('Not enough koku.'); return; }
    this.money -= price;
    this.give(id);
    this.sfx('coin');
    this.ui.toast(`Bought ${it.name.toLowerCase()}.`, it.icon);
  }

  claimRequest(i) {
    const res = this.daily.claim(i);
    if (!res) return null;
    this.stats.requests++;
    this.stats.earned += res.reward;
    this.sfx(res.gift ? 'fanfare' : 'claim');
    this.haptic(25);
    const bonus = res.bonus ? ` + ${res.bonus.n > 1 ? `${res.bonus.n} ` : ''}${ITEMS[res.bonus.item].name.toLowerCase()}` : '';
    this.ui.toast(`Hana thanks you: ${res.reward} koku${bonus}!`, 'icons:koku');
    if (res.gift) this.ui.toast(`All done for today! Hana gives you a ${ITEMS[res.gift].name.toLowerCase()}.`, ITEMS[res.gift].icon);
    this.save();
    this.ui.refresh();
    return res;
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, t) {
    const pl = this.player;
    const input = this.ui.modalOpen() ? null : this.moveInput();
    let move = null;
    if (input) { pl.path = null; pl.pending = null; this.queue.length = 0; move = input; }
    else if (pl.path && pl.path.length) {
      const target = pl.path[0];
      const dx = target.x - pl.pos.x, dz = target.y - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) { pl.path.shift(); if (!pl.path.length) { pl.path = null; this.arrive(); } }
      else move = { x: dx / d, z: dz / d, max: d };
    }
    pl.moving = !!move;
    if (move) {
      if (this.fishing) this.cancelFishing();
      // sub-stepped so low frame rates don't tunnel through collisions
      const dist = Math.min(SPEED * (move.speed ?? 1) * dt, move.max ?? Infinity); // never overshoot a path node
      const n = Math.max(1, Math.ceil(dist / 0.09)), step = dist / n;
      for (let i = 0; i < n; i++) {
        const nx = pl.pos.x + move.x * step, nz = pl.pos.z + move.z * step;
        if (this.walkablePos(nx, pl.pos.z)) pl.pos.x = nx;
        if (this.walkablePos(pl.pos.x, nz)) pl.pos.z = nz;
      }
      const target = Math.atan2(move.x, move.z);
      let da = target - pl.facing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      pl.facing += da * Math.min(1, dt * 14);
    }
    pl.pos.y = this.props.deckHeight(pl.pos.x, pl.pos.z);
    this.char.root.position.copy(pl.pos);
    this.char.root.rotation.y = pl.facing;
    pl.swingT = Math.max(0, pl.swingT - dt);
    const swing = pl.swingT > 0 ? Math.sin((1 - pl.swingT / 0.35) * Math.PI) * 1.6 : (this.fishing ? 0.9 : 0);
    animateCharacter(this.char, t, { moving: pl.moving, swing });
    for (const [k, m] of Object.entries(this.toolMeshes)) m.visible = this.mode === 'play' && this.tool === k;

    // cursor on target tile
    const tt = this.mode === 'build' && this.hoverTile ? this.hoverTile : this.targetTile();
    const ty = this.world.isWater(tt.x, tt.z) && !this.props.isBridge(tt.x, tt.z) ? WATER_Y + 0.02 : 0.025;
    this.cursor.position.set(tt.x + 0.5, ty, tt.z + 0.5);
    this.cursor.visible = !this.fishing && !(this.mode === 'build' && this.buildSel !== 'pickup');
    if (this.mode === 'play') this.cursorColor(0xffffff);
    this.updateGhost();
    this.updateFishing(t);

    // smart-tap action queue
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    if (!pl.pending && !pl.path && !this.fishing && this.actionCooldown <= 0 && this.queue.length && !this.ui.modalOpen()) {
      this.startAction(this.queue.shift());
    }
    // destination marker while walking
    const dm = this.destMarker;
    dm.visible = !!(pl.path && pl.path.length && pl.dest && this.mode === 'play');
    if (dm.visible) {
      const goal = pl.path[pl.path.length - 1];
      dm.position.set(goal.x, this.props.deckHeight(goal.x, goal.y) + 0.03, goal.y);
      dm.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    }

    if (!this.nextCropTick || t > this.nextCropTick) {
      this.tickCrops();
      this.nextCropTick = t + 0.5;
      if (this.daily.ensure()) {
        // the clock passed 5:00 while playing
        this.dirty.veg = true;
        this.ui.toast('A new day in the village. Hana has fresh requests.', 'icons:koku');
        this.sfx('ready');
        this.ui.refresh();
      }
    }
    // little glints so ripe crops and wild greens are easy to spot on a quick look
    this.sparkleT -= dt;
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.35;
      const spots = [...[...this.farm.values()].filter((c) => this.stage(c) >= RIPE), ...this.daily.visibleForage()];
      if (spots.length) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        this.particles.sparkle(s.x + 0.3 + Math.random() * 0.4, 0.35 + Math.random() * 0.4, s.z + 0.3 + Math.random() * 0.4);
      }
    }
    if (this.dirty.ground) { this.ground.wet = new Set([...[...this.farm.values()].filter((c) => c.wet).map((c) => c.z * W + c.x), ...this.wetSoil.keys()]); this.ground.updateTypes(); this.dirty.ground = false; }
    if (this.dirty.crops) { this.rebuildCrops(); this.dirty.crops = false; }
    if (this.dirty.veg) { this.rebuildVegetation(); this.dirty.veg = false; }
    this.veg.update(t); this.cropLayer.update(t); this.canopy.update(t); this.ground.update(t);
    this.particles.update(dt);
    if (this.merchant) animateCharacter(this.merchant, t + 3, {});
    if (!this.lastSave || this.now() - this.lastSave > 10_000) this.save();
  }

  rebuildCrops() {
    const items = [];
    for (const c of this.farm.values()) {
      const def = CROPS[c.type], s = this.stage(c);
      const sprite = `${def.sprite}_${Math.max(1, s)}`;
      const h = s === 0 ? 0.28 : def.height[s - 1];
      const n = c.type === 'rice' ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const ox = n > 1 ? [-0.2, 0.18, 0.0][k] : 0, oz = n > 1 ? [0.15, 0.1, -0.2][k] : 0;
        items.push({ x: c.x + 0.5 + ox, z: c.z + 0.5 + oz, sprite, height: h * (n > 1 ? 0.85 : 1), sway: 0.05, phase: c.x * 1.3 + c.z + k, shade: s >= RIPE ? 1.08 : 1, flip: (c.x + c.z + k) % 2 === 0 });
      }
    }
    this.cropLayer.set(items);
  }

  rebuildVegetation() {
    const items = [];
    const occ = (x, z) => this.props.at(x, z);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = this.world.get(x, z);
      if (occ(x, z)) continue;
      if (t === T.GRASS) {
        const r = hash2(x, z, 3);
        const n = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
        for (let k = 0; k < n; k++) {
          const a = hash2(x, z, 10 + k), b = hash2(x, z, 20 + k), s = hash2(x, z, 30 + k);
          const sprite = s < 0.08 ? 'flowers_pink' : s < 0.16 ? 'flowers_white' : s < 0.2 ? 'fern' : s < 0.6 ? 'grass_a' : 'grass_b';
          const big = sprite === 'fern' ? 0.6 : sprite.startsWith('flowers') ? 0.5 : 0.42;
          items.push({ x: x + 0.15 + a * 0.7, z: z + 0.15 + b * 0.7, sprite, height: big * (0.8 + s * 0.5), sway: 0.08, phase: a * 6, shade: 0.92 + b * 0.14, flip: a > 0.5 });
        }
        if (hash2(x, z, 4) < 0.025) items.push({ x: x + 0.5, z: z + 0.5, sprite: 'bush', height: 0.8, sway: 0.02, shade: 1 });
      } else if (t === T.SAND && hash2(x, z, 5) < 0.06) {
        items.push({ x: x + 0.5, z: z + 0.5, sprite: 'grass_b', height: 0.35, sway: 0.08, shade: 0.9 });
      }
      // reeds along fresh water
      if (t !== T.WATER && t !== T.SOIL && t !== T.PATH) {
        let nearFresh = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.world.isFresh(x + dx, z + dz)) nearFresh = true;
        if (nearFresh && hash2(x, z, 6) < 0.45) items.push({ x: x + 0.3 + hash2(x, z, 7) * 0.4, z: z + 0.3 + hash2(x, z, 8) * 0.4, sprite: 'reeds', height: 0.95, sway: 0.1, shade: 1 });
      }
    }
    for (const f of this.daily.visibleForage()) {
      const def = FORAGE[f.item];
      for (let k = 0; k < 2; k++) {
        items.push({ x: f.x + 0.38 + k * 0.24, z: f.z + 0.5 - k * 0.12, sprite: def.sprite, height: def.height * (1 - k * 0.15), sway: 0.07, phase: k * 2, shade: 1.15, flip: k === 1 });
      }
    }
    const pb = this.props.billboards();
    this.veg.set(items.concat(pb.veg));
    this.canopy.set(pb.canopy);
    this.blobs.set(pb.shadows);
    this.particles.petalSources = this.props.list.filter((p) => p.type === 'sakura').map((p) => ({ x: p.cx, z: p.cz }));
    this.placeMerchant();
  }

  placeMerchant() {
    const s = this.props.list.find((p) => p.type === 'stall');
    if (!s) return;
    if (!this.merchant) {
      this.merchant = buildCharacter({ robe: PALETTE.vermilion, sash: PALETTE.indigo, hat: false, hair: '#4a3a30' });
      this.scene.add(this.merchant.root);
    }
    // Hana stands at the front-right corner of the stall, turned towards the plaza
    const th = s.rot * Math.PI / 2, lx = 1.3, lz = 0.25;
    const x = s.cx + lx * Math.cos(th) + lz * Math.sin(th), z = s.cz - lx * Math.sin(th) + lz * Math.cos(th);
    this.merchant.root.position.set(x, 0, z);
    this.merchant.root.rotation.y = th + 0.5;
    this.merchantCell = { x: Math.floor(x), z: Math.floor(z) };
  }
}

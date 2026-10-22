// Core gameplay: player, tools, farming, fishing, build mode, economy, saving.
// No energy / stamina / fatigue anywhere: every action is free and unlimited.
import * as THREE from 'three';
import { World, W, H, T, hash2 } from './world.js';
import { PropManager, Ghost, propCells } from './props.js';
import { ITEMS, PROPS, CROPS, RIPE, FISH, HOTBAR, START_INVENTORY, START_MONEY } from './data.js';
import { findPath } from './pathfind.js';
import { Ground, WATER_Y } from '../render/ground.js';
import { BillboardLayer, BlobShadows } from '../render/vegetation.js';
import { buildCharacter, animateCharacter } from '../render/character.js';
import { makeBrushMaterial } from '../render/materials.js';
import { Particles } from '../render/particles.js';
import { PALETTE } from '../assets/palette.js';

const SAVE_KEY = 'rokugan-cozy-village/save/v1';
const SPEED = 3.6;
const RADIUS = 0.24;
const DIRS = { up: [-1, -1], down: [1, 1], left: [-1, 1], right: [1, -1] }; // screen -> world (camera at +x+z)

export class Game {
  constructor({ scene, painted, ui, now = () => Date.now() }) {
    this.scene = scene;
    this.painted = painted;
    this.ui = ui;
    this.now = now;
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
    const crop = (type, x, z, stage) => {
      this.farm.set(z * W + x, { type, x, z, growth: stage * CROPS[type].stageMs + 1000, last: t0, wet: false });
    };
    crop('rice', 11, 26, 2); crop('rice', 12, 26, 2); crop('daikon', 13, 26, 3); crop('daikon', 14, 26, 3);
    crop('tea', 11, 27, 1); crop('rice', 12, 27, 1);
    this.player.pos.set(17.5, 0, 23.5);
    this.dirty.veg = this.dirty.crops = this.dirty.ground = true;
    this.save();
  }

  serialize() {
    return {
      v: 1, savedAt: this.now(), money: this.money, inv: [...this.inv], slot: this.slot,
      player: [this.player.pos.x, this.player.pos.z, this.player.facing],
      props: this.props.serialize(), tiles: this.world.diff(),
      farm: [...this.farm.values()].map((c) => ({ type: c.type, x: c.x, z: c.z, growth: c.growth, last: c.last, wet: c.wet })),
      wetSoil: [...this.wetSoil],
    };
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); this.lastSave = this.now(); } catch (e) { /* storage full / private mode */ }
  }

  load() {
    let s;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { s = null; }
    if (!s || s.v !== 1) return false;
    this.money = s.money; this.inv = new Map(s.inv); this.slot = s.slot || 0;
    this.world.applyDiff(s.tiles);
    for (const p of s.props) {
      const pr = this.props.add(p.type, p.x, p.z, p.rot, p.id);
      if (p.type === 'stall') this.stall = pr;
    }
    for (const c of s.farm) this.farm.set(c.z * W + c.x, { ...c });
    this.wetSoil = new Map(s.wetSoil || []);
    this.player.pos.set(s.player[0], 0, s.player[1]); this.player.facing = s.player[2];
    this.tickCrops(true);
    this.dirty.veg = this.dirty.crops = this.dirty.ground = true;
    return true;
  }

  static clearSave() { localStorage.removeItem(SAVE_KEY); }
  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }

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
  stage(c) { return Math.min(RIPE, Math.floor(c.growth / CROPS[c.type].stageMs)); }

  // ------------------------------------------------------------------ input-driven
  setKey(code, down) { if (down) this.keys.add(code); else this.keys.delete(code); }

  moveInput() {
    let x = 0, z = 0;
    const k = this.keys;
    const add = ([dx, dz]) => { x += dx; z += dz; };
    if (k.has('KeyW') || k.has('ArrowUp') || k.has('touch-up')) add(DIRS.up);
    if (k.has('KeyS') || k.has('ArrowDown') || k.has('touch-down')) add(DIRS.down);
    if (k.has('KeyA') || k.has('ArrowLeft') || k.has('touch-left')) add(DIRS.left);
    if (k.has('KeyD') || k.has('ArrowRight') || k.has('touch-right')) add(DIRS.right);
    const l = Math.hypot(x, z);
    return l ? { x: x / l, z: z / l } : null;
  }

  /** Space / action button: use the current tool on the tile in front of the player. */
  action() {
    if (this.ui.modalOpen()) return;
    if (this.fishing) { this.reel(); return; }
    if (this.mode === 'build') { const t = this.hoverTile || this.targetTile(); this.buildAt(t.x, t.z); return; }
    this.useTool(this.targetTile());
  }

  /** Click / tap on a tile. */
  clickTile(t) {
    if (this.ui.modalOpen()) return;
    if (this.fishing) { this.reel(); return; }
    if (this.mode === 'build') { this.buildAt(t.x, t.z); return; }
    const p = this.props.at(t.x, t.z);
    const c = this.crop(t.x, t.z);
    const tool = this.tool;
    const acts = (p && (p.type === 'stall' || p.type === 'well')) || this.isMerchant(t.x, t.z)
      || (c && this.stage(c) >= RIPE)
      || (tool === 'hoe' && [T.GRASS, T.SAND].includes(this.world.get(t.x, t.z)) && !p)
      || (ITEMS[tool].kind === 'seed' && this.world.get(t.x, t.z) === T.SOIL && !c)
      || (tool === 'can' && this.world.get(t.x, t.z) === T.SOIL)
      || (tool === 'rod' && this.world.isWater(t.x, t.z) && !this.props.isBridge(t.x, t.z))
      || (tool === 'hand' && c);
    if (acts) { this.goAndAct(t); return; }
    if (this.walkable(t.x, t.z)) this.walkTo(t);
  }

  walkTo(t, pending = null) {
    const start = this.playerCell();
    const path = findPath(start, t, (x, z) => this.walkable(x, z), W, H);
    this.player.pending = pending;
    if (!path) { if (pending) this.ui.toast("Can't reach that spot."); return false; }
    this.player.path = path.slice(1).map((c) => new THREE.Vector2(c.x + 0.5, c.z + 0.5));
    if (!this.player.path.length) this.arrive();
    return true;
  }

  goAndAct(t) {
    const pc = this.playerCell();
    if (Math.max(Math.abs(pc.x - t.x), Math.abs(pc.z - t.z)) <= 1 && !(pc.x === t.x && pc.z === t.z)) {
      this.face(t); this.useTool(t); return;
    }
    // pick the reachable neighbour tile closest to the player
    let best = null, bd = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = t.x + dx, nz = t.z + dz;
      if (!this.walkable(nx, nz)) continue;
      const d = Math.hypot(nx - pc.x, nz - pc.z) + (dx && dz ? 0.3 : 0);
      if (d < bd) { bd = d; best = { x: nx, z: nz }; }
    }
    if (!best) { this.ui.toast("Can't reach that spot."); return; }
    this.walkTo(best, t);
  }

  arrive() {
    const t = this.player.pending;
    this.player.pending = null;
    if (t) { this.face(t); this.useTool(t); }
  }

  face(t) {
    const dx = t.x + 0.5 - this.player.pos.x, dz = t.z + 0.5 - this.player.pos.z;
    if (dx || dz) this.player.facing = Math.atan2(dx, dz);
  }

  swing() { this.player.swingT = 0.35; }

  useTool(t) {
    const { x, z } = t;
    const tool = this.tool;
    const p = this.props.at(x, z);
    const c = this.crop(x, z);
    const tile = this.world.get(x, z);
    if ((p && p.type === 'stall') || this.isMerchant(x, z)) { this.ui.openShop(); return; }
    if (p && p.type === 'well' && tool !== 'can') { this.ui.toast('The well water is cool and clear.'); return; }
    if (c && this.stage(c) >= RIPE && tool !== 'can') { this.harvest(c); return; }
    switch (tool) {
      case 'hand':
        if (c) {
          const s = this.stage(c), def = CROPS[c.type];
          const pct = Math.floor(((c.growth % def.stageMs) / def.stageMs) * 100);
          this.ui.toast(`${def.name}: stage ${s}/${RIPE} (${pct}%)${c.wet ? ' · watered' : ' · water me!'}`);
        } else if (p) this.ui.toast(`${PROPS[p.type].name}. Use build mode (B) to move it.`);
        break;
      case 'hoe':
        if (p) { this.ui.toast('Something is in the way.'); break; }
        if (tile === T.GRASS || tile === T.SAND) {
          this.world.set(x, z, T.SOIL);
          this.swing();
          this.particles.burst(x + 0.5, 0.1, z + 0.5, { color: '#7a5537', n: 14 });
          this.dirty.ground = this.dirty.veg = true;
          this.ui.toast('Tilled the earth.');
        } else if (tile === T.SOIL) this.ui.toast('Already tilled. Plant some seeds!');
        else this.ui.toast("The hoe won't work here.");
        break;
      case 'can':
        if (p && p.type === 'well') { this.ui.toast('Your watering can never runs dry here. ♪'); break; }
        if (tile === T.SOIL) {
          if (c) c.wet = true; else this.wetSoil.set(z * W + x, this.now() + 120_000);
          this.swing();
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
        this.farm.set(idx, { type: it.crop, x, z, growth: 0, last: this.now(), wet });
        this.swing();
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
    if (def.regrow) { c.growth = 2 * def.stageMs; c.last = this.now(); c.wet = false; }
    else this.farm.delete(c.z * W + c.x);
    this.swing();
    this.particles.burst(c.x + 0.5, 0.5, c.z + 0.5, { color: '#ffe08a', n: 18, up: 1.2 });
    this.dirty.crops = this.dirty.ground = true;
    this.ui.toast(`Harvested ${n} ${ITEMS[c.type].name.toLowerCase()}!`, ITEMS[c.type].icon);
  }

  /** Real-time growth from timestamps (also catches up after the tab was closed). */
  tickCrops(force = false) {
    const now = this.now();
    let changed = false;
    for (const c of this.farm.values()) {
      const def = CROPS[c.type];
      const max = RIPE * def.stageMs;
      let dt = Math.max(0, now - c.last);
      c.last = now;
      if (c.growth >= max) continue;
      const before = this.stage(c);
      if (c.wet) {
        const toNext = (before + 1) * def.stageMs - c.growth;
        if (dt * 2 >= toNext) { c.growth += toNext; dt -= toNext / 2; c.wet = false; changed = true; } else { c.growth += dt * 2; dt = 0; }
      }
      c.growth = Math.min(max, c.growth + dt);
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
    const dx = t.x - pc.x, dz = t.z - pc.z;
    for (let k = 1; k <= 3; k++) {
      const x = pc.x + dx * k, z = pc.z + dz * k;
      if (this.world.isWater(x, z) && !this.props.isBridge(x, z)) { spot = { x, z }; if (k >= 2) break; }
      else if (spot) break;
    }
    if (!spot) { this.ui.toast('Face the water to cast your line.'); return; }
    const fresh = this.world.isFresh(spot.x, spot.z);
    const pool = Object.entries(FISH).filter(([, f]) => f.water === (fresh ? 'fresh' : 'sea'));
    let r = Math.random() * pool.reduce((s, [, f]) => s + f.weight, 0);
    let fish = pool[0][0];
    for (const [k, f] of pool) { r -= f.weight; if (r <= 0) { fish = k; break; } }
    const wait = 1500 + Math.random() * 3000;
    this.fishing = { phase: 'wait', t0: performance.now(), biteAt: performance.now() + wait, fish, spot, x: spot.x + 0.5 + d.x * 0.1, z: spot.z + 0.5 + d.z * 0.1 };
    this.player.path = null;
    this.swing();
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
      this.ui.toast(`You caught a ${FISH[f.fish].name}!`, ITEMS[f.fish].icon);
      this.lastCatch = f.fish;
    } else {
      this.ui.toast('Too early — the fish swam away.');
    }
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
      f.phase = 'bite'; f.biteEnd = now + FISH[f.fish].window;
      this.ui.bubble('!');
      this.particles.burst(f.x, WATER_Y + 0.05, f.z, { color: '#ffffff', n: 8, up: 0.5 });
    }
    if (f.phase === 'bite') {
      dip = -0.07 - Math.abs(Math.sin(t * 22)) * 0.04;
      const k = 1 - (f.biteEnd - now) / FISH[f.fish].window;
      this.ripple.material.opacity = 0.7 * (1 - k);
      this.ripple.scale.setScalar(1 + k * 3);
      if (now > f.biteEnd) { this.ui.toast('It got away...'); this.cancelFishing(); return; }
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
    this.mode = on ? 'build' : 'play';
    if (!on) this.ghost.hide();
    this.player.path = null;
    this.ui.refresh();
  }
  rotate() {
    if (this.mode !== 'build') return;
    this.buildRot = (this.buildRot + 1) % 4;
    this.ui.toast(`Rotated ${this.buildRot * 90}°`);
  }

  buildAt(x, z) {
    if (this.buildSel === 'pickup') {
      const p = this.props.at(x, z);
      if (!p) { this.ui.toast('Nothing to pick up here.'); return; }
      if (PROPS[p.type].fixed) { this.ui.toast('The merchant would miss their stall!'); return; }
      const pc = this.playerCell();
      if (p.type === 'bridge' && p.cells.some((c) => c.x === pc.x && c.z === pc.z)) { this.ui.toast("Step off the bridge first."); return; }
      this.props.remove(p);
      this.give(`prop_${p.type}`);
      this.particles.burst(p.cx, 0.4, p.cz, { color: '#f4ead2', n: 14, up: 0.8 });
      this.ui.toast(`Picked up ${PROPS[p.type].name.toLowerCase()}.`, ITEMS[`prop_${p.type}`].icon);
      return;
    }
    const id = this.buildSel;
    const type = ITEMS[id]?.prop;
    if (!type || this.count(id) <= 0) { this.ui.toast('You have none left. Buy more at the stall.'); return; }
    if (!this.props.canPlace(type, x, z, this.buildRot, { playerCell: this.playerCell(), farm: this.farm })) { this.ui.toast("Can't place that here."); return; }
    this.take(id);
    const p = this.props.add(type, x, z, this.buildRot);
    this.particles.burst(p.cx, 0.2, p.cz, { color: '#fff1c4', n: 16, up: 0.7 });
    this.ui.toast(`Placed ${PROPS[type].name.toLowerCase()}.`);
    if (this.count(id) <= 0) { this.buildSel = 'pickup'; this.ui.refresh(); }
  }

  updateGhost() {
    if (this.mode !== 'build') { this.ghost.hide(); return; }
    const t = this.hoverTile || this.targetTile();
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
  sell(id, n = this.count(id)) {
    const it = ITEMS[id];
    if (!it.sell || n <= 0) return;
    this.take(id, n);
    this.money += it.sell * n;
    this.ui.toast(`Sold ${n} ${it.name.toLowerCase()} for ${it.sell * n} koku.`, 'icons:koku');
  }
  sellAll() {
    let total = 0;
    for (const [id, n] of [...this.inv]) {
      const it = ITEMS[id];
      if (it && (it.kind === 'produce' || it.kind === 'fish')) { total += it.sell * n; this.take(id, n); }
    }
    this.money += total;
    this.ui.toast(total ? `Sold the harvest for ${total} koku!` : 'Nothing to sell yet.', 'icons:koku');
  }
  buy(id) {
    const it = ITEMS[id];
    if (this.money < it.buy) { this.ui.toast('Not enough koku.'); return; }
    this.money -= it.buy;
    this.give(id);
    this.ui.toast(`Bought ${it.name.toLowerCase()}.`, it.icon);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, t) {
    const pl = this.player;
    const input = this.ui.modalOpen() ? null : this.moveInput();
    let move = null;
    if (input) { pl.path = null; pl.pending = null; move = input; }
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
      const dist = Math.min(SPEED * dt, move.max ?? Infinity); // never overshoot a path node
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

    if (!this.nextCropTick || t > this.nextCropTick) { this.tickCrops(); this.nextCropTick = t + 0.5; }
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

// Screen -> world picking: the ground tile under a point and the smart pick (props, billboards, merchant, fuzzy snap).
import * as THREE from 'three';
import { CROPS, PROPS, RIPE } from '../game/data.js';
import { TREE_CANOPIES } from '../assets/blockouts.js';

const SNAP_PX = 28;

export function createPicker({ canvas, camera, game }) {
  const raycaster = new THREE.Raycaster();
  const v3 = new THREE.Vector3();
  const rect = () => canvas.getBoundingClientRect();

  function toScreen(x, y, z) {
    v3.set(x, y, z).project(camera);
    const r = rect();
    return { x: r.left + (v3.x * 0.5 + 0.5) * r.width, y: r.top + (-v3.y * 0.5 + 0.5) * r.height };
  }
  const pxPerUnit = () => rect().height / (camera.top - camera.bottom);

  function setRay(cx, cy) {
    const r = rect();
    raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  }

  /** Ground tile under a screen point (land at y=0, water lower). */
  function groundTile(cx, cy) {
    setRay(cx, cy);
    const pt = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) return null;
    const t = { x: Math.floor(pt.x), z: Math.floor(pt.z) };
    if (game.world.isWater(t.x, t.z) && !game.props.isBridge(t.x, t.z)) {
      if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -game.world.waterY(t.x, t.z)), pt)) return { x: Math.floor(pt.x), z: Math.floor(pt.z) };
    }
    return t;
  }

  /**
   * Smart pick: tall props (mesh raycast), billboards (crops, canopies, bamboo,
   * screen-space rectangles), the merchant, then the ground. With `fuzzy`
   * (touch), snaps to nearby interactables within SNAP_PX.
   */
  function pick(cx, cy, { fuzzy = false } = {}) {
    const ground = groundTile(cx, cy);
    const cands = []; // { tile, dist (along the view ray, smaller = closer), prop? }
    setRay(cx, cy);
    const rayDist = (x, y, z) => v3.set(x, y, z).sub(raycaster.ray.origin).dot(raycaster.ray.direction);
    const objs = [game.props.group];
    if (game.merchant) objs.push(game.merchant.root);
    const hit = raycaster.intersectObjects(objs, true)[0];
    if (hit) {
      let o = hit.object;
      while (o && o.userData.propId == null && o !== game.merchant?.root && o.parent) o = o.parent;
      if (o === game.merchant?.root || (game.merchant && isChild(hit.object, game.merchant.root))) {
        cands.push({ tile: { ...game.merchantCell }, dist: hit.distance - 0.3 });
      } else if (o && o.userData.propId != null) {
        const p = game.props.list.find((q) => q.id === o.userData.propId);
        if (p) {
          const c = p.cells.reduce((b, c) => (Math.hypot(c.x + 0.5 - hit.point.x, c.z + 0.5 - hit.point.z) < Math.hypot(b.x + 0.5 - hit.point.x, b.z + 0.5 - hit.point.z) ? c : b));
          cands.push({ tile: { x: c.x, z: c.z }, dist: hit.distance, prop: p });
        }
      }
    }
    const ppu = pxPerUnit();
    // crops: rectangle from the base to the sprite top
    for (const c of game.farm.values()) {
      const s = game.stage(c), def = CROPS[c.type];
      const h = s === 0 ? 0.28 : def.height[s - 1];
      const base = toScreen(c.x + 0.5, 0, c.z + 0.5), top = toScreen(c.x + 0.5, h, c.z + 0.5);
      const hw = ppu * 0.42;
      if (cx > base.x - hw && cx < base.x + hw && cy > top.y - 4 && cy < base.y + ppu * 0.2) {
        // billboards lean toward the camera: measure at the tile's front edge
        cands.push({ tile: { x: c.x, z: c.z }, dist: rayDist(c.x + 0.85, h * 0.4, c.z + 0.85) - (s >= RIPE ? 0.1 : 0) });
      }
    }
    // tree canopies + bamboo clumps belong to their prop tile
    for (const p of game.props.list) {
      const def = PROPS[p.type];
      if (!def.canopy && !def.sprite) continue;
      const sc = p.mesh.scale.x;
      const top = def.canopy ? TREE_CANOPIES[def.canopy][0].pos[1] * sc + 0.6 : 2.4;
      const a = toScreen(p.cx, 0, p.cz), b = toScreen(p.cx, top, p.cz);
      const hw = ppu * (def.canopy ? 0.8 : 0.4) * sc;
      if (cx > a.x - hw && cx < a.x + hw && cy > b.y - hw * 0.3 && cy < a.y + ppu * 0.15) {
        cands.push({ tile: { x: p.x, z: p.z }, dist: rayDist(p.cx, top * 0.7, p.cz), prop: p, foliage: true });
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    let best = cands[0] || null;
    // foliage hides the ground behind it; in play mode an actionable tile back there wins
    if (best?.foliage && game.mode === 'play' && ground && !(ground.x === best.tile.x && ground.z === best.tile.z)) {
      const k = game.resolve(ground).kind;
      if (k !== 'walk' && k !== 'inspect') best = cands.find((c) => !c.foliage) || null;
    }
    const groundKind = ground && game.mode === 'play' ? game.resolve(ground).kind : 'walk';
    if (!best && fuzzy && ground && (groundKind === 'walk' || groundKind === 'inspect')) {
      // fat-finger snap (only when the tile itself does nothing): ripe crops > merchant > crops
      let bd = Math.min(SNAP_PX, ppu * 0.6), bt = null;
      const consider = (x, z, y, bonus) => {
        const s = toScreen(x + 0.5, y, z + 0.5);
        const d = Math.hypot(s.x - cx, s.y - cy) - bonus;
        if (d < bd) { bd = d; bt = { x, z }; }
      };
      for (const c of game.farm.values()) if (cheb(c, ground) <= 1) consider(c.x, c.z, 0.25, game.stage(c) >= RIPE ? 8 : 0);
      if (game.merchantCell && cheb(game.merchantCell, ground) <= 1) consider(game.merchantCell.x, game.merchantCell.z, 0.5, 6);
      if (bt) best = { tile: bt, dist: 0, snapped: true };
    }
    return { tile: best ? best.tile : ground, ground, prop: best?.prop || (ground && game.props.at(ground.x, ground.z)) || null, foliage: !!best?.foliage };
  }

  return { pick, groundTile, toScreen };
}

function cheb(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)); }
function isChild(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }

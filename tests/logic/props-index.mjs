// The prop store works without a scene (PropIndex, no THREE meshes) and PropManager keeps the surface the game reads.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PropIndex } from '../../src/systems/props.js';
import { PropManager } from '../../src/game/props.js';
import { World } from '../../src/game/world.js';
import { LEGACY_OFF as O } from '../../src/world/coords.js';

export default function () {
  const world = new World();
  const idx = new PropIndex(world);
  assert.equal(idx.canPlace('crate', 20 + O, 20 + O, 0), true);
  const p = idx.add('crate', 20 + O, 20 + O, 0);
  assert.equal(p.mesh, undefined, 'the index makes no meshes');
  assert.equal(idx.version, 1);
  assert.equal(idx.at(p.cells[0].x, p.cells[0].z), p);
  assert.equal(idx.canPlace('crate', 20 + O, 20 + O, 0), false, 'occupied');
  assert.equal(idx.canPlace('crate', 20 + O, 20 + O, 0, { ignoreId: p.id }), true);
  assert.deepEqual(idx.serialize(), [{ id: p.id, type: 'crate', x: 20 + O, z: 20 + O, rot: 0 }]);
  idx.remove(p);
  assert.equal(idx.at(p.cells[0].x, p.cells[0].z), null);
  assert.equal(idx.version, 2);

  const pm = new PropManager(new THREE.Scene(), { assets: {}, sheets: {} }, world);
  let changes = 0;
  pm.onChange = () => changes++;
  const a = pm.add('crate', 20 + O, 20 + O, 0), b = pm.add('crate', 22 + O, 20 + O, 0, 9);
  assert.ok(a.mesh.isMesh && pm.group.children.includes(a.mesh) && a.mesh.userData.propId === a.id);
  assert.equal(pm.list.length, 2);
  assert.equal(pm.version, 2);
  assert.equal(pm.nextId, 10);
  assert.equal(changes, 2);
  assert.equal(pm.at(a.cells[0].x, a.cells[0].z), a);
  pm.remove(a);
  assert.ok(!pm.group.children.includes(a.mesh) && pm.list.length === 1 && pm.list[0] === b);
  assert.equal(pm.version, 3);
  assert.equal(changes, 3);
  assert.deepEqual(pm.billboards(), { canopy: [], veg: [], shadows: [] });
}

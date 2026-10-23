// A prop whose paint is missing, half-loaded or made for other geometry gets the vertex-colour material instead of throwing;
// the core view helpers a Game builds on (feedback events, inventory view) are covered in core.mjs and core-inventory.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PropManager } from '../../src/game/props.js';
import { World } from '../../src/game/world.js';
import { buildBlockoutGeometry, BLOCKOUTS } from '../../src/assets/blockouts.js';
import { geomHash } from '../../src/assets/geomhash.js';
import { createCore } from '../../src/core/core.js';
import { attachFeedback } from '../../src/ui/feedback.js';

const angle = () => ({ tex: {}, depthTex: {}, camera: { frustum: { near: 0, far: 1 }, viewProjectionMatrix: new Array(16).fill(0), viewDir: [0, 0, -1] } });
const painted = (extra = {}) => ({ assets: { crate: { angles: [angle(), angle()], ...extra } }, sheets: {} });
const isPainted = (m) => typeof m.onBeforeCompile === 'function' && m.onBeforeCompile.length > 0 && m.customProgramCacheKey().startsWith('painted');
const manager = (p) => new PropManager(new THREE.Scene(), p, new World());

function hashes() {
  const a = geomHash(buildBlockoutGeometry('crate')), b = geomHash(buildBlockoutGeometry('well'));
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, geomHash(buildBlockoutGeometry('crate')), 'stable');
  assert.notEqual(a, b);
  const g = buildBlockoutGeometry('crate');
  g.attributes.position.array[0] += 0.01;
  assert.notEqual(geomHash(g), a, 'a moved vertex changes it');
}

function materials() {
  assert.ok(BLOCKOUTS.crate && BLOCKOUTS.well);
  const ok = manager(painted()).material('crate');
  assert.ok(isPainted(ok), 'paint present: projection material');
  const hash = geomHash(buildBlockoutGeometry('crate'));
  assert.ok(isPainted(manager(painted({ geomHash: hash })).material('crate')), 'matching geomHash keeps the paint');

  for (const [what, p] of [
    ['no entry', { assets: {}, sheets: {} }],
    ['no assets at all', { sheets: {} }],
    ['one angle', { assets: { crate: { angles: [angle()] } }, sheets: {} }],
    ['textures not loaded', { assets: { crate: { angles: [{ camera: angle().camera }, angle()] } }, sheets: {} }],
    ['stale geomHash', painted({ geomHash: '00000000' })],
  ]) {
    const m = manager(p).material('crate');
    assert.ok(m.isMeshLambertMaterial && m.vertexColors && !isPainted(m), `${what}: vertex-colour fallback`);
  }

  const pm = manager({ assets: {}, sheets: {} });
  const prop = pm.add('crate', 20, 20, 0);
  assert.ok(prop.mesh.isMesh, 'a crate with no paint still gets a mesh');
  assert.equal(pm.material('crate'), pm.material('crate'), 'cached');
}

function feedback() {
  const calls = [];
  const host = {
    ui: { toast: (...a) => calls.push(['toast', ...a]) },
    sound: { play: (...a) => calls.push(['play', ...a]) },
    particles: { burst: (...a) => calls.push(['burst', ...a]), sparkle: (...a) => calls.push(['sparkle', ...a]) },
  };
  const core = createCore({ now: () => 1e12, mono: () => 0 });
  const off = attachFeedback(core, host);
  core.say('Hi', 'icons:koku');
  core.sfx('coin');
  core.sfx('pop', { pitch: 2 });
  core.fx.burst(1, 2, 3, { n: 4 });
  core.say('Plain');
  core.sparkle(5, 6, 7);
  assert.deepEqual(calls, [
    ['toast', 'Hi', 'icons:koku'], ['play', 'coin', undefined], ['play', 'pop', { pitch: 2 }], ['burst', 1, 2, 3, { n: 4 }], ['toast', 'Plain', undefined], ['sparkle', 5, 6, 7],
  ]);

  // a Fortune wakes: the open sheet closes, the wake card is queued after the camera tour (none when nobody tours)
  calls.length = 0;
  host.ui.closeModal = () => calls.push(['close']);
  host.ui.celebrate = (...a) => calls.push(['celebrate', ...a]);
  host.focusQ = [{}];
  core.bus.emit('wake', { fortune: 'ebisu' });
  host.focusQ = [];
  core.bus.emit('wake', { fortune: 'ebisu' });
  assert.deepEqual(calls, [['close'], ['celebrate', 'ebisu', 4700], ['close'], ['celebrate', 'ebisu', 0]]);

  // taps: the cards, floating labels, the queue chips, the build bar's choice, and whether a card is open
  calls.length = 0;
  let open = false;
  Object.assign(host.ui, {
    openShop: () => calls.push(['shop']), openShrine: () => calls.push(['shrine']), floatLabel: (...a) => calls.push(['label', ...a]),
    refreshQueue: () => calls.push(['queue']), selectBuild: (i) => calls.push(['select', i]), modalOpen: () => open,
  });
  core.bus.emit('openSheet', { name: 'shop' }); core.bus.emit('openSheet', { name: 'shrine' }); core.bus.emit('openSheet', { name: 'nowhere' });
  core.bus.emit('floatLabel', { text: 'Soft grass', x: 1, z: 2 }); core.bus.emit('queueChange'); core.bus.emit('buildSelect', { index: 3 });
  assert.deepEqual(calls, [['shop'], ['shrine'], ['label', 'Soft grass', 1, 2], ['queue'], ['select', 3]]);
  assert.equal(core.bus.apply('ui.modalOpen', false), false);
  open = true;
  assert.equal(core.bus.apply('ui.modalOpen', false), true);

  calls.length = 0;
  core.bus.setAway(true);
  core.say('Quiet'); core.sfx('coin'); core.fx.burst(0, 0, 0); core.sparkle(0, 0, 0); core.bus.emit('wake', { fortune: 'ebisu' });
  core.bus.setAway(false);
  assert.deepEqual(calls, [], 'away events make no noise');

  off();
  core.say('Gone');
  assert.deepEqual(calls, [], 'detached');
  attachFeedback(core, {});
  core.say('No ui'); core.sfx('x'); core.fx.burst(0, 0, 0); // a host without ui, sound or particles must not throw
}

export default function () {
  hashes();
  materials();
  feedback();
}

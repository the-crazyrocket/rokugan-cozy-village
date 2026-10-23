// Smallest stand-ins for what the daily-group systems reach into: the real daily, requests, market, forage and stats systems on a
// strict core with the real world and props, and fakes for shrine, farming and player.
import { createCore } from '../../src/core/core.js';
import { defineSystem } from '../../src/core/system.js';
import { World } from '../../src/game/world.js';
import '../../src/content/index.js';
import props from '../../src/systems/props.js';
import stats from '../../src/systems/stats.js';
import daily from '../../src/systems/daily.js';
import market from '../../src/systems/market.js';
import requests from '../../src/systems/requests.js';
import forage from '../../src/systems/forage.js';

/** A booted core: no props, no crops, shrine awake for `awake` fortunes, the player can stand on any land. */
export function stubCore({ awake = [], now = () => Date.UTC(2026, 0, 1, 12), world = new World(), crops = new Set(), walkable, systems = [], ...opts } = {}) {
  const fake = (name, api, needs = []) => defineSystem({ name, needs, api: () => api });
  const swings = { n: 0 };
  const core = createCore({ strict: true, now, mono: () => 0, ...opts });
  core.provide('world', world);
  core.boot([
    props,
    fake('shrine', { isAwake: (f) => awake.includes(f) }),
    fake('farming', { crop: (x, z) => (crops.has(z * world.w + x) ? { x, z } : undefined) }),
    fake('player', { walkable: walkable || ((x, z) => world.isLand(x, z)), swing: () => { swings.n++; } }),
    stats, daily, market, requests, forage, ...systems,
  ]);
  return Object.assign(core, { stub: { world, swings } });
}

/** The daily system's api of a stub core (golden-data calls roll(key) on it). */
export function stubDaily(opts) {
  return stubCore(opts).use('daily');
}

// Puts the legacy facade of each module on the Game instance: a function becomes an own bound method, a { get, set } pair
// an accessor. String entries (method -> api name) are booted by core.js, not installed here.
import { systems } from './index.js';

export function installFacades(game, list) {
  for (const spec of list) {
    for (const [name, entry] of Object.entries(spec.facade || {})) {
      if (typeof entry === 'function') game[name] = entry.bind(game);
      else if (entry && typeof entry === 'object') Object.defineProperty(game, name, { get: entry.get, set: entry.set, configurable: true, enumerable: true });
    }
  }
}

export function installSystems(game) {
  installFacades(game, systems);
}

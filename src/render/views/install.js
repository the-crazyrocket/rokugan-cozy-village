import { installFacades } from '../../systems/install.js';
import { views } from './index.js';

export function installViews(game) {
  installFacades(game, views);
}

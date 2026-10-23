// The views whose facade methods are installed on Game (installViews), in a stable order.
import gear from './gear.js';
import crops from './crops.js';
import vegetation from './vegetation.js';
import merchant from './merchant.js';
import fishingView from './fishing-view.js';
import ghost from './ghost-view.js';
import villagersView from './villagers.js';
import woodcutView from './woodcut.js';

export const views = [gear, crops, vegetation, merchant, fishingView, ghost, villagersView, woodcutView];
export default views;

// The systems whose facade methods are installed on Game (install.js), in a stable order. Browser-only code lives in render/views.
import props from './props.js';
import build from './build.js';
import fishing from './fishing.js';
import shrine from './shrine.js';
import stats from './stats.js';
import daily from './daily.js';
import market from './market.js';
import requests from './requests.js';
import forage from './forage.js';
import farming from './farming.js';
import player from './player.js';
import terrainrules from './terrainrules.js';
import terraform from './terraform.js';
import gather from './gather.js';
import reclaim from './reclaim.js';
import craft from './craft.js';
import projects from './projects.js';
import villagers from './villagers.js';
import visitors from './visitors.js';
import kitchen from './kitchen.js';
import bugs from './bugs.js';
import interact from './interact.js';

export const systems = [props, build, fishing, shrine, stats, daily, market, requests, forage, farming, player, terrainrules, terraform, gather, reclaim, craft, projects, villagers, visitors, kitchen, bugs, interact];
export default systems;

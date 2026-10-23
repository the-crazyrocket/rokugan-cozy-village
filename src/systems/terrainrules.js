// Terrain rules: the shared invariants every tile edit passes (docs/ARCHITECTURE.md section 4), registered as guards for the three
// edit kinds ('terraform', 'dig', 'reclaim'; world/edit.js asks once per edit and hands over the edit itself). [T]
// - Nothing under a landmark's footprint (shrine, stone, pier), a fixed prop or a deck (bridge, pier).
// - Reachability: whatever could be reached from home before the edit (home, the stall, the shrine, every anchor others add) still can be after it.
// - Soft-locks: an edit may not take away the last reachable fresh water to fish in, the last reachable sea shore, the last reachable tillable tile.
// Reachability is one flood fill from home over the terrain as it will be (viewAfter), compared with the flood over the terrain as it is,
// so a village that is already cut in two does not make every edit impossible. Later systems add what must stay reachable
// (a villager's door) with ctx.use('terrainrules').addAnchors(fn) (fn() -> [{ name, x, z, adjacent? }], adjacent: standing next to it counts).
import { defineSystem } from '../core/system.js';
import { LANDMARKS, HOME } from '../content/base/landmarks.js';
import { T, WK } from '../world/kinds.js';
import { changedTiles, propsOn, viewAfter } from '../world/edit.js';
import { merchantSpot, SHRINE_TYPES } from './shared.js';

const KINDS = ['terraform', 'dig', 'reclaim'];
const FLOOD = 4096; // tiles one flood fill may visit
const TILLABLE = new Set([T.GRASS, T.SAND, T.SOIL]);
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const LANDMARK_PROPS = [['stone', 'stone'], ['shrine_old', 'shrine'], ['shrine', 'shrine'], ['pier', 'pier']]; // [prop type, LANDMARKS key]

export default defineSystem({
  name: 'terrainrules',
  needs: ['props', 'player'],
  api(ctx) {
    const props = () => ctx.use('props');
    const providers = [];
    const key = (x, z) => z * ctx.world.w + x;

    const api = {
      /** What must stay reachable: fn() -> [{ name, x, z, adjacent? }]. Returns the way to take it back. */
      addAnchors(fn) {
        providers.push(fn);
        return () => { const i = providers.indexOf(fn); if (i >= 0) providers.splice(i, 1); };
      },

      /** [{ name, x, z, adjacent }] as the village is now. */
      anchors() {
        const out = [{ name: 'home', x: HOME.x, z: HOME.z, adjacent: false }];
        const stall = props().list.find((p) => p.type === 'stall');
        if (stall) out.push({ name: 'the stall', ...merchantSpot(stall).cell, adjacent: true });
        const shrine = props().list.find((p) => SHRINE_TYPES.has(p.type));
        if (shrine) out.push({ name: 'the shrine', x: shrine.x, z: shrine.z + 1, adjacent: true });
        for (const fn of providers) for (const a of fn() || []) out.push({ adjacent: false, ...a });
        return out;
      },

      /** The cells a landmark prop does or will cover, as a Set of tile keys. */
      landmarkCells() {
        if (!ctx.state.landmarks) {
          const set = ctx.state.landmarks = new Set();
          for (const [type, at] of LANDMARK_PROPS) for (const c of props().cells(type, LANDMARKS[at].x, LANDMARKS[at].z, 0).cells) set.add(key(c.x, c.z));
        }
        return ctx.state.landmarks;
      },

      /** Why an edit may not happen, or null. */
      check(edit) {
        const world = ctx.world, changed = changedTiles(world, edit);
        if (!changed.length) return null;

        // landmarks, fixed props and decks keep their ground
        const land = api.landmarkCells();
        for (const t of changed) {
          if (land.has(key(t.x, t.z))) return 'That ground belongs to the shrine.';
          if (props().isBridge(t.x, t.z)) return 'That ground holds up a bridge.';
          const p = props().at(t.x, t.z);
          if (p && ctx.content.props.get(p.type)?.fixed) return 'That ground is not yours to change.';
        }

        const leaving = new Set(propsOn(ctx, changed).map((p) => p.id));
        const before = viewAfter(ctx, { ...edit, to: {} });
        const after = viewAfter(ctx, edit, leaving);
        const seenBefore = before.reach(HOME, FLOOD), seenAfter = after.reach(HOME, FLOOD);

        const reached = (seen, a) => {
          if (a.x >= 0 && a.z >= 0 && a.x < world.w && a.z < world.h && seen[key(a.x, a.z)]) return true;
          return !!a.adjacent && AROUND.some(([dx, dz]) => world.inBounds(a.x + dx, a.z + dz) && seen[key(a.x + dx, a.z + dz)]);
        };
        for (const a of api.anchors()) if (reached(seenBefore, a) && !reached(seenAfter, a)) return `That would cut the path to ${a.name}.`;

        // something to fish for and something to till must stay in reach
        const kept = (view, seen, gone) => {
          const found = { fresh: false, sea: false, soil: false };
          for (let z = 0; z < world.h; z++) for (let x = 0; x < world.w; x++) {
            if (!seen[key(x, z)]) continue;
            const p = props().at(x, z);
            if (TILLABLE.has(view.kind(x, z)) && (!p || gone.has(p.id))) found.soil = true;
            for (const [dx, dz] of AROUND) {
              const nx = x + dx, nz = z + dz;
              if (!world.inBounds(nx, nz) || view.kind(nx, nz) !== T.WATER || props().isBridge(nx, nz)) continue;
              const w = view.water(nx, nz);
              if (w === WK.SEA) found.sea = true; else if (w >= WK.POND) found.fresh = true;
            }
          }
          return found;
        };
        const was = kept(before, seenBefore, new Set()), now = kept(after, seenAfter, leaving);
        if (was.fresh && !now.fresh) return 'That would leave no fresh water to fish in.';
        if (was.sea && !now.sea) return 'That would leave no shore to fish the sea from.';
        if (was.soil && !now.soil) return 'That would leave no soil to till.';
        return null;
      },
    };
    ctx.state.api = api;
    return api;
  },
  init(ctx) {
    const { api } = ctx.state;
    for (const kind of KINDS) ctx.guards.add(kind, (edit) => api.check(edit));
  },
});

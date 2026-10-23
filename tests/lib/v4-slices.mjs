// Stand-in slices for the core save tests: each slice keeps its data in ctx.mem[name], so the runner, the
// migrations and the storage layer can be exercised without any game system. Also the v4 -> v3 inverse used as an oracle.
import { createSave } from '../../src/core/save.js';
import { rleDecode } from '../../src/core/rle.js';
import { generateLegacy40 } from '../../src/world/legacy40.js';
import { LEGACY_HOTBAR } from '../../src/core/migrations/v3-v4.js';

export const SLICE_ORDER = { core: 0, world: 10, props: 20, farming: 30, daily: 40, shrine: 50, scheduler: 90, away: 95 };

export function makeSave({ shift = true } = {}) {
  const save = createSave();
  for (const [name, order] of Object.entries(SLICE_ORDER)) {
    save.register({
      name, version: 1, order,
      defaults: () => ({ defaulted: name }),
      serialize: (ctx) => ctx.mem[name],
      load(d, ctx) { ctx.mem[name] = d; ctx.loaded.push(name); },
      ...(shift && name === 'props' ? { shift: (d, dx, dz) => ({ list: d.list.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz })) }) } : {}),
    });
  }
  return save;
}

export const makeCtx = () => ({ mem: {}, loaded: [], now: () => 1234 });

/** The v3 save a v4 envelope stands for. */
export function toV3(env) {
  const d = (n) => env.slices[n].d;
  const { core, world, props, farming } = { core: d('core'), world: d('world'), props: d('props'), farming: d('farming') };
  const n = world.w * world.h;
  const kind = rleDecode(world.kind, n);
  const base = generateLegacy40().kind;
  const tiles = [];
  for (let i = 0; i < n; i++) if (kind[i] !== base[i]) tiles.push([i, kind[i]]);
  return {
    v: 3, savedAt: env.savedAt, timeOffset: core.time.carry,
    money: core.money, inv: core.inv, slot: LEGACY_HOTBAR.indexOf(core.tool), player: core.player,
    props: props.list, tiles, farm: farming.crops, wetSoil: farming.wet.map(([x, z, until]) => [z * world.w + x, until]),
    daily: d('daily'), stats: core.stats, shrine: d('shrine'),
  };
}

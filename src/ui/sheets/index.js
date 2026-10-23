// The lazy sheet table: a sheet's module is imported the first time it opens and then registered with ctx.sheets.
// Each module exports render(ui, ctx, args) -> { title, body } and, for sheets that follow the game, live = true.
export const LAZY = {
  shop: () => import('./shop.js'),
  bag: () => import('./bag.js'),
  today: () => import('./today.js'),
  shrine: () => import('./shrine.js'),
  wake: () => import('./wake.js'),
  backup: () => import('./backup.js'),
  restore: () => import('./restore.js'),
  tools: () => import('./tools.js'),
};

const loading = new WeakMap(); // ctx -> Map(name -> promise)

/** The registered sheet `name`, importing and registering it first when it is in the lazy table. */
export function loadSheet(ctx, name) {
  const have = ctx.sheets.get(name);
  if (have) return Promise.resolve(have);
  const load = LAZY[name];
  if (!load) return Promise.reject(new Error(`no sheet '${name}'`));
  if (!loading.has(ctx)) loading.set(ctx, new Map());
  const mine = loading.get(ctx);
  if (!mine.has(name)) {
    mine.set(name, load().then((m) => ctx.sheets.get(name) || ctx.as('ui').sheets.add(name, { render: m.render, live: !!m.live })).finally(() => mine.delete(name)));
  }
  return mine.get(name);
}

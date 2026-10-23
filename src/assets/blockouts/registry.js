// Leaf registry for blockouts: no imports, so base data and packs can register without reaching the browser.
// shape params: box{size:[w,h,d]}, cyl{rt,rb,h,seg}, cone{r,h,seg}, sphere{r,seg},
// prism{w,h,d} (gable, ridge along x), hip{w,d,h,ridge} (hipped roof, ridge along x)
// common: pos:[x,y,z] (centre; for prism/hip the base centre), rot:[x,y,z] degrees, scale:[x,y,z]
export const BLOCKOUTS = {};

export function defineBlockout(name, def) {
  if (BLOCKOUTS[name]) throw new Error('blockout already defined: ' + name);
  BLOCKOUTS[name] = def;
  return def;
}

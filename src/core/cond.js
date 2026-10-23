// Conditions: one small JSON engine for fish, bugs, visitors, dialogue, crop niches and project gates.
// Keys of one object are ANDed; all:[] any:[] not:{} nest; '!x' negates a value, a list matches any
// of its positive entries and none of its negated ones. Leaf module: no imports.
//
// cctx = { now, hour (0..24), season, weather (kind or {kind}), festival, day, at:{x,z}, quality,
//   standing (id or ids of what the player stands on), world, props, inv, flags, friendship, tagsOf }
//   world: kindAt|get(x,z), heightAt(x,z), waterKind(x,z) (0 land, 1 sea, 2 pond, 3 stream, 4 tide)
//     or the legacy isWater|isFresh(x,z); props.within(x,z,r) or props.list: placed {type, x, z, tags?};
//   inv.count(id, {minQ}); flags.get(name) or has(name); friendship(who) -> number or a { who: n } map.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const TERRAIN = { water: 0, grass: 1, sand: 2, path: 3, soil: 4, gravel: 5, stepping: 6, boardwalk: 7, plaza: 8 };
export const WATER = { land: [0], sea: [1], fresh: [2, 3], pond: [2], stream: [3], tide: [4] };

const pad = (n) => String(n).padStart(2, '0');
const human = (id) => String(id).replace(/_/g, ' ');
const withArticle = (s) => (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;
const clock = (h) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isStr = (s) => typeof s === 'string' && s.length > 0;
const list = (v) => (Array.isArray(v) ? v : [v]);
const ALWAYS = { test: () => true, why: () => {}, text: '' };
const NEVER = { test: () => false, why: (x, out) => out.push('never'), text: 'never' };

/** A value or list with '!' negation: true when some positive entry is() (or there is none) and no negated one is. */
function matchSpec(spec, is) {
  let anyPos = false, hit = false;
  for (const s of list(spec)) {
    if (s[0] === '!') { if (is(s.slice(1))) return false; } else { anyPos = true; if (is(s)) hit = true; }
  }
  return !anyPos || hit;
}

function specText(spec, pos, neg) {
  const p = [], n = [];
  for (const s of list(spec)) (s[0] === '!' ? n : p).push(s[0] === '!' ? s.slice(1) : s);
  return [p.length && pos(p), n.length && neg(n)].filter(Boolean).join(', ');
}

function checkSpec(v, ok, what) {
  if (!(isStr(v) || (Array.isArray(v) && v.length && v.every(isStr)))) return `${what} must be a string or a list of strings`;
  const bad = list(v).map((s) => (s[0] === '!' ? s.slice(1) : s)).find((s) => !ok(s));
  return bad === undefined ? null : `unknown ${what} "${bad}"`;
}

const tile = (x) => (x.at && x.world ? x.at : null);
const kindAt = (x) => { const w = x.world, t = tile(x); return t ? (w.kindAt ? w.kindAt(t.x, t.z) : w.get ? w.get(t.x, t.z) : null) : null; };
const heightAt = (x) => { const w = x.world, t = tile(x); return t && w.heightAt ? w.heightAt(t.x, t.z) : t ? 0 : null; };
function waterAt(w, px, pz) {
  if (w.waterKind) return w.waterKind(px, pz);
  if (!w.isWater || !w.isWater(px, pz)) return 0;
  return w.isFresh && w.isFresh(px, pz) ? 2 : 1;
}

function near(x, o) {
  const t = x.at;
  if (!t) return false;
  const r = o.r ?? 1, n = o.n ?? 1;
  if (o.water) {
    if (!x.world) return false;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (WATER[o.water].includes(waterAt(x.world, t.x + dx, t.z + dz))) return true;
    return false;
  }
  const ps = x.props;
  if (!ps) return false;
  const found = ps.within ? ps.within(t.x, t.z, r) : (ps.list || []).filter((p) => Math.max(Math.abs(p.x - t.x), Math.abs(p.z - t.z)) <= r);
  let c = 0;
  for (const p of found) {
    const type = p.type ?? p.prop;
    if (o.prop ? type === o.prop : (p.tags ?? x.tagsOf?.(type) ?? []).includes(o.tag)) c++;
  }
  return c >= n;
}

const flagSet = (x, name) => {
  const f = x.flags;
  if (!f) return false;
  return name[0] === '!' ? !flagSet(x, name.slice(1)) : typeof f.get === 'function' ? !!f.get(name) : !!f.has?.(name);
};
const kind = (w) => (typeof w === 'string' ? w : w?.kind ?? 'clear');
const WEATHER_TEXT = { rain: 'in the rain', snow: 'in the snow', clear: 'in clear weather', fog: 'in the fog', storm: 'in a storm' };
const nearText = (o) => {
  if (o.water) return `${(o.r ?? 1) <= 1 ? 'next to' : 'near'} ${o.water} water`;
  const what = human(o.prop ?? o.tag);
  return (o.n ?? 1) > 1 ? `near at least ${o.n} ${what}` : `near ${withArticle(what)}`;
};

const BUILTIN = {
  hour: {
    validate: (v) => (Array.isArray(v) && v.length === 2 && v.every((n) => isNum(n) && n >= 0 && n <= 24) ? null : 'hour must be [from, to] within 0..24'),
    test: ([a, b], x) => (a <= b ? x.hour >= a && x.hour < b : x.hour >= a || x.hour < b),
    describe: ([a, b]) => (a > b && a >= 17 && b <= 7 ? 'at night' : a === 0 && b === 24 ? 'at any hour' : `between ${clock(a)} and ${clock(b)}`),
  },
  season: {
    validate: (v) => checkSpec(v, (s) => SEASONS.includes(s), 'season'),
    test: (v, x) => matchSpec(v, (s) => x.season === s),
    describe: (v) => specText(v, (p) => `in ${p.join(' or ')}`, (n) => `not in ${n.join(' or ')}`),
  },
  weather: {
    validate: (v) => checkSpec(v, () => true, 'weather'),
    test: (v, x) => matchSpec(v, (s) => kind(x.weather) === s),
    describe: (v) => specText(v, (p) => p.map((s) => WEATHER_TEXT[s] || `in ${s} weather`).join(' or '), (n) => 'not ' + n.map((s) => WEATHER_TEXT[s] || `in ${s} weather`).join(' or ')),
  },
  festival: {
    validate: (v) => checkSpec(v, () => true, 'festival'),
    test: (v, x) => matchSpec(v, (s) => (x.festival ?? null) === s),
    describe: (v) => specText(v, (p) => `during the ${p.map(human).join(' or ')} festival`, (n) => `outside the ${n.map(human).join(' or ')} festival`),
  },
  terrain: {
    validate: (v) => checkSpec(v, (s) => s in TERRAIN, 'terrain'),
    test: (v, x) => { const k = kindAt(x); return k != null && matchSpec(v, (s) => TERRAIN[s] === k); },
    describe: (v) => specText(v, (p) => `on ${p.join(' or ')}`, (n) => `not on ${n.join(' or ')}`),
  },
  height: {
    validate: (v) => (isNum(v) || (Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] <= v[1]) ? null : 'height must be a level or [min, max]'),
    test: (v, x) => { const h = heightAt(x); return h != null && (isNum(v) ? h === v : h >= v[0] && h <= v[1]); },
    describe: (v) => (isNum(v) ? `at height ${v}` : v[0] === v[1] ? `at height ${v[0]}` : `at height ${v[0]} to ${v[1]}`),
  },
  water: {
    validate: (v) => checkSpec(v, (s) => s in WATER, 'water'),
    test: (v, x) => { const t = tile(x); if (!t) return false; const k = waterAt(x.world, t.x, t.z); return matchSpec(v, (s) => WATER[s].includes(k)); },
    describe: (v) => specText(v, (p) => p.map((s) => (s === 'land' ? 'on land' : s === 'sea' ? 'in the sea' : s === 'fresh' ? 'in fresh water' : s === 'tide' ? 'in a tide pool' : `in a ${s}`)).join(' or '), (n) => `not in ${n.join(' or ')}`),
  },
  standing: {
    validate: (v) => checkSpec(v, () => true, 'standing'),
    test: (v, x) => matchSpec(v, (s) => (x.standing == null ? [] : list(x.standing)).includes(s)),
    describe: (v) => specText(v, (p) => `standing on ${p.map((s) => withArticle(human(s))).join(' or ')}`, (n) => `not standing on ${n.map((s) => withArticle(human(s))).join(' or ')}`),
  },
  near: {
    validate: (v) => list(v).map((o) => {
      if (!o || typeof o !== 'object') return 'near must be an object or a list of objects';
      const which = ['prop', 'tag', 'water'].filter((k) => k in o);
      if (which.length !== 1) return 'near needs exactly one of prop, tag or water';
      if (which[0] === 'water' && !(o.water in WATER)) return `unknown water "${o.water}"`;
      if (which[0] !== 'water' && !isStr(o[which[0]])) return `near.${which[0]} must be a string`;
      if ('r' in o && !(isNum(o.r) && o.r >= 0)) return 'near.r must be a number >= 0';
      if ('n' in o && !(Number.isInteger(o.n) && o.n >= 1)) return 'near.n must be an integer >= 1';
      return null;
    }).find(Boolean) || null,
    test: (v, x) => list(v).every((o) => near(x, o)),
    describe: (v) => list(v).map(nearText).join(' and '),
  },
  quality: {
    validate: (v) => (isNum(v) || (v && typeof v === 'object' && !Array.isArray(v) && ('min' in v || 'max' in v) && Object.entries(v).every(([k, n]) => (k === 'min' || k === 'max') && isNum(n))) ? null : 'quality must be a number or { min, max }'),
    test: (v, x) => { const q = x.quality ?? 1; return isNum(v) ? q >= v : q >= (v.min ?? -Infinity) && q <= (v.max ?? Infinity); },
    describe: (v) => (isNum(v) ? `of quality ${v} or better` : 'min' in v && 'max' in v ? `of quality ${v.min} to ${v.max}` : 'min' in v ? `of quality ${v.min} or better` : `of quality ${v.max} or less`),
  },
  flag: {
    validate: (v) => checkSpec(v, () => true, 'flag'),
    test: (v, x) => list(v).every((n) => flagSet(x, n)),
    describe: (v) => list(v).map((n) => (n[0] === '!' ? `while "${n.slice(1)}" is not set` : `once "${n}" is set`)).join(' and '),
  },
  has: {
    validate: (v) => list(v).map((o) => {
      if (isStr(o)) return null;
      if (!o || typeof o !== 'object' || !isStr(o.item)) return 'has needs an item id or { item, n?, minQ? }';
      return ('n' in o && !(Number.isInteger(o.n) && o.n >= 1)) || ('minQ' in o && !isNum(o.minQ)) ? 'has.n must be an integer >= 1 and minQ a number' : null;
    }).find(Boolean) || null,
    test: (v, x) => x.inv != null && list(v).every((o) => {
      const { item, n = 1, minQ } = isStr(o) ? { item: o } : o;
      return x.inv.count(item, minQ ? { minQ } : undefined) >= n;
    }),
    describe: (v) => list(v).map((o) => { const { item, n = 1 } = isStr(o) ? { item: o } : o; return `carrying ${n > 1 ? n + ' ' : ''}${human(item)}`; }).join(' and '),
  },
  friendship: {
    validate: (v) => (v && typeof v === 'object' && isStr(v.who) && (v.min === undefined || isNum(v.min)) ? null : 'friendship needs { who, min? }'),
    test: (v, x) => (typeof x.friendship === 'function' ? x.friendship(v.who) : x.friendship?.[v.who] ?? 0) >= (v.min ?? 1),
    describe: (v) => `friends with ${human(v.who)}${v.min > 1 ? ` (level ${v.min})` : ''}`,
  },
};

// replaceable defaults: the owning system re-registers them with cond.define
const SOFT = {
  project: {
    validate: (v) => (isStr(v) ? null : 'project must be a project id'),
    test: (v, x) => flagSet(x, 'project.' + v),
    describe: (v) => `once the ${human(v)} project is finished`,
  },
};

const wrapText = (s) => (/, | or | and /.test(s) ? `(${s})` : s);

export function createCond() {
  const defs = new Map(Object.entries(BUILTIN).map(([k, d]) => [k, { ...d, soft: false }]));
  for (const [k, d] of Object.entries(SOFT)) defs.set(k, { ...d, soft: true });
  let cache = new WeakMap();

  function parse(c) {
    if (c == null || c === true) return ALWAYS;
    if (c === false) return NEVER;
    if (typeof c !== 'object' || Array.isArray(c)) throw new Error(`cond: expected an object, got ${JSON.stringify(c)}`);
    let node = cache.get(c);
    if (node) return node;
    const parts = [];
    for (const [key, v] of Object.entries(c)) {
      if (key === 'all' || key === 'any') {
        if (!Array.isArray(v)) throw new Error(`cond: ${key} must be a list`);
        const kids = v.map(parse);
        const text = kids.map((k) => k.text).filter(Boolean);
        if (key === 'all') parts.push({ test: (x) => kids.every((k) => k.test(x)), why: (x, out) => kids.forEach((k) => k.why(x, out)), text: text.join(', ') });
        else parts.push({ test: (x) => kids.some((k) => k.test(x)), why: (x, out) => out.push(`one of ${text.map(wrapText).join(' or ') || 'nothing'}`), text: text.length ? `either ${text.map(wrapText).join(' or ')}` : 'never' });
      } else if (key === 'not') {
        const kid = parse(v);
        parts.push({ test: (x) => !kid.test(x), why: (x, out) => out.push(`not ${wrapText(kid.text || 'always')}`), text: `not ${wrapText(kid.text || 'always')}` });
      } else {
        const d = defs.get(key);
        if (!d) throw new Error(`cond: unknown key "${key}"`);
        const err = d.validate?.(v);
        if (err && err !== true) throw new Error(`cond: ${key}: ${[].concat(err).join('; ')}`);
        const text = d.describe ? d.describe(v) : key;
        parts.push({ test: (x) => !!d.test(v, x), why: (x, out) => out.push(text), text });
      }
    }
    node = {
      test: parts.length === 1 ? parts[0].test : (x) => parts.every((p) => p.test(x)),
      why: (x, out) => { for (const p of parts) if (!p.test(x)) p.why(x, out); },
      text: parts.map((p) => p.text).filter(Boolean).join(', '),
    };
    cache.set(c, node);
    return node;
  }

  const cond = {
    evaluate: (c, cctx) => parse(c).test(cctx),
    /** fn(cctx) -> boolean, parsed once (throws on a bad condition). */
    compile: (c) => parse(c).test,
    explain(c, cctx) {
      const node = parse(c), ok = node.test(cctx), why = [];
      if (!ok) node.why(cctx, why);
      return { ok, why };
    },
    describe: (c) => parse(c).text || 'always',
    /** [] when c parses, else one error message. */
    validate(c) { try { parse(c); return []; } catch (e) { return [e.message.replace(/^cond: /, '')]; } },
    /** Register a key: { validate(v) -> null|string|[string], test(v, cctx) -> bool, describe(v) -> string }. */
    define(key, def) {
      if (!/^[a-z][A-Za-z0-9_.]*$/.test(key) || key === 'all' || key === 'any' || key === 'not') throw new Error(`cond: bad key "${key}"`);
      if (typeof def?.test !== 'function') throw new Error(`cond: ${key} needs a test(v, cctx) function`);
      const old = defs.get(key);
      if (old && !old.soft) throw new Error(`cond: key "${key}" is already defined`);
      defs.set(key, { ...def, soft: false });
      cache = new WeakMap();
    },
    has: (key) => defs.has(key),
    keys: () => [...defs.keys()],
  };
  return cond;
}

export const cond = createCond();

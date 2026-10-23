// Derived items and the content validator behind content.validateAll(). [P]
// Both take a content instance as an argument, so this file never imports core/content.js.
//
// Derived items (docs/ARCHITECTURE.md 3.3): items.js holds tools, seeds, produce and bait; fish, bugs, materials and props
// give one item each, forage and crops too once they carry their own name/icon/prices, a dish recipe gives its item.
// Order: explicit items, crops, forage, fish, bugs, props, materials, dishes. Today's 33 items are a prefix of it.
// A second definition of the same id is an error.

import { schema as defaultSchema } from './schema.js';
import { cond as defaultCond } from './cond.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const defined = (...kv) => Object.fromEntries(kv.filter(([, v]) => v !== undefined));

/** { map: Map(id -> item def), from: Map(id -> 'domain.id'), conflicts: string[] } for a content instance. */
export function deriveItems(content) {
  const map = new Map(), from = new Map(), conflicts = [];
  const put = (id, def, origin) => {
    if (map.has(id)) { conflicts.push(`items.${id}: defined by both ${from.get(id)} and ${origin}`); return; }
    map.set(id, def);
    from.set(id, origin);
  };
  for (const [id, def] of content.items.all()) put(id, def, `items.${id}`);
  for (const [id, c] of content.crops.all()) {
    if (c.seedPrice !== undefined && (c.seedIcon || c.icon)) put(c.seed || `seed_${id}`, defined(['name', `${c.name} seeds`], ['kind', 'seed'], ['crop', id], ['icon', c.seedIcon || c.icon], ['buy', c.seedPrice], ['unlock', c.unlock]), `crops.${id}`);
    if (c.sell !== undefined && c.icon) put(id, { name: c.name, kind: 'produce', icon: c.icon, sell: c.sell }, `crops.${id}`);
  }
  for (const [id, f] of content.forage.all()) if (f.name && f.icon && f.sell !== undefined) put(id, { name: f.name, kind: 'forage', icon: f.icon, sell: f.sell }, `forage.${id}`);
  // legacy: a deep fish is Ebisu's until the fish names its own `unlock`
  for (const [id, f] of content.fish.all()) put(id, defined(['name', f.name], ['kind', 'fish'], ['icon', f.icon || `icons:${id}`], ['sell', f.sell], ['unlock', f.unlock || (f.deep ? 'ebisu' : undefined)]), `fish.${id}`);
  for (const [id, b] of content.bugs.all()) put(id, defined(['name', b.name], ['kind', 'bug'], ['icon', b.icon], ['sell', b.sell]), `bugs.${id}`);
  for (const [id, p] of content.props.all()) if (!p.fixed) put(`prop_${id}`, defined(['name', p.name], ['kind', 'prop'], ['prop', id], ['icon', p.icon || `asset:${p.asset}`], ['buy', p.price], ['sell', Math.floor(p.price / 2)], ['unlock', p.unlock]), `props.${id}`);
  for (const [id, m] of content.materials.all()) put(id, defined(['name', m.name], ['kind', 'material'], ['icon', m.icon], ['sell', m.sell]), `materials.${id}`);
  for (const [id, r] of content.recipes.all()) if (r.kind === 'dish' && r.item) put(id, defined(['name', r.item.name || r.name], ['kind', 'dish'], ['icon', r.item.icon], ['sell', r.item.sell], ['hint', r.item.hint]), `recipes.${id}`);
  return { map, from, conflicts };
}

const condCheck = (cond) => (v) => {
  if (!isObj(v)) return 'expected a condition object';
  const [err] = cond.validate(v);
  return err ? `bad condition: ${err}` : true;
};

// scalar types the validator adds to the schema's own: art references are checked against the maps in opts
const ART = {
  icon: (v, spec, env) => {
    if (typeof v !== 'string' || !/^[a-z0-9_]+:[a-z0-9_]+$/.test(v)) return "expected 'sheet:cell' or 'asset:name'";
    if (!env.sheets && !env.blockouts) return true;
    const [sheet, cell] = v.split(':');
    if (sheet === 'asset') return !env.blockouts || !!env.blockouts[cell] || `unknown blockout "${cell}"`;
    if (!env.sheets) return true;
    if (!env.sheets[sheet]) return `unknown sheet "${sheet}"`;
    return env.sheets[sheet].cells.some(([n]) => n === cell) || `sheet "${sheet}" has no cell "${cell}"`;
  },
  asset: (v, spec, env) => typeof v === 'string' && (!env.blockouts || !!env.blockouts[v] || `unknown blockout "${v}"`),
  canopy: (v, spec, env) => typeof v === 'string' && (!env.canopies || !!env.canopies[v] || `unknown canopy "${v}"`),
  cell: (v, spec, env) => {
    if (typeof v !== 'string' || !v) return 'expected a sprite name';
    const sheet = env.sheets?.[spec.sheet];
    if (!env.sheets) return true;
    if (!sheet) return `unknown sheet "${spec.sheet}"`;
    const names = spec.frames ? Array.from({ length: spec.frames }, (_, i) => `${v}_${i + 1}`) : [v];
    const miss = names.find((n) => !sheet.cells.some(([c]) => c === n));
    return miss === undefined || `sheet "${spec.sheet}" has no cell "${miss}"`;
  },
};

// what an `unlocks: [{ type, id }]` entry of a project may name
const UNLOCK_DOMAIN = { prop: 'props', recipe: 'recipes', blueprint: 'blueprints', region: 'regions', villager: 'villagers', crop: 'crops', fish: 'fish', item: 'items', visitor: 'visitors', fortune: 'fortunes', stamp: 'stamps' };
export const UNLOCK_TYPES = Object.keys(UNLOCK_DOMAIN);

// Rules a field list cannot say. (def, id, report(path, message), ref(domain, id, path), items)
const RULES = {
  props(p, id, bad) {
    if (!p.asset && !p.sprite) bad('', 'needs an asset or a sprite');
    if (!p.asset && !p.icon) bad('icon', 'a prop without a blockout needs an icon');
    if (p.fixed && p.price !== 0) bad('price', 'fixed props are not for sale (price 0)');
    if (!p.fixed && !(p.price > 0)) bad('price', 'a prop for sale needs a price above 0');
  },
  fish(f, id, bad) {
    if (!f.water && !f.when) bad('', 'needs water or a when condition');
    if (f.deep && f.water !== 'sea') bad('deep', 'deep fish live in the sea');
  },
  crops(c, id, bad, ref, items) {
    const seed = c.seed || `seed_${id}`;
    ref('items', id, '');
    if (!c.seed) ref('items', seed, 'seed');
    const s = items.get(seed);
    if (s && s.crop !== id) bad('seed', `item ${seed} belongs to crop ${s.crop}`);
  },
  forage(f, id, bad, ref) { ref('items', id, ''); },
  fortunes(f, id, bad) {
    const seen = new Set();
    for (const [i, o] of (f.offerings || []).entries()) { if (seen.has(o.id)) bad(`offerings[${i}].id`, `duplicate offering "${o.id}"`); seen.add(o.id); }
  },
  recipes(r, id, bad) {
    if (r.item && r.kind !== 'dish') bad('item', 'only a dish recipe defines an item');
    if (r.item && !(id in (r.out || {}))) bad('out', `a dish recipe's output must include its own id "${id}"`);
  },
  projects(p, id, bad, ref) {
    for (const [i, u] of (p.unlocks || []).entries()) {
      if (UNLOCK_DOMAIN[u.type]) ref(UNLOCK_DOMAIN[u.type], u.id, `unlocks[${i}].id`);
      else bad(`unlocks[${i}].type`, `expected one of ${UNLOCK_TYPES.join(', ')}`);
    }
  },
};

/** Item ids that count as present while their (listed, unregistered) owner has not added them yet. */
function softIds(ids) {
  const soft = {};
  const add = (domain, id) => (soft[domain] ||= new Set()).add(id);
  for (const [id, e] of Object.entries(ids)) {
    add(e.domain, id);
    if (e.domain === 'crops') { add('items', id); add('items', `seed_${id}`); }
    else if (e.domain === 'props') add('items', `prop_${id}`);
    else add('items', id);
  }
  return soft;
}

/**
 * Every problem of a content instance as 'domain.id.path: message'.
 * opts: blockouts, sheets, canopies (the maps to check art references against; a missing map skips that check),
 * mode 'fork' (default: a reference to an id listed in `ids` but not yet registered is soft, and every id of `ids`
 * owned by `owner` must exist) or 'merged' (every reference and every id of `ids` must resolve),
 * ids (docs/IDS.json parsed), owner ('wp26'), schema and cond (instances to use instead of the singletons).
 */
export function validateContent(content, opts = {}) {
  const { blockouts, sheets, canopies, mode = 'fork', ids = {}, owner = null, schema = defaultSchema, cond = defaultCond } = opts;
  if (mode !== 'fork' && mode !== 'merged') throw new Error(`content.validateAll: mode must be 'fork' or 'merged', got ${JSON.stringify(mode)}`);
  const errs = [];
  const refs = [];
  const { map: items, from, conflicts } = deriveItems(content);
  errs.push(...conflicts);

  const env = {
    sheets, blockouts, canopies,
    onRef: (domain, id, path) => refs.push({ domain, id, path }),
    types: { cond: condCheck(cond), ...ART },
  };
  const ref = (path) => (domain, id, sub) => refs.push({ domain, id, path: sub ? `${path}.${sub}` : path });

  for (const domain of content.domains) {
    const reg = content.registry(domain);
    if (!schema.has(domain)) { if (reg.size) errs.push(`${domain}: no schema defined for this domain`); continue; }
    for (const [id, def] of reg.entries()) {
      errs.push(...schema.validate(domain, id, def, env));
      const rule = RULES[domain];
      if (rule && isObj(def)) {
        const path = `${domain}.${id}`;
        rule(def, id, (sub, msg) => errs.push(`${sub ? `${path}.${sub}` : path}: ${msg}`), ref(path), items);
      }
    }
  }
  for (const [id, def] of items) if (from.get(id) !== `items.${id}`) errs.push(...schema.validate('items', id, def, env).map((e) => `${e} (derived from ${from.get(id)})`));

  const soft = mode === 'fork' ? softIds(ids) : {};
  const seen = new Set();
  for (const r of refs) {
    const reg = r.domain === 'items' ? items : content.domains.includes(r.domain) ? content.registry(r.domain) : null;
    const key = `${r.path} ${r.domain}.${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!reg) errs.push(`${r.path}: unknown domain "${r.domain}"`);
    else if (!reg.has(r.id) && !soft[r.domain]?.has(r.id)) errs.push(`${r.path}: unknown ${r.domain} "${r.id}"`);
  }

  for (const [id, e] of Object.entries(ids)) {
    if (!content.domains.includes(e.domain)) { errs.push(`ids.${id}: unknown domain "${e.domain}"`); continue; }
    if ((mode === 'merged' || e.owner === owner) && !content.registry(e.domain).has(id)) errs.push(`${e.domain}.${id}: listed in IDS.json for ${e.owner} but not registered`);
  }
  return errs;
}

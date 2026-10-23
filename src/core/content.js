// Content registries: one registry per domain, filled by append-only add() blocks.
// Base content calls addBase, packs call add/override. Imports only the pure schema, condition and check modules.
//
// content.<domain>: get(id) has(id) ids() all() entries() filter(fn(def, id)) byTag(tag) view() size
// all(), filter() and byTag() return [id, def] entries (the shape of Object.entries(FISH)).
// content.itemMap(): Map of every item, the items domain plus the items derived from crops, fish, props ...
// content.validateAll({ blockouts, sheets, canopies, mode, ids, owner }): problems as 'domain.id.path: message'.

import { deriveItems, validateContent } from './content-check.js';

export { validateContent };

export const DOMAINS = ['items', 'props', 'crops', 'fish', 'bugs', 'materials', 'forage', 'recipes', 'blueprints', 'projects', 'regions', 'villagers', 'visitors', 'fortunes', 'festivals', 'stamps'];

const ID = /^[a-z][a-z0-9_]*$/;

function deepFreeze(v) {
  if (!v || typeof v !== 'object' || Object.isFrozen(v)) return v;
  const proto = Object.getPrototypeOf(v);
  if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return v;
  Object.freeze(v);
  for (const k of Object.keys(v)) deepFreeze(v[k]);
  return v;
}

function createRegistry(domain, isFrozen) {
  const defs = new Map();
  let tags = null;
  let view = null;
  const touch = () => { tags = null; view = null; };
  const reg = {
    domain,
    get: (id) => defs.get(id),
    has: (id) => defs.has(id),
    ids: () => [...defs.keys()],
    all: () => [...defs],
    entries: () => [...defs],
    filter: (fn) => [...defs].filter(([id, def]) => fn(def, id)),
    byTag(tag) {
      if (!tags) {
        tags = new Map();
        for (const [id, def] of defs) for (const t of def.tags || []) (tags.get(t) || tags.set(t, []).get(t)).push([id, def]);
      }
      return [...(tags.get(tag) || [])];
    },
    /** { id: def } in registration order; cached and frozen once the content is frozen. */
    view() {
      const frozen = isFrozen();
      if (view && (view.frozen || !frozen)) return view.o;
      const o = Object.fromEntries(defs);
      if (frozen) Object.freeze(o);
      view = { o, frozen };
      return o;
    },
    get size() { return defs.size; },
    _set(id, def) { defs.set(id, def); touch(); },
  };
  return reg;
}

function build() {
  let frozen = false;
  let validator = null;
  let items = null;
  const log = [];
  const registries = {};

  const defineDomain = (name) => {
    if (registries[name]) throw new Error(`content: domain "${name}" already exists`);
    if (name in content) throw new Error(`content: "${name}" is reserved`);
    registries[name] = content[name] = createRegistry(name, () => frozen);
  };
  const registry = (domain) => {
    const r = registries[domain];
    if (!r) throw new Error(`content: unknown domain "${domain}"`);
    return r;
  };
  const mutable = (what) => { if (frozen) throw new Error(`content: ${what} after freeze()`); };

  function apply(op) {
    const reg = registry(op.domain);
    if (op.op === 'add') {
      if (reg.has(op.id)) throw new Error(`content: duplicate ${op.domain} "${op.id}"`);
      reg._set(op.id, op.def);
    } else {
      const old = reg.get(op.id);
      if (!old) throw new Error(`content: override of missing ${op.domain} "${op.id}"`);
      reg._set(op.id, { ...old, ...op.patch });
    }
  }
  function record(op) {
    if (!op.id || typeof op.id !== 'string' || !ID.test(op.id)) throw new Error(`content: bad id "${op.id}" in ${op.domain}`);
    apply(op);
    log.push(op);
  }

  const content = {
    log,
    add(domain, id, def, { layer = 'pack', owner = null } = {}) {
      mutable('add');
      if (!def || typeof def !== 'object') throw new Error(`content: ${domain}.${id} needs an object`);
      record({ op: 'add', domain, id, def, layer, owner });
    },
    /** Shallow merge over an existing entry; later packs win. */
    override(domain, id, patch, { layer = 'pack', owner = null } = {}) {
      mutable('override');
      if (!patch || typeof patch !== 'object') throw new Error(`content: override ${domain}.${id} needs a patch object`);
      record({ op: 'override', domain, id, patch, layer, owner });
    },
    defineDomain(name) { mutable('defineDomain'); defineDomain(name); },
    registry,
    get domains() { return Object.keys(registries); },
    /** Every override applied so far, for the content test: [{ domain, id, fields, owner }]. */
    overrides: () => log.filter((o) => o.op === 'override').map((o) => ({ domain: o.domain, id: o.id, fields: Object.keys(o.patch), owner: o.owner })),
    /** The same content with add/override bound to an owner id (ctx.as('wp26')); registries and reads pass through. */
    as(owner) {
      return Object.assign(Object.create(content), {
        add: (d, i, def, o) => content.add(d, i, def, { ...o, owner }),
        override: (d, i, patch, o) => content.override(d, i, patch, { ...o, owner }),
      });
    },
    freeze() {
      if (frozen) return content;
      frozen = true;
      for (const r of Object.values(registries)) for (const [, def] of r.entries()) deepFreeze(def);
      for (const r of Object.values(registries)) r.view();
      return content;
    },
    get frozen() { return frozen; },
    /** Replaces the validator: fn(content, opts) -> string[] of 'domain.id.path: message'. Instances start with validateContent, empty ones with none. */
    setValidator(fn) { validator = fn; },
    /** Every item as a Map(id -> def) in a stable order (see content-check.js); cached once the content is frozen. */
    itemMap() {
      if (items && frozen) return items;
      const m = deriveItems(content).map;
      if (frozen) items = m;
      return m;
    },
    validateAll(opts) {
      if (!validator) throw new Error('content: no validator installed');
      return validator(content, opts);
    },
    _apply: apply,
  };

  for (const d of DOMAINS) defineDomain(d);
  return content;
}

const singleton = build();
singleton.setValidator(validateContent);

/**
 * An isolated instance. packs:true replays everything registered on the module singleton so
 * far, packs:false only the base layer (golden tests); empty:true starts blank (unit tests).
 */
export function createContent({ packs = true, empty = false } = {}) {
  const c = build();
  if (empty) return c;
  c.setValidator(validateContent);
  for (const d of singleton.domains) if (!c.domains.includes(d)) c.defineDomain(d);
  for (const op of singleton.log) {
    if (!packs && op.layer !== 'base') continue;
    c._apply(op);
    c.log.push(op);
  }
  return c;
}

export const content = singleton;
export const add = singleton.add;
export const override = singleton.override;
export const addBase = (domain, id, def, o) => singleton.add(domain, id, def, { ...o, layer: 'base' });

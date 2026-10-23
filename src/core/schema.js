// Field-spec validator shared by content domains, event payloads and registry definitions. [P]
//
// A spec is a shorthand string or an object:
//   'string' | 'number' | 'int' | 'bool' | 'id' | 'cond' | 'function' | 'object' | 'array' | 'null' | 'any' | <registered type>
//   a trailing '?' marks a field optional ('int?')
//   { type, optional?, nullable?, min?, max?, pattern? }         scalar with constraints
//   { enum: [...] }                                              one of these values
//   { array: spec, len?, minLen?, maxLen? }                      list of one spec
//   { tuple: [spec, ...], ordered? }                             fixed length list, ordered = non-decreasing numbers
//   { fields: { key: spec }, open? }                             object with known keys, unknown keys rejected unless open
//   { map: spec, keys?: spec }                                   object used as a dictionary
//   { any: [spec, ...] }                                         the first spec that accepts the value
//   { ref: 'domain' }                                            a string naming an entry of another domain
// Every validator returns an array of 'path: message' strings (empty when valid).

const IDENT = /^[a-z][a-z0-9_]*$/;
const EXTENSION = /^x_[a-z0-9]+_[A-Za-z0-9_]+$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sub = (path, key) => (path ? `${path}.${key}` : String(key));
const show = (v) => { let s; try { s = JSON.stringify(v) ?? String(v); } catch { s = String(v); } return s.length > 40 ? `${s.slice(0, 37)}...` : s; };

/** A type check returns true, or false, or a message string. */
export const TYPES = {
  string: (v) => typeof v === 'string' && v.length > 0 || 'expected a non-empty string',
  number: (v) => Number.isFinite(v) || 'expected a finite number',
  int: (v) => Number.isInteger(v) || 'expected an integer',
  bool: (v) => typeof v === 'boolean' || 'expected true or false',
  id: (v) => typeof v === 'string' && IDENT.test(v) || 'expected an id (lowercase letters, digits, underscore)',
  cond: (v) => isObj(v) || 'expected a condition object',
  function: (v) => typeof v === 'function' || 'expected a function',
  object: (v) => isObj(v) || 'expected an object',
  array: (v) => Array.isArray(v) || 'expected an array',
  null: (v) => v === null || 'expected null',
  any: () => true,
};

/** Splits a shorthand or object spec into { ...spec, optional }. */
export function normalize(spec) {
  if (typeof spec === 'string') {
    const optional = spec.endsWith('?');
    return { type: optional ? spec.slice(0, -1) : spec, optional };
  }
  if (isObj(spec)) return spec;
  throw new Error(`bad spec ${show(spec)}`);
}

/**
 * Validates `value` against `spec`.
 * env: { types?: extra type checks, ref?(domain, id) -> bool, onRef?(domain, id, path) } (all optional).
 */
export function validate(spec, value, path = '', env = {}) {
  const errs = [];
  check(normalize(spec), value, path, env, errs);
  return errs;
}

/** Validates the fields of an object against a { key: spec } map; unknown keys are errors unless `open`. */
export function validateFields(fields, value, path = '', env = {}, open = false) {
  const errs = [];
  checkFields(fields, value, path, env, open, errs);
  return errs;
}

/** Like validate, but throws one Error listing every problem. */
export function assertValid(spec, value, path = '', env = {}) {
  const errs = validate(spec, value, path, env);
  if (errs.length) throw new Error(errs.join('; '));
}

function checkFields(fields, value, path, env, open, errs) {
  if (!isObj(value)) { errs.push(`${path}: expected an object`); return; }
  for (const key of Object.keys(fields)) {
    const spec = normalize(fields[key]);
    const v = value[key];
    if (v === undefined) {
      if (!spec.optional) errs.push(`${sub(path, key)}: required`);
      continue;
    }
    check(spec, v, sub(path, key), env, errs);
  }
  if (!open) for (const key of Object.keys(value)) if (!(key in fields)) errs.push(`${sub(path, key)}: unknown field`);
}

function check(spec, v, path, env, errs) {
  if (v === undefined) { if (!spec.optional) errs.push(`${path}: required`); return; }
  if (v === null && spec.nullable) return;
  if (spec.enum) {
    if (!spec.enum.includes(v)) errs.push(`${path}: expected one of ${spec.enum.map(show).join(', ')}, got ${show(v)}`);
    return;
  }
  if (spec.any) {
    const tries = spec.any.map((s) => validate(s, v, path, env));
    if (tries.every((t) => t.length)) errs.push(`${path}: ${show(v)} matches none of the allowed forms`);
    return;
  }
  if (spec.array) {
    if (!Array.isArray(v)) { errs.push(`${path}: expected an array`); return; }
    if (spec.len !== undefined && v.length !== spec.len) errs.push(`${path}: expected ${spec.len} items, got ${v.length}`);
    if (spec.minLen !== undefined && v.length < spec.minLen) errs.push(`${path}: expected at least ${spec.minLen} items, got ${v.length}`);
    if (spec.maxLen !== undefined && v.length > spec.maxLen) errs.push(`${path}: expected at most ${spec.maxLen} items, got ${v.length}`);
    const item = normalize(spec.array);
    v.forEach((x, i) => check(item, x, `${path}[${i}]`, env, errs));
    return;
  }
  if (spec.tuple) {
    if (!Array.isArray(v)) { errs.push(`${path}: expected an array`); return; }
    if (v.length !== spec.tuple.length) { errs.push(`${path}: expected ${spec.tuple.length} items, got ${v.length}`); return; }
    const before = errs.length;
    spec.tuple.forEach((s, i) => check(normalize(s), v[i], `${path}[${i}]`, env, errs));
    if (spec.ordered && errs.length === before) for (let i = 1; i < v.length; i++) if (v[i] < v[i - 1]) { errs.push(`${path}: expected ascending values, got ${show(v)}`); break; }
    return;
  }
  if (spec.fields) { checkFields(spec.fields, v, path, env, !!spec.open, errs); return; }
  if (spec.map) {
    if (!isObj(v)) { errs.push(`${path}: expected an object`); return; }
    const val = normalize(spec.map), keys = spec.keys && normalize(spec.keys);
    for (const k of Object.keys(v)) {
      if (keys) check(keys, k, `${sub(path, k)} (key)`, env, errs);
      check(val, v[k], sub(path, k), env, errs);
    }
    return;
  }
  if (spec.ref) {
    if (typeof v !== 'string' || !v) { errs.push(`${path}: expected an id of ${spec.ref}`); return; }
    if (env.onRef) env.onRef(spec.ref, v, path);
    else if (env.ref && !env.ref(spec.ref, v)) errs.push(`${path}: unknown ${spec.ref} ${show(v)}`);
    return;
  }
  const test = (env.types && env.types[spec.type]) || TYPES[spec.type];
  if (!test) { errs.push(`${path}: unknown type ${show(spec.type)}`); return; }
  const r = test(v, spec, env);
  if (r !== true) { errs.push(`${path}: ${typeof r === 'string' ? r : `expected ${spec.type}`}, got ${show(v)}`); return; }
  if (typeof v === 'number') {
    if (spec.min !== undefined && v < spec.min) errs.push(`${path}: ${v} is below ${spec.min}`);
    if (spec.max !== undefined && v > spec.max) errs.push(`${path}: ${v} is above ${spec.max}`);
  } else if (typeof v === 'string' && spec.pattern && !new RegExp(spec.pattern).test(v)) errs.push(`${path}: ${show(v)} does not match ${spec.pattern}`);
}

/** An isolated set of domain schemas. The module singleton `schema` is one of these. */
export function createSchema() {
  const domains = new Map();   // domain -> { base: frozen fields, ext: { field: spec }, owners: { field: owner }, open }
  const types = {};

  const need = (domain) => {
    const d = domains.get(domain);
    if (!d) throw new Error(`schema: unknown domain '${domain}'`);
    return d;
  };

  function build(owner) {
    const api = {
      owner,
      /** Declares a domain with its base fields (frozen). Unknown fields are rejected unless opts.open. */
      define(domain, fields, opts = {}) {
        if (domains.has(domain)) throw new Error(`schema: domain '${domain}' is already defined`);
        const base = {};
        for (const k of Object.keys(fields)) base[k] = Object.freeze(normalize(fields[k]));
        domains.set(domain, { base: Object.freeze(base), ext: {}, owners: {}, open: !!opts.open });
        return api;
      },
      /** A WP adds one namespaced optional field to a domain: schema.extend('crops', 'x_wp26_compost', 'bool'). */
      extend(domain, field, spec) {
        const d = need(domain);
        if (!EXTENSION.test(field)) throw new Error(`schema.extend: '${field}' must look like x_wp26_name`);
        if (field in d.base || field in d.ext) throw new Error(`schema.extend: '${domain}.${field}' already exists`);
        d.ext[field] = Object.freeze({ ...normalize(spec), optional: true });
        d.owners[field] = owner;
        return api;
      },
      /** Registers a scalar type: check(value, spec, env) -> true | false | message. */
      type(name, fn) {
        if (name in TYPES || name in types) throw new Error(`schema.type: '${name}' already exists`);
        types[name] = fn;
        return api;
      },
      has: (domain) => domains.has(domain),
      domains: () => [...domains.keys()],
      /** Base fields then extension fields. */
      fields: (domain) => { const d = need(domain); return { ...d.base, ...d.ext }; },
      baseFields: (domain) => need(domain).base,
      /** [{ field, owner }] for every extension of a domain, or of all domains. */
      extensions(domain) {
        const out = [];
        for (const [name, d] of domains) if (!domain || domain === name) for (const field of Object.keys(d.ext)) out.push({ domain: name, field, owner: d.owners[field] });
        return out;
      },
      /** Errors for one entry, as 'domain.id.path: message'. */
      validate(domain, id, def, env = {}) {
        const d = domains.get(domain);
        const path = `${domain}.${id}`;
        if (!d) return [`${path}: unknown domain '${domain}'`];
        return validateFields({ ...d.base, ...d.ext }, def, path, { ...env, types: { ...types, ...env.types } }, d.open);
      },
      /** validate() for a free spec using this instance's registered types. */
      validateValue: (spec, value, path = '', env = {}) => validate(spec, value, path, { ...env, types: { ...types, ...env.types } }),
      as: (o) => build(o),
    };
    return api;
  }
  return build(null);
}

export const schema = createSchema();

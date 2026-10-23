// Save storage: slots in a Web Storage object (injected, so it runs in Node), a backup slot, quarantine copies,
// the dev namespace, portable RCV2 codes, and the load-safety states of docs/ARCHITECTURE.md 3.7.
// A save that cannot be read is never overwritten: inspect() copies it to a quarantine key and locks writes.
import { SAVE_VERSION } from './migrations/index.js';

const NS = 'rokugan-cozy-village/save/';
export const SAVE_KEY = `${NS}v1`; // slot name kept from v1 so old saves still load
export const BACKUP_KEY = `${NS}backup`;
export const PRE_V4_KEY = `${NS}pre-v4`;
export const QUARANTINE_PREFIX = `${NS}quarantine-`;
export const DEV_KEY = `${NS}dev`;
export const DEV_BACKUP_KEY = `${NS}dev-backup`;
export const DEV_PRE_V4_KEY = `${NS}dev-pre-v4`;
export const DEV_QUARANTINE_PREFIX = `${NS}dev-quarantine-`;
export const CODE_PREFIX = 'RCV2';

export const keysFor = (dev) => (dev
  ? { main: DEV_KEY, backup: DEV_BACKUP_KEY, pre: DEV_PRE_V4_KEY, quarantine: DEV_QUARANTINE_PREFIX }
  : { main: SAVE_KEY, backup: BACKUP_KEY, pre: PRE_V4_KEY, quarantine: QUARANTINE_PREFIX });

/** A Web Storage look-alike for tests and Node tools. */
export function createMemoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); },
    dump: () => Object.fromEntries(m),
  };
}

const reasonOf = (e) => (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014) ? 'quota' : 'denied');
const peekVersion = (raw) => { const m = typeof raw === 'string' && raw.slice(0, 40).match(/^\{\s*"v"\s*:\s*(\d+)/); return m ? Number(m[1]) : null; };
const peekSavedAt = (raw) => { try { const t = JSON.parse(raw).savedAt; return Number.isFinite(t) ? Math.floor(t) : null; } catch { return null; } };

/**
 * opts: storage, save (a createSave() instance), dev (false | true | 'reset' | 'empty'), now() -> ms, strict.
 * Locks: while any is set the store is read-only. inspect() sets 'unreadable' or 'future'; the caller may add
 * its own ('time' for a dev clock or a `?date` session, 'build' for a stale module graph).
 */
export function createSaveStorage({ storage, save, dev = false, now = () => 0, strict = false } = {}) {
  const k = keysFor(dev);
  const locks = new Set();
  let inspected = false, trusted = false, quarantineKey = null;
  let rawMain = null, rawBackup = null;

  const get = (key) => { try { return storage.getItem(key); } catch { return null; } };
  const set = (key, v) => storage.setItem(key, v);
  const del = (key) => { try { storage.removeItem(key); } catch { /* ignore */ } };

  if (dev) {
    if (dev === 'empty') { del(k.main); del(k.backup); del(k.pre); } else if ((dev === 'reset' || get(k.main) == null) && get(SAVE_KEY) != null) {
      try { set(k.main, get(SAVE_KEY)); const b = get(BACKUP_KEY); if (b != null) set(k.backup, b); else del(k.backup); } catch { /* quota: dev starts blank */ }
    }
  }

  const prepareRaw = (raw) => save.prepare(raw);

  function quarantine(reason, slices = null) {
    const stamp = peekSavedAt(rawMain ?? rawBackup) ?? now();
    const body = { v: 1, at: now(), reason, main: rawMain, backup: rawBackup };
    if (slices) body.slices = slices;
    try {
      let key = `${k.quarantine}${stamp}`;
      for (let n = 2; n < 100; n++) {
        const cur = get(key);
        if (cur == null) break;
        let same = false;
        try { const c = JSON.parse(cur); same = c.main === body.main && c.backup === body.backup; } catch { /* a foreign value: pick the next key */ }
        if (same) break;
        key = `${k.quarantine}${stamp}-${n}`;
      }
      set(key, JSON.stringify(body));
      quarantineKey = key;
    } catch { quarantineKey = null; }
    return quarantineKey;
  }

  const store = {
    keys: k,
    get readOnly() { return locks.size > 0; },
    get locks() { return [...locks]; },
    lock(reason) { locks.add(reason); },
    unlock(reason) { locks.delete(reason); },
    get quarantineKey() { return quarantineKey; },
    has() { return get(k.main) != null || get(k.backup) != null; },

    /** none | ok | unreadable | future. Unreadable and future copy the raw slots to quarantine and lock writes; nothing else is touched. */
    inspect() {
      inspected = true;
      rawMain = get(k.main);
      rawBackup = get(k.backup);
      quarantineKey = null;
      if (rawMain == null && rawBackup == null) { trusted = true; return { state: 'none' }; }
      const source = rawMain != null ? 'main' : 'backup';
      const raw = source === 'main' ? rawMain : rawBackup;
      const prep = prepareRaw(raw);
      if (prep.state === 'ok') {
        trusted = true;
        if (prep.from < SAVE_VERSION && get(k.pre) == null) { try { set(k.pre, raw); } catch { /* the original stays where it is */ } }
        return { ...prep, source, raw };
      }
      trusted = false;
      locks.add(prep.state);
      const backup = rawBackup == null ? 'none' : source === 'backup' ? 'same' : prepareRaw(rawBackup).state;
      return { ...prep, source, raw, backup, quarantineKey: quarantine(prep.reason) };
    },

    /** A slice's load threw after a good inspect(): keep its JSON, lock writes. */
    sliceFailed(failed, env) {
      locks.add('unreadable');
      trusted = false;
      const slices = Object.fromEntries(failed.map((f) => [f.slice, JSON.stringify(env?.slices?.[f.slice] ?? null)]));
      return quarantine('slice', slices);
    },

    /** Check any slot ('main' | 'backup' | 'pre') without side effects. */
    inspectSlot(which) {
      const raw = get(k[which === 'main' ? 'main' : which === 'backup' ? 'backup' : 'pre']);
      return raw == null ? { state: 'none' } : { ...prepareRaw(raw), raw };
    },

    /** Make `raw` (a slot, or a decoded code) the main save after a failed load. Quarantines first; returns the new inspect(). */
    adopt(raw) {
      const prep = prepareRaw(raw);
      if (prep.state !== 'ok') return { ok: false, state: prep.state, reason: prep.reason };
      if (!inspected) store.inspect();
      if ((rawMain != null || rawBackup != null) && !quarantineKey && !quarantine('adopt')) return { ok: false, reason: 'quarantine' };
      try { set(k.main, raw); } catch (e) { return { ok: false, reason: reasonOf(e) }; }
      locks.delete('unreadable'); locks.delete('future');
      return { ok: true, ...store.inspect() };
    },

    /** -> { ok, reason?, backup? }. Refuses in read-only mode (throws when strict) and never writes anything it cannot re-parse. */
    writeSave(data, { backup = false } = {}) {
      if (!inspected) store.inspect();
      const refuse = (reason, detail) => {
        if (strict) throw new Error(`save refused: ${reason}${detail ? ` (${detail})` : ''}`);
        return { ok: false, reason };
      };
      if (locks.size) return refuse('readonly', [...locks].join(','));
      let json;
      try {
        json = typeof data === 'string' ? data : JSON.stringify(data);
        const back = JSON.parse(json);
        if (back.v !== SAVE_VERSION || !back.slices || typeof back.slices !== 'object') throw new Error('not a v4 envelope');
      } catch { return { ok: false, reason: 'serialize' }; }
      const onDisk = peekVersion(get(k.main));
      if (onDisk != null && onDisk > SAVE_VERSION) { locks.add('future'); return refuse('readonly', 'future'); } // another tab saved with a newer build
      try { set(k.main, json); } catch (e) { return { ok: false, reason: reasonOf(e) }; }
      let wroteBackup = false;
      if (backup && trusted) { try { set(k.backup, json); wroteBackup = true; } catch { /* the main slot is saved; the backup waits */ } }
      return { ok: true, backup: wroteBackup };
    },

    /** Remove the main and backup slots (a deliberate reset). Not allowed while read-only. */
    clear() {
      if (locks.size) return { ok: false, reason: 'readonly' };
      del(k.main); del(k.backup);
      return { ok: true };
    },

    quarantines() {
      const out = [];
      try { for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key && key.startsWith(k.quarantine)) out.push(key); } } catch { /* ignore */ }
      return out.sort();
    },
    readRaw: (key) => get(key),

    /** RCV2 text -> checked save. Throws a friendly message when it is not a usable code. */
    async importCode(code) {
      const prep = save.prepare(await decodeCode(code));
      if (prep.state === 'future') throw new Error('That code was made by a newer version of the game.');
      if (prep.state !== 'ok') throw new Error('That code is from an unknown version of the game.');
      return prep;
    },
    encodeCode: (data) => encodeCode(data),
  };
  return store;
}

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Save data -> short text code ("RCV2z:..." gzipped, or "RCV2:..." plain JSON base64). */
export async function encodeCode(data) {
  const raw = new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data));
  if (typeof CompressionStream === 'function') {
    try { return `${CODE_PREFIX}z:${toB64(await pipe(raw, new CompressionStream('gzip')))}`; } catch { /* fall through */ }
  }
  return `${CODE_PREFIX}:${toB64(raw)}`;
}

const NOT_A_CODE = 'That doesn’t look like a village code.';

/** Text code -> the parsed JSON inside (any save version; run save.prepare on it). Throws a friendly message if it isn't a code. */
export async function decodeCode(code) {
  const m = String(code).trim().replace(/\s+/g, '').match(/^RCV(\d+)(z?):([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error(NOT_A_CODE);
  let bytes;
  try { bytes = fromB64(m[3]); } catch { throw new Error(NOT_A_CODE); }
  if (m[2]) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can’t unpack that code.');
    try { bytes = await pipe(bytes, new DecompressionStream('gzip')); } catch { throw new Error(NOT_A_CODE); }
  }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(NOT_A_CODE); }
}

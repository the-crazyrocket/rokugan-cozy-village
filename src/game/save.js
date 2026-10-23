// Save storage: versioned JSON in localStorage with a rolling backup slot,
// migrations from older versions, and portable save codes (gzip + base64) for
// backing a village up or moving it to another browser / the installed app.
export const SAVE_KEY = 'rokugan-cozy-village/save/v1'; // slot name kept from v1 so old saves still load
export const BACKUP_KEY = 'rokugan-cozy-village/save/backup';
export const SAVE_VERSION = 2;
const CODE_PREFIX = 'RCV2';

// v1 stored crop growth in ms at these stage lengths; v2 stores progress in stages.
const V1_STAGE_MS = { rice: 60_000, daikon: 90_000, tea: 120_000 };

/** Bring any known save version up to SAVE_VERSION (or null if unusable). */
export function migrate(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.props)) return null;
  if (s.v === 1) {
    s = {
      ...s, v: 2, timeOffset: 0, daily: null, stats: {},
      farm: (s.farm || []).map((c) => ({ type: c.type, x: c.x, z: c.z, progress: c.growth / (V1_STAGE_MS[c.type] || 60_000), last: c.last, wet: !!c.wet })),
    };
  }
  return s.v === SAVE_VERSION ? s : null;
}

function readSlot(key) {
  try { return migrate(JSON.parse(localStorage.getItem(key) || 'null')); } catch { return null; }
}

/** The current save, falling back to the backup slot if the main one is damaged. */
export function readSave() { return readSlot(SAVE_KEY) || readSlot(BACKUP_KEY); }

export function writeSave(data, { backup = false } = {}) {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, json);
    if (backup) localStorage.setItem(BACKUP_KEY, json);
    return true;
  } catch { return false; } // storage full / private mode
}

export function hasSave() {
  try { return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(BACKUP_KEY)); } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ save codes
const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Save data -> short text code ("RCV2z:..." gzipped, or "RCV2:..." plain JSON base64). */
export async function encodeSave(data) {
  const raw = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') {
    try { return `${CODE_PREFIX}z:${toB64(await pipe(raw, new CompressionStream('gzip')))}`; } catch { /* fall through */ }
  }
  return `${CODE_PREFIX}:${toB64(raw)}`;
}

/** Text code -> migrated save data. Throws with a friendly message if it isn't a save. */
export async function decodeSave(code) {
  const m = String(code).trim().replace(/\s+/g, '').match(/^RCV(\d+)(z?):([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('That doesn’t look like a village code.');
  let bytes = fromB64(m[3]);
  if (m[2]) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser can’t unpack that code.');
    bytes = await pipe(bytes, new DecompressionStream('gzip'));
  }
  const data = migrate(JSON.parse(new TextDecoder().decode(bytes)));
  if (!data) throw new Error('That code is from an unknown version of the game.');
  return data;
}

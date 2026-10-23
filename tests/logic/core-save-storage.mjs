// core/save-storage.js: slots, backup, quarantine, load-safety states, dev namespace, RCV2 codes.
import assert from 'node:assert/strict';
import {
  createSaveStorage, createMemoryStorage, encodeCode, decodeCode,
  SAVE_KEY, BACKUP_KEY, PRE_V4_KEY, DEV_KEY, DEV_BACKUP_KEY, QUARANTINE_PREFIX, DEV_QUARANTINE_PREFIX,
} from '../../src/core/save-storage.js';
import { readFixture, clone } from '../lib/fixtures.mjs';
import { makeSave, makeCtx } from '../lib/v4-slices.mjs';

const save = makeSave();
const v3 = readFixture('save-v3-mid.json');
const raw3 = JSON.stringify(v3);
const env4 = () => save.serialize(loadedCtx(), { savedAt: v3.savedAt, timeOffset: 600000 });
function loadedCtx() { const ctx = makeCtx(); save.load(save.prepare(v3), ctx); return ctx; }
const raw4 = () => JSON.stringify(env4());

let clock = 5000;
const make = (initial = {}, opts = {}) => {
  const storage = createMemoryStorage(initial);
  return { storage, store: createSaveStorage({ storage, save, now: () => clock, ...opts }) };
};
const quarantineKeys = (storage) => Object.keys(storage.dump()).filter((k) => k.includes('quarantine'));

/** A storage that logs every write and removal. */
function spy(initial) {
  const inner = createMemoryStorage(initial);
  const log = [];
  return { inner, log, storage: { ...inner, get length() { return inner.length; }, key: inner.key, getItem: inner.getItem, setItem(k, v) { log.push(['set', k]); inner.setItem(k, v); }, removeItem(k) { log.push(['remove', k]); inner.removeItem(k); } } };
}

function none() {
  const { storage, store } = make();
  assert.deepEqual(store.inspect(), { state: 'none' });
  assert.equal(store.has(), false);
  assert.equal(store.readOnly, false);
  const w = store.writeSave(env4(), { backup: true });
  assert.deepEqual(w, { ok: true, backup: true });
  assert.equal(storage.getItem(SAVE_KEY), storage.getItem(BACKUP_KEY));
  assert.equal(store.has(), true);
  const again = store.inspect();
  assert.equal(again.state, 'ok');
  assert.equal(again.source, 'main');
  assert.equal(again.from, 4);
  assert.deepEqual(again.env, JSON.parse(storage.getItem(SAVE_KEY)));
  assert.equal(storage.getItem(PRE_V4_KEY), null, 'no pre-v4 copy for a v4 save');
  assert.deepEqual(store.writeSave(env4()), { ok: true, backup: false }, 'backup only on request');
  assert.deepEqual(quarantineKeys(storage), []);
  // load straight from an inspect result
  assert.equal(save.load(again, makeCtx()).state, 'ok');
}

function v3Upgrade() {
  const { storage, store } = make({ [SAVE_KEY]: raw3 });
  const r = store.inspect();
  assert.equal(r.state, 'ok');
  assert.equal(r.from, 3);
  assert.equal(r.env.v, 4);
  assert.equal(storage.getItem(PRE_V4_KEY), raw3, 'the raw v3 JSON is copied once');
  assert.equal(storage.getItem(SAVE_KEY), raw3, 'inspect does not rewrite the save');
  storage.setItem(SAVE_KEY, JSON.stringify({ ...v3, money: 1 }));
  store.inspect();
  assert.equal(storage.getItem(PRE_V4_KEY), raw3, 'and never copies again');
  assert.equal(store.writeSave(env4()).ok, true);
  assert.equal(store.inspect().from, 4);
  assert.equal(storage.getItem(PRE_V4_KEY), raw3);
}

function unreadable() {
  const garbage = '{"v":4,"slices":{"core":'; // a truncated write
  const backup = raw4();
  const { storage, store } = make({ [SAVE_KEY]: garbage, [BACKUP_KEY]: backup, other: 'x' });
  const before = storage.dump();
  const r = store.inspect();
  assert.equal(r.state, 'unreadable');
  assert.equal(r.reason, 'json');
  assert.equal(r.backup, 'ok', 'the card is told the backup could be restored');
  assert.equal(store.readOnly, true);
  assert.deepEqual(store.locks, ['unreadable']);
  const qk = quarantineKeys(storage);
  assert.equal(qk.length, 1);
  assert.equal(qk[0], `${QUARANTINE_PREFIX}5000`, 'named after savedAt, or now when unreadable');
  assert.equal(r.quarantineKey, qk[0]);
  const q = JSON.parse(storage.getItem(qk[0]));
  assert.equal(q.main, garbage);
  assert.equal(q.backup, backup);
  assert.equal(q.reason, 'json');
  // every other key is byte-identical
  const after = storage.dump();
  delete after[qk[0]];
  assert.deepEqual(after, before);
  // never overwritten
  assert.deepEqual(store.writeSave(env4(), { backup: true }), { ok: false, reason: 'readonly' });
  assert.deepEqual(store.clear(), { ok: false, reason: 'readonly' });
  assert.equal(storage.getItem(SAVE_KEY), garbage);
  assert.equal(storage.getItem(BACKUP_KEY), backup);
  // asking again changes nothing and does not pile up quarantine copies
  assert.equal(store.inspect().state, 'unreadable');
  assert.equal(quarantineKeys(storage).length, 1);
  // a strict store throws instead
  const strictStore = createSaveStorage({ storage, save, strict: true, now: () => clock });
  strictStore.inspect();
  assert.throws(() => strictStore.writeSave(env4()), /readonly/);
  assert.equal(storage.getItem(SAVE_KEY), garbage);

  // restoring the backup is explicit: quarantine first, then the backup becomes the main save
  assert.deepEqual(store.inspectSlot('backup').state, 'ok');
  const res = store.adopt(storage.getItem(BACKUP_KEY));
  assert.equal(res.ok, true);
  assert.equal(res.state, 'ok');
  assert.equal(store.readOnly, false);
  assert.equal(storage.getItem(SAVE_KEY), backup);
  assert.equal(JSON.parse(storage.getItem(qk[0])).main, garbage, 'the bad copy is still in quarantine');
  assert.equal(store.writeSave(env4()).ok, true);

  // a save that parses but whose migration throws is unreadable too
  const brokenV3 = JSON.stringify({ ...v3, props: 'oops' });
  const b = make({ [SAVE_KEY]: brokenV3 });
  assert.equal(b.store.inspect().state, 'unreadable');
  assert.equal(b.storage.getItem(SAVE_KEY), brokenV3);
  assert.equal(b.store.writeSave(env4()).ok, false);
  assert.equal(b.store.inspect().backup, 'none');

  // two different bad saves at the same instant get different quarantine keys
  const c = make({ [SAVE_KEY]: 'junk-1' });
  c.store.inspect();
  c.storage.setItem(SAVE_KEY, 'junk-2');
  c.store.inspect();
  assert.equal(quarantineKeys(c.storage).length, 2);

  // main missing, backup unreadable
  const d = make({ [BACKUP_KEY]: 'nope' });
  assert.equal(d.store.inspect().state, 'unreadable');
  assert.equal(d.store.inspect().source, 'backup');
  assert.equal(d.storage.getItem(SAVE_KEY), null, 'no main slot was invented');

  // adopt refuses junk and keeps the lock
  assert.deepEqual(b.store.adopt('junk'), { ok: false, state: 'unreadable', reason: 'json' });
  assert.equal(b.store.readOnly, true);
}

function future() {
  const e = env4();
  const cases = {
    envelope: JSON.stringify({ ...e, v: 99, extra: { new: true } }),
    slice: JSON.stringify({ ...e, slices: { ...e.slices, world: { v: 2, d: { newShape: 1 } } } }),
  };
  for (const [kind, rawFuture] of Object.entries(cases)) {
    const { storage, store } = make({ [SAVE_KEY]: rawFuture, [BACKUP_KEY]: raw4() });
    const r = store.inspect();
    assert.equal(r.state, 'future', kind);
    assert.equal(r.reason, kind);
    if (kind === 'slice') assert.deepEqual(r.newer, ['world']);
    assert.equal(r.backup, 'ok');
    assert.equal(storage.getItem(SAVE_KEY), rawFuture, 'preserved byte for byte');
    assert.equal(store.readOnly, true);
    assert.deepEqual(store.writeSave(raw4(), { backup: true }), { ok: false, reason: 'readonly' });
    assert.equal(storage.getItem(SAVE_KEY), rawFuture);
    assert.equal(JSON.parse(storage.getItem(quarantineKeys(storage)[0])).main, rawFuture);
    assert.equal(save.load(r, makeCtx()).state, 'future');
  }

  // another tab saved a newer version after this session loaded: the write is refused and the save is kept
  const { storage, store } = make({ [SAVE_KEY]: raw4() });
  assert.equal(store.inspect().state, 'ok');
  const newer = JSON.stringify({ v: 5, slices: {} });
  storage.setItem(SAVE_KEY, newer);
  assert.deepEqual(store.writeSave(env4()), { ok: false, reason: 'readonly' });
  assert.equal(storage.getItem(SAVE_KEY), newer);
  assert.equal(store.readOnly, true);
}

function writes() {
  // quota and denied
  for (const [name, code, reason] of [['QuotaExceededError', 22, 'quota'], ['Anything', 1014, 'quota'], ['SecurityError', 18, 'denied']]) {
    const { storage, store } = make({ [SAVE_KEY]: raw4() });
    const before = storage.dump();
    store.inspect();
    storage.setItem = () => { throw Object.assign(new Error('x'), { name, code }); };
    assert.deepEqual(store.writeSave(env4(), { backup: true }), { ok: false, reason }, name);
    assert.deepEqual(storage.dump(), before, 'a failed write changes nothing');
    assert.equal(store.readOnly, false, 'a full disk is not a lock');
  }
  // a throwing backup still reports the main save as written
  const s = createMemoryStorage({ [SAVE_KEY]: raw4() });
  const store = createSaveStorage({ storage: s, save });
  store.inspect();
  const set = s.setItem;
  s.setItem = (k, v) => { if (k === BACKUP_KEY) throw new Error('full'); set(k, v); };
  assert.deepEqual(store.writeSave(env4(), { backup: true }), { ok: true, backup: false });
  // data that cannot be serialised or is not a v4 envelope is never written
  const circular = { v: 4, slices: {} }; circular.self = circular;
  const m = make({ [SAVE_KEY]: raw4() });
  const was = m.storage.getItem(SAVE_KEY);
  for (const bad of [circular, { v: 3 }, { v: 4 }, { v: 4, slices: 1 }, 'not json', null]) assert.deepEqual(m.store.writeSave(bad), { ok: false, reason: 'serialize' });
  assert.equal(m.storage.getItem(SAVE_KEY), was);
  // a strings is written as is
  assert.equal(m.store.writeSave(raw4()).ok, true);
  // backups come only from a state that loaded: never from an unread slot
  const u = make({ [SAVE_KEY]: raw4() });
  assert.equal(u.store.writeSave(env4(), { backup: true }).backup, true, 'a lazy inspect runs first and trusts a readable save');
  // locks from outside (dev clock, stale build)
  const l = make();
  l.store.inspect();
  l.store.lock('time');
  assert.deepEqual(l.store.writeSave(env4()), { ok: false, reason: 'readonly' });
  assert.equal(l.storage.getItem(SAVE_KEY), null);
  l.store.unlock('time');
  assert.equal(l.store.writeSave(env4()).ok, true);
  assert.deepEqual(l.store.clear(), { ok: true });
  assert.equal(l.store.has(), false);

  // a slice that fails to load after a good inspect: the slice JSON is quarantined and writes stop
  const f = make({ [SAVE_KEY]: raw4() });
  const r = f.store.inspect();
  const qk = f.store.sliceFailed([{ slice: 'farming', error: new Error('x') }], r.env);
  assert.equal(f.store.readOnly, true);
  const q = JSON.parse(f.storage.getItem(qk));
  assert.equal(q.main, raw4());
  assert.deepEqual(JSON.parse(q.slices.farming), r.env.slices.farming);
  assert.equal(f.store.writeSave(env4()).ok, false);
}

function dev() {
  const real = raw4();
  const backup = raw3;
  const { inner, log, storage } = spy({ [SAVE_KEY]: real, [BACKUP_KEY]: backup });
  const before = inner.dump();
  const store = createSaveStorage({ storage, save, dev: true, now: () => clock });
  assert.equal(store.keys.main, DEV_KEY);
  assert.equal(inner.getItem(DEV_KEY), real, 'first use copies the real save');
  assert.equal(inner.getItem(DEV_BACKUP_KEY), backup);
  assert.equal(store.inspect().state, 'ok');
  const e = env4();
  e.savedAt += 777;
  assert.equal(store.writeSave(e, { backup: true }).ok, true);
  assert.equal(inner.getItem(DEV_KEY), JSON.stringify(e));
  assert.equal(inner.getItem(SAVE_KEY), real);
  assert.equal(inner.getItem(BACKUP_KEY), backup);
  assert.deepEqual(log.filter(([, k]) => k === SAVE_KEY || k === BACKUP_KEY), [], 'the real keys are never written or removed');
  assert.deepEqual({ ...inner.dump(), [DEV_KEY]: 0, [DEV_BACKUP_KEY]: 0 }, { ...before, [DEV_KEY]: 0, [DEV_BACKUP_KEY]: 0 });

  // the copy happens once: later sessions keep the dev progress; ?dev=reset recopies; ?dev=empty starts blank
  inner.setItem(SAVE_KEY, raw3);
  const again = createSaveStorage({ storage, save, dev: true });
  assert.equal(again.inspect().state, 'ok');
  assert.equal(inner.getItem(DEV_KEY), JSON.stringify(e));
  createSaveStorage({ storage, save, dev: 'reset' });
  assert.equal(inner.getItem(DEV_KEY), raw3);
  const empty = createSaveStorage({ storage, save, dev: 'empty' });
  assert.deepEqual(empty.inspect(), { state: 'none' });
  assert.equal(inner.getItem(DEV_KEY), null);
  assert.equal(inner.getItem(SAVE_KEY), raw3);
  assert.deepEqual(log.filter(([, k]) => k === SAVE_KEY || k === BACKUP_KEY).slice(0), [], 'still untouched');

  // a bad dev copy quarantines inside the dev namespace
  const bad = spy({ [SAVE_KEY]: 'garbage' });
  const ds = createSaveStorage({ storage: bad.storage, save, dev: true, now: () => 9 });
  assert.equal(ds.inspect().state, 'unreadable');
  assert.ok(bad.inner.getItem(`${DEV_QUARANTINE_PREFIX}9`));
  assert.equal(bad.inner.getItem(`${QUARANTINE_PREFIX}9`), null);
  assert.equal(bad.inner.getItem(SAVE_KEY), 'garbage');
  assert.deepEqual(bad.log.filter(([, k]) => k === SAVE_KEY), []);
  assert.deepEqual(ds.quarantines(), [`${DEV_QUARANTINE_PREFIX}9`]);
  // dev with no real save starts blank
  assert.deepEqual(createSaveStorage({ storage: createMemoryStorage(), save, dev: true }).inspect(), { state: 'none' });
}

async function codes() {
  const { store } = make();
  const e = env4();
  const code = await store.encodeCode(e);
  assert.match(code, /^RCV2z?:[A-Za-z0-9+/=]+$/);
  assert.deepEqual(await decodeCode(code), e);
  const prep = await store.importCode(`  ${code}\n`);
  assert.deepEqual(prep.env, e);
  // an old v3 code arrives migrated, with the old fixtures too
  for (const f of ['save-v1.json', 'save-v2.json', 'save-v3-ebisu.json']) {
    const p = await store.importCode(await encodeCode(readFixture(f)));
    assert.equal(p.env.v, 4, f);
  }
  assert.match(await encodeCode(e), /^RCV2z?:/);
  await assert.rejects(store.importCode('not a code'), /village code/);
  await assert.rejects(store.importCode('RCV2:@@@@'), /village code/);
  await assert.rejects(store.importCode(`RCV2:${btoa('{nope')}`), /village code/);
  await assert.rejects(store.importCode(`RCV2z:${btoa('not gzip')}`), /village code/);
  await assert.rejects(store.importCode(await encodeCode({ v: 9, props: [] })), /newer version/);
  await assert.rejects(store.importCode(await encodeCode({ v: 3, props: 'x' })), /unknown version/);
  await assert.rejects(store.importCode(await encodeCode([1, 2])), /unknown version/);
  assert.deepEqual(clone(await decodeCode(await encodeCode('{"a":1}'))), { a: 1 }, 'a string is encoded as is');
}

export default async function () {
  none();
  v3Upgrade();
  unreadable();
  future();
  writes();
  dev();
  await codes();
}

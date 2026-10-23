#!/usr/bin/env node
// Parallel-work helper. Git worktrees can't carry uncommitted work, so an agent
// gets an isolated COPY of the working tree (node_modules symlinked, own .git
// with a "fork-base" tag on the state it started from). When it is done its
// changes are merged back file by file with a 3-way merge (base = the fork-base
// state, ours = the main tree now, theirs = the fork). Nothing in the main
// repo's git history or index is touched.
//
//   node tools/fork.mjs create <name>          copy the tree into $FORKS_DIR/<name>
//   node tools/fork.mjs status <name>          files the fork changed since it started
//   node tools/fork.mjs merge <name> [--dry]   merge them into the main tree (reports conflicts)
//   node tools/fork.mjs remove <name>          delete the copy
//   node tools/fork.mjs list
//
// Conflicting text files are written with <<<<<<< markers and listed; binary
// files that both sides changed are listed and left as in the main tree.
// assets/painted/manifest.json is merged key by key (assets / sheets).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORKS = process.env.FORKS_DIR || path.join(os.tmpdir(), 'rcv-forks');
const SKIP_COPY = new Set(['node_modules']);
const SKIP_PREFIX = ['pipeline/out/renders', 'pipeline/out/painted_raw', 'pipeline/out/post', 'pipeline/out/tmp'];
const TEXT = new Set(['.js', '.mjs', '.json', '.css', '.html', '.md', '.py', '.webmanifest', '.svg', '.txt', '.jsonl', '.yml', '.yaml']);
const IGNORE_MERGE = (p) => p.startsWith('pipeline/out/') || p.endsWith('.log');

const git = (cwd, args, opts = {}) => spawnSync('git', args, { cwd, encoding: opts.buffer ? 'buffer' : 'utf8', maxBuffer: 1 << 28, ...opts });
const dirOf = (name) => path.join(FORKS, name);
const isText = (p) => TEXT.has(path.extname(p).toLowerCase());
const rel = (p) => p.split(path.sep).join('/');

function create(name) {
  const dest = dirOf(name);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(FORKS, { recursive: true });
  fs.cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const r = rel(path.relative(ROOT, src));
      if (!r) return true;
      if (SKIP_COPY.has(r.split('/')[0])) return false;
      return !SKIP_PREFIX.some((p) => r === p || r.startsWith(p + '/'));
    },
  });
  if (fs.existsSync(path.join(ROOT, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dest, 'node_modules'), 'dir');
  git(dest, ['add', '-A']);
  const c = git(dest, ['-c', 'user.name=fork', '-c', 'user.email=fork@local', 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'fork base']);
  if (c.status !== 0) throw new Error('baseline commit failed: ' + c.stderr);
  git(dest, ['tag', '-f', 'fork-base']);
  console.log(`forked ${ROOT} -> ${dest}`);
}

/** [{status:'A'|'M'|'D', path}] of everything the fork changed since fork-base. */
function changes(name) {
  const dest = dirOf(name);
  if (!fs.existsSync(dest)) throw new Error('no such fork: ' + name);
  git(dest, ['add', '-A']);
  const r = git(dest, ['diff', '--cached', '--name-status', '--no-renames', 'fork-base']);
  return r.stdout.split('\n').filter(Boolean).map((l) => { const [s, ...p] = l.split('\t'); return { status: s[0], path: p.join('\t') }; })
    .filter((c) => !IGNORE_MERGE(c.path));
}

const baseOf = (dest, p) => { const r = git(dest, ['show', `fork-base:${p}`], { buffer: true }); return r.status === 0 ? r.stdout : null; };
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);
const same = (a, b) => (a === null || b === null ? a === b : Buffer.compare(a, b) === 0);

function mergeManifest(ours, base, theirs) {
  const o = JSON.parse(ours.toString()), b = base ? JSON.parse(base.toString()) : {}, t = JSON.parse(theirs.toString());
  for (const section of ['assets', 'sheets']) {
    for (const [k, v] of Object.entries(t[section] || {})) {
      if (JSON.stringify(v) !== JSON.stringify((b[section] || {})[k])) (o[section] ||= {})[k] = v;
    }
    for (const k of Object.keys(b[section] || {})) if (!(t[section] || {})[k]) delete (o[section] || {})[k];
  }
  o.generated = t.generated || o.generated;
  return Buffer.from(JSON.stringify(o, null, 1) + '\n');
}

function merge(name, dry) {
  const dest = dirOf(name);
  const report = { copied: [], merged: [], conflicts: [], binaryConflicts: [], deleted: [], skipped: [] };
  for (const c of changes(name)) {
    const theirsPath = path.join(dest, c.path), oursPath = path.join(ROOT, c.path);
    const base = baseOf(dest, c.path), ours = read(oursPath), theirs = c.status === 'D' ? null : read(theirsPath);
    const write = (buf) => { if (!dry) { fs.mkdirSync(path.dirname(oursPath), { recursive: true }); fs.writeFileSync(oursPath, buf); } };
    if (c.status === 'D') {
      if (ours === null) report.skipped.push(c.path);
      else if (same(ours, base)) { if (!dry) fs.rmSync(oursPath); report.deleted.push(c.path); }
      else report.conflicts.push(c.path + ' (deleted in fork, changed in main)');
      continue;
    }
    if (same(ours, theirs)) { report.skipped.push(c.path); continue; }
    if (same(ours, base)) { write(theirs); report.copied.push(c.path); continue; } // main did not touch it
    if (c.path === 'assets/painted/manifest.json' && ours && theirs) { write(mergeManifest(ours, base, theirs)); report.merged.push(c.path); continue; }
    if (!isText(c.path)) { report.binaryConflicts.push(c.path); continue; }
    if (base === null) { report.conflicts.push(c.path + ' (added in both)'); continue; } // no common ancestor
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forkmerge-'));
    const f = (n, b) => { const p = path.join(tmp, n); fs.writeFileSync(p, b); return p; };
    const m = spawnSync('git', ['merge-file', '-p', '-L', 'main', '-L', 'base', '-L', 'fork:' + name, f('ours', ours), f('base', base), f('theirs', theirs)], { maxBuffer: 1 << 28 });
    fs.rmSync(tmp, { recursive: true, force: true });
    if (m.status < 0 || m.status > 127) { report.conflicts.push(c.path + ' (merge failed)'); continue; }
    write(m.stdout);
    (m.status === 0 ? report.merged : report.conflicts).push(m.status === 0 ? c.path : `${c.path} (${m.status} conflict${m.status > 1 ? 's' : ''})`);
  }
  console.log(JSON.stringify({ fork: name, dry: !!dry, ...report }, null, 1));
  return report;
}

const [cmd, name, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'create') create(name);
  else if (cmd === 'status') console.log(changes(name).map((c) => c.status + ' ' + c.path).join('\n'));
  else if (cmd === 'merge') { const r = merge(name, rest.includes('--dry')); process.exit(r.conflicts.length || r.binaryConflicts.length ? 2 : 0); }
  else if (cmd === 'remove') { fs.rmSync(dirOf(name), { recursive: true, force: true }); console.log('removed', name); }
  else if (cmd === 'list') console.log(fs.existsSync(FORKS) ? fs.readdirSync(FORKS).join('\n') : '(none)');
  else { console.error('usage: node tools/fork.mjs create|status|merge|remove|list <name> [--dry]'); process.exit(1); }
} catch (e) { console.error('fork:', e.message); process.exit(1); }

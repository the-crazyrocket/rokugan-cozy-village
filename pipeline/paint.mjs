// Step 3 of the art pipeline: ask Codex CLI (non-interactive) to repaint each
// grey blockout render / sheet guide in one consistent hand-painted style.
//  - idempotent: skips jobs whose painted PNG already exists (use --force to redo)
//  - up to 4 Codex calls in parallel, 3 attempts per job
//  - every call is logged to pipeline/out/log/codex_calls.jsonl (+ full transcript per attempt)
// Usage: node pipeline/paint.mjs [--only minka_a45,vegetation] [--force] [--dry]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JOBS, STYLE } from './jobs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_RAW = path.join(ROOT, 'pipeline/out/painted_raw');
const LOG_DIR = path.join(ROOT, 'pipeline/out/log');
const STATUS = path.join(ROOT, 'pipeline/out/paint_status.json');
const CODEX = process.env.CODEX_BIN || path.join(os.homedir(), '.local/bin/codex');
const GEN_DIR = path.join(os.homedir(), '.codex/generated_images');
const CONCURRENCY = Number(process.env.PAINT_CONCURRENCY || 4);
const ATTEMPTS = 3;
const TIMEOUT_MS = 8 * 60 * 1000;

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const onlyArg = args.find((a, i) => args[i - 1] === '--only');
const only = onlyArg ? onlyArg.split(',') : null;

fs.mkdirSync(OUT_RAW, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
const status = fs.existsSync(STATUS) ? JSON.parse(fs.readFileSync(STATUS, 'utf8')) : {};
const saveStatus = () => fs.writeFileSync(STATUS, JSON.stringify(status, null, 2));

function isValidPng(file) {
  try {
    const b = fs.readFileSync(file);
    return b.length > 20000 && b.readUInt32BE(0) === 0x89504e47;
  } catch { return false; }
}

function logCall(entry) {
  fs.appendFileSync(path.join(LOG_DIR, 'codex_calls.jsonl'), JSON.stringify(entry) + '\n');
}

function runCodex(job, attempt) {
  const out = path.join(OUT_RAW, `${job.name}_painted.png`);
  const prompt = job.prompt(out);
  const cliArgs = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', OUT_RAW];
  for (const img of job.images) cliArgs.push('-i', img);
  // `-i` is variadic, so the prompt goes through stdin instead of argv.
  const started = new Date();
  return new Promise((resolve) => {
    const child = spawn(CODEX, cliArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(prompt);
    let transcript = '';
    child.stdout.on('data', (d) => (transcript += d));
    child.stderr.on('data', (d) => (transcript += d));
    const timer = setTimeout(() => { transcript += '\n[paint.mjs] TIMEOUT, killing codex\n'; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      let recovered = false;
      if (!isValidPng(out)) {
        // Codex generated an image but didn't copy it: recover from its session folder.
        const sid = /session id:\s*([0-9a-f-]{36})/i.exec(transcript)?.[1];
        const dir = sid && path.join(GEN_DIR, sid);
        if (dir && fs.existsSync(dir)) {
          const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png'))
            .map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
          if (pngs[0]) { fs.copyFileSync(pngs[0], out); recovered = true; }
        }
      }
      const ok = isValidPng(out);
      const ended = new Date();
      fs.writeFileSync(path.join(LOG_DIR, `${job.name}_attempt${attempt}.txt`), `$ codex ${cliArgs.map((a) => JSON.stringify(a)).join(' ')} <<< prompt\n\nPROMPT:\n${prompt}\n\n${transcript}`);
      const entry = {
        job: job.name, kind: job.kind, attempt, started: started.toISOString(), ended: ended.toISOString(),
        seconds: Math.round((ended - started) / 1000), exitCode: code, ok, recoveredFromSessionDir: recovered,
        output: ok ? path.relative(ROOT, out) : null,
      };
      logCall(entry);
      resolve(entry);
    });
  });
}

async function runJob(job) {
  const out = path.join(OUT_RAW, `${job.name}_painted.png`);
  if (!flag('--force') && isValidPng(out)) {
    console.log(`skip ${job.name} (already painted)`);
    status[job.name] = { ...(status[job.name] || {}), painted: true, by: status[job.name]?.by || 'codex' };
    return;
  }
  if (flag('--force') && fs.existsSync(out)) fs.unlinkSync(out);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    console.log(`codex ${job.name} attempt ${attempt}...`);
    const r = await runCodex(job, attempt);
    console.log(`  -> ${job.name}: ${r.ok ? 'OK' : 'FAILED'} (${r.seconds}s, exit ${r.exitCode})`);
    status[job.name] = { painted: r.ok, by: r.ok ? 'codex' : null, attempts: attempt, last: r.ended };
    saveStatus();
    if (r.ok) return;
  }
}

const jobs = JOBS.filter((j) => !only || only.includes(j.name) || only.includes(j.asset));
if (flag('--dry')) {
  for (const j of jobs) console.log(j.name, j.images, '\n', j.prompt(path.join(OUT_RAW, j.name + '_painted.png')), '\n');
  console.log('style:', STYLE);
  process.exit(0);
}
const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await runJob(queue.shift());
}));
saveStatus();
const ok = jobs.filter((j) => status[j.name]?.painted).length;
console.log(`done: ${ok}/${jobs.length} painted`);

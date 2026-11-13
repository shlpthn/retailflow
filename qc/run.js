#!/usr/bin/env node
'use strict';
// ============================================================================
// RetailFlow QC runner
//   node qc/run.js                       run every automated case
//   node qc/run.js --suite rf-08         run one suite (us-06.4 | us-06.6 | rf-08)
//   node qc/run.js --id TC-RF08-020      run selected case(s) (repeatable)
//   node qc/run.js --catalog             write the catalog only (no execution)
// Each automated case gets its own server + freshly seeded SQLite DB.
// Output: qc/results/latest.json (catalog + results), consumed by build_excel.py.
// Exit code 1 when any automated case FAILs or ERRORs.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Server, Context, CheckFailed, Blocked, TMP, ROOT } = require('./lib/harness');

const SUITES = {
  'us-06.4': require('./suites/us-06.4'),
  'us-06.6': require('./suites/us-06.6'),
  'rf-08': require('./suites/rf-08'),
};
const CASE_TIMEOUT_MS = 30000;
const PORT = Number(process.env.QC_PORT || 3217);
const OUT = path.join(__dirname, 'results', 'latest.json');

function parseArgs(argv) {
  const a = { suites: [], ids: [], catalog: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--suite') a.suites.push(argv[++i]);
    else if (argv[i] === '--id') a.ids.push(argv[++i]);
    else if (argv[i] === '--catalog') a.catalog = true;
    else throw new Error('unknown argument ' + argv[i]);
  }
  return a;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms))]);

async function runCase(tc) {
  const dbFile = path.join(TMP, 'qc.db');
  Server.wipe(dbFile);
  const server = new Server(PORT, dbFile);
  const started = Date.now();
  let status; let actual;
  try {
    await server.start();
    const ctx = new Context(server);
    actual = await withTimeout(tc.auto(ctx), CASE_TIMEOUT_MS);
    status = 'PASS';
  } catch (e) {
    if (e instanceof CheckFailed) status = 'FAIL';
    else if (e instanceof Blocked) status = 'BLOCKED';
    else status = 'ERROR';
    actual = e.message;
  }
  if (server.proc && server.proc.exitCode !== null && server.proc.exitCode !== 0 && status !== 'PASS') {
    const tail = server.log.trim().split('\n').slice(-3).join(' | ');
    actual = `${actual} [server crashed: ${tail}]`;
    if (status === 'ERROR') status = 'FAIL';
  }
  await server.stop();
  Server.wipe(dbFile);
  return { status, actual: String(actual == null ? '' : actual), durationMs: Date.now() - started };
}

function gitInfo() {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim(),
      dirty: execSync('git status --porcelain -- server', { cwd: ROOT }).toString().trim() !== '',
    };
  } catch (e) { return {}; }
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  for (const s of args.suites) if (!SUITES[s]) throw new Error(`unknown suite ${s} (have: ${Object.keys(SUITES).join(', ')})`);
  // The catalog always holds every suite; only the selection is executed.
  const all = [];
  for (const [suite, cases] of Object.entries(SUITES)) for (const tc of cases) all.push({ suite, tc });

  // Keep previous results for cases not executed in this run (partial reruns).
  let previous = {};
  try { for (const c of JSON.parse(fs.readFileSync(OUT, 'utf8')).cases) previous[c.id] = c; } catch (e) { /* first run */ }

  const executedAt = new Date().toISOString();
  const out = [];
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, ERROR: 0 };
  for (const { suite, tc } of all) {
    const { auto, ...meta } = tc;
    const row = {
      ...meta, suite, automated: !!auto,
      script: auto ? `qc/suites/${suite}.js` : '',
      code: auto ? auto.toString() : '',
      status: 'NOT_RUN', actual: '', executedAt: '', durationMs: null,
    };
    const wanted = auto && !args.catalog
      && (!args.suites.length || args.suites.includes(suite))
      && (!args.ids.length || args.ids.includes(tc.id));
    if (wanted) {
      process.stdout.write(`${tc.id.padEnd(16)} `);
      const r = await runCase(tc);
      Object.assign(row, r, { executedAt });
      counts[r.status]++;
      console.log(`${r.status.padEnd(8)} ${r.actual.slice(0, 140)}`);
    } else if (previous[tc.id] && previous[tc.id].status !== 'NOT_RUN') {
      const p = previous[tc.id];
      Object.assign(row, { status: p.status, actual: p.actual, executedAt: p.executedAt, durationMs: p.durationMs });
    }
    out.push(row);
  }

  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: executedAt, node: process.version, git: gitInfo(), cases: out }, null, 2));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}  →  ${path.relative(ROOT, OUT)}`);
  process.exit(counts.FAIL + counts.ERROR > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

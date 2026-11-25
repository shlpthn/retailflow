#!/usr/bin/env node
'use strict';
// ============================================================================
// RetailFlow QC runner
//   node qc/run.js                                   run every automated test case
//   node qc/run.js --pbi RF-08                       run one PBI (repeatable): RF-06 RF-07 RF-08 RF-09 RF-10
//   node qc/run.js --us US-08.3 --id TC-08.3-02      narrow to user stories / test cases (repeatable)
//   node qc/run.js --date 2026-11-24 --run 2 --title "Full regression" [--pbi …] [--as-of ISO] [--build sha]
//        records a test run → qc/runs/<date>_run<n>.json (one sheet of TestRun/TestRun_<date>.xlsx)
// Every automated case gets its own server and a freshly seeded SQLite DB.
// Actual results are recorded per step: passed steps "As expected", the failing step with what was
// observed, later steps "Not executed".
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Server, Context, CheckFailed, Blocked, TMP, ROOT } = require('./lib/harness');
const stories = require('./catalog');

const CASE_TIMEOUT_MS = 60000;
const PORT = Number(process.env.QC_PORT || 3217);
const LATEST = path.join(__dirname, 'results', 'latest.json');

function parseArgs(argv) {
  const a = { pbi: [], us: [], ids: [], date: null, run: null, title: '', asOf: null, build: null };
  const take = { '--pbi': 'pbi', '--us': 'us', '--id': 'ids' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (take[k]) a[take[k]].push(argv[++i]);
    else if (k === '--date') a.date = argv[++i];
    else if (k === '--run') a.run = Number(argv[++i]);
    else if (k === '--title') a.title = argv[++i];
    else if (k === '--as-of') a.asOf = argv[++i];
    else if (k === '--build') a.build = argv[++i];
    else throw new Error('unknown argument ' + k);
  }
  if ((a.date && !a.run) || (a.run && !a.date)) throw new Error('--date and --run go together');
  return a;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms))]);
const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

async function runCase(tc) {
  const dbFile = path.join(TMP, 'qc.db');
  Server.wipe(dbFile);
  const server = new Server(PORT, dbFile);
  const started = Date.now();
  let status = 'PASS'; let message = ''; let ctx = null;
  try {
    await server.start();
    ctx = new Context(server);
    await withTimeout(tc.auto(ctx), CASE_TIMEOUT_MS);
  } catch (e) {
    status = e instanceof CheckFailed ? 'FAIL' : e instanceof Blocked ? 'BLOCKED' : 'ERROR';
    message = oneLine(e.message);
  }
  if (status !== 'PASS' && server.proc && server.proc.exitCode !== null && server.proc.exitCode !== 0) {
    message += ` [server crashed: ${oneLine(server.log.split('\n').slice(-3).join(' '))}]`;
    if (status === 'ERROR') status = 'FAIL';
  }
  await server.stop();
  Server.wipe(dbFile);
  const at = ctx ? ctx.stepNo : 0;
  const observed = ctx ? ctx.observed : {};
  const label = { FAIL: 'Failed', BLOCKED: 'Blocked', ERROR: 'Error' }[status];
  const steps = [0, ...tc.steps.map((_, i) => i + 1)].map((n) => {
    if (status !== 'PASS' && n === at) return { n, actual: `${label} — ${message}` };
    if (status !== 'PASS' && n > at) return { n, actual: `Not executed (stopped at step ${at})` };
    if (n === 0) return { n, actual: 'Done' };
    return { n, actual: observed[n] ? `As expected — ${oneLine(observed[n])}` : 'As expected' };
  });
  return { status, failedStep: status === 'PASS' ? null : at, message, steps, durationMs: Date.now() - started };
}

function gitInfo() {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim(),
    };
  } catch (e) { return {}; }
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(TMP, { recursive: true });
  const runStart = Date.now();
  const asOf = args.asOf ? Date.parse(args.asOf) : null;
  if (args.asOf && Number.isNaN(asOf)) throw new Error('--as-of must be an ISO date-time');
  const stamp = () => new Date((asOf ?? runStart) + (Date.now() - runStart)).toISOString();

  const inScope = (s) => (!args.pbi.length || args.pbi.includes(s.pbi)) && (!args.us.length || args.us.includes(s.id));
  const results = [];
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, ERROR: 0, MANUAL: 0 };
  for (const s of stories.filter(inScope)) {
    for (const tc of s.cases) {
      if (args.ids.length && !args.ids.includes(tc.id)) continue;
      if (tc.retired) continue; // removed from the suite (reason kept in the catalog)
      const base = { id: tc.id, pbi: s.pbi, us: s.id, ac: tc.ac, executedAt: stamp() };
      if (!tc.auto) {
        counts.MANUAL++;
        results.push({ ...base, status: 'NOT_RUN', failedStep: null, message: '', durationMs: null,
          steps: [0, ...tc.steps.map((_, i) => i + 1)].map((n) => ({ n, actual: 'Not executed — manual UI test, pending tester' })) });
        continue;
      }
      process.stdout.write(`${tc.id.padEnd(13)} `);
      const r = await runCase(tc);
      counts[r.status]++;
      console.log(`${r.status.padEnd(8)} ${r.failedStep != null ? `step ${r.failedStep}: ` : ''}${r.message.slice(0, 120)}`);
      results.push({ ...base, ...r });
    }
  }

  const doc = {
    date: args.date, run: args.run, title: args.title,
    scope: args.pbi.length ? args.pbi : [...new Set(stories.map((s) => s.pbi))],
    startedAt: new Date(asOf ?? runStart).toISOString(), finishedAt: stamp(),
    simulatedDate: !!args.asOf, actuallyExecutedAt: new Date(runStart).toISOString(),
    build: args.build || gitInfo().commit, git: gitInfo(), node: process.version, results,
  };
  const out = args.date ? path.join(__dirname, 'runs', `${args.date}_run${args.run}.json`) : LATEST;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 2));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}  →  ${path.relative(ROOT, out)}`);
  process.exit(counts.FAIL + counts.ERROR > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

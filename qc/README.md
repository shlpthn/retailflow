# QC — Sprints 3–5

Test cases written against the RetailFlow BA spec, executable by a manual tester and automated end-to-end through the API.

| Sprint | Backlog item | BA user stories |
|---|---|---|
| S3 | US-06.4 · US-06.6 | US-06.4 (payment & sale completion) · US-07.1 (sales history filters + store scope) |
| S4 | RF-08 | US-08.1 … US-08.8 (HO-coordinated stock transfer, incl. stock integrity) |
| S5 | RF-09 · RF-10 | US-09.1 … 09.3 (promotions) · US-10.1 … 10.5 (reporting & audit) |

## Deliverables

| Path | Content |
|---|---|
| `RetailFlow_QC_TestCases.xlsx` | Sheet 1 *User Stories & AC*; then one sheet per user story: Testcase ID · Testcase Name · Test Type · Acceptance Criteria ID · Description · Step # · Step Description · Expected Result (step 0 = prerequisite) |
| `TestRun/TestRun_<date>.xlsx` | One file per day, one sheet per run: Testcase ID · Step # · Test Step Description · Expected Result · Actual Result · Note (bug) |
| `TestRun/Bug_Summary.xlsx` | All bugs with severity, PBI / US / AC, test case + step, first found, last seen, status (git-ignored) |

## Run

```bash
npm ci                                   # once, at repo root
node qc/run.js                           # all automated cases, quick check → qc/results/latest.json
node qc/run.js --pbi RF-09 --id TC-09.3-04
node qc/run.js --date 2026-12-05 --run 1 --title "Sprint 6 regression"   # record a run → qc/runs/
pip install openpyxl && python3 qc/build_excel.py                        # rebuild all workbooks
```

## Layout

| Path | What |
|---|---|
| `catalog/rf-06.js` … `rf-10.js` | PBI → user story → AC → test cases; each case holds its manual steps and its automation (`auto`) |
| `catalog/common.js` | Prerequisite wording and shared business helpers |
| `lib/harness.js` | Server per case on a fresh seeded DB, per-role API clients, step tracking (`ctx.at(n)`), stock reconciliation |
| `run.js` | Executes cases; records Actual Result per step (passed steps "As expected", failing step with the observation, later steps "Not executed") |
| `runs/<date>_run<n>.json` | Recorded runs (source of the TestRun files) |
| `bug-register.json` | Bugs mapped to `TC-ID#step` (git-ignored, source of Bug_Summary and the Note column) |

API paths assumed for BA features that do not exist yet are constants at the top of `catalog/common.js` (`RF08`, `PROMO`, `REPORT`).

# QC — Sprint 3 & 4

Test cases and API automation for **US-06.4** (payment & sale completion), **US-06.6** (sales history filters + store scope → BA US-07.1) and **RF-08** (HO-coordinated stock transfer + stock integrity), written against the BA spec.

```bash
npm ci                                  # once, at repo root
node qc/run.js                          # run every automated case (~1 min)
node qc/run.js --suite us-06.4          # one suite: us-06.4 | us-06.6 | rf-08
node qc/run.js --id TC-RF08-020         # one case (repeat --id for more)
pip install openpyxl && python3 qc/build_excel.py   # rebuild the workbook
```

| Path | What |
|---|---|
| `RetailFlow_QC_TestCases.xlsx` | Deliverable: Read Me, Summary, Test Cases, Traceability, Automation Scripts |
| `suites/*.js` | Test case catalog **and** automation — one object per case; `auto` is the script (manual cases have none) |
| `lib/harness.js` | Boots a server per case on a fresh seeded DB, per-role API clients, stock reconciliation |
| `run.js` | Runner → `results/latest.json` (git-ignored); exit code 1 when a case fails |
| `build_excel.py` | Builds the workbook from `results/latest.json` (+ bug ids from `bug-log.md`) |
| `bug-log.md` | QC bug log — git-ignored, local only |

To add a case, append an object to the right suite (copy a neighbour), run it with `--id`, then rebuild the workbook. When Dev ships BA endpoints with different paths than assumed, update `PATHS` at the top of `suites/rf-08.js`.

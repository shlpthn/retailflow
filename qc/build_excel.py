#!/usr/bin/env python3
"""
Build qc/RetailFlow_QC_TestCases.xlsx from the QC catalog + last run.

    node qc/run.js                 # run automated cases -> qc/results/latest.json
    python3 qc/build_excel.py      # needs: pip install openpyxl

Inputs : qc/results/latest.json (catalog, results, script code)
         qc/bug-log.md (optional, git-ignored) -> fills the Bug ID column
         qc/lib/harness.js, qc/run.js          -> embedded in "Automation Scripts"
Output : qc/RetailFlow_QC_TestCases.xlsx
"""
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

QC = Path(__file__).resolve().parent
RESULTS = QC / "results" / "latest.json"
BUG_LOG = QC / "bug-log.md"
OUT = QC / "RetailFlow_QC_TestCases.xlsx"

FONT = "Arial"
HEAD_FILL = PatternFill("solid", fgColor="1F3864")
SUB_FILL = PatternFill("solid", fgColor="D9E1F2")
INPUT_FILL = PatternFill("solid", fgColor="FFF2CC")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
STATUS_STYLE = {
    "PASS": ("C6EFCE", "006100"),
    "FAIL": ("FFC7CE", "9C0006"),
    "BLOCKED": ("FFEB9C", "9C5700"),
    "NOT RUN": ("EDEDED", "595959"),
}
STATUS_LABEL = {"PASS": "PASS", "FAIL": "FAIL", "BLOCKED": "BLOCKED", "ERROR": "FAIL", "NOT_RUN": "NOT RUN"}
BACKLOG = OrderedDict([
    ("US-06.4", ("S3", "Payment and sale completion — US-06.4 AC1–AC5, BR-06/07, FR-POS-05..09, SD-01")),
    ("US-06.6", ("S3", "Sales history filters + store scope — BA US-07.1, BR-09, FR-POS-10, SD-02, activity 8.4")),
    ("RF-08", ("S4", "HO-coordinated stock transfer + stock integrity — US-08.1..08.8, BR-12..15, BR-20..22")),
])
REQ_RE = re.compile(r"\b(US-\d\d\.\d|BR-\d\d|FR-[A-Z]{3}-\d\d|NFR-\d\d)\b")

def font(**kw):
    return Font(name=FONT, size=kw.pop("size", 10), **kw)

def load_bug_map():
    """TC id -> [BUG ids] from the summary table of the (git-ignored) bug log."""
    m = {}
    if not BUG_LOG.exists():
        return m
    for line in BUG_LOG.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and re.fullmatch(r"BUG-\d{3}", cells[0]):
            for tc in re.findall(r"TC-[A-Z0-9-]+", cells[3]):
                m.setdefault(tc, []).append(cells[0])
    return m

def header_row(ws, row, labels, widths=None):
    for i, label in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=label)
        c.font = font(bold=True, color="FFFFFF")
        c.fill = HEAD_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
        if widths:
            ws.column_dimensions[get_column_letter(i)].width = widths[i - 1]

def body_cell(ws, row, col, value, **align):
    c = ws.cell(row=row, column=col, value=value)
    c.font = font()
    c.alignment = Alignment(vertical="top", wrap_text=True, **align)
    c.border = BORDER
    return c

def status_formatting(ws, rng, first_cell):
    for label, (bg, fg) in STATUS_STYLE.items():
        ws.conditional_formatting.add(rng, FormulaRule(
            formula=[f'{first_cell}="{label}"'],
            fill=PatternFill("solid", fgColor=bg), font=Font(name=FONT, color=fg, bold=True)))

# --------------------------------------------------------------------------- sheets
def sheet_readme(wb, data):
    ws = wb.active
    ws.title = "Read Me"
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 110
    ws["A1"] = "RetailFlow — QC Test Cases (Sprint 3 & Sprint 4)"
    ws["A1"].font = font(size=14, bold=True)
    git = data.get("git", {})
    rows = [
        ("Scope", "S3: US-06.4 (payment & sale completion), US-06.6 (sales history filters + store scope). "
                  "S4: RF-08 (HO-coordinated stock transfer + stock integrity)."),
        ("Requirement baseline", "RetailFlow Business Requirements Specification (BA). Every case traces to BA IDs (US / BR / FR / NFR / SD / ST). "
                                 "Backlog item US-06.6 is not in the BA: it maps to BA US-07.1 (+ BR-09, FR-POS-10)."),
        ("Build under test", f"branch {git.get('branch', '?')} @ {git.get('commit', '?')}"
                             + (" (server/ had local changes)" if git.get("dirty") else "")),
        ("Last automated run", f"{data.get('generatedAt', '?')} (UTC), Node {data.get('node', '?')}"),
        ("Sheets", "Summary — counts and pass rate per backlog item (formulas over Test Cases).\n"
                   "Test Cases — every case, automated and manual, with expected / actual / status / bug.\n"
                   "Traceability — BA requirement → number of cases and their status (formulas).\n"
                   "Automation Scripts — source of every automated case plus the shared harness and runner."),
        ("Status values", "PASS — actual matches expected.\n"
                          "FAIL — actual differs from expected (a bug is logged).\n"
                          "BLOCKED — cannot run because a prerequisite feature/endpoint is missing (linked to the blocking bug).\n"
                          "NOT RUN — manual case not executed yet."),
        ("Re-run automation", "From the repo root:\n"
                              "  npm ci\n"
                              "  node qc/run.js                       # all automated cases\n"
                              "  node qc/run.js --suite rf-08         # one suite: us-06.4 | us-06.6 | rf-08\n"
                              "  node qc/run.js --id TC-RF08-020      # one case (repeat --id for more)\n"
                              "  python3 qc/build_excel.py            # rebuild this workbook (pip install openpyxl)"),
        ("How the scripts work", "Each automated case boots its own server on a freshly seeded SQLite file (qc/.tmp), drives the REST API as the "
                                 "seed users (cashier1, inventory1/2, manager1/2, ho1, admin1; password password123) and asserts the BA expectation. "
                                 "Cases are independent and can run in any order."),
        ("Assumptions", "1. API paths for BA features that have no endpoint yet follow the existing resources (see PATHS in qc/suites/rf-08.js); "
                        "sales history filters use SD-02 names (from, to, receiptNo, cashier, paymentMethod, page).\n"
                        "2. Current request/order status names are mapped to BA enums inside the RF-08 suite so the flow can be tested; "
                        "TC-RF08-050 checks the raw names separately.\n"
                        "3. TC-0604-025 depends on the seed promotion being active (valid until 2026-12-31).\n"
                        "4. Malformed numbers such as 1e309 are sent as strings because JSON cannot encode Infinity."),
        ("Manual cases", "IDs ending in -Mxx. Execute in the browser and fill Status / Actual result / Executed at (yellow cells). "
                         "Notes hold static-review observations made while writing the case."),
        ("Bug IDs", "Refer to the QC bug log (qc/bug-log.md, kept out of git)."),
    ]
    r = 3
    for k, v in rows:
        a = ws.cell(row=r, column=1, value=k)
        a.font = font(bold=True)
        a.alignment = Alignment(vertical="top")
        b = ws.cell(row=r, column=2, value=v)
        b.font = font()
        b.alignment = Alignment(vertical="top", wrap_text=True)
        ws.row_dimensions[r].height = max(15, 14 * (v.count("\n") + 1 + len(v) // 120))
        r += 1

def sheet_test_cases(wb, cases, bug_map):
    ws = wb.create_sheet("Test Cases")
    cols = ["TC ID", "Sprint", "Backlog item", "BA trace", "Area", "Title", "Type", "Priority", "Preconditions",
            "Test steps", "Test data", "Expected result", "Execution", "Automation script", "Status", "Actual result",
            "Bug ID", "Executed at", "Notes"]
    widths = [15, 7, 10, 22, 15, 38, 11, 9, 30, 44, 22, 40, 11, 20, 10, 44, 13, 17, 30]
    header_row(ws, 1, cols, widths)
    ws.row_dimensions[1].height = 30
    for i, c in enumerate(cases, start=2):
        steps = "\n".join(f"{n}. {s}" for n, s in enumerate(c.get("steps", []), 1))
        status = STATUS_LABEL.get(c["status"], c["status"])
        executed = c.get("executedAt", "")
        executed = executed.replace("T", " ")[:16] + " UTC" if executed else ""
        values = [c["id"], c["sprint"], c["backlog"], c["trace"], c["area"], c["title"], c["type"], c["priority"],
                  c.get("pre", ""), steps, c.get("data", ""), c["expected"],
                  "Automated" if c["automated"] else "Manual", c.get("script", ""), status, c.get("actual", ""),
                  ", ".join(bug_map.get(c["id"], [])), executed, c.get("notes", "")]
        for j, v in enumerate(values, 1):
            body_cell(ws, i, j, v, horizontal="center" if j in (2, 3, 7, 8, 13, 15) else None)
        if not c["automated"]:
            for j in (15, 16, 18):  # manual results are filled in by the tester
                ws.cell(row=i, column=j).fill = INPUT_FILL
        lines = max(len(steps) // 42 + steps.count("\n") + 1, len(c["expected"]) // 38 + 1, len(c.get("actual", "")) // 42 + 1)
        ws.row_dimensions[i].height = min(400, 13 * max(2, lines))
    last = len(cases) + 1
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{last}"
    status_formatting(ws, f"O2:O{last}", "O2")
    dv = DataValidation(type="list", formula1='"PASS,FAIL,BLOCKED,NOT RUN"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"O2:O{last}")
    return last

def sheet_summary(wb, data, last):
    ws = wb.create_sheet("Summary", 1)
    tc = "'Test Cases'"
    ws["A1"] = "QC Summary — Sprint 3 & Sprint 4"
    ws["A1"].font = font(size=14, bold=True)
    git = data.get("git", {})
    ws["A2"] = f"Build {git.get('branch', '?')} @ {git.get('commit', '?')} · automated run {data.get('generatedAt', '?')[:16].replace('T', ' ')} UTC · counts are formulas over the Test Cases sheet"
    ws["A2"].font = font(italic=True, color="595959")

    labels = ["Sprint", "Backlog item", "BA mapping", "Total", "Automated", "Manual", "PASS", "FAIL", "BLOCKED", "NOT RUN", "Pass rate (executed)"]
    header_row(ws, 4, labels, [8, 12, 62, 8, 11, 9, 8, 8, 10, 10, 14])
    ws.row_dimensions[4].height = 30
    r = 5
    for item, (sprint, mapping) in BACKLOG.items():
        body_cell(ws, r, 1, sprint, horizontal="center")
        body_cell(ws, r, 2, item, horizontal="center")
        body_cell(ws, r, 3, mapping)
        rng = f"{tc}!$C$2:$C${last}"
        formulas = {
            4: f"=COUNTIFS({rng},$B{r})",
            5: f'=COUNTIFS({rng},$B{r},{tc}!$M$2:$M${last},"Automated")',
            6: f'=COUNTIFS({rng},$B{r},{tc}!$M$2:$M${last},"Manual")',
            7: f'=COUNTIFS({rng},$B{r},{tc}!$O$2:$O${last},"PASS")',
            8: f'=COUNTIFS({rng},$B{r},{tc}!$O$2:$O${last},"FAIL")',
            9: f'=COUNTIFS({rng},$B{r},{tc}!$O$2:$O${last},"BLOCKED")',
            10: f'=COUNTIFS({rng},$B{r},{tc}!$O$2:$O${last},"NOT RUN")',
            11: f'=IF(SUM(G{r}:I{r})=0,"-",G{r}/SUM(G{r}:I{r}))',
        }
        for col, f in formulas.items():
            body_cell(ws, r, col, f, horizontal="center")
        ws.cell(row=r, column=11).number_format = "0.0%"
        r += 1
    body_cell(ws, r, 1, "")
    body_cell(ws, r, 2, "Total", horizontal="center").font = font(bold=True)
    body_cell(ws, r, 3, "")
    for col in range(4, 11):
        L = get_column_letter(col)
        body_cell(ws, r, col, f"=SUM({L}5:{L}{r - 1})", horizontal="center").font = font(bold=True)
    body_cell(ws, r, 11, f'=IF(SUM(G{r}:I{r})=0,"-",G{r}/SUM(G{r}:I{r}))', horizontal="center").font = font(bold=True)
    ws.cell(row=r, column=11).number_format = "0.0%"
    for col in range(1, 12):
        ws.cell(row=r, column=col).fill = SUB_FILL
    total_row = r

    r += 2
    ws.cell(row=r, column=1, value="By test type").font = font(bold=True, size=11)
    r += 1
    header_row(ws, r, ["", "Type", "", "Total", "", "", "PASS", "FAIL", "BLOCKED", "NOT RUN", "Pass rate (executed)"])
    r += 1
    first_type = r
    for t in ["Functional", "Negative", "Security", "Integrity", "UI"]:
        body_cell(ws, r, 1, "")
        body_cell(ws, r, 2, t, horizontal="center")
        body_cell(ws, r, 3, "")
        rng = f"{tc}!$G$2:$G${last}"
        body_cell(ws, r, 4, f"=COUNTIFS({rng},$B{r})", horizontal="center")
        body_cell(ws, r, 5, "")
        body_cell(ws, r, 6, "")
        for col, st in zip(range(7, 11), ["PASS", "FAIL", "BLOCKED", "NOT RUN"]):
            body_cell(ws, r, col, f'=COUNTIFS({rng},$B{r},{tc}!$O$2:$O${last},"{st}")', horizontal="center")
        body_cell(ws, r, 11, f'=IF(SUM(G{r}:I{r})=0,"-",G{r}/SUM(G{r}:I{r}))', horizontal="center")
        ws.cell(row=r, column=11).number_format = "0.0%"
        r += 1

    r += 1
    ws.cell(row=r, column=1, value="Pass rate (executed) = PASS / (PASS + FAIL + BLOCKED). Manual cases count as NOT RUN until a tester records a result.").font = font(italic=True, color="595959")
    ws.cell(row=r + 1, column=1, value="Failed and blocked cases map to bugs in the QC bug log (Bug ID column on Test Cases).").font = font(italic=True, color="595959")
    ws.freeze_panes = "A5"
    return total_row, first_type

def sheet_traceability(wb, cases, last):
    ws = wb.create_sheet("Traceability")
    reqs = OrderedDict()
    for c in cases:
        for tok in REQ_RE.findall(c["trace"]):
            reqs.setdefault(tok, []).append(c["id"])
    order = {"US": 0, "BR": 1, "FR": 2, "NFR": 3}

    def key(t):
        kind = t.split("-")[0]
        nums = [int(x) for x in re.findall(r"\d+", t)]
        return (order[kind], t.split("-")[1] if kind == "FR" else "", nums)

    labels = ["BA requirement", "Kind", "Cases", "PASS", "FAIL", "BLOCKED", "NOT RUN", "Coverage", "Test case IDs"]
    header_row(ws, 1, labels, [16, 8, 8, 8, 8, 10, 10, 12, 90])
    tc = "'Test Cases'"
    kinds = {"US": "Story", "BR": "Rule", "FR": "Func. req.", "NFR": "Non-func."}
    for r, tok in enumerate(sorted(reqs, key=key), start=2):
        body_cell(ws, r, 1, tok, horizontal="center")
        body_cell(ws, r, 2, kinds[tok.split("-")[0]], horizontal="center")
        crit = f'"*"&$A{r}&"*"'
        trace = f"{tc}!$D$2:$D${last}"
        body_cell(ws, r, 3, f"=COUNTIFS({trace},{crit})", horizontal="center")
        for col, st in zip(range(4, 8), ["PASS", "FAIL", "BLOCKED", "NOT RUN"]):
            body_cell(ws, r, col, f'=COUNTIFS({trace},{crit},{tc}!$O$2:$O${last},"{st}")', horizontal="center")
        body_cell(ws, r, 8, f'=IF(E{r}+F{r}>0,"Defects",IF(G{r}=C{r},"Not run",IF(D{r}=C{r},"Passed","Partial")))', horizontal="center")
        body_cell(ws, r, 9, ", ".join(reqs[tok]))
    last_r = len(reqs) + 1
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = f"A1:I{last_r}"
    for label, color in (("Defects", "FFC7CE"), ("Passed", "C6EFCE"), ("Partial", "FFEB9C"), ("Not run", "EDEDED")):
        ws.conditional_formatting.add(f"H2:H{last_r}", FormulaRule(formula=[f'H2="{label}"'], fill=PatternFill("solid", fgColor=color)))
    return last_r

def sheet_scripts(wb, cases):
    ws = wb.create_sheet("Automation Scripts")
    header_row(ws, 1, ["TC ID", "Script file", "Title", "Automated check (JavaScript)"], [15, 22, 36, 130])
    r = 2
    mono = Font(name="Courier New", size=9)
    for c in cases:
        if not c["automated"]:
            continue
        body_cell(ws, r, 1, c["id"])
        body_cell(ws, r, 2, c["script"])
        body_cell(ws, r, 3, c["title"])
        cell = body_cell(ws, r, 4, c["code"])
        cell.font = mono
        ws.row_dimensions[r].height = min(409, 12 * (c["code"].count("\n") + 1))
        r += 1
    for path, title in (("lib/harness.js", "Shared harness: server per case, API clients, reconciliation"),
                        ("run.js", "Runner: executes cases, writes qc/results/latest.json")):
        src = (QC / path).read_text(encoding="utf-8")
        body_cell(ws, r, 1, "(shared)")
        body_cell(ws, r, 2, f"qc/{path}")
        body_cell(ws, r, 3, title)
        cell = body_cell(ws, r, 4, src[:32000])
        cell.font = mono
        ws.row_dimensions[r].height = 409
        r += 1
    ws.freeze_panes = "B2"

def main():
    if not RESULTS.exists():
        sys.exit("qc/results/latest.json not found — run `node qc/run.js` first.")
    data = json.loads(RESULTS.read_text(encoding="utf-8"))
    cases = data["cases"]
    bug_map = load_bug_map()
    missing = [c["id"] for c in cases if c["status"] in ("FAIL", "BLOCKED", "ERROR") and c["id"] not in bug_map]
    if bug_map and missing:
        print("warning: failed/blocked cases without a bug id:", ", ".join(missing))

    wb = Workbook()
    sheet_readme(wb, data)
    last = sheet_test_cases(wb, cases, bug_map)
    sheet_summary(wb, data, last)
    sheet_traceability(wb, cases, last)
    sheet_scripts(wb, cases)
    wb.calculation.fullCalcOnLoad = True  # Excel / Sheets compute the formulas on open
    wb.save(OUT)
    print(f"wrote {OUT.relative_to(QC.parent)}  ({len(cases)} cases, {len(bug_map)} with bug ids)")

if __name__ == "__main__":
    main()

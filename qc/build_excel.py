#!/usr/bin/env python3
"""
Build the QC workbooks (needs: pip install openpyxl).

    python3 qc/build_excel.py

Outputs
  qc/RetailFlow_QC_TestCases.xlsx      sheet 1 = all user stories and acceptance criteria,
                                       then one sheet of test cases per user story
  qc/TestRun/TestRun_<date>.xlsx       one file per day, one sheet per run of that day
  qc/TestRun/Bug_Summary.xlsx          all logged bugs with first / last run they were seen in

Inputs
  qc/catalog/*.js (via node qc/catalog/export.js), qc/runs/<date>_run<n>.json, qc/bug-register.json
"""
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

QC = Path(__file__).resolve().parent
ROOT = QC.parent
RUNS = QC / "runs"
TESTRUN = QC / "TestRun"
REGISTER = QC / "bug-register.json"

FONT = "Arial"
HEAD_FILL = PatternFill("solid", fgColor="EDEDED")   # light grey header — the only fill used
THIN = Side(style="thin", color="A6A6A6")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOP = Alignment(vertical="center", wrap_text=True)                      # every cell is centred vertically
TOP_C = Alignment(vertical="center", horizontal="center", wrap_text=True)


# ----------------------------------------------------------------------------- helpers
def f(**kw):
    return Font(name=FONT, size=kw.pop("size", 10), **kw)


def header(ws, row, labels, widths):
    for i, (label, w) in enumerate(zip(labels, widths), 1):
        c = ws.cell(row=row, column=i, value=label)
        c.font = f(bold=True)
        c.fill = HEAD_FILL
        c.border = BORDER
        c.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[row].height = 30


def cell(ws, row, col, value, center=False, bold=False):
    c = ws.cell(row=row, column=col, value=value)
    c.font = f(bold=bold)
    c.alignment = TOP_C if center else TOP
    c.border = BORDER
    return c


def merge_down(ws, col, first, last):
    """Merge a block of rows in one column (value already written in the first row)."""
    for r in range(first, last + 1):
        ws.cell(row=r, column=col).border = BORDER
    if last > first:
        ws.merge_cells(start_row=first, start_column=col, end_row=last, end_column=col)


def height(*texts, widths):
    lines = 1
    for t, w in zip(texts, widths):
        t = str(t or "")
        lines = max(lines, sum(len(part) // max(1, int(w * 1.1)) + 1 for part in t.split("\n")))
    return min(400, 13 * lines + 4)


def title(ws, row, text, sub=None):
    ws.cell(row=row, column=1, value=text).font = f(size=13, bold=True)
    if sub:
        ws.cell(row=row + 1, column=1, value=sub).font = f(italic=True)



def load_catalog():
    out = subprocess.run(["node", str(QC / "catalog" / "export.js")], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def load_runs():
    runs = []
    for p in sorted(RUNS.glob("*_run*.json")):
        if re.match(r"(\d{4}-\d{2}-\d{2})_run(\d+)$", p.stem):
            runs.append(json.loads(p.read_text(encoding="utf-8")))
    runs.sort(key=lambda r: (r["date"], r["run"]))
    return runs


def load_bugs():
    if not REGISTER.exists():
        return []
    return json.loads(REGISTER.read_text(encoding="utf-8"))["bugs"]


def prerequisite(tc):
    items = tc["pre"] if isinstance(tc["pre"], list) else [tc["pre"]]
    return "Prerequisite — we need:\n" + "\n".join(f"• {x}" for x in items)


def step_rows(tc):
    rows = [(0, prerequisite(tc), tc.get("preExpect", ""))]
    rows += [(i, s[0], s[1]) for i, s in enumerate(tc["steps"], 1)]
    return rows


def ac_label(ac):
    return "Stock integrity" if ac == "INT" else ac


# ----------------------------------------------------------------------------- test cases
def build_testcases(stories):
    wb = Workbook()
    ws = wb.active
    ws.title = "User Stories & AC"
    title(ws, 1, "RetailFlow — User stories and acceptance criteria in QC scope",
          "Source: RetailFlow Business Requirements Specification (BA). One test case sheet per user story follows.")
    cols = ["PBI", "Sprint", "User Story ID", "User Story", "AC ID", "Acceptance Criteria", "Related rules", "Test Cases"]
    widths = [8, 8, 13, 40, 10, 60, 24, 16]
    header(ws, 4, cols, widths)
    r = 5
    for s in stories:
        first = r
        by_ac = defaultdict(list)
        for c in s["cases"]:
            by_ac[c["ac"]].append(c["id"])
        for a in s["acs"]:
            tcs = "\n".join(by_ac[a["id"]])
            cell(ws, r, 5, ac_label(a["id"]), center=True)
            cell(ws, r, 6, a["text"])
            cell(ws, r, 7, a["rules"])
            cell(ws, r, 8, tcs)
            ws.row_dimensions[r].height = height(a["text"], tcs, a["rules"], widths=[60, 16, 24])
            r += 1
        us_label = s["id"] + (f"\n(backlog {s['backlog']})" if s["backlog"] not in (s["id"], s["pbi"]) else "")
        for col, v, center in ((1, s["pbi"], True), (2, s["sprint"], True), (3, us_label, True), (4, f"{s['name']}\n\n{s['story']}", False)):
            cell(ws, first, col, v, center=center, bold=(col == 3))
            merge_down(ws, col, first, r - 1)
    ws.freeze_panes = "A5"

    cols = ["Testcase ID", "Testcase Name", "Test Type", "Acceptance Criteria ID", "Description", "Step #", "Step Description", "Expected Result"]
    widths = [13, 30, 11, 12, 34, 7, 56, 46]
    for s in stories:
        ws = wb.create_sheet(s["id"])
        title(ws, 1, f"{s['id']} — {s['name']}  ({s['pbi']}, sprint {s['sprint']})", s["story"])
        header(ws, 4, cols, widths)
        r = 5
        for c in s["cases"]:
            first = r
            for n, desc, exp in step_rows(c):
                cell(ws, r, 6, n, center=True)
                cell(ws, r, 7, desc)
                cell(ws, r, 8, exp)
                ws.row_dimensions[r].height = height(desc, exp, widths=[56, 46])
                r += 1
            descr = c["description"] + (f"\nNote: {c['notes']}" if c.get("notes") else "") + ("\nManual test (not automated)." if not c["automated"] else "")
            for col, v, center in ((1, c["id"], True), (2, c["name"], False), (3, c["type"], True), (4, ac_label(c["ac"]), True), (5, descr, False)):
                cell(ws, first, col, v, center=center, bold=(col == 1))
                merge_down(ws, col, first, r - 1)
        ws.freeze_panes = "B5"
    out = QC / "RetailFlow_QC_TestCases.xlsx"
    wb.save(out)
    return out


# ----------------------------------------------------------------------------- test runs
def bug_index(bugs):
    idx = defaultdict(list)  # (tc, step) -> [bug]
    for b in bugs:
        for ref in b["testCases"]:
            tc, _, step = ref.partition("#")
            idx[(tc, int(step or 1))].append(b)
    return idx


def build_testruns(stories, runs, bugs):
    TESTRUN.mkdir(exist_ok=True)
    cases = {c["id"]: c for s in stories for c in s["cases"]}
    idx = bug_index(bugs)
    unmapped = []
    by_date = defaultdict(list)
    for run in runs:
        by_date[run["date"]].append(run)
    written = []
    cols = ["Testcase ID", "Step #", "Test Step Description", "Expected Result", "Actual Result", "Note"]
    widths = [13, 7, 56, 44, 50, 34]
    for date, day_runs in sorted(by_date.items()):
        wb = Workbook()
        wb.remove(wb.active)
        for run in day_runs:
            ws = wb.create_sheet(f"Run {run['run']}")
            title(ws, 1, f"Test Run {date} · Run {run['run']} — {run['title']}")
            header(ws, 3, cols, widths)
            r = 4
            for res in run["results"]:
                tc = cases.get(res["id"])
                if tc is None:
                    continue
                first = r
                actual = {s["n"]: s["actual"] for s in res["steps"]}
                for n, desc, exp in step_rows(tc):
                    note = ""
                    if res["status"] in ("FAIL", "BLOCKED", "ERROR") and n == res["failedStep"]:
                        found = idx.get((res["id"], n), [])
                        note = "\n".join(f"{b['id']} — {b['title']}" for b in found)
                        if not found:
                            unmapped.append(f"{date} run {run['run']} {res['id']} step {n}")
                    cell(ws, r, 2, n, center=True)
                    cell(ws, r, 3, desc)
                    cell(ws, r, 4, exp)
                    cell(ws, r, 5, actual.get(n, ""))
                    cell(ws, r, 6, note)
                    ws.row_dimensions[r].height = height(desc, exp, actual.get(n, ""), note, widths=[56, 44, 50, 34])
                    r += 1
                cell(ws, first, 1, res["id"], center=True, bold=True)
                merge_down(ws, 1, first, r - 1)
            ws.freeze_panes = "B4"
        out = TESTRUN / f"TestRun_{date}.xlsx"
        wb.save(out)
        written.append(out)
    return written, sorted(set(unmapped))


# ----------------------------------------------------------------------------- bug summary
def build_bug_summary(runs, bugs):
    seen = defaultdict(list)  # bug id -> [(date, run)] where its step failed
    last_exec = {}            # (bug, ref) -> (date, run, failed_here, passed)
    for run in runs:
        for res in run["results"]:
            if res["status"] == "NOT_RUN":
                continue
            for b in bugs:
                for ref in b["testCases"]:
                    tc, _, step = ref.partition("#")
                    if tc != res["id"]:
                        continue
                    failed_here = res["status"] != "PASS" and res["failedStep"] == int(step or 1)
                    last_exec[(b["id"], ref)] = (run["date"], run["run"], failed_here, res["status"] == "PASS")
                    if failed_here:
                        seen[b["id"]].append((run["date"], run["run"]))
    wb = Workbook()
    ws = wb.active
    ws.title = "Bug Summary"
    title(ws, 1, "RetailFlow — QC Bug Summary",
          f"{len(bugs)} bugs on main (server code unchanged since 7babcea). Test case references give the step that exposes the bug.")
    cols = ["Bug ID", "Title", "Severity", "PBI", "User Story", "AC ID", "Test Case(s)", "Found by", "First found", "Last seen", "Status", "Expected", "Actual", "Location"]
    widths = [10, 44, 10, 8, 10, 10, 20, 12, 15, 15, 14, 30, 34, 26]
    header(ws, 4, cols, widths)
    order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    for r, b in enumerate(sorted(bugs, key=lambda b: (order[b["severity"]], b["id"])), start=5):
        hits = sorted(seen.get(b["id"], []))
        tcs = "\n".join(sorted({ref.split("#")[0] + (f" (step {ref.split('#')[1]})" if "#" in ref else "") for ref in b["testCases"]}))
        if b["testCases"]:
            found_by = "Test run"
            first = f"{hits[0][0]} · Run {hits[0][1]}" if hits else "—"
            last = f"{hits[-1][0]} · Run {hits[-1][1]}" if hits else "—"
            states = [s for s in (last_exec.get((b["id"], ref)) for ref in b["testCases"]) if s]
            latest = max((s[:2] for s in states), default=None)
            current = [s for s in states if s[:2] == latest]
            if any(s[2] for s in current):
                status = "Open"
            elif current and all(s[3] for s in current):
                status = "Fixed — verify"
            else:
                status = "Open (not reached)"
        else:
            found_by, first, last, status = "Exploratory", b.get("found", "—"), "—", "Open"
        vals = [b["id"], b["title"], b["severity"], b["pbi"], b["us"], b["ac"], tcs or "—", found_by, first, last, status, b["expected"], b["actual"], b.get("where", "")]
        for c, v in enumerate(vals, 1):
            cell(ws, r, c, v, center=c in (1, 3, 4, 5, 6, 8, 9, 10, 11), bold=(c == 1))
        ws.row_dimensions[r].height = height(b["title"], tcs, b["actual"], b["expected"], widths=[44, 20, 34, 30])
    ws.freeze_panes = "C5"
    ws.auto_filter.ref = f"A4:{get_column_letter(len(cols))}{len(bugs) + 4}"
    out = TESTRUN / "Bug_Summary.xlsx"
    wb.save(out)
    return out


def main():
    stories = load_catalog()
    runs = load_runs()
    bugs = load_bugs()
    print("wrote", build_testcases(stories).relative_to(ROOT))
    if not runs:
        print("no recorded runs in qc/runs — TestRun files not built")
        return 0
    files, unmapped = build_testruns(stories, runs, bugs)
    for p in files:
        print("wrote", p.relative_to(ROOT))
    if unmapped:
        print("warning: failed steps without a bug in the register:\n  " + "\n  ".join(unmapped))
    if bugs:
        print("wrote", build_bug_summary(runs, bugs).relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())

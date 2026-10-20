#!/usr/bin/env python3
"""Phase 3 plan checks.

1. F-id coverage: every F-001..F-086 appears exactly once in the PLAN.md §10
   index, exactly once across all package "Closes:" lines plus the §9
   Deferred table, and both places agree on the package.
2. File existence: every backticked repo path in §5 exists in the given
   worktree (paths with placeholders like <ts> are reported separately).

Usage: python3 check_plan.py PLAN.md WORKTREE
"""
import os
import re
import sys

plan_path, worktree = sys.argv[1], sys.argv[2]
text = open(plan_path, encoding="utf-8").read()

def section(title_prefix):
    m = re.search(r"^## " + re.escape(title_prefix) + r".*?$(.*?)(?=^## |\Z)", text, re.M | re.S)
    return m.group(1) if m else ""

ALL = [f"F-{i:03d}" for i in range(1, 87)]

# --- index (§10)
index = {}
dup_index = []
for row in section("10.").splitlines():
    for fid, pkg in re.findall(r"\|\s*(F-\d{3})\s*\|\s*(PKG-\d{2}|Deferred)\s*\|", row):
        if fid in index:
            dup_index.append(fid)
        index[fid] = pkg

# --- packages (§5): "### PKG-xx" headings and their "**Closes:**" line
closes = {}
dup_closes = []
pkgs = re.split(r"^### (PKG-\d{2})", section("5."), flags=re.M)
for i in range(1, len(pkgs), 2):
    pkg, body = pkgs[i], pkgs[i + 1]
    m = re.search(r"\*\*Closes:\*\*([^\n]*)", body)
    if not m:
        print(f"MISSING Closes line in {pkg}")
        continue
    for fid in re.findall(r"F-\d{3}", m.group(1)):
        if fid in closes:
            dup_closes.append(fid)
        closes[fid] = pkg

# --- deferred (§9): first column starting with **F-xxx**
for fid in re.findall(r"^\|\s*\*\*(F-\d{3})\*\*", section("9."), flags=re.M):
    if fid in closes:
        dup_closes.append(fid)
    closes[fid] = "Deferred"

missing_index = [f for f in ALL if f not in index]
missing_closes = [f for f in ALL if f not in closes]
mismatch = [f"{f}: index={index.get(f)} closes={closes.get(f)}" for f in ALL if index.get(f) != closes.get(f)]
extra = sorted((set(index) | set(closes)) - set(ALL))

print("F-ID COVERAGE CHECK")
print(f"  findings expected: {len(ALL)}")
print(f"  in index (§10): {len(index)}; duplicates: {dup_index or 'none'}; missing: {missing_index or 'none'}")
print(f"  in package Closes lines + Deferred: {len(closes)}; duplicates: {dup_closes or 'none'}; missing: {missing_closes or 'none'}")
print(f"  index vs Closes mismatches: {mismatch or 'none'}")
print(f"  unknown ids: {extra or 'none'}")
by_pkg = {}
for f, p in closes.items():
    by_pkg.setdefault(p, []).append(f)
print(f"  packages with findings: {len([p for p in by_pkg if p != 'Deferred'])}; deferred: {len(by_pkg.get('Deferred', []))}")
ok = not (dup_index or missing_index or dup_closes or missing_closes or mismatch or extra)
print("  RESULT:", "PASS" if ok else "FAIL")

# --- file existence (§5)
print()
print("FILE EXISTENCE CHECK (worktree", worktree + ")")
paths = set()
for tok in re.findall(r"`([^`\s]+)`", section("5.")):
    if re.match(r"^(apps|packages|supabase|\.github)/", tok):
        paths.add(tok.rstrip(",.;:"))
expected_new = set()
exp_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "expected_new_paths.txt")
for line in open(exp_file, encoding="utf-8"):
    line = line.split("#", 1)[0].strip()
    if line:
        expected_new.add(line)
present, absent, placeholder, new_ok = [], [], [], []
for p in sorted(paths):
    if "<" in p or "*" in p:
        placeholder.append(p)
    elif p in expected_new and not os.path.exists(os.path.join(worktree, p)):
        new_ok.append(p)
    elif os.path.exists(os.path.join(worktree, p)):
        present.append(p)
    else:
        absent.append(p)
print(f"  paths checked: {len(paths)}; exist: {len(present)}; new files of in-flight PRs or of this plan (listed in expected_new_paths.txt): {len(new_ok)}; placeholders (<ts>, globs): {len(placeholder)}; unexpectedly absent: {len(absent)}")
for p in absent:
    print("    ABSENT:", p)
print("  RESULT:", "PASS" if not absent else "FAIL")

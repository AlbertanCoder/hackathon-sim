"""Read-only audit (24 Oct 2026): auto-marked question quality and a curriculum inventory.
Runs check/dump-lessons.mjs and reports: how often the correct option is first or the longest
(biases the QC audit found in the pre-fix page), exam composition vs the page rules (13-16
auto-marked questions, 80 percent to pass), and module/lesson/project inventory for the
progression review. Run from the hackathon-sim folder: python -I check/audit-mcbias.py"""
import json
import subprocess
from pathlib import Path

ROOT = Path(r"C:\Users\SHADHUNTER\Desktop\Hackathon Game Plan\hackathon-sim")
p = subprocess.run(["node", "check/dump-lessons.mjs", "all"], cwd=str(ROOT),
                   capture_output=True, check=True)
raw = p.stdout.decode("utf-8", errors="replace")
course = json.loads(raw)

opt_len = lambda o: len(o[0]) if isinstance(o, (list, tuple)) else len(str(o))
opt_txt = lambda o: o[0] if isinstance(o, (list, tuple)) and o else str(o)


def walk(node, in_exam, stats, comp):
    if isinstance(node, dict):
        exam_here = in_exam or ("exam" in node and node.get("t") is None)
        for k, v in node.items():
            if k == "opts" and isinstance(v, list) and v and isinstance(v[0], (list, tuple)):
                corr = [o for o in v if len(o) > 1 and o[1] is True]
                if len(corr) == 1:
                    bucket = "exam" if in_exam else "lesson"
                    s = stats[bucket]
                    s[0] += 1
                    if v.index(corr[0]) == 0:
                        s[1] += 1
                    if opt_len(corr[0]) == max(opt_len(o) for o in v):
                        s[2] += 1
            elif k == "exam" and isinstance(v, dict):
                walk(v, True, stats, comp)
            else:
                walk(v, in_exam or (k == "exam"), stats, comp)
    elif isinstance(node, list):
        for x in node:
            walk(x, in_exam, stats, comp)


stats = {"lesson": [0, 0, 0], "exam": [0, 0, 0]}
comp = []
for lid, l in sorted(course.items()):
    walk(l, False, stats, comp)
    if (l.get("name") or "").startswith("Final test"):
        types = [st.get("t", "?") for st in (l.get("steps") or []) if isinstance(st, dict)]
        comp.append((l.get("name"), len(types), types, (l.get("exam") or {}).get("pass")))

print("== multiple-choice bias (n, correct-is-first, correct-is-longest) ==")
for bucket in ("lesson", "exam"):
    n, first, longest = stats[bucket]
    pct = lambda x: ("%.0f%%" % (100.0 * x / n)) if n else "n/a"
    print("%s: n=%d first=%d (%s) longest=%d (%s)" % (bucket, n, first, pct(first), longest, pct(longest)))

print("== final test composition (lesson id, question count, types) ==")
for cid, n, types, passed in comp:
    print("  %s: %s questions pass=%s types=%s" % (cid, n, passed, ",".join(types) if types else ""))

print("== curriculum inventory (module | lesson | mins | project | optional) ==")
mods = {}
for lid, l in course.items():
    mods.setdefault(l.get("module", "?"), []).append(l)
for m in sorted(mods):
    total = sum(l.get("mins") or 0 for l in mods[m])
    proj = [l.get("name") for l in mods[m] if l.get("proj")]
    print("-- %s: %d lessons, ~%d min, projects: %s" % (m, len(mods[m]), total, "; ".join(proj) or "none"))
    for l in sorted(mods[m], key=lambda x: x.get("name", "")):
        flags = ("project " if l.get("proj") else "") + ("optional " if l.get("optional") else "")
        print("     %s (%s min) %s" % (l.get("name"), l.get("mins"), flags.strip()))

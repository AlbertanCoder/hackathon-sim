"""Proof for Levels 4 to 12: every runnable claim in the new levels is re-run for real, and the shape rules are checked.
Run from the hackathon-sim folder:  python -I check/levels-facts.py [workdir] [--no-urls]
What a step may carry (the page ignores these fields):
  setup (on a lesson)   Python (or JS, SQL) source put in front of every run in that lesson
  run / runs            {py|js|sql|sh: code, out: expected output}; with no code given, the step's own `ex` lines are run
  test (on write steps) a driver appended to the model answer and every alt; it must print ok. Every `bad` answer must FAIL it.
Ends with the line "levels: all passed" only if every check passed."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
args = [a for a in sys.argv[1:] if not a.startswith('--')]
NO_URLS = '--no-urls' in sys.argv
work = args[0] if args else os.path.join(tempfile.gettempdir(), 'levels-facts')
os.makedirs(work, exist_ok=True)
fails, notes, counts = [], [], {'checks': 0, 'runs': 0, 'answers': 0, 'bad': 0, 'urls': 0}
LEVEL_MODS = ['dsa', 'net', 'web', 'data', 'llmapi', 'llm', 'swe', 'hired', 'ml']


def ok(cond, msg):
    counts['checks'] += 1
    if not cond:
        fails.append(msg)
        print('FAIL', msg)


def sh(cmd, cwd=None, timeout=120, inp=None):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, encoding='utf-8', errors='replace', input=inp)
    except subprocess.TimeoutExpired:
        return 124, '', 'timed out after %s seconds' % timeout   # a runaway answer counts as a failed one
    return r.returncode, r.stdout.replace('\r\n', '\n'), r.stderr.replace('\r\n', '\n')


node = shutil.which('node')
r = sh([node, os.path.join(HERE, 'dump-lessons.mjs'), 'all'], cwd=ROOT)
ok(r[0] == 0, 'dump-lessons failed: ' + r[2][-300:])
ALL = json.loads(r[1])
L = {k: v for k, v in ALL.items() if v['module'] in LEVEL_MODS}
mods = sorted({v['module'] for v in L.values()}, key=LEVEL_MODS.index)
print('modules found:', ', '.join(mods) or 'none')
ok(len(L) > 0, 'no level lessons found')

# ---- the packages the runs need, in a venv of their own ----
blob = json.dumps(L)
NEED = {'numpy': 'numpy', 'sklearn': 'scikit-learn', 'anthropic': 'anthropic', 'pandas': 'pandas', 'httpx': 'httpx', 'pytest': 'pytest', 'yaml': 'pyyaml', 'fastapi': 'fastapi', 'mcp': 'mcp'}
need = sorted({pkg for imp, pkg in NEED.items() if re.search(r'\b(import|from)\s+' + imp + r'\b', blob)} | ({'httpx'} if re.search(r'\b(import|from)\s+fastapi\b', blob) else set()) | ({'pytest'} if '-m", "pytest' in blob or 'pytest -q' in blob else set()))   # TestClient needs httpx; a lesson may run pytest as a program
venv = os.path.join(work, 'venv')
VPY = os.path.join(venv, 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(venv, 'bin', 'python')
if not os.path.exists(VPY):
    shutil.rmtree(venv, ignore_errors=True)
    ok(sh([sys.executable, '-m', 'venv', venv])[0] == 0, 'could not make the venv')
if need:
    have = sh([VPY, '-m', 'pip', 'list', '--format=freeze'])[1].lower()
    missing = [p for p in need if p.lower() + '==' not in have]
    if missing:
        r = sh([VPY, '-m', 'pip', 'install', '-q'] + missing, timeout=900)
        ok(r[0] == 0, 'pip install ' + ' '.join(missing) + ': ' + r[2][-300:])
run_dir = os.path.join(work, 'run')


shutil.rmtree(run_dir, ignore_errors=True)
os.makedirs(run_dir, exist_ok=True)


def fresh_dir():
    """A brand new empty folder for every run (a leftover process can hold an old one, so never reuse a name)."""
    return tempfile.mkdtemp(prefix='r', dir=run_dir)


def pyrun(code, timeout=20):
    d = fresh_dir()
    open(os.path.join(d, 'code.py'), 'w', encoding='utf-8').write(code)
    return sh([VPY, '-I', 'code.py'], cwd=d, timeout=timeout)


def jsrun(code, timeout=90):
    d = fresh_dir()
    open(os.path.join(d, 'code.mjs'), 'w', encoding='utf-8').write(code)
    return sh([node, 'code.mjs'], cwd=d, timeout=timeout)


def bashrun(code, timeout=90):
    d = fresh_dir()
    return sh(['C:/Program Files/Git/bin/bash.exe', '-c', code], cwd=d, timeout=timeout)


def sqlrun(setup, code):
    """Run SQL in an in-memory SQLite: the setup script, then each statement of `code`; print rows as a|b|c, one per line."""
    drv = ("import sqlite3, sys, json\nd = json.load(sys.stdin)\ncon = sqlite3.connect(':memory:')\nif d['setup']: con.executescript(d['setup'])\n"
           "for stmt in [s for s in d['code'].split(';') if s.strip()]:\n    cur = con.execute(stmt)\n    for row in cur.fetchall():\n        print('|'.join('' if v is None else str(v) for v in row))\n")
    d = fresh_dir()
    open(os.path.join(d, 'code.py'), 'w', encoding='utf-8').write(drv)
    return sh([VPY, '-I', 'code.py'], cwd=d, inp=json.dumps({'setup': setup, 'code': code}))


def execute(lang, code, lesson):
    if lang == 'py':
        return pyrun((lesson.get('setup') or '') + '\n' + code)
    if lang == 'js':
        return jsrun((lesson.get('setup_js') or '') + '\n' + code)
    if lang == 'sh':
        return bashrun(code)
    if lang == 'sql':
        return sqlrun(lesson.get('setup_sql') or '', code)
    if lang in ('dom', 'jsx', 'jsxdom', 'ts', 'tsc'):
        # no empty first line when there is no setup: tsc reports line numbers and the lessons quote them
        pre = (lesson.get('setup_js') + '\n') if lesson.get('setup_js') else ''
        return noderun(lang, pre + code, lesson.get('setup_html') or '<!doctype html><html><body></body></html>')
    raise ValueError(lang)


NODE_DIR = os.path.join(work, 'node')
NODE_LANGS = ('dom', 'jsx', 'jsxdom', 'ts', 'tsc')


def ensure_node():
    """jsdom (a pretend browser), React and esbuild (turns JSX into JavaScript), installed once into <workdir>/node."""
    if all(os.path.exists(os.path.join(NODE_DIR, 'node_modules', n)) for n in ('jsdom', 'esbuild', 'typescript')):
        return
    os.makedirs(NODE_DIR, exist_ok=True)
    npm = shutil.which('npm') or shutil.which('npm.cmd')
    open(os.path.join(NODE_DIR, 'package.json'), 'w').write('{"name":"facts","version":"1.0.0","private":true}')
    r = sh([npm, 'install', '--silent', '--no-audit', '--no-fund', 'jsdom', 'react', 'react-dom', 'esbuild', 'typescript'], cwd=NODE_DIR, timeout=900)
    ok(r[0] == 0, 'npm install for the facts: ' + (r[2] or r[1])[-300:])


def noderun(lang, code, html, timeout=40):
    ensure_node()
    d = tempfile.mkdtemp(prefix='n', dir=os.path.join(NODE_DIR, 'runs')) if os.path.isdir(os.path.join(NODE_DIR, 'runs')) else None
    if d is None:
        os.makedirs(os.path.join(NODE_DIR, 'runs'), exist_ok=True)
        d = tempfile.mkdtemp(prefix='n', dir=os.path.join(NODE_DIR, 'runs'))
    dom_boot = ("const { JSDOM } = require('jsdom');\n"
                "const dom = new JSDOM(" + json.dumps(html) + ", { url: 'http://localhost/', pretendToBeVisual: true });\n"
                "const window = dom.window, document = window.document, localStorage = window.localStorage;\n"
                "Object.assign(globalThis, { window, document, localStorage, Event: window.Event, MouseEvent: window.MouseEvent, HTMLElement: window.HTMLElement });\n")
    if lang == 'tsc':
        open(os.path.join(d, 'code.ts'), 'w', encoding='utf-8').write(code)
        tsc = os.path.join(NODE_DIR, 'node_modules', 'typescript', 'bin', 'tsc')
        rc, out, err = sh([node, tsc, '--noEmit', '--strict', '--target', 'es2020', '--lib', 'es2020,dom', '--pretty', 'false', 'code.ts'], cwd=d, timeout=timeout)
        return 0, out, err   # tsc exits 2 when it reports errors: that is the output we want to read
    if lang == 'ts':
        script = ("const esbuild = require('esbuild');\nconst compiled = esbuild.transformSync(" + json.dumps(code) + ", { loader: 'ts' }).code;\n"
                  "(async () => { await (new (Object.getPrototypeOf(async function(){}).constructor)(compiled))(); })().catch(e => { console.error(e); process.exit(1); });\n")
    elif lang == 'dom':
        script = dom_boot + "(async () => {\n" + code + "\n})().catch(e => { console.error(e); process.exit(1); });\n"
    else:
        react = ("const React = require('react'); const { renderToString } = require('react-dom/server');\n"
                 "const esbuild = require('esbuild');\n"
                 "const compiled = esbuild.transformSync(" + json.dumps(code) + ", { loader: 'jsx' }).code;\n")
        if lang == 'jsx':
            script = react + "Object.assign(globalThis, { React, renderToString, useState: React.useState });\n(async () => { await (new (Object.getPrototypeOf(async function(){}).constructor)(compiled))(); })().catch(e => { console.error(e); process.exit(1); });\n"
        else:
            script = dom_boot + react + ("globalThis.IS_REACT_ACT_ENVIRONMENT = true;\nconst { createRoot } = require('react-dom/client');\n"
                                         "Object.assign(globalThis, { React, renderToString, useState: React.useState, createRoot, act: React.act });\n"
                                         "(async () => { await (new (Object.getPrototypeOf(async function(){}).constructor)(compiled))(); })().catch(e => { console.error(e); process.exit(1); });\n")
    open(os.path.join(d, 'run.cjs'), 'w', encoding='utf-8').write(script)
    return sh([node, 'run.cjs'], cwd=d, timeout=timeout)


# ---- shape rules ----
ids = list(L)
ok(len(ids) == len(set(ids)), 'lesson ids are unique')
for m in mods:
    items = [(k, v) for k, v in L.items() if v['module'] == m]
    plain = [v for k, v in items if not v['proj'] and not v['exam']]
    proj = [v for k, v in items if v['proj'] and not v['exam']]
    exam = [v for k, v in items if v['exam']]
    ok(len(plain) >= 5, f'{m}: at least 5 lessons (has {len(plain)})')
    ok(len(proj) == 1 and 8 <= len(proj[0]['steps']) <= 10, f'{m}: one portfolio project of 8 to 10 steps')
    ok(len(exam) == 1 and exam[0]['exam']['mins'] >= 10 and 0.5 <= exam[0]['exam']['pass'] <= 1 and 10 <= len(exam[0]['steps']) <= 16, f'{m}: one timed final test of 10 to 16 questions')
    ok(all(4 <= len(v['steps']) <= 8 for v in plain), f'{m}: every lesson has 4 to 8 steps: ' + str({k: len(v['steps']) for k, v in items if not v['proj'] and not v['exam']}))
    ok(all(v['recap'] for v in plain + proj), f'{m}: every lesson and project has a recap')
    ok(all(len(v['refs']) >= 1 for v in plain), f'{m}: every lesson links at least one free outside course')
    ok(all(re.match(r'^https://', r[1]) for v in plain + proj for r in v['refs']), f'{m}: every link is https')
GUARANTEE = re.compile(r'guarantee|will get you (a|the) job|you will be hired|certain to get', re.I)
for k, v in L.items():
    text = json.dumps([v['steps'], v['recap'], v['name']])
    for mt in GUARANTEE.finditer(text):
        before = text[max(0, mt.start() - 30):mt.start()].lower()
        ok(re.search(r'\b(no|not|never|cannot|nothing|nobody|n\'t)\b', before) is not None, f'{k}: a promise of a job or a guarantee: ...{text[max(0, mt.start() - 40):mt.end() + 30]}...')
    for i, s in enumerate(v['steps']):
        t = s['t']
        if t == 'explain':
            ok(len(s.get('points', [])) >= 3 and s.get('model') and s.get('need', 2) <= len(s.get('points', [])), f'{k}.{i + 1}: explain has points, a model answer and a sane `need`')
        if t == 'todo':
            ok(len(s.get('items', [])) >= 2, f'{k}.{i + 1}: todo has at least 2 items')
        if t in ('mc', 'bug', 'fill', 'write', 'cmd'):
            ok(bool(s.get('q')), f'{k}.{i + 1}: {t} has a question')
        if t == 'fill':
            ok('{}' not in s['q'], f'{k}.{i + 1}: a fill question must not contain a literal {{}}')
            ok(sum(c.count('{}') for c in s['code']) == len(s['blanks']) == len(s['ans']), f'{k}.{i + 1}: fill blanks match its code')
        if v['exam']:
            ok(t not in ('read', 'explain', 'todo'), f'{k}.{i + 1}: a final test holds only auto-marked questions (not {t})')

# ---- every run, every example, every answer ----
for k, v in L.items():
    for i, s in enumerate(v['steps']):
        key = f'{k}.{i + 1}'
        runs = s.get('run')
        runs = runs if isinstance(runs, list) else [runs] if runs else []
        for rn in runs:
            lang = next((x for x in ('py', 'js', 'sh', 'sql', 'dom', 'jsx', 'jsxdom', 'ts', 'tsc') if x in rn), None)
            code = rn[lang] if lang else '\n'.join(s.get('ex') or [])
            lang = lang or ('js' if v['module'] == 'web' and not re.search(r'\bdef\b|\bprint\(', code) else 'py')
            ok('out' in rn, f'{key}: a run needs an expected `out`')
            rc, out, err = execute(lang, code, v)
            counts['runs'] += 1
            ok(rc == 0 and out.strip() == str(rn.get('out', '')).strip(), f'{key}: run printed {out.strip()!r} (wanted {str(rn.get("out", ""))!r}) rc={rc} {err.strip()[-200:]}')
        if s.get('ex') and not runs and v['module'] not in ('hired',):
            code = '\n'.join(s['ex'])
            if s.get('prompt', '').endswith(('.py',)) or re.search(r'^(def|import|from|class|print)\b', code, re.M):
                try:
                    compile(code, key, 'exec')
                except SyntaxError as e:
                    ok(False, f'{key}: the example does not even parse: {e}')
        if s['t'] == 'write':
            drv = s.get('test')
            ok(bool(drv), f'{key}: a write step needs a `test` driver')
            if not drv:
                continue
            lang = s.get('lang') or ('js' if v['module'] == 'web' else 'py')
            # a SQL answer is run on its own and its printed rows must equal `test`; any other answer is followed by the driver, which prints ok
            full = (lambda code: code) if lang == 'sql' else (lambda code: code + '\n' + drv)
            good = (lambda rc, out: rc == 0 and out.strip() == drv.strip()) if lang == 'sql' else (lambda rc, out: rc == 0 and out.strip().endswith('ok'))
            for kind, code in [('answer', s['ans'])] + [('alt', a) for a in s.get('alt', [])]:
                rc, out, err = execute(lang, full(code), v)
                counts['answers'] += 1
                ok(good(rc, out), f'{key} {kind}: did not pass its own test: {out.strip()[-120:]} {err.strip()[-200:]}')
                if lang == 'ts':
                    rc2, out2, err2 = execute('tsc', full(code), v)
                    ok(out2.strip() == '', f'{key} {kind}: the TypeScript checker complains: {out2.strip()[:200]}')
            for bi, code in enumerate(s.get('bad', [])):
                rc, out, err = execute(lang, full(code), v)
                counts['bad'] += 1
                passes = good(rc, out)
                if bi in s.get('badSlow', []):   # right answer, wrong method (too slow): it must pass the test, the page still refuses it
                    ok(passes, f'{key} badSlow {bi}: should be correct but slow, yet it failed the test: {out.strip()[-80:]} {err.strip()[-120:]}')
                else:
                    ok(not passes, f'{key} bad: a wrong answer PASSED the test, so it is not wrong: {code[:80]!r}')

# ---- the outside links ----
if not NO_URLS:
    seen = {}
    for k, v in L.items():
        for title, url in v['refs']:
            seen.setdefault(url, []).append(k)
    for url, who in seen.items():
        counts['urls'] += 1
        status = None
        for method in ('HEAD', 'GET'):
            try:
                req = urllib.request.Request(url, method=method, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'})
                with urllib.request.urlopen(req, timeout=25) as resp:
                    status = resp.status
                    break
            except urllib.error.HTTPError as e:
                status = e.code
                if method == 'HEAD' and e.code in (403, 405, 400, 404, 501):
                    continue
                break
            except Exception as e:
                status = str(e)[:60]
                if method == 'GET':
                    break
        if isinstance(status, int) and (200 <= status < 400):
            continue
        if status in (401, 403, 429, 999):
            notes.append(f'link answered {status} to a script (check in a browser): {url}')
            continue
        ok(False, f'link is dead ({status}): {url}  used by {", ".join(who[:3])}')

for n in notes:
    print('note:', n)
print(f'{counts["checks"]} checks, {counts["runs"]} runs, {counts["answers"]} answers re-run, {counts["bad"]} wrong answers shown to fail, {counts["urls"]} links, {len(fails)} failed')
print('levels: all passed' if not fails else 'levels: FAILED')
sys.exit(1 if fails else 0)

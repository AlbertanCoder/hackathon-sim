"""Stage 2 proof: every claim the 11 Python lessons make, re-run on a FRESH clone of the public
gold-bot-practice repo with its own .venv. Run from the hackathon-sim folder:
    python -I check/practice-facts.py [workdir]
Ends with the line "practice facts: all passed" only if every check passed."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
work = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='practice-facts-')
clone = os.path.join(work, 'gold-bot')
fails, checks = [], [0]


def run(cmd, cwd=None, timeout=300, env=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env, encoding='utf-8', errors='replace')


def ok(cond, msg):
    checks[0] += 1
    if not cond:
        fails.append(msg)
        print('FAIL', msg)


# ---- a fresh clone with its own .venv ----
if os.path.exists(clone):   # never reuse a half-deleted venv: start in a brand new folder
    work = tempfile.mkdtemp(prefix='practice-facts-')
    clone = os.path.join(work, 'gold-bot')
os.makedirs(work, exist_ok=True)
r = run(['git', 'clone', '-q', 'https://github.com/AlbertanCoder/gold-bot-practice', clone])
ok(r.returncode == 0, 'clone: ' + r.stderr[-200:])
r = run([sys.executable, '-m', 'venv', os.path.join(clone, '.venv')])
ok(r.returncode == 0, 'venv: ' + r.stderr[-200:])
PY = os.path.join(clone, '.venv', 'Scripts', 'python.exe')
if not os.path.exists(PY):
    PY = os.path.join(clone, '.venv', 'bin', 'python')
r = run([PY, '-m', 'pip', 'install', '-q', '-r', 'requirements.txt'], cwd=clone)
ok(r.returncode == 0, 'pip install: ' + r.stderr[-300:])
r = run([PY, '-m', 'pip', 'list'], cwd=clone)
ok('discord.py' in r.stdout and '2.7.1' in r.stdout and 'aiosqlite' in r.stdout and '0.22.1' in r.stdout and 'pytest' in r.stdout and '9.1.1' in r.stdout,
   'pip list names the three pins')


def py(code, cwd=clone):
    r = run([PY, '-c', code], cwd=cwd)
    return r.returncode, r.stdout.strip(), r.stderr.strip()


def pytest(args, cwd=clone):
    r = run([PY, '-m', 'pytest', '-q'] + args, cwd=cwd)
    return r.returncode, (r.stdout + r.stderr).strip()


# ---- counts quoted in the lessons ----
rc, out = pytest([])
ok(rc == 0 and out.splitlines()[-1].startswith('41 passed'), 'full suite is 41 passed: ' + out[-120:])
rc, out = pytest(['-k', 'usd'])
ok(rc == 0 and '8 passed, 33 deselected' in out, 'pytest -k usd is 8 passed, 33 deselected: ' + out[-120:])
rc, out = pytest(['tests/unit/test_keyword_filter.py::TestPrefilter::test_groups'])
ok(rc == 0 and out.splitlines()[-1].startswith('11 passed'), 'test_groups is 11 passed: ' + out[-120:])
rc, out = pytest(['tests/unit/test_keyword_filter.py'])
ok(rc == 0, 'keyword_filter tests pass')

# ---- values quoted in the lessons ----
CLAIMS = [
    ('percent(0.667)', "from goldbot.discord_bot.words import percent; print(percent(0.667))", "67%"),
    ('percent(0.667, 1)', "from goldbot.discord_bot.words import percent; print(percent(0.667, 1))", "66.7%"),
    ('plural(3, signal)', "from goldbot.discord_bot.words import plural; print(plural(3, 'signal'))", "3 signals"),
    ('plural(1, signal)', "from goldbot.discord_bot.words import plural; print(plural(1, 'signal'))", "1 signal"),
    ('usd(-42)', "from goldbot.discord_bot.words import usd; print(usd(-42))", "-$42.00"),
    ('usd signed', "from goldbot.discord_bot.words import usd; print(usd(12.3, signed=True))", "+$12.30"),
    ('usd(0.004)', "from goldbot.discord_bot.words import usd; print(usd(0.004))", "$0.00"),
    ('usd(1234.5)', "from goldbot.discord_bot.words import usd; print(usd(1234.5))", "$1,234.50"),
    ('stop_distance(10)', "from goldbot.risk import stop_distance, RiskRules; print(stop_distance(10, RiskRules()))", "15.0"),
    ('stop mult is 1.5', "from goldbot.risk import RiskRules; print(RiskRules().stop_atr_mult)", "1.5"),
    ('totals loop', "hits=[('usd',0.5),('risk_off',0.25),('usd',0.25)]\ntotals={}\nfor factor, score in hits:\n    totals[factor]=totals.get(factor,0.0)+score\nprint(totals)", "{'usd': 0.75, 'risk_off': 0.25}"),
    ('clip', "print(max(-1.0, min(1.0, 1.7)), max(-1.0, min(1.0, -3)), max(-1.0, min(1.0, 0.4)))", "1.0 -1.0 0.4"),
    ('real clip line in keyword_filter', "import goldbot.scoring.keyword_filter as k, inspect; print('max(-1.0, min(1.0, total))' in inspect.getsource(k))", "True"),
    ('json.dumps sorted', "import json; print(json.dumps({'usd': 0.75, 'gold': 1}, sort_keys=True))", '{"gold": 1, "usd": 0.75}'),
    ('fed-up does not pass', "from goldbot.scoring.keyword_filter import load_keywords; kw=load_keywords(); print(kw.passes('Investors fed up with low returns'), kw.passes(\"Fed's Waller says more easing likely\"))", "False True"),
    ('round(2.675, 2)', "print(round(2.675, 2))", "2.67"),
    ('double("ab")', "def double(x: int) -> int: return x * 2\nprint(repr(double('ab')))", "'abab'"),
    ('float(abc) is ValueError', "\ntry: float('abc')\nexcept ValueError as e: print(type(e).__name__)", "ValueError"),
    ('Paths.under db_path', "from pathlib import Path\nfrom goldbot.config import Paths; print(Paths.under(Path('C:/bot')).db_path)", str(__import__('pathlib').Path('C:/bot') / 'data' / 'goldbot.db')),
    ('Path join shown the OS way', "from pathlib import Path; print(str(Path('C:/bot') / 'data' / 'goldbot.db'))", str(__import__('pathlib').Path('C:/bot') / 'data' / 'goldbot.db')),
    ('frozen', "from pathlib import Path\nfrom goldbot.config import Paths\np=Paths.under(Path('C:/bot'))\ntry: p.base_dir=Path('D:/')\nexcept Exception as e: print(type(e).__name__, e)", "FrozenInstanceError cannot assign to field 'base_dir'"),
    ('market method', "import inspect; from goldbot.config import AppConfig; print(inspect.signature(AppConfig.market))", "(self, instrument: str) -> goldbot.config.MarketDef"),
    ('AppConfig has 1 method', "import inspect; from goldbot.config import AppConfig; print([n for n, f in vars(AppConfig).items() if inspect.isfunction(f) and not n.startswith('__')])", "['market']"),
    ('plural hints', "import inspect; from goldbot.discord_bot.words import plural, direction_word; print(inspect.signature(plural), inspect.signature(direction_word))", "(count: int, word: str) -> str (direction: str) -> str"),
    ('parse_export_json header', "import inspect; from goldbot.feeds.ff_calendar import parse_export_json; print(inspect.signature(parse_export_json))", "(content: bytes | str) -> list[goldbot.feeds.ff_calendar.FFEvent]"),
    ('help(round) text', "import io, contextlib, pydoc; print('Round a number to a given precision in decimal digits.' in pydoc.render_doc(round, renderer=pydoc.plaintext))", "True"),
    ('db default', "import asyncio, tempfile, os\nfrom goldbot.db import open_db, get_json_state\nasync def go():\n    d=os.path.join(tempfile.mkdtemp(),'t.db'); db=await open_db(d)\n    v=await get_json_state(db,'last_run',default={}); await db.close(); return v\nprint(asyncio.run(go()))", "{}"),
]
for name, code, want in CLAIMS:
    rc, out, err = py(code)
    ok(rc == 0 and out == want, f'{name}: wanted {want!r}, got rc={rc} {out!r} {err[-120:]}')

rc, out, err = py("from goldbot.discord_bot.words import usd; usd(12.3, True)")
ok(rc != 0 and 'TypeError: usd() takes 1 positional argument but 2 were given' in err, 'usd(12.3, True) TypeError text: ' + err[-150:])
rc, out, err = py("from goldbot.risk import stop_distance; stop_distance(0, None)")
ok(rc != 0 and err.splitlines()[-1] == 'ValueError: ATR must be positive', 'stop_distance(0, None): ' + err[-120:])
rc, out, err = py("from goldbot.risk import RiskRules, stop_distance\nstop_distance(-2, RiskRules())")
ok(rc != 0 and err.splitlines()[-1] == 'ValueError: ATR must be positive', 'stop_distance(-2): ' + err[-120:])
nodir = os.path.join(work, 'does-not-exist')
rc, out, err = py(f"from goldbot.main import run_post_demo\nr = run_post_demo({nodir!r})\nprint('return', r)")
ok(rc == 0 and out.startswith('No demo posted: config file not found:') and out.endswith('return 1'), 'run_post_demo on a missing folder: ' + out[-200:] + err[-100:])
# the global Python must NOT have aiosqlite (the .venv lesson's claim), the venv one must
r = run(['py', '-S', '-c', 'from goldbot.db import get_json_state'], cwd=clone)   # -S: ignore the laptop's own site-packages, so the check holds on a machine that has aiosqlite installed globally
ok("No module named 'aiosqlite'" in r.stderr, "py (no venv) -> ModuleNotFoundError aiosqlite: " + r.stderr[-150:])
rc, out, err = py('from goldbot.db import get_json_state; print("ok")')
ok(out == 'ok', 'the .venv python imports goldbot.db')
# json.py shadowing
sh = os.path.join(work, 'shadow')
shutil.rmtree(sh, ignore_errors=True)
os.makedirs(sh)
open(os.path.join(sh, 'json.py'), 'w').write('# my notes about JSON\n')
open(os.path.join(sh, 'save_scores.py'), 'w').write('import json\njson.dump({"a": 1}, open("scores.json", "w"))\n')
r = run([PY, 'save_scores.py'], cwd=sh)
ok("module 'json' has no attribute 'dump'" in r.stderr, 'json.py shadows json: ' + r.stderr[-200:])
os.rename(os.path.join(sh, 'json.py'), os.path.join(sh, 'notes_json.py'))
r = run([PY, 'save_scores.py'], cwd=sh)
ok(r.returncode == 0, 'renamed, the script works')
# the "no assert" test passes while testing nothing; and the real test with a bad assert fails
tdir = os.path.join(clone, 'tests', '_lesson_tmp')
os.makedirs(tdir, exist_ok=True)


def run_test_file(src):
    open(os.path.join(tdir, 'test_tmp.py'), 'w', encoding='utf-8').write(src)
    return pytest(['tests/_lesson_tmp/test_tmp.py'])


rc, out = run_test_file('from goldbot.discord_bot.words import usd\n\ndef test_usd_negative():\n    usd(-42) == "$42.00"\n')
ok(rc == 0 and '1 passed' in out, 'test with no assert passes: ' + out[-80:])
rc, out = run_test_file('from goldbot.discord_bot.words import usd\n\ndef test_usd_negative():\n    assert usd(-42) == "$42.00"\n')
ok(rc != 0, 'a wrong assert fails')

# ---- every write-step answer (and every alternative) runs and does what its lesson says ----
node = shutil.which('node')
lessons = json.loads(run([node, os.path.join(HERE, 'dump-lessons.mjs'), 'python'], cwd=ROOT).stdout)
ok(len(lessons) >= 11, f'python module has {len(lessons)} lessons')

DRIVERS = {
    'direction_word': "assert f('buy') == 'BUY' and f('sell') == 'SELL' and f('x') == 'SELL'",
    'plural': "assert f(1, 'signal') == '1 signal' and f(3, 'signal') == '3 signals' and f(0, 'signal') == '0 signals'",
    'risk_usd': "assert f(2, 3, 2) == 12 and f(2, 3) == 6",
    'add_up': "assert f([('usd', 0.5), ('risk_off', 0.25), ('usd', 0.25)]) == {'usd': 0.75, 'risk_off': 0.25} and f([('usd', 0.5), ('usd', 0.25)]) == {'usd': 0.75}",
    'clip': "assert f(1.7) == 1.0 and f(-3) == -1.0 and f(0.4) == 0.4",
    'read_number': "assert f('12.5') == 12.5 and f('abc') is None",
    'save_scores': "import os, tempfile\np = os.path.join(tempfile.mkdtemp(), 's.json')\nf(p, {'usd': 0.75})\nimport json\nassert json.load(open(p, encoding='utf-8')) == {'usd': 0.75}",
    'load_scores': "import os, tempfile, json\np = os.path.join(tempfile.mkdtemp(), 's.json')\njson.dump({'usd': 0.75}, open(p, 'w', encoding='utf-8'))\nassert f(p) == {'usd': 0.75}",
}
seen = set()
for lid, L in lessons.items():
    for si, st in enumerate(L['steps']):
        if st.get('t') != 'write':
            continue
        for kind, code in [('ans', st['ans'])] + [('alt', a) for a in st.get('alt', [])]:
            m = re.search(r'^def (\w+)\(', code, re.M)
            label = f'{lid}.{si + 1} {kind}'
            if 'def test_' in code:
                rc, out = run_test_file(code)
                want = '3 passed' if 'parametrize' in code else '1 passed'
                ok(rc == 0 and want in out, f'{label}: test file should give {want}: {out[-120:]}')
                seen.add(lid + str(si))
                continue
            if 'class Trade' in code:
                rc, out, err = py(code + "\nassert Trade(2400.0, 2390.5).risk() == 9.5 and Trade(2390.5, 2400.0).risk() == 9.5\nprint('ok')")
                ok(out == 'ok', f'{label}: Trade: {err[-150:]}')
                seen.add(lid + str(si))
                continue
            fn = m.group(1) if m else None
            if fn not in DRIVERS:
                ok(False, f'{label}: no driver for {fn!r}')
                continue
            extra = ''
            if fn == 'direction_word' and lid == 'py-docs':
                extra = "\nimport inspect\nassert str(inspect.signature(direction_word)) == '(direction: str) -> str'"
            rc, out, err = py(code + f"\nf = {fn}\n" + DRIVERS[fn] + extra + "\nprint('ok')")
            ok(out == 'ok', f'{label}: {fn} did not do what the lesson says: {err[-200:]}')
            seen.add(lid + str(si))
shutil.rmtree(tdir, ignore_errors=True)

# ---- the lesson text is clean ----
blob = json.dumps(lessons)
for banned in ('SHADHUN' + 'TER', 'gold-swing' + '-bot', '1,983', 'your Gold Bot', 'Your Gold Bot'):   # spelled in pieces so this file does not repeat the private names
    ok(banned not in blob, f'banned phrase in the lessons: {banned}')
ok('41 passed' in blob and '8 passed, 33 deselected' in blob, 'lessons carry the new counts')

# the clone must be left as cloned (the venv and caches are git-ignored)
r = run(['git', 'status', '--porcelain'], cwd=clone)
ok(r.stdout.strip() == '', 'clone is clean: ' + r.stdout[:200])

print(f'{checks[0]} checks, {len(fails)} failed')
print('practice facts: all passed' if not fails else 'practice facts: FAILED')
sys.exit(1 if fails else 0)

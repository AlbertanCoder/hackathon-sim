// Content audit of every Learn lesson, through the real page: each mc has exactly one right option and every option explains
// itself; each cmd step accepts the listed correct variants and catches the listed near-misses with a specific message;
// each fill accepts its answer and sensible spellings; each bug step points at a real line; cmd hints never contain the answer.
// Run: node check/lessons-audit.mjs   (about 1 to 2 minutes; prints only FAIL lines and a total)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-la-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`, '--remote-debugging-port=0', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const pf = join(prof, 'DevToolsActivePort');
for (let i = 0; i < 100 && !existsSync(pf); i++) await sleep(100);
await sleep(200);
const port = readFileSync(pf, 'utf8').split('\n')[0].trim();
const t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const w = new Map(), errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push(x.slice(0, 80) + ' -> ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result?.value; };
const sim = x => js(`window.__sim.${x}`);
let bad = 0, n = 0; const ok = (c, m) => { n++; if (!c) { console.log('FAIL ' + m); bad++; } };
await cdp('Runtime.enable');
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
// Correct variants that must pass, and near-misses that must NOT pass and must get a specific message, for every cmd step.
const VAR = {
  'py-imports.5': { yes: ['pip install -r requirements.txt', 'python -m pip install -r requirements.txt', 'py -m pip install -r requirements.txt', '.venv/Scripts/python.exe -m pip install -r requirements.txt'], no: ['pip install requirements.txt', 'pip install -r requirements', 'pip install discord.py', 'pip -r requirements.txt'] },
  'py-pytest.5': { yes: ['pytest -k usd', 'python -m pytest -k usd', 'py -m pytest -k usd', '.venv/Scripts/python.exe -m pytest -k usd', 'pytest -q -k usd', 'pytest -k "usd"'], no: ['pytest usd', 'pytest', 'pytest -k', 'python test_usd.py'] },
  't-where.1': { yes: ['pwd', '  pwd  '], no: ['ls', 'whereami', 'dir'] },
  't-where.3': { yes: ['ls', 'ls -l', 'ls -la', 'ls -a', 'ls -F'], no: ['pwd', 'dir', 'list'] },
  't-where.6': { yes: ['ls -a', 'ls -la', 'ls -al', 'ls -A', 'ls --all'], no: ['ls', 'ls -l', 'ls -h', 'dir /a'] },
  't-cd.1': { yes: ['cd projects', 'cd projects/', 'cd ~/projects'], no: ['cd', 'cd proj', 'projects', 'cd Projects'] },
  't-cd.3': { yes: ['cd 02_eyes_on_the_sky', 'cd 02_eyes_on_the_sky/', 'cd ./02_eyes_on_the_sky'], no: ['cd 02_Eyes_On_The_Sky', 'cd eyes_on_the_sky', 'cd 02 eyes'] },
  't-cd.4': { yes: ['cd ..', 'cd ../'], no: ['cd .', 'cd..', 'cd challenges'] },
  't-cd.5': { yes: ['cd ../03_stay_connected', 'cd ../03_stay_connected/'], no: ['cd 03_stay_connected', 'cd ..', 'cd .. 03_stay_connected', 'cd ../03_Stay_Connected', 'cd .../03_stay_connected'] },
  't-read.1': { yes: ['cat sites.csv', 'cat ./sites.csv'], no: ['cat', 'cat site.csv', 'open sites.csv'] },
  't-read.4': { yes: ['head -n 3 sensor_tracks.csv', 'head -3 sensor_tracks.csv', 'head -n3 sensor_tracks.csv'], no: ['cat sensor_tracks.csv', 'head sensor_tracks.csv', 'tail -n 3 sensor_tracks.csv'] },
  't-read.5': { yes: ['wc -l sites.csv'], no: ['wc sites.csv', 'wc -l'] },
  't-grep.1': { yes: ['grep YEG sites.csv', 'grep "YEG" sites.csv', "grep 'YEG' sites.csv", 'grep -i yeg sites.csv'], no: ['grep sites.csv YEG', 'grep yeg sites.csv', 'grep YEG'] },
  't-grep.3': { yes: ['grep -c RAH-00145 sensor_tracks.csv', 'grep -c "RAH-00145" sensor_tracks.csv'], no: ['grep RAH-00145 sensor_tracks.csv', 'grep -n RAH-00145 sensor_tracks.csv'] },
  't-grep.6': { yes: ['grep RAH sensor_tracks.csv | head -n 5', 'grep RAH sensor_tracks.csv|head -5', 'grep "RAH" sensor_tracks.csv | head -n5'], no: ['grep RAH sensor_tracks.csv', 'head -n 5 sensor_tracks.csv | grep RAH', 'grep RAH sensor_tracks.csv | head', 'grep RAH sensor_tracks.csv > head', 'grep -c RAH sensor_tracks.csv | head -n 5', 'grep RAH sensor_tracks.csv | tail -n 5'] },
  't-grep.7': { yes: ['grep -r alert_radius_m .', 'grep -rn alert_radius_m .', 'grep -rl alert_radius_m .', 'grep -r alert_radius_m', 'grep -r "alert_radius_m" .'], no: ['grep alert_radius_m sites.csv', 'grep alert_radius_m .', 'grep alert_radius_m', 'grep -r . alert_radius_m'] },
  't-errors.4': { yes: ['python score.py --submission work/val_predictions.csv --labels work/val_labels.csv', 'python3 score.py --labels work/val_labels.csv --submission work/val_predictions.csv', '../../.venv/Scripts/python score.py --submission work/val_predictions.csv --labels work/val_labels.csv'], no: ['python score.py', 'python score.py --submission work/val_predictions.csv', 'python scor.py --submission x', 'score.py --submission work/val_predictions.csv --labels work/val_labels.csv', '.venv/Scripts/python score.py --submission work/val_predictions.csv --labels work/val_labels.csv'] },
  'g-why.2': { yes: ['git status', 'git status -s', 'git status --short'], no: ['status', 'git', 'git stauts', 'git st'] },
  'g-why.5': { yes: ['git log --oneline', 'git log --oneline -5', 'git log --oneline -n 5'], no: ['git history', 'log', 'git log', 'git log -5', 'git log --one-line'] },
  'g-why.7': { yes: ['git config user.name', 'git config --global user.name', 'git config --get user.name'], no: ['git config', 'git config user.email', 'git config --list', 'git config --global user.name "Shad"'] },
  'g-commit.1': { yes: ['git diff', 'git diff loader.py'], no: ['git status', 'diff loader.py'] },
  'g-commit.2': { yes: ['git add loader.py', 'git add ./loader.py'], no: ['git add .', 'git add -A', 'git add', 'git commit -m "x"'] },
  'g-undo.1': { yes: ['git restore map.js', 'git checkout -- map.js', 'git checkout map.js'], no: ['git restore .', 'git reset --hard', 'git revert HEAD'] },
  'g-undo.2': { yes: ['git restore --staged bad_rows.log', 'git reset bad_rows.log', 'git reset HEAD bad_rows.log', 'git rm --cached bad_rows.log'], no: ['git restore bad_rows.log', 'git restore --staged .', 'git rm bad_rows.log', 'rm bad_rows.log', 'git reset --hard'] },
  'g-team.1': { yes: ['git clone https://github.com/mei-yeg/sky-watch.git', 'git clone https://github.com/mei-yeg/sky-watch'], no: ['git pull', 'git clone', 'git clone https://github.com/mei/sky-watch.git', 'git download https://github.com/mei-yeg/sky-watch.git', 'cd sky-watch'] },
  'g-team.2': { yes: ['git pull', 'git pull origin main'], no: ['git push', 'git clone https://github.com/mei-yeg/sky-watch.git', 'git fetch', 'git update'] },
  'g-team.4': { yes: ['git push', 'git push origin main'], no: ['git push --force', 'git push -f', 'git commit -m "legend"', 'git pull', 'git upload'] },
  'g-branch.1': { yes: ['git switch -c map-legend', 'git switch --create map-legend', 'git checkout -b map-legend'], no: ['git branch map-legend', 'git switch map-legend', 'git switch -c gord-alerts', 'git switch -c map_legend', 'git new map-legend'] },
  'g-branch.3': { yes: ['git switch main', 'git checkout main'], no: ['git switch -c main', 'git switch master', 'git switch', 'git branch main', 'git merge map-legend'] },
  'c-test.1': { yes: ['python run_demo.py', 'python3 run_demo.py', 'py run_demo.py'], no: ['python loader.py', 'pytest', 'run_demo.py'] },
  'c-test.2': { yes: ['pytest', 'pytest -q', 'python -m pytest', 'py -m pytest', 'pytest test_loader.py'], no: ['python test_loader.py', 'py test_loader.py', 'py.test', 'test'] },
  'c-undo.2': { yes: ['git restore loader.py', 'git checkout -- loader.py'], no: ['git reset --hard', 'git revert HEAD', 'git restore', 'rm loader.py'] },
  's-data.1': { yes: ['wc -l sensors.csv', 'wc -l ./sensors.csv'], no: ['wc sensors.csv', 'cat sensors.csv', 'wc -l sensor.csv'] },
  's-data.6': { yes: ['grep -c ",drone," labels_train/track_labels.csv', "grep -c ',drone,' labels_train/track_labels.csv", 'grep -c drone labels_train/track_labels.csv'], no: ['grep ",drone," labels_train/track_labels.csv', 'grep -c drone track_labels.csv', 'grep -c drone labels_train/track_label.csv'] },
  's-anykit.1': { yes: ['grep gnss_logs.csv 03_stay_connected/README.md', 'grep "gnss_logs.csv" 03_stay_connected/README.md', 'grep gnss_logs ./03_stay_connected/README.md'], no: ['grep gnss_logs.csv README.md', 'grep gnss_logs.csv 03_stay_connected', 'cat 03_stay_connected/README.md', 'grep 03_stay_connected/README.md gnss_logs.csv'] },
  's-anykit.2': { yes: ['python score.py --help', 'python3 score.py --help', 'py score.py -h', 'python score.py -h'], no: ['python score.py', 'score.py --help', 'python score --help', 'python score.py help'] },
  's-pilot.1': { yes: ['grep YEG-RF sensors.csv', 'grep "YEG-RF" sensors.csv'], no: ['grep YEG sensors.csv', 'grep RAH-RF sensors.csv', 'grep yeg-rf sensors.csv', 'grep YEG-RF sensor_tracks.csv'] },
  'p-claude.1': { yes: ['git commit -m "Before Claude"', "git commit -m 'save'", 'git commit -am "save"'], no: ['git commit', 'git push', 'git add predict.py', 'git commit -m save'] },
  'p-claude.5': { yes: ['git restore work/val_labels.csv', 'git restore ./work/val_labels.csv', 'git checkout -- work/val_labels.csv'], no: ['git reset --hard', 'git restore .', 'git restore predict.py', 'git revert HEAD', 'git restore val_labels.csv', 'git restore'] },
  'p-claude.6': { yes: ['python predict.py', 'python3 predict.py', 'py predict.py'], no: ['python score.py --submission work/val_predictions.csv --labels work/val_labels.csv', 'predict.py', 'python run_demo.py'] },
  'p-claude.7': { yes: ['python score.py --submission work/val_predictions.csv --labels work/val_labels.csv', 'python score.py --labels work/val_labels.csv --submission work/val_predictions.csv', 'py score.py --submission work/val_predictions.csv --labels work/val_labels.csv'], no: ['python score.py', 'python score.py --submission work/val_predictions.csv', 'python predict.py'] }
};
// Extra spellings each fill step must accept (the step's own answer is always tried first).
const FILL = { 'py-files.3': [], 'py-imports.2': [], 'py-pytest.3': [], 'py-class.3': [], 'py-docs.3': [], 'py-write.3': [['1 signal']], 'py-loops.3': [['min']], 'py-try.3': [['ValueError']], 'k-agents.3': [['agents']], 'k-hooks.3': [['PreToolUse', 'pretooluse']], 'k-hooks.4': [['2']], 'k-verify.5': [['clear']], 'py-return.3': [['s']], 'py-args.4': [['"$0.00"', "'$0.00'"]], 'py-guard.3': [['<']], 'k-boss.4': [['plan']], 'k-boss.6': [['diff']], 'k-memory.4': [['py', 'push']], 'k-perms.5': [['./.env', './.env']], 'k-skills.3': [['skills', 'skills']], 't-fix.3': [['""', 'continue']], 'g-commit.4': [['commit', 'Skip blank rows and log them']], 'g-branch.7': [], 'c-ask.4': [['change', 'when'], ['Touch', 'When']], 'c-ask.5': [['python3', './work/val_labels.csv']],
  'c-plan.3': [['step', 'file']], 'c-undo.7': [['ADD', 'Commit']], 'h-plan.4': [['skip', 'b']], 'h-pitch.2': [['Now', 'Using'], ['currently', 'with']], 'h-pitch.5': [['show', 'map']], 'h-judges.6': [['194', 'baseline']], 'h-people.4': [['Apprentice', 'made']], 'h-people.5': [['24', 'repo'], ['24 to 48', 'GitHub link']],
  's-what.7': [], 's-pilot.6': [['5,000', '300'], ['5000.0', '300.0']], 's-anykit.3': [['f1', '.93']], 'p-hack.2': [['alert', 'video'], ['core', 'capture']] };
const course = await sim('course()');
const lessons = course.flatMap(m => m.lessons.filter(l => l.steps));
const LEVEL_MODS = new Set(['dsa', 'net', 'web', 'data', 'llmapi', 'llm', 'swe', 'hired', 'ml']), modOf = {};
course.forEach(m => m.lessons.forEach(l => { modOf[l.id] = m.id; }));
const isNew = L => LEVEL_MODS.has(modOf[L.id]);   // Levels 4 to 12 carry their own audit data in the step (s.audit); the older lessons use the tables above
async function gotoStep(L, i) {   // open the lesson fresh and answer the earlier steps with their own answers
  await js(`localStorage.removeItem('hsim-learn')`);
  await sim(`lesson(${JSON.stringify(L.id)})`);
  for (let k = 0; k < i; k++) {
    const st = L.steps[k];
    if (st.t === 'cmd' || st.t === 'fill' || st.t === 'write') await sim(`lxAnswer(${JSON.stringify(st.ans)})`);
    else if (st.t !== 'read') await sim(`lxAnswer(${st.right})`);
    await sim('lxNext()');
  }
  return sim('lxState()');
}
const st = () => sim('lxState()');
for (const L of lessons) {
  const raw = await sim(`lxRaw(${JSON.stringify(L.id)})`);
  // a final test gives one try: a wrong answer shows the answer and moves on, so it is marked by its message, not by staying put
  const isOk = r => L.exam ? r.fb.startsWith('\u2713') : r.passed;   // accepted: a tick in a final test (passed is true after a miss too)
  const wrongOk = r => L.exam ? (r.passed && r.fb.startsWith('\u2717')) : (!r.passed && r.fb.startsWith('\u2717'));
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i], key = L.id + '.' + i;
    if (s.t === 'mc') {
      ok(s.opts.filter(o => o[1]).length === 1, `${key}: exactly one right option`);
      ok(s.opts.every(o => typeof o[2] === 'string' && o[2].length > 8), `${key}: every option explains itself`);
      ok(new Set(s.opts.map(o => o[0])).size === s.opts.length, `${key}: no duplicate options`);
      // every wrong option is rejected with its own explanation; the right one passes
      for (let k = 0; k < s.opts.length; k++) {
        await gotoStep(L, i); await sim(`lxAnswer(${k})`); const r = await st();
        ok((L.exam ? r.fb.startsWith('\u2713') : r.passed) === !!s.opts[k][1], `${key}: option ${k + 1} ${s.opts[k][1] ? 'passes' : 'is marked wrong'}`);
      }
    }
    if (s.t === 'bug') {
      ok(Number.isInteger(s.line) && s.line >= 0 && s.line < s.code.length, `${key}: the bug line points at a real line`);
      await gotoStep(L, i); await sim(`lxAnswer(${s.line})`); ok(isOk(await st()), `${key}: clicking the broken line passes`);
      const other = s.line === 0 ? 1 : 0; await gotoStep(L, i); await sim(`lxAnswer(${other})`); const r = await st();
      ok(wrongOk(r), `${key}: clicking a fine line is marked wrong with a message`);
    }
    if (s.t === 'cmd' || s.t === 'fill' || s.t === 'write') ok(s.ans != null, `${key}: has a Show answer`);
    if (s.t === 'write') {
      ok(s.nrules >= 4, `${key}: has at least 4 rules`);
      for (const y of [s.ans].concat(s.alt || [])) { await gotoStep(L, i); await sim(`lxAnswer(${JSON.stringify(y)})`); const r = await st(); ok(isOk(r), `${key}: a correct answer is accepted (${y.slice(0, 50).replace(/\n/g, ' / ')}) got: ${r.fb.slice(0, 80)}`); }
      if (s.canRun) for (const y of (s.bad || [])) { await gotoStep(L, i); await sim(`lxAnswer(${JSON.stringify(y)})`); const r = await st(); ok(wrongOk(r) && (L.exam || r.miss > 0), `${key}: a wrong answer is caught (${y.slice(0, 50).replace(/\n/g, ' / ')}) got: ${r.fb.slice(0, 80)}`); }
      for (const y of ['def', 'x', 'return 1']) { await gotoStep(L, i); await sim(`lxAnswer(${JSON.stringify(y)})`); const r = await st(); ok(L.exam ? r.fb.startsWith('\u2717') : !r.passed, `${key}: a stub (${y}) does not pass`); }
      if (!s.canRun) {   // not run by the page (Python, SQL, TypeScript, React, DOM): compared with the model answer and ticked by the learner
        await gotoStep(L, i); await js(`document.getElementById('lx-write').value = ${JSON.stringify(s.ans)}`); await sim('lxNext()');
        ok(await js(`document.querySelectorAll('.lx-points input').length`) === s.nrules && await js(`!!document.querySelector('.lx-model pre')`), `${key}: Check shows the model answer and one tick box per rule`);
        await sim('lxNext()'); const r2 = await st(); ok(!r2.passed && r2.fb.startsWith('\u2717'), `${key}: unticked points are not accepted`);
      }
    }
    if (s.t === 'explain') {
      ok(s.points >= 3, `${key}: explain lists at least 3 points`);
      await gotoStep(L, i); await sim(`lxAnswer('too short')`); let r = await st();
      ok(!r.passed && /few sentences/.test(r.fb), `${key}: a one-line explanation is not accepted`);
      await gotoStep(L, i); await sim('lxAnswer()'); r = await st(); ok(r.passed, `${key}: a real explanation with the points ticked passes`);
      await gotoStep(L, i); await js(`document.getElementById('lx-explain').value = 'A long enough attempt at an answer, written in my own words, to reach the model answer.'`); await sim('lxNext()'); await sim('lxNext()'); r = await st();
      ok(!r.passed && r.fb.startsWith('\u2717'), `${key}: ticking no points is not enough`);
    }
    if (s.t === 'todo') {
      ok(s.items >= 2, `${key}: todo lists at least 2 items`);
      await gotoStep(L, i); await sim('lxNext()'); let r = await st(); ok(!r.passed && r.fb.startsWith('\u2717'), `${key}: unticked boxes are not accepted`);
      await gotoStep(L, i); await sim('lxAnswer()'); r = await st(); ok(r.passed, `${key}: every box ticked passes`);
    }
    if (s.t === 'cmd' && s.hint) ok(!s.hint.toLowerCase().includes(String(s.ans).toLowerCase()), `${key}: the hint does not contain the exact answer`);
    if (s.t === 'cmd') {
      const v = VAR[key] || (isNew(L) ? s.audit : null); if (!v) { ok(false, `${key}: no variants listed in lessons-audit.mjs`); continue; }
      for (const y of v.yes) { await gotoStep(L, i); await sim(`lxAnswer(${JSON.stringify(y)})`); ok(isOk(await st()), `${key}: "${y}" is accepted`); }
      for (const y of v.no) { await gotoStep(L, i); await sim(`lxAnswer(${JSON.stringify(y)})`); const r = await st();
        ok(!r.passed && r.fb.startsWith('\u2717') && !/Not the command this step needs/.test(r.fb), `${key}: "${y}" is caught with a specific message (got: ${r.fb.slice(0, 70)})`); }
      // the COMMANDS IN THIS STEP line (.lx-uses) names the command word and every dash option of the answer
      await gotoStep(L, i); const uses = (await js(`(document.querySelector('.lx-uses code') || {}).textContent || ''`)).split(' ');
      const toks = String(s.ans).match(/"[^"]*"|'[^']*'|\S+/g) || [];
      ok(uses[0] === toks[0] && toks.filter(t => /^-/.test(t)).every(t => uses.includes(t)), `${key}: COMMANDS IN THIS STEP names the command and its options (${uses.join(' ')})`);
    }
    if (s.t === 'fill') {
      if (!(key in FILL) && !isNew(L)) { ok(false, `${key}: no fill variants listed in lessons-audit.mjs`); continue; }
      for (const y of [s.ans].concat(FILL[key] || [])) { await gotoStep(L, i); await sim(`lxAnswer(${JSON.stringify(y)})`); ok(isOk(await st()), `${key}: fill ${JSON.stringify(y)} is accepted`); }
      await gotoStep(L, i); await sim(`lxAnswer(${JSON.stringify(s.ans.map(() => ''))})`); const r = await st();
      ok(!r.passed && r.miss === 0 && /Fill in every blank/.test(r.fb), `${key}: empty blanks are not counted as a miss`);
    }
  }
}
console.log(`${n} lesson checks over ${lessons.length} lessons, ${bad} failed`);
ok(!errors.length, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
edge.kill(); process.exit(bad ? 1 : 0);

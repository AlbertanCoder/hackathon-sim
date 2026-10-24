// The engine for Levels 4 to 12, through the real page: the timed final test (one try per question, countdown, pass mark, retry,
// time-out, best score), the explain and todo steps, the module page row and the certificate.
// Run: node check/levels.mjs   (prints ok/FAIL lines, then "failed: N")
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-lv-'));
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
const ls = () => sim('lxState()');
const txt = id => js(`document.getElementById('${id}').innerText`);
let bad = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
await cdp('Runtime.enable');
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);

const course = await sim('course()');
const EXAMS = course.flatMap(m => m.lessons.filter(l => l.exam).map(l => ({ mod: m.id, id: l.id })));
ok(EXAMS.length >= 1, 'there is at least one timed final test: ' + EXAMS.map(e => e.id).join(', '));
const E = EXAMS[0];
const steps = course.find(m => m.id === E.mod).lessons.find(l => l.id === E.id).steps;
const N = steps.length;
// answer step i right, or wrong (a deliberately wrong answer for each kind)
async function answer(i, right) {
  const s = steps[i];
  if (s.t === 'mc') { const k = s.right; await sim(`lxAnswer(${right ? k : (k === 0 ? 1 : 0)})`); }
  else if (s.t === 'bug') { await sim(`lxAnswer(${right ? s.right : (s.right === 0 ? 1 : 0)})`); }
  else if (s.t === 'fill') { await sim(`lxAnswer(${right ? JSON.stringify(s.ans) : "['zzz','zzz','zzz']"})`); }
  else if (s.t === 'write') { await sim(`lxAnswer(${right ? JSON.stringify(s.ans) : JSON.stringify('x')})`); }
  else if (s.t === 'cmd') { await sim(`lxAnswer(${right ? JSON.stringify(s.ans) : "'zzz'"})`); }
}
async function playTest(wrongAt) {
  await sim(`lesson(${JSON.stringify(E.id)})`); await sleep(60);
  for (let i = 0; i < N; i++) { await answer(i, !wrongAt.includes(i)); await sim('lxNext()'); await sleep(15); }
  return ls();
}

// ---- 1. the test opens as a test ----
await js(`localStorage.clear()`);
await sim(`lesson(${JSON.stringify(E.id)})`); await sleep(80);
let s = await ls();
ok(new RegExp(`^TEST · QUESTION 1 OF ${N} · TIME LEFT \\d+:\\d\\d$`).test(s.step), 'the step line shows the question and a countdown: ' + s.step);
ok(await js(`document.getElementById('lx-eyebrow').textContent.startsWith('FINAL TEST')`), 'the eyebrow says FINAL TEST');
ok(await js(`document.getElementById('lx-prev').hidden && document.getElementById('lx-priya').hidden`), 'no Back and no tutor in a final test');
// ---- 2. one try: a wrong answer shows the answer and moves on ----
await answer(0, false); s = await ls();
ok(s.passed && s.fb.startsWith('✗') && /The answer: /.test(s.fb) && /one try/.test(s.fb), 'a wrong answer is marked wrong, the answer is shown, and Next is offered: ' + s.fb.slice(0, 90));
ok(!(await js(`document.getElementById('lx-hint').hidden === false`)), 'no hint is offered in a final test');
await sim('lxNext()'); s = await ls();
ok(s.i === 1 && /QUESTION 2 OF/.test(s.step), 'Next moves to question 2');
await sleep(1200); s = await ls();
ok(/TIME LEFT 24:5\d|TIME LEFT 25:0\d|TIME LEFT 24:4\d/.test(s.step), 'the countdown runs: ' + s.step);

// ---- 3. 12 of 13 right is a pass ----
await js(`localStorage.clear()`);
s = await playTest([0]);
ok(s.step === 'TEST PASSED', 'one miss in ' + N + ' still passes (92%): ' + s.step);
ok(/Passed/.test(s.body) && /What you missed/.test(s.body), 'the result says Passed and lists what was missed');
const pct = Math.round((N - 1) / N * 100);
ok(s.saved.done[E.id] > 0 && s.saved.exam[E.id].best === pct && s.saved.exam[E.id].runs === 1, `the pass is saved with its score (${pct}%) and one run`);
ok(await js(`!!document.getElementById('lx-donemap') && !document.getElementById('lx-exagain')`), 'a pass offers Back to the module, not a retry');
// ---- 4. too many misses: not passed, not marked done, retry offered ----
await js(`localStorage.clear()`);
s = await playTest([0, 1, 2, 3]);
ok(s.step === 'TEST NOT PASSED YET' && /Not yet/.test(s.body), 'four misses fail the test: ' + s.step);
ok(!s.saved.done[E.id] && s.saved.exam[E.id].best === Math.round((N - 4) / N * 100), 'a fail is not marked done, but its best score is kept');
ok(await js(`!!document.getElementById('lx-exagain')`), 'a fail offers "Try the test again"');
await js(`document.getElementById('lx-exagain').click()`); await sleep(100); s = await ls();
ok(s.i === 0 && /QUESTION 1 OF/.test(s.step), 'Try again starts at question 1');
// a better second run raises the best score and passes
await js(`localStorage.setItem('hsim-learn', JSON.stringify({exam:{[${JSON.stringify(E.id)}]:{best:40,runs:1,last:40,at:1}}}))`);
s = await playTest([]);
ok(s.step === 'TEST PASSED' && s.saved.exam[E.id].best === 100 && s.saved.exam[E.id].runs === 2, 'a clean second run passes with a best of 100% and 2 runs');

// ---- 5. time runs out ----
await js(`localStorage.clear()`);
await sim(`lesson(${JSON.stringify(E.id)})`); await sleep(60);
await answer(0, true); await sim('lxNext()');
await js(`(() => { const o = Date.now; Date.now = () => o() + 30 * 60 * 1000; })()`); await sleep(900); s = await ls();
ok(s.step === 'TEST NOT PASSED YET' && /time ran out/.test(s.body), 'when the time is up the test ends and says so: ' + s.step);
ok(!s.saved.done[E.id], 'a timed-out test is not marked done');
await js(`location.reload()`); await sleep(1200);

// ---- 6. the module page: the test row, then the certificate ----
await js(`localStorage.clear()`);
const idx = course.findIndex(m => m.id === E.mod);
await sim(`modPage(${idx}, false)`); await sleep(120);
ok(await js(`[...document.querySelectorAll('#lxm-${E.mod} .lx-l.test')].some(b => /FINAL TEST · \\d+ MIN · PASS 80%/.test(b.textContent))`), 'the module page lists the final test with its minutes and pass mark');
ok(await js(`!document.querySelector('#lxm-${E.mod} .lx-cert')`), 'no certificate before everything is done');
await sim(`modPage(${idx}, true)`); await sleep(120);
ok(await js(`(document.querySelector('.lx-cert') || {}).innerText && /You finished all/.test(document.querySelector('.lx-cert').innerText) && !/Shad/.test(document.querySelector('.lx-cert').innerText)`), 'with every item done, the module page shows the certificate (and it does not name Shad)');
ok((await js(`document.getElementById('lx-sum').textContent`)).includes('timed final test'), 'the module summary promises the final test');

// ---- 7. a project step: todo and explain are honour-system steps with a real check ----
const proj = course.find(m => m.id === E.mod).lessons.find(l => l.proj && !l.exam);
if (proj) {
  await js(`localStorage.clear()`);
  await sim(`lesson(${JSON.stringify(proj.id)})`); await sleep(60);
  const kinds = proj.steps.map(x => x.t);
  ok(kinds.includes('todo') && kinds.includes('explain'), 'the project uses todo and explain steps: ' + kinds.join(','));
  const ti = kinds.indexOf('todo');
  for (let i = 0; i < ti; i++) { const st = proj.steps[i]; if (st.t === 'cmd' || st.t === 'fill' || st.t === 'write') await sim(`lxAnswer(${JSON.stringify(st.ans)})`); else if (st.t !== 'read') await sim(`lxAnswer(${st.right})`); await sim('lxNext()'); }
  s = await ls();
  ok(s.kind === 'todo' && await js(`document.querySelectorAll('.lx-todo input').length >= 2 && !document.getElementById('lx-check').hidden`), 'a todo step shows its boxes and a Check button');
  await sim('lxNext()'); s = await ls();
  ok(!s.passed && s.fb.startsWith('✗') && /honour system/.test(s.fb), 'unticked boxes are not accepted, and the message says it is honour system: ' + s.fb.slice(0, 80));
  await js(`document.querySelector('.lx-todo input').click()`); await sim('lxNext()'); s = await ls();
  ok(!s.passed, 'one box of several is not enough');
  await sim('lxAnswer()'); s = await ls();
  ok(s.passed && s.fb.startsWith('✓'), 'every box ticked passes');
}
// ---- 8. an optional lesson never blocks the certificate and never counts toward the main progress ----
const OPTMOD = course.find(m => m.lessons.some(l => l.optional));
if (OPTMOD) {
  const opt = OPTMOD.lessons.filter(l => l.optional), req = OPTMOD.lessons.filter(l => !l.optional && (l.steps || l.term));
  await js(`localStorage.clear(); localStorage.setItem('hsim-learn', JSON.stringify({done:${JSON.stringify(Object.fromEntries(req.map(l => [l.id, Date.now()])))}, days:[]}))`);
  await sim(`modPage(${course.findIndex(m => m.id === OPTMOD.id)}, false)`); await sleep(150);
  ok(await js(`!!document.querySelector('#lxm-${OPTMOD.id} .lx-cert')`), 'with every required item done, the module shows its certificate although the optional lesson is not done');
  const optName = await js(`(() => { const r = [...document.querySelectorAll('#lxm-${OPTMOD.id} .lx-l')].find(b => /OPTIONAL/.test(b.querySelector('small').textContent)); return r ? r.querySelector('span').textContent : null; })()`);
  ok(!!optName, 'the optional lesson is listed with the word OPTIONAL: ' + optName);
  ok(!(await js(`document.getElementById('lx-next').hidden === false && document.getElementById('lx-next').textContent.includes(${JSON.stringify(optName || '??')})`)), 'the Start/Continue button never points at the optional lesson');
  await sim('learn()'); await sleep(120);
  ok(await js(`document.getElementById('lxc-${OPTMOD.id}').classList.contains('done')`), 'the module card shows COMPLETE without the optional lesson');
  const main = course.filter(m => !['hack', 'sky', 'all'].includes(m.id)).flatMap(m => m.lessons).filter(l => (l.steps || l.term) && !l.optional).length;
  ok((await txt('lx-sum')).startsWith('0 of ' + main + ' ') || new RegExp('^' + req.length + ' of ' + main + ' ').test(await txt('lx-sum')), 'the course total counts only required lessons: ' + (await txt('lx-sum')).slice(0, 40));
}
// no horizontal scroll at a phone width inside a final test and a project
await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false });
await sim(`lesson(${JSON.stringify(E.id)})`); await sleep(100);
ok(await js(`document.documentElement.scrollWidth <= window.innerWidth + 1`), 'a final test has no sideways scroll at 400 px');
if (proj) { await sim(`lesson(${JSON.stringify(proj.id)})`); await sleep(100); ok(await js(`document.documentElement.scrollWidth <= window.innerWidth + 1`), 'a project has no sideways scroll at 400 px'); }
await cdp('Emulation.clearDeviceMetricsOverride');
// ---- added after the QC audit (2026-10-23): these guard the holes the mutation tests found ----
// (1) a final test survives a reload: same clock, same place, and a miss stays a miss
await js(`localStorage.removeItem('hsim-learn')`);
await sim(`lesson(${JSON.stringify(E.id)})`); await sleep(100);
await answer(0, false); await sim('lxNext()'); await sleep(50);
await js(`location.hash = '#course/${E.id}'`); await cdp('Page.reload'); await sleep(1800);
{
  const st = await ls();
  ok(st.id === E.id && st.i === 1 && /QUESTION 2 OF/.test(st.step), 'a reload in the middle of a final test resumes at the next question: ' + st.step);
  const left = /TIME LEFT (\d+):(\d\d)/.exec(st.step); const secs = left ? +left[1] * 60 + +left[2] : -1;
  ok(secs > 0 && secs < 25 * 60 - 1, 'the clock did not restart on reload: ' + (left ? left[0] : 'none'));
  for (let i = 1; i < N; i++) { await answer(i, true); await sim('lxNext()'); await sleep(15); }
  const done = await js(`JSON.parse(localStorage.getItem('hsim-learn')).exam['${E.id}']`);
  ok(done && done.last === Math.round((N - 1) / N * 100), 'a question missed before the reload still counts as missed: ' + JSON.stringify(done));
  ok(await js(`JSON.parse(localStorage.getItem('hsim-learn')).examRun === null`), 'a finished test leaves no half-finished run behind');
}
// (2) a saved run whose time has run out is ended and recorded when the test is opened again
await js(`(() => { const p = JSON.parse(localStorage.getItem('hsim-learn')); p.exam = {}; p.examRun = {id: '${E.id}', t0: Date.now() - 60 * 60 * 1000, secs: 1500, i: 2, fails: {}}; localStorage.setItem('hsim-learn', JSON.stringify(p)); location.hash = '#course/${E.id}'; })()`);
await cdp('Page.reload'); await sleep(1800);
ok(/NOT PASSED|PASSED/.test((await ls()).step) && await js(`JSON.parse(localStorage.getItem('hsim-learn')).exam['${E.id}'].runs === 1`), 'a saved test whose time ran out is finished and recorded when reopened');
// (3) lesson text with markup is shown as text, never turned into a page element
{
  const found = { id: 'w-dom', i: 3 };   // the bug step whose question quotes <img src=x onerror=alert(1)>
  {
    await js(`(() => { const p = JSON.parse(localStorage.getItem('hsim-learn') || '{}'); p.pos = Object.assign(p.pos || {}, {['${found.id}']: ${found.i}}); localStorage.setItem('hsim-learn', JSON.stringify(p)); })()`);
    await sim(`lesson(${JSON.stringify(found.id)})`); await sleep(150);
    ok(await js(`document.querySelector('#lx-body img') === null && document.getElementById('lx-body').innerText.includes('<img src=x onerror=alert(1)>')`), 'markup in lesson text is escaped: shown as text, no <img> element is created');
  }
}
// (4) typed commands: extra spaces do not matter, and a run of spaces is not a different command
{
  let found = null;
  for (const m of course) for (const l of m.lessons) (l.steps || []).forEach((st, i) => { if (!found && st.t === 'cmd' && st.ans === 'ls -a') found = { id: l.id, i }; });
  if (found) {
    await js(`(() => { const p = JSON.parse(localStorage.getItem('hsim-learn') || '{}'); p.pos = Object.assign(p.pos || {}, {['${found.id}']: ${found.i}}); localStorage.setItem('hsim-learn', JSON.stringify(p)); })()`);
    await sim(`lesson(${JSON.stringify(found.id)})`); await sleep(150);
    await sim(`lxAnswer('  ls     -a  ')`); await sleep(100);
    ok((await ls()).passed === true, 'a command typed with extra spaces is accepted');
  } else ok(false, 'a cmd step with answer "ls -a" exists for the spacing check');
}
// (4b) a practice terminal answers like a real one: ls of a name that is not there says so
{
  let found = null;
  for (const m of course) for (const l of m.lessons) (l.steps || []).forEach((st, i) => { if (!found && st.t === 'cmd' && st.ans === 'ls') found = { id: l.id, i }; });
  ok(!!found, 'a cmd step with answer "ls" exists for the missing-name check');
  if (found) {
    await js(`(() => { const p = JSON.parse(localStorage.getItem('hsim-learn') || '{}'); p.pos = Object.assign(p.pos || {}, {['${found.id}']: ${found.i}}); p.at = {id: '${found.id}', i: ${found.i}}; localStorage.setItem('hsim-learn', JSON.stringify(p)); })()`);
    await sim(`lesson(${JSON.stringify(found.id)})`); await sleep(150);
    await sim(`lxAnswer('ls pwd')`); await sleep(100);
    ok((await js(`document.getElementById('lx-term').innerText`)).includes("ls: cannot access 'pwd': No such file or directory"), 'ls of a name that is not there prints the real error');
    await sim(`lxAnswer('ls')`); await sleep(100);
    ok((await ls()).passed === true, 'the right command still passes after a wrong one');
  }
}
// (5) XP: a lesson is worth 100, a project 150 and a final test 150 (no study days, no hands-on ticks)
await js(`localStorage.setItem('hsim-learn', JSON.stringify({done: {'d-speed': 1, 'd-project': 1, 'd-exam': 1}, days: [], real: {}, quests: [], pos: {}, exam: {}}))`);
await js(`location.hash = '#course'`); await cdp('Page.reload'); await sleep(1500);
ok((await txt('lx-sum')).includes(' 400 XP '), 'one lesson, one project and one final test are worth 400 XP: ' + (await txt('lx-sum')).slice(0, 80));
ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`${n} checks, failed: ${bad}`);
edge.kill();
process.exit(bad ? 1 : 0);

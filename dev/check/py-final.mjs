// The 22 Oct final-check fixes, in headless Edge: every step of the five newest Python lessons (py-files, py-imports,
// py-pytest, py-class, py-docs) at phone and laptop width with no sideways scroll, code example lines that wrap keep
// their indent, glossary words that fit the module, the module page only promising a project or final it has, each
// lesson remembering its own step, the Home button saying Carry on mid-lesson, and the taught-first wording.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-pf-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`, '--remote-debugging-port=0', '--window-size=400,900', 'about:blank'], { stdio: 'ignore' });
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
const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push(x + ' -> ' + JSON.stringify(r.result.exceptionDetails)); return r.result.result?.value; };
const sim = x => js(`window.__sim.${x}`);
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const ls = () => sim('lxState()');
const size = (width, height) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
const LESSONS = ['py-files', 'py-imports', 'py-pytest', 'py-class', 'py-docs'];

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
const course = await sim('course()');
const steps = Object.fromEntries(course.flatMap(m => m.lessons).filter(l => LESSONS.includes(l.id)).map(l => [l.id, l.steps]));
ok(LESSONS.every(x => steps[x]), 'the five lessons are in the course');

// the right answer for the current step, from the course data
const right = (lid, i) => { const s = steps[lid][i]; return s.t === 'mc' || s.t === 'bug' ? s.right : s.ans; };
// page wider than the screen, or code example lines whose wrapped part starts left of where the line starts
let W = 400; const wideNow = () => js(`document.documentElement.scrollWidth > ${W} + 1 || innerWidth > ${W} + 1`);
const badIndent = () => js(`[...document.querySelectorAll('#lx-body .lx-crt > div')].filter(d => { const n = d.firstChild; if (!n || n.nodeType !== 3) return false; const k = n.data.search(/\\S/); if (k < 0) return false;
  const r = document.createRange(); r.setStart(n, k); r.setEnd(n, n.data.length); const b = [...r.getClientRects()].filter(x => x.width > 0); return b.length > 1 && Math.min(...b.slice(1).map(x => x.left)) < b[0].left - 1; }).map(d => d.textContent.trim().slice(0, 40))`);   // measured from the first letter, not the leading spaces
// the glossary chips under the current step
const words = () => js(`[...document.querySelectorAll('#lx-body .lx-words button')].map(b => b.textContent)`);

for (const [label, wd, ht] of [['phone', 400, 900], ['laptop', 1366, 800]]) {
  await size(wd, ht); W = wd; await sleep(150);
  for (const lid of LESSONS) {
    await js(`localStorage.removeItem('hsim-learn')`); await sim(`lesson('${lid}')`); await sleep(80);
    const wideAt = [], indentAt = [], offWords = [];
    for (let i = 0; i < steps[lid].length; i++) {
      const st = await ls(); if (st.i !== i) { ok(false, `${label} ${lid}: expected step ${i + 1}, at ${st.step}`); break; }
      if (await wideNow()) wideAt.push(i + 1);
      const bi = await badIndent(); if (bi.length) indentAt.push((i + 1) + ': ' + bi.join(' / '));
      const wds = await words(); if (wds.some(x => x === 'API key' || x === 'judges\u2019 rubric' || x === "judges' rubric")) offWords.push((i + 1) + ': ' + wds.join(', '));
      if (st.kind !== 'read') { await sim(`lxAnswer(${JSON.stringify(right(lid, i))})`); await sleep(60);
        if (await wideNow()) wideAt.push((i + 1) + ' after answering'); }
      if (!(await ls()).passed) { ok(false, `${label} ${lid} step ${i + 1}: the right answer did not pass`); break; }
      await sim('lxNext()'); await sleep(80);
    }
    const end = await ls();
    if (await wideNow()) wideAt.push('lesson-done screen');
    ok(end.step === 'LESSON DONE', `${label} ${lid}: walked all ${steps[lid].length} steps with the right answers to the lesson-done screen`);
    ok(!wideAt.length, `${label} ${lid}: no sideways scroll on any step or the lesson-done screen` + (wideAt.length ? ' (wide at ' + wideAt.join(', ') + ')' : ''));
    if (label === 'phone') ok(!indentAt.length, `phone ${lid}: wrapped code example lines keep their indent` + (indentAt.length ? ' (' + indentAt.join(' | ') + ')' : ''));
    if (label === 'phone') ok(!offWords.length, `phone ${lid}: no "API key" or "judges' rubric" word on a Python step` + (offWords.length ? ' (' + offWords.join(' | ') + ')' : ''));
  }
}
await size(400, 900); await sleep(100);

// the glossary still offers those words where they belong
await js(`localStorage.removeItem('hsim-learn')`); await sim(`lesson('k-boss')`); await sleep(80);
let kw = [];
for (let i = 0; i < 12 && !kw.includes('API key'); i++) { kw = await words(); if (kw.includes('API key')) break; const st = await ls(); if (st.step === 'LESSON DONE') break;
  const s = (await sim('course()')).flatMap(m => m.lessons).find(l => l.id === 'k-boss').steps[st.i];
  if (st.kind !== 'read') await sim(`lxAnswer(${JSON.stringify(s.t === 'mc' || s.t === 'bug' ? s.right : s.ans)})`); await sim('lxNext()'); await sleep(60); }
ok(kw.includes('API key'), 'the Claude Code boss fight (k-boss) still shows the API key word');

// the module page only promises a practice project or a final test the module really has
const sums = {};
for (const [n, m] of course.entries()) { if (m.id === 'all') continue; await sim(`modPage(${n})`); await sleep(60); sums[m.id] = (await ls()).sum; }
const promise = m => /practice project/.test(sums[m.id]) === !!m.project && /final test/.test(sums[m.id]) === (m.tests.length > 0 || m.lessons.some(l => l.exam));   // a final test is a drill or a timed exam lesson
const wrong = course.filter(m => m.id !== 'all' && !promise(m)).map(m => m.id);
ok(!wrong.length, 'each module page mentions a practice project and a final test only when the module has one' + (wrong.length ? ' (wrong: ' + wrong.join(', ') + ')' : ''));
ok(!/practice project|final test/.test(sums.python), 'the Python module page no longer promises a project or a final test: ' + sums.python.slice(-90));

// every lesson remembers its own step: leave py-files at step 3, open py-imports, come back to py-files
await js(`localStorage.removeItem('hsim-learn')`);
await sim(`lesson('py-files')`); await sleep(60);
for (let i = 0; i < 2; i++) { const st = await ls(); if (st.kind !== 'read') await sim(`lxAnswer(${JSON.stringify(right('py-files', i))})`); await sim('lxNext()'); await sleep(60); }
ok((await ls()).i === 2, 'py-files left at step 3');
await sim(`lesson('py-imports')`); await sleep(60); await sim('lxNext()'); await sleep(60);
ok((await ls()).i === 1, 'py-imports opened and moved on to step 2');
await sim(`lesson('py-files')`); await sleep(60);
ok((await ls()).step === 'STEP 3 OF 8', 'reopening py-files from the list carries on at step 3, not step 1: ' + (await ls()).step);
await sim(`lesson('py-imports')`); await sleep(60);
ok((await ls()).step === 'STEP 2 OF 7', 'reopening py-imports carries on at step 2: ' + (await ls()).step);
// a finished lesson starts from step 1 when opened again
await js(`localStorage.removeItem('hsim-learn')`); await sim(`lesson('py-docs')`); await sleep(60);
for (let i = 0; i < steps['py-docs'].length; i++) { const st = await ls(); if (st.kind !== 'read') await sim(`lxAnswer(${JSON.stringify(right('py-docs', i))})`); await sim('lxNext()'); await sleep(60); }
await sim(`lesson('py-docs')`); await sleep(60);
ok((await ls()).step === 'STEP 1 OF 7', 'a finished lesson opens again at step 1: ' + (await ls()).step);

// Home: mid-lesson with nothing finished, the button says Carry on (not Start the course)
await js(`localStorage.removeItem('hsim-learn')`); await sim(`lesson('py-files')`); await sleep(60); await sim('lxNext()'); await sleep(60);
await js(`location.hash = '#home'`); await sleep(200);
const home = await js(`({btn: document.getElementById('home-course').textContent, line: document.getElementById('home-cnext').textContent})`);
ok(home.line.startsWith('Carry on') && home.btn === 'Carry on', 'Home mid-lesson: the line and the button both say Carry on (' + home.btn + ' | ' + home.line + ')');
await js(`localStorage.removeItem('hsim-learn')`); await js(`location.hash = '#course'`); await sleep(100); await js(`location.hash = '#home'`); await sleep(200);
ok(await js(`document.getElementById('home-course').textContent`) === 'Start the course', 'Home with nothing started still says Start the course');

// taught first, plain English, and the wording slips (read from the lesson text the page shows)
const raw = Object.fromEntries(await Promise.all(LESSONS.map(async x => [x, JSON.stringify(await sim(`lxRaw('${x}')`))])));
const src = readFileSync(join(root, 'index.html'), 'utf8');
const block = lid => { const m = src.match(new RegExp("\\{id:'" + lid + "'[\\s\\S]*?(?=\\nconst |\\n// )")); return m ? m[0] : ''; };
const P = Object.fromEntries(LESSONS.map(x => [x, block(x)]));
const read1 = lid => P[lid].split("{t:'mc'")[0];   // the lesson's opening read step
ok(/sort_keys=True` (saves|puts|writes)/.test(read1('py-files')), 'py-files teaches sort_keys in its read step, before step 2 asks about it');
ok(/"w"/.test(read1('py-files')) && /"a"/.test(read1('py-files')) && /`with/.test(read1('py-files')), 'py-files teaches the "w" and "a" modes and `with` before the fill step');
ok(/json\.load`/.test(read1('py-files')) || /`json\.dump` and `json\.load`/.test(read1('py-files')), 'py-files names json.load (no s) before the bug step uses it');
ok(/encoding=\\?"utf-8\\?"/.test(read1('py-files')) && /accent|é|special letters/i.test(read1('py-files')), 'py-files says what encoding="utf-8" is for');
ok(/`async`/.test(read1('py-files')) && /`await`/.test(read1('py-files')), 'py-files says in plain English what async and await mean');
ok(/\*\*decorator\*\*/.test(read1('py-pytest')), 'py-pytest explains the word decorator in its read step');
ok(/`bytes`/.test(P['py-docs']) && /raw/i.test(P['py-docs'].split("{t:'mc'")[1] || ''), 'py-docs step 2 explains bytes');
ok(/repeats/i.test(P['py-docs'].split("{t:'mc'")[2] || ''), 'py-docs step 3 says text times a number repeats it');
ok(/`help\(/.test(read1('py-docs')), 'py-docs teaches help() before the fill step asks for it');
ok(/active/.test(P['py-imports']) && /this terminal (now )?uses/i.test(P['py-imports']), 'py-imports says what "the .venv is active" means');
ok(!/looks like this:'/.test(P['py-docs']) && !/Real lines from your bot:'/.test(P['py-imports']) && !/\(shortened\):'/.test(P['py-class']), 'no read step points at the code with a colon before another paragraph');
ok(!/\]:`\. What/.test(P['py-docs']), 'no stray ":." in py-docs step 2');
ok(Object.values(raw).every(r => r.length > 50), 'the page returns the raw steps of all five lessons');

ok(!errors.length, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
edge.kill(); process.exit(bad ? 1 : 0);

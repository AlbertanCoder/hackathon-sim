// Plays the Learn course in headless Edge: course map, every written lesson (wrong answers, hints, show-the-answer),
// progress saving, quick review, final-test links, phone width, and the optional tutor against a fake DeepSeek.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-lx-'));
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
const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push(x + ' -> ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result?.value; };
const sim = x => js(`window.__sim.${x}`);
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const ls = () => sim('lxState()');
const wide = async where => ok(await js('document.documentElement.scrollWidth <= innerWidth'), where + ': no sideways scroll at phone width');

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__calls = 0; window.__last = null; window.__fail = 0; window.__reply = 'Think of pwd like checking which room you are standing in.'; const real = window.fetch;
  window.fetch = async (u, o) => {
    if (!/deepseek|openrouter/.test(String(u))) return real(u, o);
    window.__calls++; window.__last = JSON.parse(o.body);
    if (window.__fail) return new Response('{}', {status:window.__fail});
    return new Response(JSON.stringify({choices:[{message:{content: JSON.stringify({reply:window.__reply})}}], usage:{prompt_tokens:100, completion_tokens:40}}), {status:200});
  };` });
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);

// ---- the course map ----
ok((await ls()).screen === 'home' && await js(`['nav-home','nav-course','nav-play','nav-drills','menu-btn'].every(id => document.getElementById(id).getBoundingClientRect().width > 0)`), 'the app opens on Home with the top bar: Home, Course, Play, Drills, Settings');
await js(`document.getElementById('nav-course').click()`); await sleep(150);
ok(await js(`document.getElementById('nav-course').getAttribute('aria-current') === 'page' && location.hash === '#course'`), 'the Course tab is marked as the current page and the address says #course');
let s = await ls();
ok(s.screen === 'learn' && s.part === 'map', 'Learn opens the course map');
const course = await sim('course()');
const OLD8 = ['term', 'git', 'claude', 'power', 'hack', 'sky', 'python', 'all'];
ok(course.map(m => m.id).filter(id => OLD8.includes(id)).join(',') === OLD8.join(',') && course.map(m => m.id).indexOf('python') < course.map(m => m.id).indexOf('all'), 'the original eight modules stay in order (Levels 4 to 12 sit between python and all): ' + course.map(m => m.id).join(', '));
const written = course.flatMap(m => m.lessons.filter(l => l.steps));
const ready = course.flatMap(m => m.lessons.filter(l => l.steps || l.term)), N = ready.length;
const plain = written.filter(l => !l.proj && !l.exam), exams = written.filter(l => l.exam), projs = course.filter(m => m.project).map(m => m.project);
ok(course.filter(m => m.id !== 'all').every(m => m.lessons.every(l => l.steps || l.term)), 'every lesson in every module is written (' + plain.length + ' lessons, ' + projs.length + ' practice projects, ' + N + ' items)');
ok(plain.every(l => l.steps.length >= 4 && l.steps.length <= 8), 'every lesson has 4 to 8 steps');
ok(exams.every(l => l.steps.length >= 10 && l.steps.length <= 16), 'every final test has 10 to 16 questions (' + exams.length + ' final tests)');
ok(written.filter(l => l.proj).every(l => l.steps.length >= 8 && l.steps.length <= 10), 'the Claude and Hackathon projects have 8 to 10 steps');
ok(course.find(m => m.id === 'sky').lessons.map(l => l.id).join(',') === 's-data,s-what,s-pilot,s-anykit', 'Eyes on the Sky has 4 lessons: s-data, s-what, s-pilot, s-anykit');
ok(course.filter(m => !['power','sky','python','all'].includes(m.id)).every(m => m.project) && projs.filter(p => p.term).map(p => p.term).join(',') === 'crash,merge', 'modules 1 to 4 end with a practice project (terminals: crash, merge)');
ok(await js(`document.querySelectorAll('.lx-l.soon').length`) === 0, 'no lesson shows as coming next');
ok(await js(`[...document.querySelectorAll('.lx-mod')].every(sec => { const b = [...sec.querySelectorAll('.lx-l')]; const p = b.findIndex(x => x.classList.contains('proj')), t = b.findIndex(x => x.classList.contains('test')); return p < 0 || t < 0 || p < t; })`), 'each practice project is listed before the final test');
const ids = await sim('drillIds()');
ok(ids.every(d => course.some(m => m.tests.includes(d))), 'all 7 drills are linked as final tests');
ok(await js(`document.querySelectorAll('.lx-l.test').length`) >= 7, 'final tests are listed in the modules');
const NMAIN = course.filter(m => !['hack', 'sky', 'all'].includes(m.id)).flatMap(m => m.lessons).filter(l => (l.steps || l.term) && !l.optional).length;   // the optional hackathon track does not count until it is turned on, and optional lessons never count
ok(s.sum.startsWith(`0 of ${NMAIN} lessons done`) && await js(`document.getElementById('lx-review').hidden`), `progress starts at 0 of ${NMAIN} (main course) and Quick review is hidden`);
ok((await js(`document.getElementById('lx-next').textContent`)).includes('Where am I'), 'the next-lesson button points at the first lesson');
// ---- the Weekend path: part of the optional hackathon track (turned on here), 29 items; Next follows it (skips t-fix); the toggle goes back to course order ----
await js(`localStorage.setItem('hsim-hackathon', 'on')`); await sim('learn()'); await sleep(60);
ok(await js(`!document.getElementById('lx-wk').hidden && document.querySelectorAll('#lx-wk-list .lx-l').length === 29`), 'the Weekend path panel shows 29 lessons on the dashboard');
ok((await sim('weekend()')).includes('h-dayof') && (await sim('course()')).find(m => m.id === 'hack').lessons.some(x => x.id === 'h-dayof' && x.steps.length === 5), 'the day-of checklist lesson is on the Weekend path inside Hackathon skills, with five steps');
await js(`localStorage.setItem('hsim-learn', JSON.stringify({done:{'t-where':true,'t-cd':true,'t-read':true,'t-grep':true,'t-errors':true}}))`); await sim('learn()'); await sleep(60);
ok((await js(`document.getElementById('lx-next').textContent`)).includes('Practice project: the crash'), 'with the weekend path on, Next skips t-fix and goes to the crash project');
await js(`document.getElementById('lx-wk-btn').click()`); await sleep(60);
ok((await js(`document.getElementById('lx-next').textContent`)).includes('Read the code, fix one line') && !(await js(`!!document.getElementById('lx-wk-list')`)), 'turning it off goes back to course order (t-fix next) and hides the list');
await js(`document.getElementById('lx-wk-btn').click()`); await sleep(60);
ok(await js(`localStorage.getItem('hsim-weekend') === 'on' && !!document.getElementById('lx-wk-list')`), 'turning it back on saves and shows the list again');
if (new Date() < new Date(2026, 10, 14)) {
  await js(`localStorage.setItem('hsim-learn', '{}')`); await sim('learn()'); await sleep(60);
  ok((await js(`document.getElementById('lx-wk-track').textContent`)).startsWith('Behind by'), 'with nothing done, the on-track line says how many lessons to do today');
}
await js(`localStorage.setItem('hsim-learn', JSON.stringify({done:Object.fromEntries(window.__sim.weekend().map(id => [id, true]))}))`); await sim('learn()'); await sleep(60);
ok(await js(`!!document.getElementById('lx-wk-cert') && !document.getElementById('lx-wk-track') && [...document.querySelectorAll('.lx-badge.got')].some(b => b.textContent.includes('Hackathon ready'))`), 'all 28 done shows the HACKATHON READY certificate and earns the Hackathon ready badge');
await js(`document.getElementById('nav-home').click()`); await sleep(80);
ok((await js(`document.getElementById('home-cprog').textContent`)).includes('29 of 29 weekend lessons · Hackathon ready'), 'Home shows 29 of 29 weekend lessons, Hackathon ready');
ok(JSON.stringify(await sim('weekend()')).includes('"g-team","g-branch","c-ask"'), 'the weekend path has g-branch right after g-team');
ok(JSON.stringify(await sim('weekend()')).includes('"s-pilot","s-anykit","p-hack"'), 'the weekend path has s-anykit right after s-pilot');
// ---- gates on the Weekend path (13 Oct): the next module opens when the one before is done and its final has been played once ----
await js(`localStorage.setItem('hsim-learn', JSON.stringify({done:{'t-where':true,'t-cd':true,'t-read':true,'t-grep':true,'t-errors':true,'p-term':true}})); localStorage.removeItem('hsim-drills')`); await sim('learn()'); await sleep(60);
ok(await js(`(() => { const r = [...document.querySelectorAll('#lx-wk-list .lx-l')].find(x => x.textContent.includes('Why git')); return !!r && r.classList.contains('gated') && /OPENS AFTER TERMINAL BASICS AND ITS FINAL: TERMINAL TRIAGE/.test(r.textContent); })()`), 'with Terminal basics done but its final unplayed, the first Git lesson is gated and says why');
await js(`location.hash = '#course/g-why'`); await sleep(300);
ok((await sim('lxState()')).part === 'map' && (await js(`document.getElementById('lx-next').textContent`)) === 'Final test: Terminal triage', 'opening a gated lesson lands on the module page, where the final test is the next button');
await js(`localStorage.setItem('hsim-drills', JSON.stringify({debug:{best:40, runs:1, last:40, at:Date.now()}}))`); await sim('learn()'); await sleep(60);
ok(await js(`(() => { const r = [...document.querySelectorAll('#lx-wk-list .lx-l')].find(x => x.textContent.includes('Why git')); return !!r && !r.classList.contains('gated'); })()`), 'once the final has been played, the Git lessons open');
await js(`location.hash = '#course/g-why'`); await sleep(300);
ok((await sim('lxState()')).part === 'run' && (await sim('lxState()')).id === 'g-why', 'and the deep link opens the lesson');
await js(`localStorage.setItem('hsim-learn', '{}'); localStorage.removeItem('hsim-drills')`); await sim('learn()'); await sleep(60);
await js(`localStorage.removeItem('hsim-learn'); localStorage.removeItem('hsim-weekend'); localStorage.removeItem('hsim-hackathon')`); await sim('learn()'); await sleep(60);
ok((await js(`document.getElementById('lx-next').textContent`)).includes('Where am I'), 'with progress cleared, Next is back at the first lesson');
// ---- no date lock (22 Oct, the course is for anyone): every module and lesson opens on the first tap ----
ok(await js(`!document.getElementById('lxc-python').textContent.includes('OPENS 16 NOV')`), 'the Python module card no longer says it opens 16 Nov');
await js(`document.getElementById('lxc-power').click()`); await sleep(60);
ok(await js(`document.querySelectorAll('#lxm-power .lx-l.locked').length === 0`), 'the power-user module has no locked lessons');
await sim('learn()'); await sleep(40); await js(`document.getElementById('lxc-python').click()`); await sleep(60);
ok(await js(`document.querySelectorAll('#scr-learn .lx-l.locked').length === 0`), 'no lesson anywhere shows as locked');
await js(`[...document.querySelectorAll('#lxm-python .lx-l')].find(b => b.textContent.includes('Functions and return')).click()`); await sleep(80);
ok((await ls()).id === 'py-return', 'one tap opens a Python lesson');
await js(`localStorage.removeItem('hsim-learn')`); await sim('learn()'); await sleep(60);
await wide('course map');
// ---- phone fixes (13 Oct): the claude.ai viewer's floating bar, and short commands that must not break across lines ----
await js(`document.body.classList.add('viewer')`); await sleep(30);
ok(await js(`parseInt(getComputedStyle(document.querySelector('.cab')).paddingTop) >= 80 && getComputedStyle(document.querySelector('.brand')).display === 'none'`), 'inside the claude.ai viewer on a phone the page starts below the floating bar and drops the duplicate title');
ok(await js(`document.querySelectorAll('#nav .nv i > svg').length === 6 && [...document.querySelectorAll('#nav .nv i')].every(i => !i.textContent.trim())`), 'every tab icon is a drawn icon, so a phone cannot swap some of them for colour emoji');
await wide('course map inside the viewer');
await js(`const st = document.createElement('style'); st.id = 'host-white'; st.textContent = 'body{margin:0;padding:0;font:14px -apple-system,sans-serif;background:#fff;color:#000}'; document.head.prepend(st)`); await sleep(30);   // the claude.ai page skeleton's own body rule, placed before the app's styles
ok(await js(`getComputedStyle(document.body).color === 'rgb(244, 239, 229)' && getComputedStyle([...document.querySelectorAll('#scr-title p')].find(p => p.textContent.startsWith('You are Shad'))).color === 'rgb(244, 239, 229)'`), 'plain paragraph text stays light under the claude.ai page skeleton, which sets body text black ahead of the app styles');
ok(await js(`getComputedStyle(document.body).backgroundColor === 'rgb(13, 15, 23)' && getComputedStyle(document.documentElement).backgroundColor === 'rgb(13, 15, 23)'`), 'the page ground stays dark under the claude.ai page skeleton, which paints the body white ahead of the app styles');
await js(`document.getElementById('host-white').remove()`);
await js(`scrollTo(0, 400)`); await sleep(30); await js(`document.getElementById('nav-drills').click()`); await sleep(150);
ok(await js(`document.body.dataset.screen === 'drills' && scrollY === 0`), 'changing page from part-way down a long page lands at the top of the new page');
await js(`localStorage.setItem('hsim-hackathon', 'on')`);   // its rows are the Weekend path list (optional hackathon track)
await js(`document.getElementById('nav-course').click()`); await sleep(100);
ok(await js(`(() => { const r = [...document.querySelectorAll('#scr-learn .lx-l')].find(x => x.offsetParent && x.querySelector('small').textContent); if (!r) return false; const w = r.getBoundingClientRect().width, sp = r.querySelector('span').getBoundingClientRect(), sm = r.querySelector('small').getBoundingClientRect(); return sp.width > w * 0.6 && sm.top >= sp.bottom - 2; })()`), 'on a phone a lesson row gives the name the width and puts the module note under it');
await js(`localStorage.removeItem('hsim-hackathon')`);
ok(await js(`document.querySelectorAll('#scr-learn .lx-l b svg').length >= 2 && ![...document.querySelectorAll('#scr-learn .lx-l b')].some(b => /[\u23F1\u2692\u{1F512}]/u.test(b.textContent))`), 'the markers for tests, projects and locked modules in lesson lists are drawn icons, not symbols a phone turns into emoji');
await js(`document.getElementById('menu-btn').click()`); await sleep(150);
ok(await js(`document.querySelector('#menu .panel').getBoundingClientRect().top >= 80 && [...document.querySelectorAll('#menu .tab')].every((t, i, a) => t.offsetTop === a[0].offsetTop) && getComputedStyle(document.getElementById('set-fs')).display === 'none'`), 'inside the viewer the settings dialog starts below the floating bar, its three tabs sit on one row, and the full-screen button is hidden on phones');
await js(`document.getElementById('menu-done').click()`); await sleep(100);
await sim(`lesson('p-term')`); await sleep(300);
ok(await js(`document.getElementById('term').getBoundingClientRect().top >= 72 && [...document.querySelectorAll('#term button')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 36)`), 'inside the viewer a terminal starts below the floating bar and its buttons are tall enough to tap');
await sim('termQuit()'); await sleep(200);
await sim(`lesson('t-fix')`); await sim('lxNext()'); await sleep(60);
ok(await js(`[...document.querySelectorAll('.opt.lx-codeopt')].length > 0 && [...document.querySelectorAll('.opt.lx-codeopt')].every(o => getComputedStyle(o).whiteSpace === 'pre-wrap' && o.scrollWidth <= o.clientWidth + 1)`), 'on a phone the code lines of a bug step wrap instead of being cut off');
await sim('learn()'); await sleep(60);
await js(`document.body.classList.remove('viewer')`);
await sim(`lesson('t-where')`); await sleep(60); await sim('lxNext()'); await sim(`lxAnswer('pwd')`); await sim('lxNext()'); await sleep(40);
ok(await js(`[...document.querySelectorAll('.lx-body code')].some(c => c.textContent === 'ls --help' && c.classList.contains('nb') && getComputedStyle(c).whiteSpace === 'nowrap')`), 'a short inline command like ls --help never breaks across lines');
await wide('a lesson step'); await js(`localStorage.removeItem('hsim-learn')`); await sim('learn()'); await sleep(40);

await cdp('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(root, 'concepts', '16-learn-map.png'), Buffer.from(r.result.data, 'base64')));

// ---- lesson 1 by hand: wrong answers, specific feedback, hint after 1 miss, show-answer after 3 ----
await sim(`lesson('t-where')`); await sleep(80); s = await ls();
ok(s.part === 'run' && s.kind === 'read' && s.check === 'Next' && s.step === 'STEP 1 OF 7', 'a lesson opens on a reading step with Next: ' + s.step);
ok(!s.ai, 'without a key the tutor box is hidden');
await sim('lxNext()'); s = await ls();
ok(s.kind === 'cmd' && s.check === 'Check' && !s.hint && !s.show, 'step 2 is a mini terminal; no hint before a miss');
ok(s.body.includes('ON YOUR WINDOWS LAPTOP'), 'the step has a Windows note');
await sim(`lxAnswer('ls')`); s = await ls();
ok(!s.passed && s.fb.includes('lists what is') && s.hint && !s.show, 'a near-miss gets a specific message and unlocks Hint');
await cdp('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(root, 'concepts', '18-learn-step.png'), Buffer.from(r.result.data, 'base64')));
await js(`document.getElementById('lx-hint').click()`); s = await ls();
ok(s.fb.startsWith('Hint:'), 'Hint shows a hint');
await sim(`lxAnswer('whereami')`); await sim(`lxAnswer('banana')`); s = await ls();
ok(s.miss === 3 && s.show && s.body.includes('command not found'), 'after 3 misses Show me the answer appears, and nonsense prints command not found');
await js(`document.getElementById('lx-show').click()`); s = await ls();
ok(!s.passed && (await js(`document.getElementById('lx-cmd').value`)) === 'pwd', 'Show me the answer types it in for you to check');
await sim('lxNext()'); s = await ls();
ok(s.passed && s.check === 'Next' && s.body.includes('/home/you'), 'checking it passes and prints the real output');
ok((s.saved.miss['t-where.1'] || 0) === 1, 'the missed step is remembered for review');
await sim('lxNext()'); await sim('lxNext()'); s = await ls();
ok(s.kind === 'cmd', 'reading step 3 then step 4');
await sim(`lxAnswer('  LS ')`); s = await ls();
ok(!s.passed, 'commands are case-sensitive like a real shell');
await sim(`lxAnswer('ls -la')`); s = await ls();
ok(s.passed, 'ls -la also counts');
await sim('lxNext()'); await sim('lxAnswer(1)'); s = await ls();
ok(!s.passed && s.fb.includes('only shows names') && await js(`document.querySelector('#lx-opts .opt.wrong') !== null`), 'a wrong choice is marked and explains itself');
await sim('lxAnswer(0)'); s = await ls();
ok(s.passed && s.fb.startsWith('\u2713'), 'the right choice passes with its reason');
const twSteps = course.find(m => m.id === 'term').lessons.find(l => l.id === 't-where').steps;
await sim('lxNext()'); await sim(`lxAnswer(${twSteps[5].right})`); s = await ls();
ok(s.passed, 'the second choice question passes with its right option (option ' + (twSteps[5].right + 1) + ')');
await sim('lxNext()'); await sim(`lxAnswer('ls')`); s = await ls();
ok(!s.passed && s.fb.includes('dot names'), 'plain ls on the hidden-files step gets a specific message');
await sim(`lxAnswer('ls -a')`); s = await ls();
ok(s.check === 'Finish', 'the last step says Finish');
await sim('lxNext()'); s = await ls();
ok(s.step === 'LESSON DONE' && s.body.includes('TRY IT FOR REAL') && s.saved.done['t-where'], 'finishing saves the checkmark and shows the optional Try it for real box');
ok(await js(`!!document.getElementById('lx-donenext')`) && (await js(`document.getElementById('lx-donenext').textContent`)).includes('Moving around'), 'done screen offers the next lesson');
await js(`document.getElementById('lx-realck').click()`);
ok((await ls()).saved.real['t-where'] > 0, 'ticking Try it for real is saved');
// the lesson-finished screen lists the same topic in recognized courses, as links that open in a new tab
ok(await js(`(() => { const a = [...document.querySelectorAll('#lx-refs a')]; return document.getElementById('lx-refs').innerText.includes('Same topic in real courses:') && a.length === 2 && a.every(x => x.target === '_blank' && x.rel.split(' ').includes('noopener') && x.href.startsWith('https://')); })()`), 'the done screen shows "Same topic in real courses:" with 2 links that open in a new tab (rel noopener)');
{ const want = ['t-where','t-cd','t-read','t-grep','t-errors','p-term','g-why','g-commit','g-undo','g-team','g-branch'], items = course.flatMap(m => m.lessons);
  const bad = want.filter(id => { const l = items.find(x => x.id === id); return !l || !l.refs.length || !l.refs.every(r => r.length === 2 && r[0].length > 10 && /^https:\/\/(swcarpentry\.github\.io|missing\.csail\.mit\.edu|git-scm\.com|github\.com\/skills)\//.test(r[1])); });
  ok(!bad.length, 'every Terminal and Git lesson lists course links (Software Carpentry, Missing Semester, Pro Git, GitHub Skills)' + (bad.length ? ': missing ' + bad.join(', ') : '')); }
{ const want = ['c-ask','c-plan','c-diff','c-test','c-undo','k-perms','p-claude'], items = course.flatMap(m => m.lessons);
  const bad = want.filter(id => { const l = items.find(x => x.id === id); return !l || l.refs.length < 3 || !l.refs.every(r => r.length === 2 && r[0].length > 10 && /^https:\/\/(code\.claude\.com\/docs\/en|anthropic\.skilljar\.com|platform\.claude\.com\/docs|docs\.github\.com\/en)\//.test(r[1])) || !l.refs.some(r => r[1].startsWith('https://code.claude.com/docs/en/')); });
  ok(!bad.length, 'every Claude Code lesson lists at least 3 links, including the official Claude Code docs' + (bad.length ? ': missing ' + bad.join(', ') : '')); }
{ const want = ['h-plan','h-pitch','h-judges','h-rules','h-people','p-hack','s-data','s-what','s-pilot','s-anykit'], items = course.flatMap(m => m.lessons.concat(m.project ? [m.project] : []));
  const bad = want.filter(id => { const l = items.find(x => x.id === id); return !l || !l.refs || l.refs.length < 2 || !l.refs.every(r => r.length === 2 && r[0].length > 10 && /^https:\/\//.test(r[1])); });
  ok(!bad.length, 'every Hackathon skills and Eyes on the Sky item lists at least 2 source links' + (bad.length ? ': missing ' + bad.join(', ') : '')); }
await wide('lesson done');

// ---- every other lesson and project, played with the right answers (fill steps: one wrong try first) ----
// Terminal projects are solved in the practice terminal (no clock, unlimited hints); nothing may create a saved run.
const doneTests = [], lastOf = {};
course.forEach(m => { const r = m.lessons.filter(l => l.steps || l.term); if (r.length) lastOf[r[r.length - 1].id] = m.id; });
let fillWrongOk = 0, fillN = 0;
for (const L of ready.slice(1)) {
  if (L.term) {
    await sim(`lesson(${JSON.stringify(L.id)})`); await sleep(120);
    let tm = await sim('term()');
    ok(tm && !tm.done && (await ls()).step.includes('NO TIMER'), `${L.id}: the practice terminal opens with no timer`);
    for (let h = 0; h < 4; h++) { await sim('termHint()'); await sleep(40); }
    tm = await sim('term()');
    ok(tm.hints === 4 && !/No more hints/.test(tm.out), `${L.id}: Priya gives more than 3 hints in a practice project`);
    await sim('termSolve()'); await sleep(80); await sim('termContinue()'); await sleep(120);
    s = await ls();
    ok(s.step === 'PROJECT DONE' && s.saved.done[L.id] && !(await sim('state()')).save, `${L.id}: solving it marks the project done, with no saved run`);
  } else {
    await sim(`lesson(${JSON.stringify(L.id)})`); await sleep(30);
    for (let i = 0; i < L.steps.length; i++) {
      const st = L.steps[i];
      if (st.t === 'cmd' || st.t === 'write') await sim(`lxAnswer(${JSON.stringify(st.ans)})`);
      else if (st.t === 'fill' && L.exam) await sim(`lxAnswer(${JSON.stringify(st.ans)})`);   // a final test gives one try, so no wrong attempt first
      else if (st.t === 'fill') { fillN++; await sim(`lxAnswer(['zzz','zzz','zzz'])`); const f = await ls(); if (f.passed) ok(false, L.id + ' fill accepted a wrong answer'); else if (f.fb.startsWith('\u2717')) fillWrongOk++; await sim(`lxAnswer(${JSON.stringify(st.ans)})`); }
      else if (st.t === 'ant') await sim('lxAnswer(true)');
      else if (st.t !== 'read') await sim(`lxAnswer(${st.right})`);
      s = await ls();
      if (!s.passed) { ok(false, `${L.id} step ${i + 1} (${st.t}) did not pass with its own answer: ${s.fb}`); break; }
      await sim('lxNext()');
    }
    s = await ls();
    ok(s.step === (L.exam ? 'TEST PASSED' : 'LESSON DONE'), `${L.id}: all ${L.steps.length} steps pass with the right answers`);
  }
  if (await js(`!!document.getElementById('lx-donetest')`)) doneTests.push(L.id);
  await wide(L.id);
}
ok(fillN > 0 && fillWrongOk === fillN, `every fill step rejects a wrong answer with a message (${fillWrongOk} of ${fillN})`);
const wantTests = Object.keys(lastOf).filter(id => course.find(m => m.id === lastOf[id]).tests.length);
ok(wantTests.every(id => doneTests.includes(id)), 'finishing each module offers its final test: ' + doneTests.join(', '));
await js(`document.getElementById('lx-donemap').click()`); await sleep(80);
ok(await js(`location.hash`) === '#course/m/' + course.filter(m => m.lessons.length).pop().id &&await js(`document.getElementById('lx-crumbs').innerText.includes('Course')`), '"Back to the module" opens the module page with breadcrumbs');
await sim('learn()'); await sleep(60); s = await ls();
ok(await js(`document.querySelectorAll('#lx-cards .mcard').length`) === course.length && await js(`document.querySelectorAll('#lx-cards .mcard.done').length`) === course.length - 1, 'the course dashboard shows 8 module cards, 7 complete');
const NREQ = N - ready.filter(l => l.optional).length;   // optional lessons never count toward the main progress
ok(s.sum.startsWith(`${NREQ} of ${NREQ} lessons done`) && /1 day in a row/.test(s.sum), `the map shows ${NREQ} of ${NREQ} and a 1-day streak`);
ok(await js(`document.getElementById('lx-next').hidden`), 'no next lesson left on the dashboard');
await js(`document.getElementById('lxc-term').click()`); await sleep(60);
ok(await js(`document.querySelectorAll('#lxm-term .lx-l.done').length`) === 7 && await js(`document.querySelectorAll('#lx-mods .lx-mod').length`) === 1, 'a module page lists only that module, every item checked');
await sim('learn()'); await sleep(40);
ok(!(await sim('state()')).save, 'the whole course never creates a saved run');
await cdp('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(root, 'concepts', '17-learn-done.png'), Buffer.from(r.result.data, 'base64')));

// ---- quick review: 5 steps from finished lessons, the missed step first in line ----
ok(!(await js(`document.getElementById('lx-review').hidden`)), 'Quick review appears once lessons are done');
await js(`document.getElementById('lx-review').click()`); await sleep(50); s = await ls();
ok(s.id === 'review' && s.n === 5 && s.step === 'REVIEW 1 OF 5', 'Quick review has 5 steps');
const seenKeys = [];
let guard = 0;
while ((await ls()).step !== 'REVIEW DONE' && guard++ < 20) {
  seenKeys.push((await ls()).key);
  // answer whatever step is up by revealing it (Show me the answer always works once shown), then move on
  await js(`document.getElementById('lx-show').click()`); s = await ls();
  if (!s.passed) await sim('lxNext()');   // cmd/fill: the answer is typed in, Check passes it
  if (!(await ls()).passed && await js(`!!document.querySelector('.lx-points input')`)) { await js(`document.querySelectorAll('.lx-points input').forEach(x => { x.checked = true; })`); await sim('lxNext()'); }   // a write step the page cannot run: tick the model-answer points
  await sim('lxNext()');
}
s = await ls();
ok(s.step === 'REVIEW DONE', 'the review plays through to the end');
ok(seenKeys.includes('t-where.1'), 'the step missed earlier comes back in the review: ' + seenKeys.join(', '));
ok(!(await ls()).saved.done.review, 'a review does not count as a lesson');

// ---- final test link opens the timed drill; back returns to the course; the saved run is untouched ----
await sim('learn()'); await sleep(50);
await js(`document.getElementById('lxc-hack').click()`); await sleep(60);
await js(`[...document.querySelectorAll('#lxm-hack .lx-l.test')].find(b => b.textContent.includes('short pitch')).click()`); await sleep(150);
const d = await sim('drState()');
ok(d.screen === 'drills' && d.part === 'dr-run' && d.q.includes('BRIEFING'), 'a final test opens the timed drill briefing');
await js(`document.getElementById('dr-stop').click()`); await sleep(100);
await js(`document.getElementById('dr-back').click()`); await sleep(100);
ok((await ls()).screen === 'learn', 'leaving the drills returns to the course');
ok(!(await sim('state()')).save, 'Learn never creates a saved run');
await js(`document.getElementById('lx-back').click()`); await sleep(80);
ok((await sim('state()')).screen === 'title', 'Back to the title works');

// ---- progress survives a reload; optional tutor with a key ----
await js(`localStorage.setItem('hsim-ai', JSON.stringify({key:'sk-test', model:'deepseek-flash'}))`);
await cdp('Page.reload'); await sleep(1200);
await sim('learn()'); await sleep(50); s = await ls();
ok(s.sum.startsWith(`${NREQ} of ${NREQ}`), 'progress survives a reload');
await sim(`lesson('t-cd')`); await sleep(50); s = await ls();
ok(!s.ai && await js(`!document.getElementById('lx-priya').hidden`), 'with a key the step shows an Ask Priya button (folded shut)');
await js(`document.getElementById('lx-priya').click()`); s = await ls();
ok(s.ai, 'Ask Priya opens Explain it differently and the Ask box');
await js(`document.getElementById('lx-explain').click()`); await sleep(400);
let ch = await sim('lxChat()');
ok(/^YOU:/.test(ch.text) && /PRIYA:\s*Think of pwd/.test(ch.text), 'Explain it differently shows a YOU / PRIYA chat');
const sys = await js(`window.__last && window.__last.messages[0].content`);
ok(/Never give the exact answer/.test(sys || '') && /at most 90 words/.test(sys) && /Job-site/.test(sys), 'Priya is told: never the answer, at most 90 words, job-site comparisons welcome');
// a wrong attempt on the cmd step, then a question: the attempt and its feedback are sent, the answer is not
await sim('lxNext()'); await sim(`lxAnswer('cd projekts')`); s = await ls();
const callsBefore = await js('window.__calls');
ok(!s.passed && callsBefore === await js('window.__calls'), 'a wrong answer is checked without the AI');
ch = await sim('lxChat()');
ok(ch.chat.length === 0 && ch.tries.length === 1 && ch.tries[0].a.includes('cd projekts'), 'moving to the next step clears the chat; the wrong attempt is remembered');
await js(`document.getElementById('lx-ask').value = 'what is a folder?'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(400);
let last = await js('window.__last');
const sys2 = last.messages[0].content, msgs = last.messages;
ok(sys2.includes('cd projekts') && /Check the spelling/.test(sys2), 'Priya sees the attempt and the feedback it got');
ok(!/cd (~\/)?projects/.test(sys2) && !msgs.some(m => /cd (~\/)?projects/.test(m.content)) && /The lesson said: [^\n]*\[the answer\]/.test(sys2), 'the exact answer is never sent to Priya, even when the feedback quotes it');
ok(msgs[msgs.length - 1].role === 'user' && msgs[msgs.length - 1].content.includes('what is a folder?'), 'Ask sends the question');
// a second miss: from then on Priya is handed the answer and told to give it
await sim(`lxAnswer('cd proj')`); s = await ls();
ok(!s.passed && s.miss === 2, 'a second wrong answer is the second miss');
await js(`document.getElementById('lx-ask').value = 'just tell me'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(400);
last = await js('window.__last'); const sys3 = last.messages[0].content;
ok(/missed twice/.test(sys3) && /cd projects/.test(sys3) && !/Never give the exact answer/.test(sys3), 'after the second miss Priya is given the answer and told to say it plainly');
for (let k = 0; k < 4; k++) { await js(`document.getElementById('lx-ask').value = 'question ${k}'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(300); }
last = await js('window.__last'); ch = await sim('lxChat()');
ok(last.messages.length <= 7 && ch.chat.length <= 6 && last.messages.slice(1).some(m => m.role === 'assistant'), 'history keeps the last 6 messages and is sent back as a chat (' + (last.messages.length - 1) + ' sent)');
// AI text is shown as plain text, never as HTML
await js(`window.__reply = '<b>bold</b><img src=x onerror="window.__xss=1">'`);
await js(`document.getElementById('lx-ask').value = 'html?'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(400);
ch = await sim('lxChat()');
ok(ch.text.includes('<b>bold</b>') && !(await js('!!window.__xss')) && !/<img/i.test(ch.html.replace(/&lt;img/g, '')), 'AI replies are shown as plain text');
await js(`window.__reply = 'Think of pwd like checking which room you are standing in.'`);
// a failing call and the daily cap show aiErrorText, and the chat keeps working
await js('window.__fail = 401'); await js(`document.getElementById('lx-ask').value = 'fail?'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(400);
ok((await sim('lxChat()')).out.includes('did not accept the API key'), 'a failed AI call shows a clear message');
await js('window.__fail = 0');
const d0 = new Date().toISOString().slice(0, 10);
await js(`localStorage.setItem('hsim-ai-spend', JSON.stringify({calls:400, usd:0, day:'${d0}', today:400}))`);
const cBefore = await js('window.__calls');
await js(`document.getElementById('lx-ask').value = 'cap?'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(300);
ok((await sim('lxChat()')).out.includes('Daily safety cap') && await js('window.__calls') === cBefore, 'the daily cap stops calls with a clear message');
await js(`localStorage.removeItem('hsim-ai-spend')`);
const calls = await js('window.__calls');
await sim(`lxAnswer('cd projects')`);
ok((await ls()).passed && (await js('window.__calls')) === calls, 'checking answers never calls the AI');
await sim('lxNext()'); ch = await sim('lxChat()');
ok(ch.chat.length === 0 && ch.tries.length === 0 && ch.text === '', 'the chat and attempts clear on the next step');

// ---- every cmd step names its commands, read from its own answer ----
const usesLine = () => js(`(document.querySelector('.lx-uses code') || {}).textContent || ''`);
await sim(`lesson('t-where')`); await sleep(60); await sim('lxNext()'); await sleep(40);
ok((await usesLine()) === 'pwd' && /COMMANDS IN THIS STEP/.test(await js(`document.querySelector('.lx-uses').textContent`)), 'a cmd step shows COMMANDS IN THIS STEP with its command (pwd)');
await sim(`lxAnswer('pwd')`); await sim('lxNext()'); await sim('lxNext()'); await sleep(40);
ok((await usesLine()) === 'ls', 'the next cmd step names ls');
await sim(`lxAnswer('ls')`); await sim('lxNext()'); await sim('lxAnswer(0)'); await sim('lxNext()'); await sim('lxAnswer(3)'); await sim('lxNext()'); await sleep(40);
ok((await usesLine()) === 'ls -a', 'the ls -a step names the option too');
await sim(`lxAnswer('ls -a')`); await sleep(40); await sim(`lesson('t-grep')`); await sleep(60);
ok(!(await js(`!!document.querySelector('.lx-uses')`)), 'a read step has no commands line');
await sim(`lesson('t-fix')`); await sim('lxNext()'); await sleep(40);
ok(!(await js(`!!document.querySelector('.lx-uses')`)), 'a bug step has no commands line');

// ---- navigation: sidebar, Back step, browser Back, Esc up one level, the safe API key ----
await sim(`lesson('t-cd')`); await sleep(40);
ok(await js(`document.querySelectorAll('#lx-side .lx-l').length`) === 8 && await js(`!!document.querySelector('#lx-side .lx-l.cur')`), 'the lesson sidebar lists the module (7 items + final test) and marks the current one');
{ const st = (await sim('course()')).flatMap(m => m.lessons).find(l => l.id === 't-cd').steps;   // answer step 1 with its real answer
  await sim('lxNext()'); await sim(`lxAnswer(${JSON.stringify(st[1].t === 'cmd' || st[1].t === 'fill' || st[1].t === 'write' ? st[1].ans : st[1].t === 'ant' ? true : st[1].right)})`); await sim('lxNext()'); }
const iNow = (await ls()).i;
ok(iNow >= 2, 'a few steps into the lesson (it resumes where it was left; at step ' + iNow + ')');
await js(`document.getElementById('lx-prev').click()`); s = await ls();
ok(s.i === iNow - 1 && s.passed && await js(`!document.getElementById('lx-prev').hidden && (document.getElementById('lx-fb').textContent.includes('You already did this step') || !document.querySelector('#lx-body input:not([disabled]), #lx-opts'))`), 'Back re-opens the step before, already answered and read-only');
await sim('lxNext()'); ok((await ls()).i === iNow, 'Next returns to where you were');
await js(`history.back()`); await sleep(150); s = await ls();
ok(s.screen === 'learn' && await js(`location.hash`) !== '#course/t-cd', 'the browser Back button moves back one page inside the app: ' + await js('location.hash'));
await sim(`lesson('t-cd')`); await sleep(60); await js(`document.activeElement && document.activeElement.blur()`);
ok(await js(`location.hash`) === '#course/t-cd', 'opening a lesson writes its own #hash (not one step stale): ' + await js('location.hash'));   // Esc while typing is ignored on purpose
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(60);
ok(await js(`location.hash`) === '#course/m/term' && await js(`document.getElementById('menu').hidden`), 'Esc in a lesson goes up to its module page (no menu)');
await js(`document.getElementById('menu-btn').click()`); await js(`document.getElementById('tab-ai').click()`);
ok(await js(`!document.getElementById('key-saved').hidden && document.getElementById('key-form').hidden && document.getElementById('key-line').textContent.includes('ends in \u2026test')`), 'a saved key shows only its last 4 characters, with Test and Change');
ok(await js(`!document.getElementById('key-fold').open && document.querySelector('#key-fold summary').textContent === 'API Key'`), 'Remove sits in a folder called "API Key", closed by default');
await js(`document.getElementById('key-fold').open = true; document.getElementById('set-clear').click()`);
ok(await js(`!document.getElementById('key-confirm').hidden && document.getElementById('key-confirm').innerText.includes('Are you sure?')`) && await js(`JSON.parse(localStorage.getItem('hsim-ai')||'{}').key`) === 'sk-test', 'Remove key asks "Are you sure?" first, and the key is still there');
await js(`document.getElementById('key-no').click()`);
ok(await js(`JSON.parse(localStorage.getItem('hsim-ai')||'{}').key`) === 'sk-test', '"No, keep it" keeps the key');
await js(`document.getElementById('set-clear').click(); document.getElementById('key-yes').click()`);
ok(!(await js(`localStorage.getItem('hsim-ai')`)) && await js(`!document.getElementById('key-form').hidden`), '"Yes, remove it" removes the key and shows the empty form again');
await js(`document.getElementById('menu-done').click()`);
// ---- edge cases: odd input, HTML typed in, double clicks, Escape and F while typing, resume, corrupted progress ----
await js(`localStorage.removeItem('hsim-ai')`); await cdp('Page.reload'); await sleep(1200);
await sim(`lesson('t-where')`); await sim('lxNext()'); s = await ls();
const cmdBefore = await js(`document.querySelectorAll('#lx-term > div').length`);
await sim(`lxAnswer('   ')`); s = await ls();
ok(!s.passed && s.miss === 0 && await js(`document.querySelectorAll('#lx-term > div').length`) === cmdBefore, 'an empty or blank answer is ignored, not counted as a miss');
await sim(`lxAnswer(${JSON.stringify('x'.repeat(5000))})`); s = await ls();
ok(!s.passed && s.miss === 1 && await js('document.documentElement.scrollWidth <= innerWidth'), 'very long input is a miss, with no sideways scroll');
await sim(`lxAnswer('<b>x</b><img src=y onerror="window.__xss2=1">')`);
ok(await js(`document.getElementById('lx-term').innerText.includes('<b>x</b>')`) && !(await js('!!window.__xss2')) && !(await js(`!!document.querySelector('#lx-term b')`)), 'HTML typed into an answer shows as plain text');
await js(`document.getElementById('lx-cmd').value = 'pwd'`); await js(`document.getElementById('lx-cmd').focus()`);
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'f', text: 'f' }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f' });
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
ok(await js(`document.getElementById('menu').hidden && !document.fullscreenElement`), 'Escape and F while typing in a lesson box do not open the menu or full screen');
await js(`document.getElementById('lx-cmd').value = 'pwd'`);
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(60);
s = await ls(); const iAt = s.i;
ok(s.passed, 'Enter checks a typed command');
await js(`(() => { const b = document.getElementById('lx-check'); b.dispatchEvent(new MouseEvent('click', {detail:1, bubbles:true})); b.dispatchEvent(new MouseEvent('click', {detail:2, bubbles:true})); })()`); s = await ls();
ok(s.i === iAt + 1, 'double-clicking Next moves on one step only');
await js(`document.getElementById('lx-exit').click()`); await sleep(60);
ok((await js(`document.getElementById('lx-next').textContent`)).includes('Carry on'), 'leaving mid-lesson offers Carry on');
await js(`document.getElementById('lx-next').click()`); await sleep(60); s = await ls();
ok(s.id === 't-where' && s.i === iAt + 1, 'Carry on resumes at the same step');
for (const bad of ['not json', '[]', '{"done":"oops","days":5,"miss":null,"at":{"id":3}}', '{"done":{"old-lesson-1":1,"s-cols":2,"t-where":3}}']) {
  await js(`localStorage.setItem('hsim-learn', ${JSON.stringify(bad)})`); await cdp('Page.reload'); await sleep(900);
  await sim('learn()'); await sleep(40); s = await ls();
  ok(s.screen === 'learn' && /^\d+ of \d+ lessons done/.test(s.sum), 'the course loads with hsim-learn = ' + bad.slice(0, 40));
}
ok(s.sum.startsWith(`1 of ${NMAIN}`), 'old progress with unknown lesson ids still loads (only known lessons count)');
ok(!(await sim('state()')).save && (await js(`localStorage.getItem('hsim-drills')`)) !== 'x', 'the saved run is still untouched');

// glossary: chips under a step, tap to define; a searchable panel on the course page
await js(`localStorage.setItem('hsim-learn', '{}')`); await cdp('Page.reload'); await sleep(900);
await sim('learn()'); await sleep(60);
ok(await js(`document.getElementById('lx-gloss').hidden`), 'the glossary starts closed');
await js(`document.getElementById('lx-gloss-btn').click()`); await sleep(60);
ok(!(await js(`document.getElementById('lx-gloss').hidden`)) && (await js(`document.querySelectorAll('#lx-gloss-list p').length`)) >= 30, 'the Glossary button opens a list of 30+ words');
await js(`(() => { const q = document.getElementById('lx-gloss-q'); q.value = 'api key'; q.dispatchEvent(new Event('input', {bubbles:true})); })()`); await sleep(40);
ok((await js(`document.querySelectorAll('#lx-gloss-list p').length`)) >= 1 && (await js(`document.querySelector('#lx-gloss-list p').innerText`)).toLowerCase().includes('api key'), 'searching the glossary filters the list');
await js(`(() => { const q = document.getElementById('lx-gloss-q'); q.value = 'zzzz nothing'; q.dispatchEvent(new Event('input', {bubbles:true})); })()`); await sleep(40);
ok((await js(`document.getElementById('lx-gloss-list').innerText`)).includes('No word like that'), 'a search with no match says so');
await sim('lesson("g-why")'); await sleep(80);
ok(await js(`!!document.querySelector('.lx-words button')`), 'a lesson step shows tap-to-define word chips');
await js(`document.querySelector('.lx-words button').click()`); await sleep(40);
ok(await js(`(() => { const d = document.querySelector('.lx-def'); return !!d && !d.hidden && d.innerText.length > 20; })()`), 'tapping a word chip shows its meaning');
await js(`document.querySelector('.lx-words button').click()`); await sleep(40);
ok(await js(`document.querySelector('.lx-def').hidden`), 'tapping the same chip again hides the meaning');

// certificate: none while a module is unfinished, one once every ready item in it is done
await js(`localStorage.setItem('hsim-learn', '{}')`); await cdp('Page.reload'); await sleep(900);
await sim('modPage(0, false)'); await sleep(80);
ok(!(await js(`!!document.querySelector('.lx-cert')`)), 'no certificate on an unfinished module page');
const modName = await sim('modPage(0, true)'); await sleep(80);
ok(await js(`!!document.querySelector('.lx-cert') && document.querySelector('.lx-cert').innerText.includes(${JSON.stringify(modName)})`), 'a finished module page shows its certificate');
await js(`localStorage.setItem('hsim-learn', '{}')`); await cdp('Page.reload'); await sleep(600);

// ---- tonight's quest, the 32-day grid, the rest-day streak and XP for hands-on work (13 Oct evening) ----
{
  const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  await js(`localStorage.setItem('hsim-learn', JSON.stringify({days:${JSON.stringify([1, 2, 4, 5, 6, 7, 8].map(day))}}))`); await sim('learn()'); await sleep(60);
  ok((await ls()).sum.includes('7 days in a row'), 'one missed day in a week is a rest day: the streak counts through it (7 days in a row)');
  ok(await js(`document.querySelectorAll('#lx-goals .lx-grid i').length === 32`), 'the course page shows the 32-day grid');
  await js(`localStorage.setItem('hsim-learn', JSON.stringify({days:${JSON.stringify([1, 2, 4, 6, 7, 8].map(day))}}))`); await sim('learn()'); await sleep(60);
  ok((await ls()).sum.includes('3 days in a row'), 'two missed days in a week break the streak (3 days in a row)');
  await js(`localStorage.setItem('hsim-hackathon', 'on')`);   // the 32-day grid belongs to the optional hackathon track
  await js(`document.getElementById('nav-home').click()`); await sleep(80);
  ok(await js(`document.querySelectorAll('#home-grid32 .lx-grid i').length === 32`), 'Home shows the 32-day study grid');
  ok(await js(`document.querySelectorAll('#quest-list .q').length === 3 && document.querySelectorAll('#quest-list .q.on').length === 0 && document.getElementById('quest-done').hidden`), 'the quest card lists three things, none done yet');
  const now = Date.now();
  await js(`localStorage.setItem('hsim-learn', JSON.stringify({days:['${day(0)}'], done:{'t-where':${now}}, rev:['${day(0)}'], real:{'t-where':${now}}}))`);
  await js(`document.getElementById('nav-course').click()`); await sleep(60); await js(`document.getElementById('nav-home').click()`); await sleep(80);
  ok(await js(`document.querySelectorAll('#quest-list .q.on').length === 3 && !document.getElementById('quest-done').hidden`), 'a lesson, a review and a hands-on tick today complete the quest');
  s = await ls();
  ok(Array.isArray(s.saved.quests) && s.saved.quests.length === 1, 'the finished quest is banked once');
  ok((await js(`document.getElementById('home-meta').textContent`)).includes('220 XP'), 'XP counts the lesson (100), the study day (20), the hands-on tick (50) and the quest (50): 220 XP');
  ok(await js(`document.querySelectorAll('#home-grid32 .lx-grid i.on').length === 1`), 'the grid marks today as studied');
  await js(`localStorage.removeItem('hsim-hackathon')`);
  ok((await js(`document.getElementById('home-week').textContent`)).startsWith('This week: 1 lesson'), 'the weekly line counts this week\'s lessons');
  await js(`localStorage.setItem('hsim-learn', JSON.stringify({done:{'h-pitch':${now}}}))`); await js(`document.getElementById('nav-course').click()`); await sleep(60); await js(`document.getElementById('nav-home').click()`); await sleep(80);
  ok(await js(`!!document.getElementById('quest-pitch')`), 'once h-pitch is done the third quest item is saying the pitch out loud');
  await js(`document.getElementById('quest-pitch').click()`); await sleep(80);
  s = await ls();
  ok((s.saved.pitch || []).length === 1 && await js(`document.getElementById('quest-pitch').checked`), 'ticking the pitch box saves today');
  await sim('lesson("t-where")'); await sleep(60);
  for (let i = 0; i < 7; i++) { const st = (await ls()); if (st.kind === 'cmd') await sim(`lxAnswer(${JSON.stringify(st.key === 't-where.1' ? 'pwd' : st.key === 't-where.3' ? 'ls' : 'ls -a')})`); else if (st.kind === 'mc') await sim(`lxAnswer(${st.key === 't-where.4' ? 0 : 3})`); await sim('lxNext()'); await sleep(30); }
  ok((await ls()).step === 'LESSON DONE' && (await js(`document.getElementById('lx-realck') && document.getElementById('lx-realck').parentElement.textContent.includes('+50 XP')`)), 'the lesson-done screen offers the hands-on tick worth 50 XP');
  await js(`document.getElementById('lx-realck').click()`); await sleep(40);
  ok((await js(`document.querySelector('.lx-xp').textContent`)).includes('+150 XP'), 'ticking it on the spot shows +150 XP (100 for the lesson, 50 hands-on)');
  await js(`localStorage.removeItem('hsim-learn')`); await sim('learn()'); await sleep(60);
}
ok(!errors.length, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
edge.kill(); process.exit(bad ? 1 : 0);

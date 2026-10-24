// Stage 3 check, through the real page: the course is for anyone, the hackathon is an optional track.
// A stranger (empty localStorage) is not greeted as Shad, not counted down to 14-15 Nov, does not get the Weekend path or the 32-day
// grid, and the optional modules sit last and do not count toward progress. Turning the track on brings all of that back.
// Run: node check/for-anyone.mjs   (prints ok/FAIL lines, then "failed: N")
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCourse } from './lessons-from-source.mjs';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-fa-'));
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
let bad = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
await cdp('Runtime.enable');
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
const home = async () => { await js(`document.querySelector('.nv[data-go="home"]').click()`); await sleep(150); };
const txt = id => js(`document.getElementById('${id}').innerText`);

// ---- 1. a stranger on Home ----
await js(`localStorage.clear()`); await js(`location.reload()`); await sleep(1200);
await home();
const welcome = await txt('home-welcome'), eyebrow = await txt('home-eyebrow'), meta = await txt('home-meta');
ok(welcome === 'Welcome.', `a stranger is welcomed plainly: "${welcome}"`);
ok(!/Shad/.test(await txt('scr-home')), 'the Home screen never says Shad');
ok(!/hackathon|nov/i.test(meta), `no hackathon countdown on Home: "${meta}"`);
ok(!/hackathon|nov/i.test(eyebrow), `the Home eyebrow is not about the hackathon: "${eyebrow}"`);
ok(await js(`document.getElementById('home-grid32').children.length === 0`), 'the 32-day grid (it leads up to 14 Nov) is hidden');
ok(await js(`localStorage.getItem('hsim-weekend') === null`), 'nothing was saved by just looking');

// ---- 2. the course page ----
const course = await sim('course()');
const OPT = ['hack', 'sky', 'all'];
const ready = course.filter(m => !OPT.includes(m.id)).flatMap(m => m.lessons).filter(l => (l.steps || l.term) && !l.optional).length;
await sim('learn()'); await sleep(200);
ok(await js(`document.getElementById('lx-wk').hidden`), 'the Weekend path panel is hidden for a stranger');
const sum = await txt('lx-sum');
ok(new RegExp(`^0 of ${ready} lessons done`).test(sum), `progress counts only the main course (${ready} lessons): "${sum.slice(0, 60)}"`);
const cardIds = await js(`[...document.querySelectorAll('#lx-cards .mcard')].map(b => b.id)`);
ok(cardIds.indexOf('lxc-hack') > cardIds.indexOf('lxc-python') && cardIds.indexOf('lxc-all') === cardIds.length - 1, `the optional cards come last: ${cardIds.join(' ')}`);
ok(await js(`!!document.querySelector('#lx-cards .lx-opt') && document.getElementById('lx-hack-btn').textContent.includes('on')`), 'the optional heading has a "turn on" button');
ok(await js(`document.querySelector('#lxc-hack .st').textContent.startsWith('OPTIONAL TRACK')`), 'the hackathon card says OPTIONAL TRACK');
ok(await js(`document.querySelector('#lxc-term .st').textContent.startsWith('MODULE 1')`), 'the first card is MODULE 1');
const nextTxt = await txt('lx-next');
ok(/Start here: /.test(nextTxt) && !/pitch|plan|judge|drone|hackathon/i.test(nextTxt), `Start here is a main-course lesson: "${nextTxt}"`);
ok(await js(`!document.querySelector('.lx-l.gated')`), 'no lesson is gated behind the weekend path');

// ---- 3. turn the track on ----
await js(`document.getElementById('lx-hack-btn').click()`); await sleep(200);
ok(await js(`localStorage.getItem('hsim-hackathon') === 'on'`), 'the switch saves "on"');
ok(await js(`!document.getElementById('lx-wk').hidden`), 'the Weekend path panel appears once the track is on');
await home();
ok(/hackathon/i.test(await txt('home-meta')), `Home counts down again: "${(await txt('home-meta')).slice(0, 50)}"`);
ok(/POSTPONED TO 2027/.test(await txt('home-eyebrow')) && !/14/.test(await txt('home-eyebrow')), 'the Home eyebrow names the hackathon again and says it is postponed, with no stale date');
ok(await js(`document.getElementById('home-grid32').children.length === 1`), 'the 32-day grid is back');
ok(!/Shad/.test(await txt('scr-home')), 'still no "Shad" on Home with the track on');
// ---- 4. and off again ----
await sim('learn()'); await sleep(150);
await js(`document.getElementById('lx-hack-btn').click()`); await sleep(200);
ok(await js(`localStorage.getItem('hsim-hackathon') === 'off' && document.getElementById('lx-wk').hidden`), 'the switch turns it off again');

// ---- 5. an old save that already finished a hackathon lesson keeps its track ----
await js(`localStorage.removeItem('hsim-hackathon'); localStorage.setItem('hsim-learn', JSON.stringify({done:{'h-plan':Date.now(), 't-where':Date.now()}, days:[]}))`);
await js(`location.reload()`); await sleep(1200); await home();
ok(/hackathon/i.test(await txt('home-meta')), 'a save with a hackathon lesson done keeps the track on');
ok(await txt('home-welcome') === 'Welcome back.', 'someone with progress is welcomed back (without a name)');
// ---- 6. a main-course lesson only: stays off ----
await js(`localStorage.setItem('hsim-learn', JSON.stringify({done:{'t-where':Date.now()}, days:[]}))`);
await js(`location.reload()`); await sleep(1200); await home();
ok(!/hackathon/i.test(await txt('home-meta')) && await txt('home-welcome') === 'Welcome back.', 'one terminal lesson done: welcomed back, still no countdown');

// ---- 7. the lesson data itself: nobody is called Shad in a lesson, and the pitch example uses a made-up name ----
const items = loadCourse(join(root, 'index.html')).flatMap(m => m.items);
const blob = JSON.stringify(items.map(l => l.steps || []));
ok(!/I(\\)?'m Shad|I am Shad/.test(blob), "no lesson step says \"I'm Shad\"");
ok(/I'm Sam, a carpenter/.test(blob), 'the pitch examples use a made-up name');
const src = readFileSync(join(root, 'index.html'), 'utf8');
ok(!/Welcome back, Shad/.test(src), '"Welcome back, Shad" is gone from the page');
ok(!/'Shad finished all/.test(src), 'the certificate does not say Shad');

ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`${n} checks, failed: ${bad}`);
edge.kill();
process.exit(bad ? 1 : 0);

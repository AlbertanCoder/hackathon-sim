// Phone (touch) rules, through the real page: text boxes are 16 px or bigger (iPhone Safari zooms the page in on smaller ones), no sideways scroll, big touch targets.
// (header of levels.mjs reused)
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


await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Page.reload'); await sleep(1500);
for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
ok(await js(`matchMedia('(pointer: coarse)').matches`), 'the emulated phone reports a touch screen');
async function at(id, i) { await js(`(() => { const p = JSON.parse(localStorage.getItem('hsim-learn') || '{}'); p.pos = Object.assign(p.pos || {}, {['${id}']: ${i}}); p.at = ${i} > 0 ? {id: '${id}', i: ${i}} : null; localStorage.setItem('hsim-learn', JSON.stringify(p)); })()`); await sim(`lesson(${JSON.stringify(id)})`); await sleep(200); }
for (const [name, id, i] of [['command box', 't-where', 1], ['fill boxes', 't-fix', 3], ['code box', 'd-recursion', 4], ['choices', 'd-speed', 1], ['reading', 'd-speed', 0]]) {
  await at(id, i);
  const r = await js(`(() => { const f = [...document.querySelectorAll('input[type=text], input:not([type]), textarea')].filter(e => e.getBoundingClientRect().width > 0).map(e => parseFloat(getComputedStyle(e).fontSize)); return {min: f.length ? Math.min(...f) : 99, n: f.length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth}; })()`);
  ok(r.min >= 16, `${name}: every text box is at least 16 px on a phone (${r.n} boxes, smallest ${r.min}px)`);
  ok(r.over <= 1, `${name}: no sideways scroll at 390 px (${r.over}px over)`);
}
await js(`document.getElementById('menu-btn').click()`); await sleep(300);
ok(await js(`parseFloat(getComputedStyle(document.getElementById('set-key')).fontSize) >= 16`), 'the AI key box is at least 16 px on a phone');
ok(!/user-scalable|maximum-scale/.test(await js(`document.querySelector('meta[name=viewport]').content`)), 'pinch zoom is still allowed');
ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`${n} checks, failed: ${bad}`);
edge.kill();
process.exit(bad ? 1 : 0);

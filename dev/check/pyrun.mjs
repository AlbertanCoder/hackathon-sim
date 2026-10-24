// Python steps that the page RUNS (Pyodide, served from the pyodide/ folder next to the page): through the real page over http.
// For every runnable step: the model answer and each alternative pass; each wrong answer fails; a stub fails; an endless loop is stopped.
// Run: node check/pyrun.mjs   (prints ok/FAIL lines, then "failed: N"; about a minute)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.zip': 'application/zip', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'Play Hackathon Sim.html');
  if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const prof = mkdtempSync(join(tmpdir(), 'hsim-py-'));
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
const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push(x.slice(0, 80) + ' -> ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result.result?.value; };
const sim = x => js(`window.__sim.${x}`);
let bad = 0, n = 0; const ok = (c, m) => { n++; if (!c) { console.log('FAIL ' + m); bad++; } };
await cdp('Runtime.enable');
await cdp('Page.navigate', { url: base + 'Play%20Hackathon%20Sim.html' }); await sleep(1500); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
// the lesson data comes from the page itself (lxRaw)
const course = await sim('course()');
const mods = course.map(m => m.id);
let steps = 0, right = 0, wrongTried = 0;
const gotoStep = async (lid, i) => { await js(`(() => { const p = JSON.parse(localStorage.getItem('hsim-learn') || '{}'); p.pos = Object.assign(p.pos || {}, {['${lid}']: ${i}}); p.at = ${i} > 0 ? {id: '${lid}', i: ${i}} : null; localStorage.setItem('hsim-learn', JSON.stringify(p)); })()`); await sim(`lesson(${JSON.stringify(lid)})`); await sleep(120); };
const ls = () => sim('lxState()');
const ids = await js(`window.__sim.course().flatMap(m => m.lessons.map(l => l.id))`);
for (const lid of ids) {
  const raw = await sim(`lxRaw(${JSON.stringify(lid)})`); if (!raw) continue;
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]; if (s.t !== 'write' || !s.canRun) continue;
    steps++;
    for (const a of [s.ans].concat(s.alt || [])) { await gotoStep(lid, i); await sim(`lxAnswer(${JSON.stringify(a)})`); const r = await ls(); right++; ok(r.passed === true, `${lid}.${i + 1}: a correct answer passes (${a.slice(0, 40).replace(/\n/g, ' / ')}) got: ${(r.fb || '').slice(0, 100)}`); }
    for (const b of (s.bad || [])) { await gotoStep(lid, i); await sim(`lxAnswer(${JSON.stringify(b)})`); const r = await ls(); wrongTried++; ok(r.passed === false && (r.fb || '').startsWith('\u2717'), `${lid}.${i + 1}: a wrong answer fails (${b.slice(0, 40).replace(/\n/g, ' / ')}) got: ${(r.fb || '').slice(0, 100)}`); }
    await gotoStep(lid, i); await sim(`lxAnswer('def f():\\n    return 1')`); { const r = await ls(); ok(r.passed === false, `${lid}.${i + 1}: a stub does not pass`); }
  }
}
ok(steps >= 40, `the page runs at least 40 Python steps for real (${steps})`);
// an endless loop is stopped and the next run still works
await gotoStep('d-lookup', 5); { const t0 = Date.now(); await sim(`lxAnswer('def unique_in_order(items):\\n    while True:\\n        pass')`); const r = await ls(); ok(r.passed === false && /more than 3 seconds|did not finish|ran for more than|never ends/i.test(r.fb || '') && Date.now() - t0 < 20000, 'an endless loop is stopped with a message: ' + (r.fb || '').slice(0, 90)); }
await gotoStep('d-lookup', 5); { const raw = await sim(`lxRaw('d-lookup')`); await sim(`lxAnswer(${JSON.stringify(raw[5].ans)})`); const r = await ls(); ok(r.passed === true, 'after a stopped loop the runner starts again and passes a right answer'); }
ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`${n} checks (${steps} Python steps, ${right} right answers, ${wrongTried} wrong answers), failed: ${bad}`);
edge.kill(); server.close();
process.exit(bad ? 1 : 0);

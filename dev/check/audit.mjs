// Walkthrough audit at desktop size: screenshots every major screen and checks layout. Not part of the check.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..'), out = join(root, 'concepts', 'audit');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-audit-'));
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
const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push(x + ' -> ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result?.value; };
const sim = x => js(`window.__sim.${x}`);
const issues = [];
const shot = async (name, w = 1280, h = 800) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(250);
  const o = await js(`[document.documentElement.scrollWidth, innerWidth]`); if (o[0] > o[1]) issues.push(`${name} @${w}: sideways scroll ${o[0]} > ${o[1]}`);
  const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}-${w}.png`), Buffer.from(r.result.data, 'base64'));
};
const both = async name => { await shot(name, 1280, 800); await shot(name, 400, 860); await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
await both('01-title');
await js(`document.getElementById('menu-btn').click()`); await both('02-settings'); await js(`document.getElementById('menu-close').click()`);
await sim('newRun(20261114)'); await both('03-roll');
await sim(`setMode('full')`); await js(`document.getElementById('go-pack').click()`); await both('04-pack');
await sim(`pack(['laptop','powerbar','phone','snacks','layer','notebook'])`); await sleep(300); await both('05-play');
// open a Full writing task directly to see the modal
js(`(async()=>{ const S0 = 1; })()`);
await js(`window.__taskP = (window.__sim.task, null)`);
await sim(`teleport(16,7,'up')`); await sleep(50);
// jump to chapter 1 team table needs quest 'team'; just open the drills writing screen and a terminal instead
await sim('openTerm("crash")'); await sleep(300); await both('06-terminal'); await sim('termQuit()'); await sleep(100);
await sim('drills()'); await both('07-drills');
await sim(`drill('pitch')`); await sleep(200); await sim(`drAnswer('')`); await sleep(200); await both('08-drill-writing');
await js(`document.getElementById('dr-stop').click()`); await sleep(100);
// Escape during a drill answer must not open the pause menu over it
await sim(`drill('judges')`); await sleep(150); await sim(`drAnswer('')`); await sleep(150);
await js(`document.getElementById('dr-txt').focus(); document.getElementById('dr-txt').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(100);
if (await js(`!document.getElementById('menu').hidden`)) issues.push('Escape in a drill answer opened the pause menu');
await js(`document.getElementById('dr-stop').click()`);
console.log(issues.length ? 'ISSUES:\n' + issues.join('\n') : 'no layout issues');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors');
edge.kill(); process.exit(0);

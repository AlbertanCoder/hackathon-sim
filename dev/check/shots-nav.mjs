// Navigation review: screenshots (concepts/s10/) + layout facts for Home, course, module, lesson, Settings, Drills, Play flow.
// Run: node check/shots-nav.mjs   (needs a built "Play Hackathon Sim.html")
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..'), out = join(root, 'concepts', 's10');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
for (const [tag, W, H] of [['phone', 400, 900], ['1280', 1280, 800], ['1920', 1920, 1080]]) {
  const prof = mkdtempSync(join(tmpdir(), 'hsim-n-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`, '--remote-debugging-port=0', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
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
  const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push(x.slice(0, 60) + ' ' + JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result?.value; };
  const click = async s => { await js(`document.querySelector(${JSON.stringify(s)}).click()`); await sleep(250); };
  const key = async k => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0 }); await sleep(250); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: tag === 'phone' });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `if (!localStorage.getItem('__seed')) { localStorage.setItem('__seed','1'); localStorage.setItem('hsim-ai', JSON.stringify({key:'sk-test-a1b2', model:'deepseek-flash', remember:true})); }` });
  await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1300); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
  const info = () => js(`(() => { const nav = document.getElementById('nav'), navShown = getComputedStyle(nav).display !== 'none';
    const sw = document.documentElement.scrollWidth <= innerWidth + 1;
    const cut = [...document.querySelectorAll('button, p, h1, h2, h3')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > innerWidth + 1).length;
    const modal = [...document.querySelectorAll('.modal')].some(m => !m.hidden && getComputedStyle(m).display !== 'none');
    let covered = 0;
    if (navShown && !modal && getComputedStyle(nav).position === 'fixed') { const nt = nav.getBoundingClientRect().top;
      covered = [...document.querySelectorAll('.cab button')].filter(e => { if (!e.offsetParent || e.closest('#nav')) return false; const r = e.getBoundingClientRect();
        if (r.height <= 0 || r.bottom <= nt || r.top >= innerHeight) return false; const el = document.elementFromPoint(r.left + r.width/2, Math.min(r.top + r.height/2, innerHeight - 1)); return !!(el && el.closest('#nav')); }).length; }
    return {screen: document.body.dataset.screen, hash: location.hash, navShown, sw, cut, covered, modal}; })()`);
  const shot = async (name, want) => {
    await sleep(150); const i = await info();
    ok(i.sw && i.cut === 0, `${tag} ${name}: no sideways scroll / cut-off (cut ${i.cut}); screen=${i.screen} hash=${i.hash} nav=${i.navShown}`);
    if (want) ok(want(i), `${tag} ${name}: state as expected`);
    const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${tag}-${name}.png`), Buffer.from(r.result.data, 'base64')); return i;
  };
  await shot('01-home', i => i.screen === 'home' && i.navShown);
  await click('#nav-course'); await shot('02-course', i => i.hash === '#course');
  await js(`location.hash = '#course/m/term'`); await sleep(400); await shot('03-module', i => i.hash === '#course/m/term');
  await js(`location.hash = '#course/t-where'`); await sleep(400); await shot('04-lesson', i => i.hash === '#course/t-where');
  await js(`document.getElementById('lx-check').click()`); await sleep(300); await shot('04b-practice-step');   // step 2: the practice pane + checklist
  await js(`document.getElementById('lx-cmd').value = 'ls'`); await js(`document.getElementById('lx-check').click()`); await sleep(300); await shot('04c-wrong-answer');
  await js(`location.hash = '#course/c-ask'`); await sleep(400); await js(`document.getElementById('lx-check').click()`); await sleep(300); await js(`(document.querySelector('.lx-words button') || {click(){}}).click()`); await sleep(200); await shot('04d-word-chips');
  await js(`location.hash = '#course/h-rules'`); await sleep(400); await js(`document.getElementById('lx-check').click()`); await sleep(300); await shot('04e-ai-allowed-step');
  await js(`location.hash = '#course'`); await sleep(400); await js(`document.getElementById('lx-gloss-btn').click()`); await sleep(200); await shot('02b-glossary-open');
  await click('#nav-drills'); await shot('05-drills', i => i.screen === 'drills');
  await click('#nav-play'); await shot('06-play-menu', i => i.hash === '#play');
  await click('#menu-btn'); await click('#tab-ai'); await shot('07-settings-key', i => i.modal);
  await js(`document.getElementById('key-fold').open = true`); await click('#set-clear'); await shot('08-key-confirm');
  await click('#key-no'); await click('#menu-done');
  await click('#go-start'); await shot('09-roll'); await click('#roll-back');
  await click('#go-start'); await shot('10-roll-again');
  await key('Escape'); await shot('11-after-esc', i => i.hash === '#play');   // Esc on the roll screen goes back to the Play menu
  await click('#go-start'); await click('#go-pack'); await shot('12-pack', i => i.hash === '#play/pack');
  await key('Escape'); await shot('13-pack-esc', i => i.hash === '#play/new');   // Esc on the pack screen goes back to the roll
  await click('#go-pack'); await js(`document.querySelectorAll('#items .item').forEach((b, i) => { if (i < 6) b.click(); })`); await sleep(200);
  await click('#go-play'); await sleep(800); await shot('14-in-game', i => i.screen === 'play' && !i.navShown);
  await key('Escape');   // the first Esc skips the chapter card (if it is still showing)
  if (await js(`document.getElementById('menu').hidden`)) await key('Escape');   // then Esc opens the pause menu
  await shot('15-pause-menu', i => i.modal);
  await click('#menu-quit'); await shot('16-saved-home', i => i.screen === 'home');
  ok(await js(`/Run in progress|Continue/i.test(document.getElementById('scr-home').innerText)`), `${tag}: Home offers to continue the run`);
  ok(!errors.length, `${tag}: no script errors` + (errors.length ? ': ' + errors.join(' | ') : ''));
  edge.kill();
}
process.exit(bad ? 1 : 0);



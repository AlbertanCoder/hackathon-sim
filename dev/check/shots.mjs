// Screenshots of Learn at 3 sizes (phone 400x900, 1280x800, 1920x1080) into concepts/s9/, plus layout checks on each:
// no sideways scroll, nothing cut off sideways, buttons at least 28 px tall. Uses a fake DeepSeek for the Priya chat.
// Run: node check/shots.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..'), out = join(root, 'concepts', 's9');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const SIZES = [['phone', 400, 900], ['1280', 1280, 800], ['1920', 1920, 1080]];
const STUB = `window.__reply = 'Think of it like a tape measure: start from where you stand. What folder did ls show you?';
  const real = window.fetch; window.fetch = async (u, o) => { if (!/deepseek|openrouter/.test(String(u))) return real(u, o);
  return new Response(JSON.stringify({choices:[{message:{content: JSON.stringify({reply:window.__reply})}}], usage:{prompt_tokens:100, completion_tokens:40}}), {status:200}); };`;
async function open(W, H, phone) {
  const prof = mkdtempSync(join(tmpdir(), 'hsim-sh-'));
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
  const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push(x.slice(0, 60) + ' ' + r.result.exceptionDetails.exception?.description); return r.result.result?.value; };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1300); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
  return { edge, cdp, js, sim: x => js(`window.__sim.${x}`), errors };
}
for (const [tag, W, H] of SIZES) {
  const { edge, cdp, js, sim, errors } = await open(W, H, tag === 'phone');
  const shot = async name => {
    await sleep(150);
    const lay = await js(`(() => { const sw = document.documentElement.scrollWidth <= innerWidth + 1;
      const cut = [...document.querySelectorAll('button, .lx-body p, .lx-fb, .opt, .lx-chat p')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).length;
      const small = [...document.querySelectorAll('#scr-learn button, #term .tbtn, #scr-drills button')].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 28).length;
      return {sw, cut, small}; })()`);
    ok(lay.sw && lay.cut === 0, `${tag} ${name}: no sideways scroll or cut-off text (cut ${lay.cut})`);
    if (lay.small) ok(false, `${tag} ${name}: ${lay.small} button(s) shorter than 28 px`);
    const r = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(out, `${tag}-${name}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const play = async lid => { const c = (await sim('course()')).flatMap(m => m.lessons).find(l => l.id === lid);
    for (const st of c.steps) { if (st.t === 'cmd' || st.t === 'fill') await sim(`lxAnswer(${JSON.stringify(st.ans)})`); else if (st.t !== 'read') await sim(`lxAnswer(${st.right})`); await sim('lxNext()'); } };
  await shot('01-title');
  await sim('learn()'); await shot('02-course-map');
  await sim(`lesson('t-where')`); await shot('03-read');
  await sim('lxNext()'); await shot('04-cmd');
  await sim(`lxAnswer('ls')`); await shot('05-wrong');
  await js(`document.getElementById('lx-hint').click()`); await shot('06-hint');
  await sim(`lxAnswer('who')`); await sim(`lxAnswer('me')`); await js(`document.getElementById('lx-show').click()`); await shot('07-show-answer');
  await sim(`lesson('c-ask')`); await sim('lxNext()'); await shot('08-mc');
  await sim(`lesson('t-fix')`); await sim('lxNext()'); await shot('09-bug');
  await sim('lxAnswer(3)'); await sim('lxNext()'); await sim('lxAnswer(0)'); await sim('lxNext()'); await shot('10-fill');
  await sim(`lesson('s-pilot')`); await play('s-pilot'); await shot('11-lesson-done');
  await js(`localStorage.setItem('hsim-ai', JSON.stringify({key:'sk-test', model:'deepseek-flash'}))`); await cdp('Page.reload'); await sleep(1300);
  await sim(`lesson('t-cd')`); await sim('lxNext()'); await sim(`lxAnswer('cd hackaton')`);
  await js(`document.getElementById('lx-ask').value = 'why did that fail?'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(400);
  await js(`document.getElementById('lx-ask').value = 'is it a spelling thing?'`); await js(`document.getElementById('lx-askbtn').click()`); await sleep(400);
  await shot('12-priya-chat');
  await js(`localStorage.removeItem('hsim-ai')`); await cdp('Page.reload'); await sleep(1300);
  await sim(`lesson('p-term')`); await sleep(300); await sim('termHint()'); await sleep(100); await shot('13-practice-project');
  await sim('termQuit()'); await sleep(200); await shot('14-project-not-solved');
  await sim(`lesson('p-claude')`); await shot('15-project-lesson');
  await sim('learn()'); await js(`[...document.querySelectorAll('#lxm-hack .lx-l.test')].find(b => b.textContent.includes('Rules')).click()`); await sleep(250);
  await shot('16-final-test-briefing');
  await sim('drAnswer("")'); await sleep(250); await sim('drAnswer("No. Jamming is illegal for civilians in Canada. We detect and warn, and the police decide.")'); await sleep(700); await shot('17-drill-feedback');
  for (let k = 0; k < 20; k++) {   // "Next step" gets '' (null would stop the drill); questions get a short honest answer
    const d = await sim('drState()'); if (d.part === 'dr-done') break;
    if (d.waiting) await sim(d.text ? 'drAnswer("No. That breaks the rules. I would tell the organizers and be honest about it.")' : 'drAnswer("")');
    await sleep(400);
  }
  await shot('18-drill-results');
  await js(`document.getElementById('dr-back').click()`); await sleep(200);
  await sim('review()'); await shot('19-quick-review');
  ok(!errors.length, `${tag}: no script errors` + (errors.length ? ': ' + errors.join(' | ') : ''));
  edge.kill();
}
process.exit(bad ? 1 : 0);

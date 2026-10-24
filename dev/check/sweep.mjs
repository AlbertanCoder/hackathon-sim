// Full-pass sweep: walks every screen and flow at phone width (inside a stand-in of the claude.ai phone viewer: the publish
// skeleton's body rule, the viewer class, a translucent top bar) and at laptop width (the desktop copy), screenshots each state
// into review-2026-10-13-pm/sweep/, and audits every state: sideways scroll, text cut off at the right edge, low-contrast text,
// tiny tap targets, script errors. Also lists the visible buttons per state. Run: node check/sweep.mjs [phone|laptop]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..'), out = resolve(root, '..', 'review-2026-10-13-pm', 'sweep');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const only = process.argv[2];
const CONFIGS = [['phone', 390, 844, true], ['laptop', 1280, 800, false]].filter(c => !only || c[0] === only);
const STUB = `window.__reply = 'Think of it like a tape measure: start from where you stand. What folder did ls show you?';
  const real = window.fetch; window.fetch = async (u, o) => { if (!/deepseek|openrouter/.test(String(u))) return real(u, o);
  return new Response(JSON.stringify({choices:[{message:{content: JSON.stringify({reply:window.__reply})}}], usage:{prompt_tokens:100, completion_tokens:40}}), {status:200}); };`;
const SKELETON = `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.id = 'skel'; st.textContent = ':root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'; document.head.prepend(st); });`;
const AUDIT = `(() => {
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const parse = c => { const m = (c || '').match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return {r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1}; };
  const lum = ({r, g, b}) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bgOf = e => { let n = e; while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a >= 0.85) return c; n = n.parentElement; } return parse(getComputedStyle(document.documentElement).backgroundColor) || {r:255, g:255, b:255, a:1}; };
  const low = [], cut = [], small = [], seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let tn;
  while ((tn = walker.nextNode())) { const txt = tn.textContent.trim(); if (txt.length < 2) continue; const e = tn.parentElement; if (!e || seen.has(e) || e.closest('script,style,#fakebar,canvas')) continue; seen.add(e); if (!vis(e)) continue;
    const cs = getComputedStyle(e); const col = parse(cs.color); if (!col || col.a < 0.2) continue; const bg = bgOf(e); const rt = ratio(col, bg);
    const sel = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '');
    if (rt < 3) low.push({t: txt.slice(0, 40), c: cs.color, bg: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')', r: +rt.toFixed(2), sel});
    const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 && !e.closest('[style*="overflow"],.crt,pre,.t-out,.lx-win')) cut.push(sel + ': ' + txt.slice(0, 30)); }
  for (const b of document.querySelectorAll('button, a[href], .opt, [role=button]')) { if (!vis(b) || b.closest('#fakebar')) continue; const r = b.getBoundingClientRect(); if (r.height < 30 || r.width < 30) small.push({t: (b.textContent.trim() || b.getAttribute('aria-label') || b.id || '').slice(0, 25), w: Math.round(r.width), h: Math.round(r.height)}); }
  const btns = [...document.querySelectorAll('button')].filter(b => vis(b) && !b.closest('#fakebar')).map(b => (b.textContent.trim().replace(/\\s+/g, ' ') || '[' + (b.getAttribute('aria-label') || b.id) + ']').slice(0, 32));
  return {sw: document.documentElement.scrollWidth <= innerWidth + 1, scrollW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, nlow: low.length, low: low.slice(0, 12), cut: cut.slice(0, 8), nsmall: small.length, small: small.slice(0, 8), btns, screen: document.body.dataset.screen, hash: location.hash, modal: [...document.querySelectorAll('.modal, #term')].some(m => !m.hidden)};
})()`;
const VK = { Enter: 13, ArrowDown: 40, Escape: 27 };
for (const [tag, W, H, phone] of CONFIGS) {
  const prof = mkdtempSync(join(tmpdir(), 'hsim-sweep-'));
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`, '--remote-debugging-port=0', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  const pf = join(prof, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(pf); i++) await sleep(100);
  await sleep(200);
  const port = readFileSync(pf, 'utf8').split('\n')[0].trim();
  const t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const w = new Map(), errors = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 160) || m.params.exceptionDetails.text); });
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async x => { const r = await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) errors.push('eval: ' + x.slice(0, 50) + ' -> ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 120)); return r.result.result?.value; };
  const sim = x => js(`window.__sim.${x}`);
  const key = async k => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: VK[k] }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: VK[k] }); await sleep(40); };
  const click = async (sel, ms = 250) => { const hit = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); if (!hit) errors.push('missing: ' + sel); await sleep(ms); return hit; };
  const clickText = async (scope, re, ms = 250) => { const hit = await js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(b => b.offsetParent && ${re}.test(b.textContent.trim())); if (!e) return false; e.click(); return true; })()`); if (!hit) errors.push('no button ' + re + ' in ' + scope); await sleep(ms); return hit; };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: STUB + (phone ? SKELETON : '') });
  const dress = async () => { if (!phone) return; await js(`document.body.classList.add('viewer'); if (!document.getElementById('fakebar')) { const b = document.createElement('div'); b.id = 'fakebar'; b.style.cssText = 'position:fixed;left:0;right:0;top:0;height:64px;background:rgba(240,240,245,.6);color:#111;font:600 17px system-ui;display:flex;align-items:center;justify-content:center;z-index:99;pointer-events:none'; b.textContent = 'Hackathon Sim'; document.body.appendChild(b); }`); };
  const load = async () => { await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1300); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100); await dress(); };
  await load();
  const report = []; let n = 0;
  const cap = async (name, opts = {}) => {
    await sleep(opts.wait || 220);
    const a = await js(AUDIT); const label = `${tag}-${String(++n).padStart(2, '0')}-${name}`;
    const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, label + '.png'), Buffer.from(r.result.data, 'base64'));
    if (opts.long) { let segs = 0; for (let y = H; y < Math.min(a.docH, H * 4) && segs < 3; y += H) { await js(`scrollTo(0, ${y})`); await sleep(150); const r2 = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${label}-s${++segs}.png`), Buffer.from(r2.result.data, 'base64')); } await js('scrollTo(0, 0)'); }
    const flags = []; if (!a.sw) flags.push(`SIDEWAYS ${a.scrollW}>${W}`); if (a.cut.length) flags.push(`CUT ${a.cut.length}`); if (a.nlow) flags.push(`LOW-CONTRAST ${a.nlow}`); if (a.nsmall) flags.push(`SMALL ${a.nsmall}`);
    console.log((flags.length ? 'warn ' : 'ok   ') + label + (flags.length ? ': ' + flags.join(', ') : '') + ` · screen=${a.screen} hash=${a.hash}` + (a.modal ? ' modal' : ''));
    report.push({ label, ...a }); return a;
  };
  const step = async (name, fn, opts) => { try { await fn(); await cap(name, opts); } catch (e) { errors.push(name + ': ' + String(e).slice(0, 120)); console.log('FAIL ' + name + ': ' + String(e).slice(0, 120)); } };
  const play = async lid => { const c = (await sim('course()')).flatMap(m => m.lessons).find(l => l.id === lid);
    for (const st of c.steps) { if (st.t === 'cmd' || st.t === 'fill') await sim(`lxAnswer(${JSON.stringify(st.ans)})`); else if (st.t !== 'read') await sim(`lxAnswer(${st.right})`); await sim('lxNext()'); } };
  // ---- Home and the course ----
  await step('home', async () => {}, { long: true });
  await step('course-map', async () => { await click('#nav-course'); }, { long: true });
  await step('glossary', async () => { await click('#lx-gloss-btn'); }, { long: true });
  await step('module', async () => { await js(`location.hash = '#course/m/term'`); await sleep(400); }, { long: true });
  await step('lesson-read', async () => { await js(`location.hash = '#course/t-where'`); await sleep(400); });
  await step('lesson-practice', async () => { await click('#lx-check', 300); });
  await step('lesson-wrong', async () => { await js(`document.getElementById('lx-cmd').value = 'ls'`); await click('#lx-check', 300); });
  await step('lesson-hint', async () => { await click('#lx-hint'); });
  await step('lesson-show-answer', async () => { await sim(`lxAnswer('who')`); await sim(`lxAnswer('me')`); await click('#lx-show'); });
  await step('lesson-choice', async () => { await sim(`lesson('c-ask')`); await sim('lxNext()'); });
  await step('lesson-bug', async () => { await sim(`lesson('t-fix')`); await sim('lxNext()'); });
  await step('lesson-fill', async () => { await sim('lxAnswer(3)'); await sim('lxNext()'); await sim('lxAnswer(0)'); await sim('lxNext()'); });
  await step('lesson-done', async () => { await sim(`lesson('s-pilot')`); await play('s-pilot'); }, { long: true });
  await step('lesson-sidebar', async () => { await sim(`lesson('t-where')`); await clickText('#scr-learn', '/Lessons/'); });
  await step('priya-chat', async () => { await js(`localStorage.setItem('hsim-ai', JSON.stringify({key:'sk-test', model:'deepseek-flash'}))`); await cdp('Page.reload'); await sleep(1300); await dress();
    await sim(`lesson('t-cd')`); await sim('lxNext()'); await sim(`lxAnswer('cd hackaton')`);
    await js(`document.getElementById('lx-ask').value = 'why did that fail?'`); await click('#lx-askbtn', 400);
    await js(`document.getElementById('lx-ask').value = 'is it a spelling thing?'`); await click('#lx-askbtn', 400); });
  await js(`localStorage.removeItem('hsim-ai')`); await cdp('Page.reload'); await sleep(1300); await dress();
  await step('project-terminal', async () => { await sim(`lesson('p-term')`); await sleep(300); await sim('termHint()'); });
  await step('project-not-solved', async () => { await sim('termQuit()'); });
  await step('project-lesson', async () => { await sim(`lesson('p-claude')`); }, { long: true });
  await step('final-test-briefing', async () => { await sim('learn()'); await js(`[...document.querySelectorAll('#lxm-hack .lx-l.test')].find(b => b.textContent.includes('Rules')).click()`); await sleep(250); });
  await step('drill-feedback', async () => { await sim('drAnswer("")'); await sleep(250); await sim('drAnswer("No. Jamming is illegal for civilians in Canada. We detect and warn, and the police decide.")'); await sleep(700); });
  await step('drill-results', async () => { for (let k = 0; k < 20; k++) { const d = await sim('drState()'); if (d.part === 'dr-done') break; if (d.waiting) await sim(d.text ? 'drAnswer("No. That breaks the rules. I would tell the organizers and be honest about it.")' : 'drAnswer("")'); await sleep(400); } }, { long: true });
  await step('quick-review', async () => { await click('#dr-back'); await sim('review()'); });
  // ---- Drills ----
  await step('drills', async () => { await click('#nav-drills'); }, { long: true });
  await step('drill-briefing', async () => { await sim(`drill('judges')`); await sleep(300); });
  await step('drill-question', async () => { await clickText('#scr-drills', '/^Start/i', 500); });
  await step('drill-terminal', async () => { await clickText('#scr-drills', '/Stop/i', 300); await sim(`drill('debug')`); await sleep(300); await clickText('#scr-drills', '/^Start/i', 700); });
  await step('drill-terminal-hint', async () => { await sim('termHint()'); });
  await step('drill-stopped', async () => { await sim('termQuit()'); await sleep(300); await clickText('#scr-drills', '/Stop/i', 300); });
  // ---- Play menu, settings ----
  await step('play-title', async () => { await click('#nav-play'); }, { long: true });
  await step('how-to-play', async () => { await click('#go-how'); }, { long: true });
  await step('settings-sound', async () => { await click('#go-how'); await click('#menu-btn'); await click('#tab-sound'); }, { long: true });
  await step('settings-ai', async () => { await click('#tab-ai'); }, { long: true });
  await step('settings-ai-open', async () => { await js(`document.getElementById('key-fold').open = true`); await sleep(100); }, { long: true });
  await step('settings-data', async () => { await click('#tab-data'); }, { long: true });
  await step('key-confirm', async () => { await click('#tab-ai'); await js(`document.getElementById('key-fold').open = true`); await click('#set-clear'); });
  await step('roll', async () => { await click('#key-no'); await click('#menu-done'); await click('#go-start', 400); }, { long: true });
  await step('roll-full', async () => { await click('#mode-full'); });
  await step('pack', async () => { await click('#go-pack', 400); }, { long: true });
  await step('chapter-card', async () => { await js(`document.querySelectorAll('#items .item').forEach((b, i) => { if (i < 6) b.click(); })`); await sleep(200); await click('#go-play', 900); });
  await step('venue', async () => { await key('Enter'); await sleep(500); });
  await step('pause-menu', async () => { await key('Escape'); await sleep(300); if (await js(`document.getElementById('menu').hidden`)) await key('Escape'); await sleep(300); });
  await step('home-with-run', async () => { await click('#menu-quit', 500); });
  // ---- A whole quick run, fast ----
  const WANT = ['yes', 'old', 'good', 'test', 'warn', 'operator', 'manual', 'fix', 'home', 'own', 'ask', 'intro', 'short', 'label', 'trade', 'note', 'rehearse', 'offline', 'user', 'say', 'tested', 'legal', 'scope'];
  let termShot = false, boardShot = false;
  async function drive(until) {
    for (let i = 0; i < 4000; i++) {
      const tk = await sim('task()'); if (tk) { await sim(`taskAnswer(${JSON.stringify('We tested on real data and the operator decides. Honest limits: sample only, not field tested.')})`); await sleep(40); continue; }
      const tm = await sim('term()'); if (tm) { if (!termShot) { termShot = true; await cap('crash-terminal'); await sim('termHint()'); await cap('crash-terminal-hint'); } await sim('termSolve()'); await cap('crash-terminal-solved'); await sim('termContinue()'); await sleep(30); continue; }
      const s = await sim('state()'); if (until(s)) return s;
      if (s.chapter === 2 && !boardShot && !s.dlg && !s.busy) { boardShot = true; await cap('build-board'); }
      if (!s.dlg) { await sleep(40); continue; }
      if (s.dlg.typing || !s.dlg.opts) { await key('Enter'); await sleep(15); continue; }
      let opt = s.dlg.opts.find(o => WANT.includes(o)); if (s.dlg.opts.includes('rest') && !opt) opt = s.stats.energy <= 2 ? 'rest' : 'test';
      const idx = Math.max(0, s.dlg.opts.indexOf(opt || s.dlg.opts[0])); for (let k = s.dlg.sel; k < idx; k++) await key('ArrowDown'); await key('Enter'); await sleep(15);
    }
    return sim('state()');
  }
  const interactAt = async (x, y, dir) => { await sim(`teleport(${x},${y},'${dir}')`); await key('Enter'); await sleep(30); };
  const endOf = ch => s => s.screen === 'end' && s.chapter === ch;
  try {
    await sim('newRun(20261114)'); await sim(`pack(${JSON.stringify(['laptop', 'powerbar', 'phone', 'snacks', 'layer', 'notebook'])})`); await sleep(300);
    await interactAt(3, 11, 'up'); for (let k = 0; k < 12; k++) { const s = await sim('state()'); if (s.dlg && s.dlg.opts) break; await key('Enter'); await sleep(60); }
    await cap('dialogue-options');
    await drive(s => !s.dlg && s.quest === 'kickoff');
    await interactAt(10, 3, 'up'); await drive(s => !s.dlg && s.quest === 'team');
    await interactAt(16, 7, 'up'); await drive(endOf(1)); await cap('end-chapter-1', { long: true });
    await click('#go-next', 300); await drive(endOf(2)); await cap('end-chapter-2', { long: true });
    await click('#go-next', 300); await drive(s => !s.dlg && !s.busy && s.quest === 'talk'); await cap('chapter-3-venue');
    await interactAt(10, 3, 'up'); await drive(s => !s.dlg && !s.busy && s.quest === 'booths');
    await interactAt(2, 3, 'up'); await drive(s => !s.dlg && !s.busy);
    await interactAt(17, 3, 'up'); await drive(s => !s.dlg && !s.busy && s.quest === 'follow');
    await interactAt(16, 7, 'up'); await drive(endOf(3)); await cap('end-chapter-3', { long: true });
    await click('#go-next', 300); await drive(s => s.chapter === 4 && !s.dlg && !s.busy); await cap('chapter-4-demo-board');
    await drive(endOf(4)); await cap('final-report-card', { long: true });
    await click('#nav-home', 300); await cap('home-after-run', { long: true });
    await click('#nav-play', 300); await cap('title-after-run', { long: true });
  } catch (e) { errors.push('run: ' + String(e).slice(0, 160)); console.log('FAIL run: ' + String(e).slice(0, 160)); }
  writeFileSync(join(out, `sweep-${tag}.json`), JSON.stringify({ errors, report }, null, 1));
  console.log(`${tag}: ${report.length} states, ${errors.length} error(s)` + (errors.length ? ': ' + errors.slice(0, 6).join(' | ') : ''));
  edge.kill();
}
process.exit(0);

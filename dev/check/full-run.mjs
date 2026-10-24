// Plays one Full run (all four chapters) in headless Edge, answering every timed writing task, and one Quick run for contrast.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-full-'));
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
const VK = { Enter: 13, ArrowDown: 40 };
const key = async k => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: VK[k] }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: VK[k] }); };
const st = () => sim('state()');
// One strong answer that hits every rubric line used in the Full run (plan, intro, calls, team, booth, follow-up, pitch, judges).
const GOOD = `I'm Shad, a carpenter apprentice, hands-on, and I build and test working software by directing Claude Code on drone data. Every night right now, base operators miss drones; the problem is real for one user, the operator. Our core feature first: one screen that will detect and warn, with an alert and a confidence score so a human operator decides and confirms. We cut the 3D map and stretch goals. Data: the provided sample csv feed. Mei builds the core, Gord tests the data, Tomás the map screen, I will test and write the demo. Checkpoints at 2 pm, 6 pm and midnight. Plan B: an offline recording and screenshots, plus my phone hotspot. Watch the demo on screen: we tested on 3,199 rows of real data and measured 12 false alarms. Honest limits: it only works on our sample, it is not yet field tested, the next step is a real operator. No jamming or spoofing; transmitting is illegal for civilians, only police, the RCMP and the military can do more under Canadian law. No, I would not paste old code; I would ask the organizers or rewrite it from scratch and disclose it. Rotate and revoke the leaked key, delete the screenshot, tell the sponsor. Sleep at home so the demo tomorrow morning is fresh with a plan for first thing. Check the history for secrets, clean it, add a readme on how to run it. Okay, no worries, let's revert to the last good commit and fix it, then use a branch and a pull request with review as the rule. Great idea for later, after the core is working, if we have an hour. Both of you get a part: one does the demo, one the Q&A; a practice run decides. Welcome back, glad you're here, what did you find? Can you take the tests next? Hi Jas, great to meet you at the Muskeg booth at the hackathon this morning. You mentioned field installers for fence sensors. Could we grab a coffee next week? Thanks, Shad. Logs help us review and tune it. It adds to existing big systems as a cheap, simple pilot, alongside, not replace. Because users asked, I would fix reliability and test it in the field.`;

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);

// Drives a whole run: answers writing tasks (good or lazy), solves terminals, and picks dialogue options from a wish list.
const WANT = ['yes', 'old', 'good', 'test', 'warn', 'operator', 'manual', 'fix', 'home', 'own', 'ask', 'intro', 'short', 'label', 'trade', 'note', 'rehearse', 'offline', 'user', 'say', 'tested', 'legal', 'scope'];
const tasksSeen = [];
async function drive(writeGood, until) {
  for (let i = 0; i < 4000; i++) {
    const tk = await sim('task()');
    if (tk) { if (tk.writing) tasksSeen.push(tk.who.split(' · ')[0]); await sim(`taskAnswer(${JSON.stringify(writeGood ? GOOD : 'ok')})`); await sleep(40); continue; }
    const tm = await sim('term()');
    if (tm) { await sim('termSolve()'); await sim('termContinue()'); await sleep(30); continue; }
    const s = await st();
    if (until(s)) return s;
    if (!s.dlg) { await sleep(40); continue; }
    if (s.dlg.typing || !s.dlg.opts) { await key('Enter'); await sleep(15); continue; }
    let opt = s.dlg.opts.find(o => WANT.includes(o));
    if (s.dlg.opts.includes('rest') && !opt) opt = s.stats.energy <= 2 ? 'rest' : 'test';
    const idx = Math.max(0, s.dlg.opts.indexOf(opt || s.dlg.opts[0]));
    for (let k = s.dlg.sel; k < idx; k++) await key('ArrowDown');
    await key('Enter'); await sleep(15);
  }
  return st();
}
const interactAt = async (x, y, dir) => { await sim(`teleport(${x},${y},'${dir}')`); await key('Enter'); await sleep(30); };
const endOf = ch => s => s.screen === 'end' && s.chapter === ch;

async function playRun(seed, mode, writeGood) {
  tasksSeen.length = 0;
  await sim(`newRun(${seed})`);
  ok((await js(`document.getElementById('mode-quick').getAttribute('aria-pressed')`)) === 'true', `${mode}: the roll screen offers Quick and Full, Quick picked by default`);
  ok((await sim(`setMode('${mode}')`)) === mode, `${mode}: the mode button switches the run to ${mode}`);
  await sim(`pack(${JSON.stringify(['laptop', 'powerbar', 'phone', 'snacks', 'layer', 'notebook'])})`);
  await interactAt(3, 11, 'up'); await drive(writeGood, s => !s.dlg && s.quest === 'kickoff');
  await interactAt(10, 3, 'up'); await drive(writeGood, s => !s.dlg && s.quest === 'team');
  await interactAt(16, 7, 'up'); let s = await drive(writeGood, endOf(1));
  await js(`document.getElementById('go-next').click()`); s = await drive(writeGood, endOf(2));
  await js(`document.getElementById('go-next').click()`); await drive(writeGood, s => !s.dlg && !s.busy && s.quest === 'talk');
  await interactAt(10, 3, 'up'); await drive(writeGood, s => !s.dlg && !s.busy && s.quest === 'booths');
  await interactAt(2, 3, 'up'); await drive(writeGood, s => !s.dlg && !s.busy);
  await interactAt(17, 3, 'up'); await drive(writeGood, s => !s.dlg && !s.busy && s.quest === 'follow');
  await interactAt(16, 7, 'up'); s = await drive(writeGood, endOf(3));
  await js(`document.getElementById('go-next').click()`); s = await drive(writeGood, endOf(4));
  return { s, tasks: tasksSeen.slice() };
}

const quick = await playRun(20261114, 'quick', true);
ok(quick.s.chapter === 4 && quick.tasks.length === 0, 'quick: all four chapters play with no writing tasks');
const full = await playRun(20261114, 'full', true);
ok(full.s.chapter === 4, 'full: all four chapters play to the end');
ok(full.tasks.length >= 10, `full: ${full.tasks.length} timed writing tasks across the weekend (${full.tasks.join(', ')})`);
ok(['MEI', 'GORD', 'JAS', 'KEN', 'LORRAINE'].every(n => full.tasks.includes(n)), 'full: the plan, intro, booths, follow-up and pitch are all written');
const goodPlace = full.s.place;
const lazy = await playRun(20261114, 'full', false);
ok(lazy.s.lessons.filter(l => !l.good).length > full.s.lessons.filter(l => !l.good).length + 5, `full: lazy written answers collect many more "work on this" lessons (${lazy.s.lessons.filter(l => !l.good).length} vs ${full.s.lessons.filter(l => !l.good).length})`);
ok(lazy.s.stats.trust < full.s.stats.trust || lazy.s.stats.contacts < full.s.stats.contacts, `full: writing well moves the real scores (trust ${full.s.stats.trust} vs ${lazy.s.stats.trust}, contacts ${full.s.stats.contacts} vs ${lazy.s.stats.contacts})`);
const hist = (await st()).history;
ok(hist[2].score < hist[1].score - 15, `full: lazy writing costs real judges' points (${hist[1].score} vs ${hist[2].score} of 95)`);
ok(hist.length === 3 && hist[1].mode === 'full' && hist[0].mode === 'quick', 'run history records which mode each run was');
console.log('places: quick', quick.s.place, '· full good', goodPlace, '· full lazy', lazy.s.place);
ok(!errors.length, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
edge.kill(); process.exit(bad ? 1 : 0);


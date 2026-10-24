// Plays the drills in headless Edge: practice mode (written rubric, practice terminals), then live mode against a fake DeepSeek.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-dr-'));
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
const ds = () => sim('drState()');
const waitFor = async (f, ms = 4000) => { for (let i = 0; i < ms / 50; i++) { const s = await ds(); if (f(s)) return s; await sleep(50); } return ds(); };

await cdp('Runtime.enable'); await cdp('Page.enable');
// a fake DeepSeek: grades every answer as meeting points 0 and 1, and invents a tiny broken project
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__calls = 0; const real = window.fetch;
  window.fetch = async (u, o) => {
    if (!String(u).includes('deepseek')) return real(u, o);
    window.__calls++;
    const body = JSON.parse(o.body), sys = body.messages[0].content, last = body.messages[body.messages.length-1].content;
    let r;
    if (/ONE realistic, unique emergency/.test(sys)) r = {title:'api 500 on deploy', teammate:'gord', story:['The API returns 500.'], host:'laptop', cwd:'/home/shad/project',
      files:{'/home/shad/project/app.py':'import src.main\\n','/home/shad/project/src/main.py':'BUGGY = 1\\n','/home/shad/project/error.log':'Error: BUGGY is wrong\\n'},
      boot:['$ python app.py','Error: boom'], rootCause:'BUGGY should be FIXED', success:'main.py has FIXED and was run', disaster:'', hints:['a','b','c'], good:'Good: read the log first.', bad:'Read the log first.', ok:'ok', no:'no'};
    else if (/grading a beginner/.test(sys)) r = {met:[0,1], reply:'Fair answer, Shad.', tip:'Give one real number.'};
    else if (/FIX/.test(last.split('The player now types: ')[1] || '')) r = {out:'all good', state:'fixed', solved:true, failed:false};
    else r = {out:'output', state:'looked', solved:false, failed:false};
    return new Response(JSON.stringify({choices:[{message:{content: JSON.stringify(r)}}], usage:{prompt_tokens:100, completion_tokens:50}}), {status:200});
  };` });
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'Play Hackathon Sim.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);

// ---- title button and drill list ----
ok(await js(`document.getElementById('nav-drills').getBoundingClientRect().width > 0`), 'the top bar has a Drills tab');
await js(`document.getElementById('nav-drills').click()`); await sleep(150);
let s = await ds();
ok(s.screen === 'drills' && s.part === 'dr-menu', 'Drills opens the drill list');
const ids = await sim('drillIds()');
ok(ids.length === 8 && (await js(`document.querySelectorAll('#dr-list .item').length`)) === 8, 'eight drills are listed: ' + ids.join(', '));
ok(await js(`document.documentElement.scrollWidth <= innerWidth`), 'the drill list has no sideways scroll at phone width');
ok((await js(`document.getElementById('dr-note').textContent`)).includes('Practice mode'), 'without a key it says practice mode');
await cdp('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(root, 'concepts', '14-drills.png'), Buffer.from(r.result.data, 'base64')));

// ---- practice mode: rules drill with good answers, a lazy one and a skip ----
await js(`localStorage.setItem('hsim-drills', JSON.stringify({calls:{best:1, runs:1, last:1, at:Date.now() - 864e5}}))`);   // an old, low best to beat
await sim(`drill('calls')`); s = await waitFor(x => x.waiting);
ok(s.part === 'dr-run' && s.q.includes('BRIEFING') && !s.text, 'a drill opens with a briefing and a start button');
ok(s.cond && s.q.includes('Conditions'), 'the briefing shows the rolled conditions: ' + JSON.stringify(s.cond));
await sim(`drAnswer('')`); s = await waitFor(x => x.waiting && x.text);
ok(/TIME LEFT \d+:\d\d/.test(s.clock), 'each answer has a live countdown: ' + s.clock);
ok(s.step.startsWith('STEP 1 OF 5'), 'the step counter reads ' + s.step);
const good = 'No. Jamming or spoofing is illegal for civilians under Canadian law, so we will not do it. I would tell the organizers and sponsor, rotate and revoke the key, delete the screenshot, and say honestly on our test of 12 rows it is early. We can detect and warn instead, and I would check with the organizers and rewrite it from scratch, then disclose it. Sleep at home so the demo tomorrow morning is fresh, with a plan for first thing. Check the history for secrets, rotate, clean, add a readme on how to run it. Cut scope, one working end to end path, be honest about what is mocked. Say no to sensitive restricted data; use public synthetic sample data.';
await sim(`drAnswer(${JSON.stringify(good)})`); s = await waitFor(x => x.waiting && !x.text);
ok(s.results.length === 1 && s.results[0].met.length >= 2, 'a good answer meets most of the rubric: ' + JSON.stringify(s.results[0]?.met));
ok(/\+ /.test(s.q), 'feedback lists what earned points');
await sim(`drAnswer('')`); await waitFor(x => x.waiting && x.text);
await sim(`drAnswer('idk lol')`); s = await waitFor(x => x.waiting && !x.text);
ok(s.results[1]?.met.length <= 1, 'a lazy answer scores at most one point');
await sim(`drAnswer('')`); await waitFor(x => x.waiting && x.text);
await sim(`drAnswer(null)`); s = await waitFor(x => x.waiting && !x.text);
ok(s.results[2]?.skip && s.q.includes('no skip'), 'skipping is allowed but costs the points');
for (let i = 0; i < 2; i++) { await sim(`drAnswer('')`); await waitFor(x => x.waiting && x.text); await sim(`drAnswer(${JSON.stringify(good)})`); await waitFor(x => x.waiting && !x.text); }
await sim(`drAnswer('')`); s = await waitFor(x => x.part === 'dr-done');
ok(s.part === 'dr-done' && /SCORE\s*\d+%/.test(s.stats), 'the drill ends with a score: ' + s.stats.replace(/\s+/g, ' '));
ok(s.saved.calls && s.saved.calls.runs === 2 && s.saved.calls.best > 1, 'the best score is saved for that drill');
ok((await js(`document.getElementById('dr-result').textContent`)).startsWith('New best!'), 'beating the saved best says New best!');
ok(s.keep.length > 5 && s.fix.length > 5, 'the results list what went well and what to work on');
ok(!(await sim('state()')).save, 'a drill never creates or overwrites the saved run');
await cdp('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(root, 'concepts', '15-drill-results.png'), Buffer.from(r.result.data, 'base64')));


// ---- practice mode: terminal triage uses the practice terminals and the step clock ----
await sim(`drill('debug')`); await waitFor(x => x.waiting); await sim(`drAnswer('')`);
s = await waitFor(x => x.waiting && x.q.includes('TEAM LAPTOP'));
ok(s.q.includes('crashed'), 'without a key a terminal step uses a practice terminal');
await sim(`drAnswer('')`); await sleep(200);
let tm = await sim('term()');
ok(tm && tm.title.startsWith('CRASH'), 'the terminal opens: ' + (tm && tm.title));
ok(/TIME LEFT/.test((await ds()).clock), 'the terminal step runs on its own countdown');
await sim('termSolve()'); await sim('termContinue()'); s = await waitFor(x => x.results.length === 1);
ok(s.results[0]?.ok === true, 'solving the terminal counts as fixed');
await js(`document.getElementById('dr-stop').click()`); await sleep(150);
s = await ds(); ok(s.part === 'dr-menu' && !(await sim('term()')), 'Stop this drill goes back to the list');

// ---- the sponsor tables drill: three Edmonton-style booths, intro + hard question each, then the follow-up (13 Oct) ----
await sim(`drill('booths')`); s = await waitFor(x => x.waiting);
ok(s.q.includes('BRIEFING') && /drone field technician/.test(s.q), 'the sponsor tables drill opens with a briefing that names the real Edmonton roles');
await sim(`drAnswer('')`); s = await waitFor(x => x.waiting && x.text);
ok(/HIRING: FIELD TECHNICIANS/.test(s.q) && /STEP 1 OF 7/.test(s.step), 'booth one is a field-technician employer and the drill has 7 steps: ' + s.step);
const boothAnswers = ["I'm Shad, a carpenter apprentice: I climb, mount and check gear on sites at -30. This weekend I built and tested a drone-detection demo with Claude Code on 3,199 rows of data. I haven't touched your gear, so what does the first month of training look like?", "I'm Shad, a carpenter apprentice: I climb, mount and check gear on sites at -30. This weekend I built and tested a drone-detection demo with Claude Code on 3,199 rows of data. I haven't touched your gear, so what does the first month of training look like?", "I'm Shad, a carpenter apprentice: I climb, mount and check gear on sites at -30. This weekend I built and tested a drone-detection demo with Claude Code on 3,199 rows of data. I haven't touched your gear, so what does the first month of training look like?", "I would check it first: re-measure with a second control point and the tolerance for that pour. 40 mm out of level is a real problem on a slab, so I would show both the super and the engineer the numbers in writing and let them decide.", "I'm Shad, a carpenter apprentice: I climb, mount and check gear on sites at -30. This weekend I built and tested a drone-detection demo with Claude Code on 3,199 rows of data. I haven't touched your gear, so what does the first month of training look like?", "Neither goes in alone. I would ask how each was counted, then show both numbers side by side with the method written next to each, so the manager sees why they differ.", "Hi Jas, we met at the Muskeg Sensors booth at the hackathon in Edmonton on Sunday. You said your techs mount fence and mast sensors and you train people who know sites. Could we have a 15-minute call next week about the field technician role? Shad"];
let boothMet = [];
for (let i = 0; i < 7; i++) { s = await waitFor(x => x.waiting && x.text); await sim(`drAnswer(${JSON.stringify(boothAnswers[i])})`); s = await waitFor(x => x.waiting && !x.text || x.part === 'dr-done'); const m = (s.q.match(/· (\d) OF (\d)/) || []); boothMet.push(m[1] + '/' + m[2]); if (s.part !== 'dr-done') await sim(`drAnswer('')`); }
s = await waitFor(x => x.part === 'dr-done');
ok(s.part === 'dr-done' && s.results.length === 7, 'all three booths and the follow-up play to a result: ' + boothMet.join(' ') + ' · ' + s.stats.replace(/\s+/g, ' '));
ok(boothMet.slice(0, 6).every(x => parseInt(x) >= 3), 'a good intro and honest answers earn at least 3 of 4 at every booth');
await js(`document.getElementById('dr-all').click()`); await sleep(200);

// ---- the pitch drill: write it, then say it out loud on a stopwatch (13 Oct) ----
await sim(`drill('pitch')`); await waitFor(x => x.waiting); await sim(`drAnswer('')`); await waitFor(x => x.waiting && x.text);
await sim(`drAnswer(${JSON.stringify(good)})`); s = await waitFor(x => x.waiting && !x.text);
ok(s.q.startsWith('SAY IT OUT LOUD') && /Start speaking/.test(await js(`document.getElementById('dr-send').textContent`)), 'after writing the pitch the drill asks you to say it out loud on a stopwatch');
await sim(`drAnswer('')`); await sleep(450);
ok(/^SPEAKING 0:0\d \/ 3:00$/.test(await js(`document.getElementById('dr-clock').textContent`)), 'the clock counts up while you speak: ' + await js(`document.getElementById('dr-clock').textContent`));
await sim('drSpoke(170)'); await sim(`drAnswer('')`); s = await waitFor(x => x.waiting && !x.text);
ok(/Said out loud: 2:50\. On time\./.test(s.q), 'the feedback shows the spoken time and whether it fit the 3-minute slot');
ok((await js(`(JSON.parse(localStorage.getItem('hsim-learn') || '{}').pitch || []).length`)) === 1, 'saying the pitch out loud ticks tonight\'s pitch-out-loud quest item');
await sim(`drAnswer('')`); await waitFor(x => x.waiting && x.text); await sim(`drAnswer(${JSON.stringify(good)})`); await waitFor(x => x.waiting && !x.text);
await sim(`drAnswer('')`); await waitFor(x => x.waiting && x.text); await sim(`drAnswer(${JSON.stringify(good)})`); s = await waitFor(x => x.part === 'dr-done');
ok(s.part === 'dr-done' && /said out loud in 2:50/.test(await js(`document.getElementById('dr-keep').innerText`)), 'the results keep the spoken pitch as something that went well');
await js(`document.getElementById('dr-all').click()`); await sleep(200);

// ---- practice mode: the full sprint plays start to finish (plan, calls, terminals, team, sponsor, pitch, judges) ----
await sim(`drill('sprint')`); await waitFor(x => x.waiting);
const kinds = [];
for (let i = 0; i < 60; i++) {
  s = await waitFor(x => x.waiting || x.part === 'dr-done' || false, 3000);
  if (s.part === 'dr-done') break;
  const tmx = await sim('term()');
  if (tmx) { kinds.push('term'); await sim('termSolve()'); await sim('termContinue()'); await sleep(100); continue; }
  if (s.text) { kinds.push(s.q.split('\n')[0].slice(0, 12)); await sim(`drAnswer(${JSON.stringify(good)})`); }
  else await sim(`drAnswer('')`);
  await sleep(60);
}
s = await ds();
ok(s.part === 'dr-done' && s.results.length === 11, 'the full sprint plays all 11 steps to a score: ' + s.stats.replace(/\s+/g, ' '));
ok(s.results.filter(r => r.k === 'term').length === 2 && s.results.filter(r => r.k === 'term').every(r => r.ok), 'the sprint has two terminal emergencies, both solved');
ok(kinds.some(k => k.startsWith('MEI')) && kinds.some(k => k.startsWith('LORRAINE')), 'the sprint includes the kickoff plan and the pitch on stage');

// ---- live mode: invented problems and a live judge ----
await js(`localStorage.setItem('hsim-ai', JSON.stringify({key:'sk-test', model:'deepseek-flash'}))`);
await cdp('Page.reload'); await sleep(1200);
await sim('drills()'); await sleep(100);
ok((await js(`document.getElementById('dr-note').textContent`)).includes('Live mode'), 'with a key it says live mode');
await sim(`drill('judges')`); await waitFor(x => x.waiting); await sim(`drAnswer('')`); await waitFor(x => x.waiting && x.text);
await sim(`drAnswer('We tested on 3,199 rows of the sample data, only one weekend, so it is an early estimate.')`);
s = await waitFor(x => x.waiting && !x.text);
ok(s.q.includes('LIVE JUDGE') && s.q.includes('Fair answer') && s.q.includes('Tip:'), 'a live judge replies in character with a tip');
await js(`document.getElementById('dr-stop').click()`); await sleep(100);
await sim(`drill('debug')`); await waitFor(x => x.waiting); await sim(`drAnswer('')`);
s = await waitFor(x => x.waiting && x.q.includes('GORD'), 6000);
ok(s.q.includes('500'), 'with a key a terminal step is an invented project, told by a teammate');
await sim(`drAnswer('')`); await sleep(300);
tm = await sim('term()'); ok(tm && /API 500/.test(tm.title), 'the invented project opens in the live shell: ' + (tm && tm.title));
await sim(`termInput('ls')`); await sleep(150);
ok((await sim('term()'))?.out.includes('app.py'), 'the live shell reads the invented files');
await sim(`termInput('FIX it')`); await sleep(400); await sim('termContinue()');
s = await waitFor(x => x.results.length === 1 && x.waiting);
ok(s.results[0]?.ok && s.q.includes('BUGGY should be FIXED'), 'after the terminal it shows the real cause');
await js(`document.getElementById('dr-stop').click()`); await sleep(100);
ok(await js(`document.getElementById('dr-back').hidden`), 'opened from the top bar: no "Back to the course" button');
await js(`document.getElementById('dr-home').click()`); await sleep(100);
ok((await js('document.body.dataset.screen')) === 'home', 'the Home button on the drills page returns Home');
await js(`document.getElementById('nav-course').click()`); await sleep(150); await js(`document.getElementById('lx-drills').click()`); await sleep(150);
ok(await js(`!document.getElementById('dr-back').hidden`), 'opened from the course: "Back to the course" shows');
await js(`document.getElementById('dr-back').click()`); await sleep(100);
ok((await js('document.body.dataset.screen')) === 'learn', 'Back returns to the course');
ok(!errors.length, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log('calls:', await js('window.__calls'));
edge.kill(); process.exit(bad ? 1 : 0);


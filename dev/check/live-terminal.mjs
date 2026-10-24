// Drives the live terminal against a fake DeepSeek (page fetch is stubbed). Not part of the check.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = mkdtempSync(join(tmpdir(), 'hsim-live-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`, '--remote-debugging-port=0', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const pf = join(prof, 'DevToolsActivePort');
for (let i = 0; i < 100 && !existsSync(pf); i++) await sleep(100);
await sleep(200);
const port = readFileSync(pf, 'utf8').split('\n')[0].trim();
const t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const w = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async x => (await cdp('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.result.value;
const sim = x => js(`window.__sim.${x}`);
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const outText = () => js(`document.getElementById('t-out').innerText`);

await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  localStorage.setItem('hsim-ai', JSON.stringify({key:'sk-test', model:'deepseek-flash'}));
  window.__calls = 0; window.__drop = false;
  const real = window.fetch;
  window.fetch = async (u, o) => {
    if (!/deepseek|openrouter/.test(String(u))) return real(u, o);
    window.__calls++; window.__last = {url:String(u), body:JSON.parse(o.body), auth:o.headers.Authorization};
    if (window.__drop) return new Response('{}', {status: 500});
    const body = JSON.parse(o.body), last = body.messages[body.messages.length-1].content;
    window.__lastBody = body;
    if (/SLOW/.test(last.split('The player now types: ')[1] || '')) await new Promise((res, rej) => { o.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); setTimeout(res, 5000); });
    const cmd = last.split('The player now types: ')[1] || '';
    const hasSys = /terminal of a Linux computer|shell of a Linux laptop/.test(body.messages[0].content);
    let r;
    if (/ONE realistic, unique emergency/.test(body.messages[0].content)) r = {title:'api 500 on deploy', teammate:'gord', story:['The API returns 500.'], host:'laptop', cwd:'/home/shad/project',
      files:{'/home/shad/project/app.py':'import src.main\\n','/home/shad/project/src/main.py':'BUGGY = 1\\n','/home/shad/project/error.log':'Error: BUGGY is wrong\\n'},
      boot:['$ python app.py','Error: boom'], rootCause:'BUGGY should be FIXED', success:'main.py has FIXED and was run', disaster:'', hints:['a','b','c'], good:'g', bad:'b', ok:'ok', no:'no'};
    else if (/sed -i/.test(cmd)) r = {out:'', writes:{'/home/shad/project/src/main.py':'FIXED = 1\\n'}, state:'edited', solved:false, failed:false};
    else if (/You are Claude Code/.test(body.messages[0].content)) r = {out:'● Read(src/main.py)\\n● Update(src/main.py)\\n  ⎿ - BUGGY = 1\\n  ⎿ + FIXED = 2\\nRenamed the flag.', writes:{'/home/shad/project/src/main.py':'FIXED = 2\\n'}, state:'claude edited main.py'};
    else if (!hasSys) r = {hint: 'check the log'};
    else if (/RM/.test(cmd)) r = {out:'removed', state:'datasets gone', solved:false, failed:true};
    else if (/FIX/.test(cmd)) r = {out:'all good', state:'fixed', solved:true, failed:false};
    else r = {out:'output for '+cmd, state:'looked around', solved:false, failed:false};
    return new Response(JSON.stringify({choices:[{message:{content: JSON.stringify(r)}}], usage:{prompt_tokens:100, completion_tokens:50}}), {status:200});
  };` });
await cdp('Page.navigate', { url: pathToFileURL(join(root, 'index.html')).href }); await sleep(1200); for (let i = 0; i < 300 && !(await js('!!(window.__sim && window.__sim.lxState)')); i++) await sleep(100);
await sim('newRun(20261114)'); await sleep(200);

for (const id of ['csv','port','env','disk','merge','secret','force']) {
  await sim(`openTerm('live:${id}')`); await sleep(300);
  const title = await js(`document.getElementById('t-title').textContent`);
  ok(title.length > 3, id + ': opens with title ' + title);
  await sim(`termInput('ls -la')`); await sleep(500);
  ok((await outText()).includes('output for ls -la'), id + ': a real command gets model output');
  const chips = await js(`document.querySelectorAll('.tchip').length`);
  ok(chips === 0, id + ': no answer chips in live mode');
  await sim(`termInput('FIX it')`); await sleep(500);
  ok(await js(`!document.getElementById('t-cont').hidden`), id + ': solving ends the scene');
  await sim('termContinue()'); await sleep(100);
}
await sim(`openTerm('live:disk')`); await sleep(300);
await sim(`termInput('RM -rf ~')`); await sleep(500);
ok((await outText()).includes('real damage') && await js(`!document.getElementById('t-cont').hidden`), 'disaster ends the scene as a failure');
await sim('termContinue()'); await sleep(100);

// ---- generated incident: the model invents the files; the game keeps a real disk, so edits persist ----
await sim('newRun(11)'); await sleep(300);   // a fresh game state: on a slow machine the scene above may not have handed the state back yet
await js(`window.__gen = true`);
const inc = await js(`window.__sim.genIncident('crash').catch(e => ({err: String((e && e.message) || e)}))`);
ok(inc && !inc.err && Object.keys(inc.files).length >= 3 && inc.success && inc.hints.length === 3, 'generator returns a complete new incident' + (inc && inc.err ? ': ' + inc.err + ' (calls ' + await js('window.__calls') + ')' : ''));
await sim(`openGen(${JSON.stringify(inc)})`); await sleep(300);
ok((await js(`document.getElementById('t-pr').textContent`)).startsWith('shad@'), 'the prompt shows user, host and folder like a real shell');
await sim(`termInput('ls')`); await sleep(200);
ok((await outText()).includes('app.py'), 'ls lists the real files from the disk');
await sim(`termInput('cd src')`); await sleep(100);
ok((await js(`document.getElementById('t-pr').textContent`)).includes('/src'), 'cd changes the prompt');
await sim(`termInput('cat main.py')`); await sleep(100);
ok((await outText()).includes('BUGGY'), 'cat shows the file contents');
await sim(`termInput('sed -i s/BUGGY/FIXED/ main.py')`); await sleep(500);
await sim(`termInput('cat main.py')`); await sleep(100);
ok((await outText()).includes('FIXED = 1'), 'an edit made by a command stays on the disk');
await sim(`termInput('cd /nope')`); await sleep(100);
ok((await outText()).includes('No such file or directory'), 'cd into a missing folder fails like a real shell');
ok(await js(`document.querySelectorAll('.tl.c-err').length > 0`), 'error lines are coloured differently');
await sim(`termInput('FIX it')`); await sleep(500);
ok(await js(`!document.getElementById('t-cont').hidden`), 'solving a generated incident ends the scene');
await sim('termContinue()'); await sleep(100);
await js(`window.__gen = false`);

// ---- the shell behaves like a real one: local commands, history, Tab, nano, Claude Code, Ctrl+C, the run's battery and Wi-Fi ----
const calls = () => js('window.__calls');
const key = (k, extra = '') => js(`document.getElementById('t-in').dispatchEvent(new KeyboardEvent('keydown', {key:'${k}', bubbles:true, cancelable:true ${extra}}))`);
await sim(`setRoll('outlets', 'scarce')`); await sim(`setRoll('wifi', 'down')`); await sim(`setRoll('ai', 'open')`); await sim(`setBag([])`);
await sim(`openGen(${JSON.stringify(inc)})`); await sleep(300);
ok((await js(`document.getElementById('t-stat').textContent`)).includes('BAT 40%'), 'no outlet and no power bar: the laptop runs on battery');
ok((await js(`document.getElementById('t-stat').textContent`)).includes('WI-FI DOWN'), 'the status line shows the Wi-Fi for this run');
let c0 = await calls();
await sim(`termInput('grep -n BUGGY src/main.py')`); await sleep(100);
await sim(`termInput('head -n 1 error.log')`); await sleep(100);
await sim(`termInput('grep -rl BUGGY .')`); await sleep(100);
await sim(`termInput('ls -la')`); await sleep(100);
let o2 = await outText();
ok(o2.includes('1:BUGGY') && o2.includes('Error: BUGGY is wrong') && o2.includes('./src/main.py') && o2.includes(' ..'), 'grep, head and ls -la answer exactly from the disk');
ok(await calls() === c0, 'those commands cost no API call');
await key('ArrowUp'); ok(await js(`document.getElementById('t-in').value`) === 'ls -la', 'Up arrow recalls the last command');
await key('ArrowUp'); ok(await js(`document.getElementById('t-in').value`) === 'grep -rl BUGGY .', 'Up again goes further back');
await key('ArrowDown'); await key('ArrowDown'); ok(await js(`document.getElementById('t-in').value`) === '', 'Down past the newest clears the line');
await js(`document.getElementById('t-in').value = 'cat src/ma'`); await key('Tab');
ok(await js(`document.getElementById('t-in').value`) === 'cat src/main.py ', 'Tab completes a file name');
await js(`document.getElementById('t-in').value = ''`);
await sim(`termInput('cat app.py')`); await sleep(50);
await sim(`termInput('nano app.py')`); await sleep(100);
ok(await js(`document.querySelector('.crt').classList.contains('editing')`), 'nano opens a real editor');
await js(`const e = document.getElementById('t-ed'); e.value = 'import src.main\\nprint(\"edited by hand\")\\n'; e.dispatchEvent(new Event('input'))`);
await js(`document.getElementById('t-ed').dispatchEvent(new KeyboardEvent('keydown', {key:'x', ctrlKey:true, bubbles:true, cancelable:true}))`);
ok((await js(`document.getElementById('t-edbar').textContent`)).includes('Save modified buffer'), 'Ctrl+X with changes asks to save, like nano');
await js(`document.getElementById('t-ed').dispatchEvent(new KeyboardEvent('keydown', {key:'y', bubbles:true, cancelable:true}))`); await sleep(50);
ok(!(await js(`document.querySelector('.crt').classList.contains('editing')`)), 'Y saves and closes the editor');
await sim(`termInput('cat app.py')`); await sleep(50);
ok((await outText()).includes('edited by hand'), 'the hand edit is on the disk');
await sim(`termInput('python SLOW.py')`); await sleep(150);
ok(await js(`document.getElementById('t-in').disabled`), 'a running command blocks the prompt');
await js(`dispatchEvent(new KeyboardEvent('keydown', {key:'c', ctrlKey:true, bubbles:true, cancelable:true}))`); await sleep(150);
ok((await outText()).trimEnd().endsWith('^C') && !(await js(`document.getElementById('t-in').disabled`)), 'Ctrl+C stops a running command');
await sim(`termInput('pip install requests')`); await sleep(300);
const lb = await js('window.__lastBody');
ok(lb.temperature === 0.2 && lb.thinking.type === 'disabled', 'the shell answers at low temperature, so the computer is steady');
ok(/Wi-Fi is down/.test(lb.messages[0].content) && /BUGGY should be FIXED/.test(lb.messages[0].content), 'the model knows the Wi-Fi is down and the real root cause');
c0 = await calls(); await sim(`termInput('claude \"fix it\"')`); await sleep(150);
ok((await outText()).includes('I need more to go on') && await calls() === c0, 'a vague claude request gets a question back with no API call');
await sim(`termInput('claude \"fix the BUGGY flag in src/main.py\"')`); await sleep(300);
await sim(`termInput('cat src/main.py')`); await sleep(50);
ok((await outText()).includes('Update(src/main.py)') && (await outText()).includes('FIXED = 2'), 'claude edits the real files like Claude Code');
ok(await js(`[...document.querySelectorAll('.tl.c-ok')].some(d => d.textContent.includes('+ FIXED'))`), 'Claude Code diff lines are coloured');
await sim(`setFlag('aiLimit', true)`); c0 = await calls();
await sim(`termInput('claude \"try again\"')`); await sleep(100);
ok((await outText()).includes('usage limit') && await calls() === c0, 'after the usage limit hits, claude refuses like the real tool');
await sim(`setFlag('aiLimit', false)`); await sim(`setRoll('ai', 'banned')`);
await sim(`termInput('claude \"help\"')`); await sleep(100);
ok((await outText()).includes('No AI coding tools') && await calls() === c0, 'when AI tools are banned, a teammate stops you');
for (let i = 0; i < 6; i++){ await sim(`termInput('git status ${i}')`); await sleep(120); }
ok((await outText()).includes('[team chat]'), 'teammates ping the chat while you work');
await sim('termQuit()'); await sleep(100);
await sim(`setRoll('ai', 'open')`); await sim(`setRoll('outlets', 'plenty')`); await sim(`setRoll('wifi', 'good')`);
await js(`window.__gen = true`); await sim(`genIncident('crash', true)`); await js(`window.__gen = false`);
const tb = await js('window.__lastBody');
ok(tb.thinking.type === 'enabled' && tb.reasoning_effort === 'high' && !tb.response_format, 'background incidents are invented with high-effort thinking');

await sim(`openTerm('live:csv')`); await sleep(300);
await sim(`termHint()`); await sleep(500);
ok((await outText()).includes('PRIYA'), 'hint works in live mode');
await js(`window.__drop = true`);
await sim(`termInput('ls')`); await sleep(450);
const o = await outText();
ok(o.includes('Switching to the practice terminal'), 'dropped connection falls back to the practice terminal');
await sleep(1200); ok((await outText()).includes('crash.log') || (await outText()).includes('Try: cat crash.log'), 'practice terminal restarts');
await sim('termQuit()'); await sleep(100); await sim('termContinue()');
// ---- the request itself: DeepSeek keys go to DeepSeek, OpenRouter keys (sk-or-) go to OpenRouter with the same model ----
await js(`window.__drop = false`);
await sim(`openTerm('live:csv')`); await sleep(300); await sim(`termInput('ls -la')`); await sleep(400);
let L = await js('window.__last');
ok(L.url === 'https://api.deepseek.com/chat/completions' && L.body.model === 'deepseek-flash' && L.body.thinking?.type === 'disabled' && L.body.response_format?.type === 'json_object',
  'a DeepSeek key calls DeepSeek with deepseek-flash, thinking off, json output');
await sim('termQuit()'); await sleep(100); await sim('termContinue()');
// switch keys the way a player does: Settings, paste, Save and test
await js(`document.getElementById('menu-btn').click()`); await sleep(100);
await js(`document.getElementById('set-key').value = 'sk-or-v1-test'; document.getElementById('set-test').click()`); await sleep(400);
const st1 = await js(`document.getElementById('set-status').textContent`);
ok(st1.startsWith('Connected to OpenRouter'), 'Save and test with an OpenRouter key says "Connected to OpenRouter": ' + st1.slice(0, 40));
await js(`document.getElementById('menu-close').click()`); await sleep(100);
await sim(`openTerm('live:csv')`); await sleep(300); await sim(`termInput('ls -la')`); await sleep(400);
L = await js('window.__last');
ok(L.url === 'https://openrouter.ai/api/v1/chat/completions' && L.auth === 'Bearer sk-or-v1-test', 'an OpenRouter key (sk-or-) calls OpenRouter with that key');
ok(L.body.model === 'deepseek/deepseek-v4.1-flash' && L.body.reasoning?.effort === 'none' && !L.body.thinking && L.body.response_format?.type === 'json_object',
  'on OpenRouter it uses deepseek/deepseek-v4.1-flash with reasoning off and json output: ' + JSON.stringify({m:L.body.model, r:L.body.reasoning}));
ok(L.body.provider?.max_price?.prompt === 0.3 && L.body.provider?.max_price?.completion === 1.2 && L.body.provider?.require_parameters === true, 'OpenRouter calls are capped at DeepSeek\'s own price and only use hosts that honour json');
ok((await outText()).includes('output for ls -la'), 'the OpenRouter reply drives the live terminal the same way');
await sim('termQuit()'); await sleep(100); await sim('termContinue()');
await js(`window.__gen = true`); await sim(`genIncident('crash', true)`);
L = await js('window.__last');
ok(L.body.reasoning?.effort === 'high' && L.body.reasoning?.exclude === true, 'inventing an incident on OpenRouter asks for high-effort reasoning, hidden from the reply');
await js(`window.__gen = false`);
console.log('calls:', await js('window.__calls'));
edge.kill(); process.exit(bad ? 1 : 0);

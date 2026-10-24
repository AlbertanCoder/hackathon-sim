// Plays chapter 1 of Hackathon Sim in headless Edge and fails loudly on anything wrong.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fail = (m) => { console.log('FAIL: ' + m); process.exitCode = 1; throw new Error(m); };
const ok = (m) => console.log('ok   ' + m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 1. the local playable copy matches the published page
const page = readFileSync(join(root, 'index.html'), 'utf8');
const local = join(root, 'Play Hackathon Sim.html');
const HEAD = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n';
export const buildLocal = () => HEAD + page.replace('<div class="cab">', '</head><body>\n<div class="cab">') + '\n</body></html>\n';
if (process.argv.includes('--build')) { writeFileSync(local, buildLocal()); console.log('local copy written'); process.exit(0); }
if (!existsSync(local) || readFileSync(local, 'utf8') !== buildLocal()) fail('local copy "Play Hackathon Sim.html" is missing or out of date (run with --build)');
ok('local copy matches index.html');

// 2. launch headless Edge
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const prof = mkdtempSync(join(tmpdir(), 'hsim-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${prof}`, '--remote-debugging-port=0', '--window-size=400,900', 'about:blank'], { stdio: 'ignore' });
const portFile = join(prof, 'DevToolsActivePort');
for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
if (!existsSync(portFile)) fail('Edge did not start');
await sleep(200);
const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const waits = new Map(); const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + JSON.stringify(m.params.args.map(a => a.value ?? a.description)));
});
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) fail('eval threw: ' + expr + ' -> ' + JSON.stringify(r.result.exceptionDetails.exception?.description));
  return r.result.result.value;
};
const VK = { Enter: 13, ArrowDown: 40, ArrowUp: 38, Escape: 27 };
const key = async (k, hold = 0) => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: VK[k] });
  if (hold) await sleep(hold);
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: VK[k] });
};
const st = () => js('window.__sim.state()');
const noOverflow = async (where) => {
  const w = await js('[document.documentElement.scrollWidth, innerWidth]');
  if (w[0] > w[1]) fail(`${where}: page is ${w[0]}px wide in a ${w[1]}px window`);
  ok(`${where}: no sideways scroll at ${w[1]}px`);
};
// Exactly the right panels are on screen, judged by what the browser actually draws.
const SHOWN = { title: ['scr-title'], roll: ['scr-roll'], pack: ['scr-pack'], end: ['scr-end'], play: ['hud', 'screen', 'dlg'], build: ['hud', 'screen', 'board', 'dlg'] };
const ALL = ['scr-title', 'scr-roll', 'scr-pack', 'scr-end', 'hud', 'screen', 'board', 'dlg'];
const visible = async (screen) => {
  const seen = await js(`${JSON.stringify(ALL)}.filter(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.height > 0; })`);
  const want = SHOWN[screen];
  if (seen.join() !== ALL.filter(i => want.includes(i)).join()) fail(`${screen} screen shows [${seen}] but should show only [${want}]`);
  ok(`${screen} screen shows only ${want.join(', ')}`);
};
const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(here, name), Buffer.from(r.result.data, 'base64')); };

// Plays an open conversation to the end. prefs: one list of acceptable answer ids per question,
// or a function (state) => answer id for scenes whose questions depend on the roll.
let termMode = "solve"; const termsSeen = []; let hackClocked = false;
async function talk(prefs) {
  const asked = [];
  for (let i = 0; i < 1500; i++) {
    const s = await st();
    if (!s.dlg) {
      const tm = await js('window.__sim.term()');
      if (tm) { termsSeen.push(tm.title); if (tm.title.startsWith('STAGING') && !hackClocked) { await sleep(700); hackClocked = (await js("document.getElementById('t-title').textContent")).includes('LEFT'); if (!hackClocked) fail('the password terminal should run on the clock like the others'); } if (termMode === 'solve') { await js('window.__sim.termSolve()'); const d = await js('window.__sim.term()'); if (!d.done) fail('terminal not solved: ' + tm.title + ' :: ' + d.out); await js('window.__sim.termContinue()'); } else await js('window.__sim.termQuit()'); await sleep(30); continue; }
      if (s.busy) { await sleep(40); continue; } return asked;
    }
    if (s.dlg.typing || !s.dlg.opts) { await key('Enter'); await sleep(15); continue; }
    const want = typeof prefs === 'function' ? [prefs(s)] : (prefs.shift() || []);
    let idx = s.dlg.opts.findIndex(o => want.includes(o)); if (idx < 0) idx = 0;
    for (let k = s.dlg.sel; k < idx; k++) await key('ArrowDown');
    const after = await st(); if (after.dlg.sel !== idx) fail(`arrow keys picked option ${after.dlg.sel}, wanted ${idx}`);
    asked.push(s.dlg.opts[idx]);
    await key('Enter'); await sleep(15);
  }
  fail('conversation never ended');
}
async function interactAt(x, y, dir) { await js(`window.__sim.teleport(${x},${y},'${dir}')`); await key('Enter'); await sleep(30); }

async function playRun(seed, bag, prefs) {
  await js(`window.__sim.newRun(${seed})`);
  if ((await st()).screen !== 'roll') fail('roll screen did not show');
  await js(`window.__sim.pack(${JSON.stringify(bag)})`);
  const s0 = await st(); if (s0.screen !== 'play' || s0.quest !== 'checkin') fail('did not enter play at check-in');
  await interactAt(10, 3, 'up'); await talk([]);
  if ((await st()).quest !== 'checkin') fail('organizer let you skip check-in');
  if (prefs.food) { await interactAt(16, 11, 'up'); await talk([prefs.food]); }
  await interactAt(3, 11, 'up'); await talk(prefs.checkin);
  if ((await st()).quest !== 'kickoff') fail('check-in did not finish');
  await interactAt(10, 3, 'up'); await talk(prefs.kickoff);
  if ((await st()).quest !== 'team') fail('kickoff did not finish');
  await interactAt(16, 7, 'up'); await talk(prefs.team);
  await sleep(800);
  const s = await st(); if (s.screen !== 'end') fail('chapter end card did not show, screen=' + s.screen);
  return s;
}


// Chapter 2 policies. Good: hold the legal line, name one user, rest before empty, work the weakest part.
const JOB = { tested: 'test', screen: 'screen', script: 'script', core: 'core' };
function goodPolicy(s) {
  const o = s.dlg.opts;
  for (const p of ['warn', 'operator', 'manual', 'fix', 'home', 'own', 'say', 'label', 'note', 'short', 'ask', 'user', 'scope']) if (o.includes(p)) return p;   // the last seven are the good answers to the random incidents
  if (o.includes('rest')) {
    if (s.stats.energy <= 2) return 'rest';
    let low = 'tested'; for (const k of ['tested', 'screen', 'script', 'core']) if (s.parts[k] < s.parts[low]) low = k;
    return s.parts[low] >= 4 ? 'rest' : JOB[low];
  }
  return o[0];
}
function badPolicy(s) {
  const o = s.dlg.opts;
  for (const p of ['jam', 'everyone', 'wait', 'later', 'stay', 'eat']) if (o.includes(p)) return p;
  return o.includes('core') ? 'core' : o[0];
}
async function playCh2(policy) {
  await js(`document.getElementById('go-next').click()`);
  const s0 = await st();
  if (s0.screen !== 'play' || s0.chapter !== 2) fail('continue button did not start chapter 2');
  await talk(policy);
  await sleep(800);
  const s = await st();
  if (s.screen !== 'end' || s.chapter !== 2) fail('chapter 2 end card did not show, screen=' + s.screen);
  if (s.tasks.length !== 7) fail('chapter 2 should ask for 7 jobs, asked ' + s.tasks.length);
  return s;
}
// Chapter 3 policies. Good: ask the speaker a real question, say your line, read the label, follow up the same day.
const C3_GOOD = ['ask', 'intro', 'short', 'label', 'trade', 'note'];
const C3_BAD = ['pitch', 'swag', 'long', 'eat', 'skip', 'mass'];
let ch3Seen = false;
async function playCh3(list) {
  await js(`document.getElementById('go-next').click()`);
  const before = await st();
  if (before.screen !== 'play' || before.chapter !== 3) fail('continue button did not start chapter 3');
  if (!ch3Seen) {
    ch3Seen = true;
    await visible('play');
    if (await js(`getComputedStyle(document.querySelector('.dpad')).display === 'none'`)) fail('the walking pad should come back in chapter 3');
    ok('chapter 3 brings the walking pad back');
    await sleep(300); await shot('play-ch3.png');
  }
  const pol = (s) => s.dlg.opts.find(o => list.includes(o)) || s.dlg.opts[0];
  await talk(pol);                                   // Mei's Sunday intro
  await interactAt(16, 7, 'up'); await talk(pol);    // team table before the talk: nothing to report yet
  if ((await st()).quest !== 'talk') fail('the team table let you skip the talk');
  await interactAt(10, 3, 'up'); await talk(pol);    // the guest talk
  if ((await st()).quest !== 'booths') fail('the talk did not open the booths');
  await interactAt(2, 3, 'up'); await talk(pol);     // Muskeg Sensors
  if ((await st()).quest !== 'booths') fail('one booth should not finish the booths');
  await interactAt(17, 3, 'up'); await talk(pol);    // Tamarack Drone Works
  if ((await st()).quest !== 'follow') fail('visiting both booths did not send you back to the team');
  await interactAt(16, 7, 'up'); await talk(pol);
  await sleep(800);
  const s = await st();
  if (s.screen !== 'end' || s.chapter !== 3) fail('chapter 3 end card did not show, screen=' + s.screen);
  return { s, before };
}
const ch3fix = (s) => s.lessons.filter(l => l.ch === 3 && !l.good);
// Chapter 4 policies. Good: rehearse, run offline, open with the user, say what AI did, answer straight.
const C4_GOOD = ['rehearse', 'offline', 'user', 'say', 'tested', 'legal'];
const C4_BAD = ['feature', 'live', 'sorry', 'hide', 'bluff', 'v2', 'ai'];
let ch4Seen = false;
async function playCh4(list) {
  await js(`document.getElementById('go-next').click()`);
  const s0 = await st();
  if (s0.screen !== 'play' || s0.chapter !== 4) fail('continue button did not start chapter 4');
  if (!ch4Seen) {
    ch4Seen = true;
    await visible('build');
    if (!(await js(`getComputedStyle(document.querySelector('.dpad')).display === 'none'`))) fail('the walking pad should hide during the demo');
    ok('chapter 4 shows the build board and hides the walking pad');
  }
  await talk((s) => s.dlg.opts.find(o => list.includes(o)) || s.dlg.opts[0]);
  await sleep(800);
  const s = await st();
  if (s.screen !== 'end' || s.chapter !== 4) fail('chapter 4 end card did not show, screen=' + s.screen);
  return s;
}
const ch4fix = (s) => s.lessons.filter(l => l.ch === 4 && !l.good);
const ch2fix = (s) => s.lessons.filter(l => l.ch === 2 && !l.good);
const partSum = (s) => Object.values(s.parts).reduce((a, b) => a + b, 0);

const GOOD_BAG = ['laptop', 'powerbar', 'phone', 'snacks', 'layer', 'notebook'];
const GOOD = () => ({ checkin: [['yes'], ['yes']], kickoff: [['old']], team: [['good'], ['good'], ['test'], ['good']] });
try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: pathToFileURL(local).href });
  for (let i = 0; i < 300 && (await js('typeof window.__sim')) !== 'object'; i++) await sleep(100);
  if (!(await js(`!document.getElementById('scr-home').hidden && document.getElementById('scr-title').hidden`))) fail('the app should open on Home');
  ok('the app opens on Home');
  await js(`document.getElementById('nav-play').click()`); await sleep(150);   // the Play tab = the old title screen (game menu)
  if ((await st()).screen !== 'title') fail('title screen did not show');
  await visible('title');
  await noOverflow('title');
  await sleep(300);
  const banner = await js(`(() => { const b = document.getElementById('banner'), r = b.getBoundingClientRect(); const px = b.getContext('2d').getImageData(Math.floor(b.width/2), Math.floor(b.height*0.6), 1, 1).data; return [r.width, b.width % 320, px[3]]; })()`);
  if (!(banner[0] > 200) || banner[1] !== 0 || banner[2] !== 255) fail('the title banner should be drawn, sharp and on screen: ' + JSON.stringify(banner));
  ok('the title screen shows the animated pixel banner');
  await shot('title.png');

  // a real player gets the chapter 1 title card; a key press closes it
  await js(`document.getElementById('go-start').click()`); await js(`document.getElementById('go-pack').click()`);
  await js(`document.getElementById('item-laptop').click()`); await js(`document.getElementById('go-play').click()`);
  await sleep(450);
  if (!(await js('window.__sim.card()'))) fail('the chapter 1 title card should show after packing');
  const cardTxt = await js(`document.getElementById('card').innerText`);
  if (!cardTxt.includes('CHAPTER 1 OF 4') || !cardTxt.includes('Saturday Morning')) fail('chapter 1 card has the wrong words: ' + JSON.stringify(cardTxt));
  await shot('card.png');
  await key('Enter'); await sleep(450);
  if (await js('window.__sim.card()')) fail('a key press should close the chapter card');
  if ((await st()).dlg) fail('the key that closed the card should not also start a conversation');
  ok('chapter 1 title card shows "Saturday Morning", and one key press closes it');

  // speech bubble over what you can use, and portraits in the dialogue box
  await js(`window.__sim.teleport(3,10,'up')`); await sleep(200);
  if (!(await js(`window.__sim.bubble()`))) fail('facing the volunteer should show a speech bubble');
  await key('Enter'); await sleep(250);
  const face = await js(`(() => { const f = document.getElementById('face'); return [f.hidden, f.getBoundingClientRect().width, document.getElementById('who').textContent]; })()`);
  if (face[0] || !(face[1] >= 48)) fail('the volunteer should have a portrait in the dialogue box: ' + JSON.stringify(face));
  ok('facing someone shows a speech bubble, and talking shows their portrait (' + face[2] + ')');

  // --- live characters, with a stand-in for DeepSeek (the check never uses a real key or spends money) ---
  const untilAsk = async () => { for (let i = 0; i < 200; i++) { const s = await st(); if (s.dlg && s.dlg.opts && !s.dlg.typing) return s; if (s.dlg && !s.dlg.wait && !s.dlg.own) await key('Enter'); await sleep(25); } fail('no question appeared'); };
  const pickOwn = async () => { const s = await untilAsk(); const i = s.dlg.opts.indexOf('__own'); if (i < 0) fail('with a key set, every question should offer "Type my own answer"');
    for (let k = s.dlg.sel; k < i; k++) await key('ArrowDown'); await key('Enter'); await sleep(80); return s; };
  if ((await untilAsk()).dlg.opts.includes('__own')) fail('without a key there should be no "Type my own answer" option');
  await js(`window.__sim.fakeAI('good', ['yes'])`);
  await key('Escape'); await sleep(80);   // Esc opens the pause menu mid-conversation...
  if (!(await st()).menu) fail('Esc should open the pause menu');
  await key('Escape'); await sleep(80);   // ...and closes it again
  if ((await st()).menu) fail('Esc should close the pause menu');
  ok('Esc opens and closes the pause menu, even mid-conversation');
  // the "share details" question was already on screen before the stand-in was switched on: answer it, so the
  // next question (allergies) is asked fresh and must offer "Type my own answer"
  await key('Enter'); await sleep(40);
  await pickOwn();
  const ownState = await st();
  if (!ownState.dlg || !ownState.dlg.own) fail('choosing "Type my own answer" should open the text box');
  for (const k of ['ArrowUp', 'Enter']) { await key(k); await sleep(20); }   // typing keys must not move Shad or skip the box
  if (!(await st()).dlg.own) fail('pressing keys while the text box is open should not close it');
  await js(`window.__sim.typeOwn('Shellfish and kiwi. I read labels like my life depends on it, because it does. I am here to find hands-on drone work.')`);
  await sleep(40);
  if (!(await st()).dlg?.wait) fail('after sending, the character should show a thinking indicator');
  for (let i = 0; i < 40 && (await st()).dlg?.wait; i++) await sleep(25);
  const said = await st();
  if (said.dlg.who !== 'Shad' || !said.dlg.text.includes('hands-on drone work')) fail('Shad should say the typed line first: ' + JSON.stringify(said.dlg));
  const seenLines = [];
  let rep = said;
  for (let i = 0; i < 8 && !(rep.dlg && rep.dlg.note === 'Live reply'); i++) { await key('Enter'); await sleep(40); rep = await st(); seenLines.push(rep.dlg ? rep.dlg.who + (rep.dlg.note ? ' [' + rep.dlg.note + ']' : '') : 'none'); }
  if (!rep.dlg || rep.dlg.note !== 'Live reply' || !rep.dlg.text.includes('stand-in for Robin')) fail('the asker should reply in their own words; saw: ' + seenLines.join(' > '));
  const prompt = await js('JSON.stringify(window.__lastPrompt)');
  for (const t of ['Robin, a cheerful volunteer', 'Shad typed: Shellfish and kiwi', 'shellfish and kiwi', 'detect and warn', 'Recent conversation', 'Any food allergies']) if (!prompt.includes(t)) fail('the live-reply prompt is missing "' + t + '"');
  ok('typing my own answer: text box, thinking dots, Shad says it, then Robin replies in character (prompt has persona, world, rules and recent lines)');
  const typedLog = (await st()).typed;
  if (typedLog.length !== 1 || typedLog[0].who !== 'Robin') fail('the typed line should be kept for the report card: ' + JSON.stringify(typedLog));
  ok('the typed line and reply are kept for the "In your own words" report card section');

  // an outage: start a fresh run, talk to Robin, and the stand-in fails
  await js('window.__sim.newRun(3)'); await js(`window.__sim.pack(['laptop'])`);
  await js(`window.__sim.fakeAI('fail')`);
  await interactAt(3, 10, 'up');
  await pickOwn();
  await js(`window.__sim.typeOwn('Sure, share them.')`);
  for (let i = 0; i < 40 && (await st()).dlg?.wait; i++) await sleep(25);
  const err = await st();
  if (err.dlg?.who !== 'Game' || !/API key/.test(err.dlg.text)) fail('a failed live reply should explain the problem plainly: ' + JSON.stringify(err.dlg));
  await key('Enter'); await sleep(40);
  const back = await untilAsk();
  if (!back.dlg.opts.includes('yes') || !back.dlg.opts.includes('no')) fail('after a failed live reply the written choices should come back: ' + JSON.stringify(back.dlg));
  ok('if DeepSeek fails, a plain message explains why and the written choices come back');
  await js(`window.__sim.fakeAI(null)`);

  // autosave: a reload offers Continue, and Continue puts you back where you were
  await talk([['yes'], ['yes']]);
  const savedAt = await st();
  if (!savedAt.save) fail('finishing a conversation should autosave');
  await cdp('Page.reload'); await sleep(300);
  for (let i = 0; i < 300 && (await js('typeof window.__sim')) !== 'object'; i++) await sleep(100);
  const cont = await js(`(() => { const b = document.getElementById('go-continue'); return [b.getBoundingClientRect().width > 0, b.textContent]; })()`);
  if (!cont[0]) fail('after a reload the title screen should offer Continue');
  await js(`document.getElementById('go-continue').click()`); await sleep(200);
  const resumed = await st();
  if (resumed.screen !== 'play' || resumed.quest !== savedAt.quest || resumed.stats.contacts !== savedAt.stats.contacts) fail('Continue should put you back where you were: ' + JSON.stringify([savedAt.quest, resumed.quest]));
  ok(`autosave works: after a reload, "${cont[1]}" put Shad back at quest "${resumed.quest}" with the same scores`);
  const twoClick = await js(`(() => { window.__sim.newRun; document.getElementById('quit').click(); const m = document.getElementById('menu-new'); m.click(); const armed = m.textContent; const stillPlay = window.__sim.state().screen; document.getElementById('menu-close').click(); return [armed, stillPlay]; })()`);
  if (!/Click again/.test(twoClick[0]) || twoClick[1] !== 'play') fail('starting a new run from the menu should ask for a second click: ' + JSON.stringify(twoClick));
  ok('the Menu button pauses, and a new run needs a second click so a run is never lost by accident');
  await js('window.__sim.newRun(1)');   // back to full-speed test mode for everything below

  // real walking with the keyboard
  await js('window.__sim.newRun(42)'); await visible('roll');
  const rollTxt = await js(`document.getElementById('rolls').innerText`);
  if (!rollTxt.includes('TIMETABLE') || !rollTxt.includes('minutes each') || !rollTxt.includes('TEAM')) fail('the roll screen should show the rolled timetable, demo length and team start: ' + JSON.stringify(rollTxt));
  ok('the roll screen rolls the kickoff time, the demo time and length, and how the team forms');
  await js(`document.getElementById('go-pack').click()`); await visible('pack');
  await js(`window.__sim.pack(['laptop'])`); await visible('play');
  const padOk = await js(`(() => { const d = document.querySelector('.dpad').getBoundingClientRect(), b = document.getElementById('abtn').getBoundingClientRect(); return b.top < d.bottom && b.left >= d.right; })()`);
  if (!padOk) fail('on a phone the A button is not beside the D-pad');
  ok('on a phone the A button sits beside the D-pad');
  const y0 = (await st()).y; await key('ArrowUp', 450); await sleep(250);
  const y1 = (await st()).y; if (!(y1 < y0)) fail(`holding the up arrow did not walk (y ${y0} -> ${y1})`);
  ok(`holding the up arrow walked Shad from row ${y0} to row ${y1}`);
  await noOverflow('play');

  const SEED = 20261114;
  await js('window.__sim.clearSeen()');
  const good = await playRun(SEED, GOOD_BAG, GOOD());
  await shot('end-good.png');
  await visible('end');
  await noOverflow('end card');
  const bad = await playRun(SEED, ['drone', 'tools'], {
    food: ['eat'], checkin: [['no'], ['no']], kickoff: [['none']], team: [['over'], ['cheat', 'no'], ['code'], ['illegal']] });
  // chapter 2 on the same roll, both ways
  await playRun(SEED, GOOD_BAG, GOOD());
  await js(`document.getElementById('go-next').click()`); await sleep(300);
  await visible('build');
  const padHidden = await js(`getComputedStyle(document.querySelector('.dpad')).display === 'none'`);
  if (!padHidden) fail('the walking pad should hide during the build');
  ok('the walking pad hides during the build; the A button stays');
  await js('window.__sim.newRun(' + SEED + ')');
  await playRun(SEED, GOOD_BAG, GOOD());
  const good2 = await playCh2(goodPolicy);
  if ((good2.incidents || []).length !== 3) fail('chapter 2 should land three random incidents, saw ' + JSON.stringify(good2.incidents));
  ok('chapter 2 landed three random incidents: ' + good2.incidents.join(', '));
  await visible('end');
  await noOverflow('chapter 2 end card');
  await shot('end-ch2.png');
  const good3 = await playCh3(C3_GOOD);
  await visible('end');
  await noOverflow('chapter 3 end card');
  await shot('end-ch3.png');
  const end3 = await js(`document.getElementById('scr-end').innerText`);
  if (!end3.includes('CHAPTER 3 DONE') || !end3.includes('YOUR NOTEBOOK') || !end3.includes('Jas:')) fail('chapter 3 end card is missing its heading or the notebook');
  if ((await js(`document.getElementById('go-next').textContent`)) !== 'Continue to chapter 4') fail('chapter 3 end card should offer "Continue to chapter 4"');
  ok('chapter 3 end card shows its heading, the notebook, and a button to chapter 4');
  const hist0 = (await st()).history.length;
  const good4 = await playCh4(C4_GOOD);
  // close-ups: a full clean weekend should cut to the real objects, and never leave one stuck on the end card
  const seenGood = await js('window.__sim.closeups()');
  for (const want of ['badge', 'slide', 'table', 'whiteboard', 'build', 'lunch', 'receiver', 'drone', 'mentor', 'crash', 'midnight', 'talk', 'boothL', 'boothR', 'notebook', 'countdown', 'stage', 'judges', 'trophy'])
    if (!seenGood.includes(want)) fail('a full clean weekend should show the "' + want + '" close-up; saw ' + JSON.stringify(seenGood));
  if (await js('window.__sim.closeup()')) fail('a close-up is still on after the chapter ended');
  ok(`a full clean weekend cuts to ${seenGood.length} close-ups (${seenGood.join(', ')}), and none is left on after the chapter`);
  await visible('end');
  await noOverflow('final report card');
  await shot('end-ch4.png');
  const end4 = await js(`document.getElementById('scr-end').innerText`);
  for (const t of ['FULL REPORT CARD', 'JUDGES’ SCORE', 'YOUR RUNS SO FAR', 'WHAT THE TEAM BUILT', 'YOUR NOTEBOOK']) if (!end4.includes(t)) fail('final report card is missing "' + t + '"');
  if (await js(`document.getElementById('go-next').getBoundingClientRect().width`) !== 0) fail('final report card should not offer a continue button');
  if (good4.lessons.some(l => !l.good)) fail('final report card: a clean weekend still has "do differently" lessons: ' + JSON.stringify(good4.lessons.filter(l => !l.good)));
  ok('final report card shows the result, score, board, notebook and run history, with no continue button and nothing to fix');
  if (good4.history.length !== hist0 + 1) fail(`finishing the weekend should save one run (had ${hist0}, now ${good4.history.length})`);
  const saved = good4.history[good4.history.length - 1];
  if (saved.score !== good4.pts.total || saved.place !== good4.place) fail('the saved run does not match the result: ' + JSON.stringify(saved));
  ok(`the finished weekend was saved to run history (score ${saved.score}, place ${saved.place})`);
  await playRun(SEED, ['drone', 'tools'], {
    food: ['eat'], checkin: [['no'], ['no']], kickoff: [['none']], team: [['over'], ['cheat', 'no'], ['code'], ['illegal']] });
  termMode = 'quit'; const bad2 = await playCh2(badPolicy); termMode = 'solve';
  if (!termsSeen.some(t => t.startsWith('STAGING')) || !termsSeen.some(t => t.startsWith('CRASH')) || !termsSeen.some(t => t.startsWith('GIT'))) fail('chapter 2 should open all three terminals, saw ' + JSON.stringify(termsSeen));
  ok('chapter 2 opened the staging, crash and git terminals: ' + termsSeen.length + ' times in all');
  console.log('chapter 2 good:', JSON.stringify(good2.stats), 'board', JSON.stringify(good2.parts), 'bugs', good2.bugs, 'jobs', good2.tasks.join(','));
  console.log('chapter 2 bad: ', JSON.stringify(bad2.stats), 'board', JSON.stringify(bad2.parts), 'bugs', bad2.bugs, 'jobs', bad2.tasks.join(','));
  for (const k of ['energy', 'trust', 'demo']) if (!(good2.stats[k] > bad2.stats[k])) fail(`chapter 2: good play should beat bad play on ${k}`);
  ok('chapter 2: good play beats bad play on energy, trust and demo');
  if (partSum(good2) < 12) fail('chapter 2: good play should fill at least 12 of 16 board pips, got ' + partSum(good2));
  if (good2.bugs) fail('chapter 2: good play should end with no known bugs');
  ok('chapter 2: good play fills ' + partSum(good2) + ' of 16 board pips with no known bugs');
  if (ch2fix(good2).length) fail('chapter 2: clean play got "do differently" lessons: ' + JSON.stringify(ch2fix(good2)));
  if (ch2fix(bad2).length < 5) fail('chapter 2: bad play should collect at least 5 lessons, got ' + ch2fix(bad2).length);
  ok('chapter 2: clean play gets none, bad play gets ' + ch2fix(bad2).length + ' "do differently" lessons');
  const endText = await js(`document.getElementById('scr-end').innerText`);
  if (!endText.includes('CHAPTER 2 DONE')) fail('chapter 2 end card has the wrong heading');
  const nextBtn = await js(`[document.getElementById('go-next').getBoundingClientRect().width, document.getElementById('go-next').textContent]`);
  if (!(nextBtn[0] > 0) || nextBtn[1] !== 'Continue to chapter 3') fail('chapter 2 end card should offer "Continue to chapter 3", got ' + JSON.stringify(nextBtn));
  ok('chapter 2 end card has its own heading and a button to chapter 3');
  const bad3 = await playCh3(C3_BAD);
  const gain = (r, k) => r.s.stats[k] - r.before.stats[k];
  console.log('chapter 3 good:', JSON.stringify(good3.s.stats), 'contacts gained', gain(good3, 'contacts'), 'notebook', good3.s.notebook.join(' / '));
  console.log('chapter 3 bad: ', JSON.stringify(bad3.s.stats), 'contacts gained', gain(bad3, 'contacts'), 'notebook', bad3.s.notebook.join(' / ') || '(empty)');
  if (!(gain(good3, 'contacts') > gain(bad3, 'contacts'))) fail('chapter 3: good play should gain more contacts than bad play');
  for (const k of ['energy', 'trust']) if (!(good3.s.stats[k] > bad3.s.stats[k])) fail(`chapter 3: good play should beat bad play on ${k}`);
  ok('chapter 3: good play gains more contacts and ends ahead on energy and trust');
  for (const n of ['Marta', 'Jas', 'Ken']) if (!good3.s.notebook.includes(n)) fail(`chapter 3: good play should write ${n} in the notebook`);
  if (bad3.s.notebook.length) fail('chapter 3: a bag with no notebook should leave the notebook empty');
  ok('chapter 3: the notebook holds Marta, Jas and Ken on good play, and stays empty with no notebook packed');
  if (ch3fix(good3.s).length) fail('chapter 3: clean play got "do differently" lessons: ' + JSON.stringify(ch3fix(good3.s)));
  if (ch3fix(bad3.s).length < 5) fail('chapter 3: bad play should collect at least 5 lessons, got ' + ch3fix(bad3.s).length);
  ok('chapter 3: clean play gets none, bad play gets ' + ch3fix(bad3.s).length + ' "do differently" lessons');
  const bad4 = await playCh4(C4_BAD);
  console.log('chapter 4 good: place', good4.place, 'score', good4.pts.total, JSON.stringify(good4.pts));
  console.log('chapter 4 bad:  place', bad4.place, 'score', bad4.pts.total, JSON.stringify(bad4.pts));
  if (!(good4.pts.total > bad4.pts.total)) fail('chapter 4: good play should outscore bad play with the judges');
  if (good4.place !== 1) fail('chapter 4: a clean weekend should win first place, got ' + good4.place);
  if (bad4.place !== 0) fail('chapter 4: a bad weekend should not place, got ' + bad4.place);
  ok(`chapter 4: good play wins first place (${good4.pts.total} of 95), bad play does not place (${bad4.pts.total})`);
  if (ch4fix(good4).length) fail('chapter 4: clean play got "do differently" lessons');
  if (ch4fix(bad4).length < 5) fail('chapter 4: bad play should collect at least 5 lessons, got ' + ch4fix(bad4).length);
  ok('chapter 4: clean play gets none, bad play gets ' + ch4fix(bad4).length + ' "do differently" lessons');
  const hist = (await st()).history.length;
  if (hist !== 2) fail('run history should hold both finished weekends, has ' + hist);
  await cdp('Page.reload');                         // history must survive closing the page
  await sleep(300);
  for (let i = 0; i < 300 && (await js('typeof window.__sim')) !== 'object'; i++) await sleep(100);
  const titleHist = await js(`document.getElementById('titlehist').innerText`);
  if (!titleHist.includes('RUNS PLAYED: 2')) fail('after a reload the title screen should show 2 saved runs, shows: ' + JSON.stringify(titleHist));
  ok('run history survives a reload: title screen says "' + titleHist + '"');

  const roll = good.roll;
  console.log(`roll for run ${SEED}: venue=${roll.venue} ai=${roll.ai} wifi=${roll.wifi} outlets=${roll.outlets} challenge=${roll.challenge}`);
  const cnt = (s) => s.lessons.filter(l => l.good).length + '/' + s.lessons.filter(l => !l.good).length;
  console.log('good choices:', JSON.stringify(good.stats), 'lessons keep/fix =', cnt(good));
  console.log('bad choices: ', JSON.stringify(bad.stats), 'lessons keep/fix =', cnt(bad));
  for (const k of ['energy', 'trust', 'demo', 'contacts']) if (!(good.stats[k] > bad.stats[k])) fail(`good choices should beat bad ones on ${k}`);
  ok('good choices beat bad choices on all four scores');
  const goodFix = good.lessons.filter(l => !l.good);
  if (goodFix.length) fail('a clean run still got "do differently" lessons: ' + JSON.stringify(goodFix));
  ok('a clean run gets no "do differently" lessons');
  const badFix = bad.lessons.filter(l => !l.good).length;
  if (badFix < 6) fail('a bad run should collect at least 6 lessons, got ' + badFix);
  ok('a bad run collects ' + badFix + ' "do differently" lessons');

  const seen = new Set(), placedSeen = new Set(), slots = new Set(), incSeen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const r = await playRun(seed, GOOD_BAG, GOOD());
    if (r.lessons.some(l => !l.good)) fail(`run ${seed}: clean choices got a "do differently" lesson`);
    const r2 = await playCh2(goodPolicy); r2.incidents.forEach(i => incSeen.add(i));
    if (ch2fix(r2).length) fail(`run ${seed}: clean chapter 2 got "do differently" lessons: ` + JSON.stringify(ch2fix(r2)));
    if (r2.bugs) fail(`run ${seed}: clean chapter 2 ended with ${r2.bugs} known bugs`);
    const r3 = await playCh3(C3_GOOD);
    if (ch3fix(r3.s).length) fail(`run ${seed}: clean chapter 3 got "do differently" lessons: ` + JSON.stringify(ch3fix(r3.s)));
    const r4 = await playCh4(C4_GOOD);
    if (ch4fix(r4).length) fail(`run ${seed}: clean chapter 4 got "do differently" lessons: ` + JSON.stringify(ch4fix(r4)));
    if (r4.place !== 1) fail(`run ${seed}: clean weekend placed ${r4.place}, score ${r4.pts.total}`);
    seen.add(r.roll.ai + '/' + r.roll.challenge); placedSeen.add(r.roll.placed); slots.add(r.roll.demoMin + 'min@' + r.roll.demoAt);
  }
  if (placedSeen.size !== 2 || slots.size < 3) fail('12 seeds should cover both team starts and several demo slots: ' + JSON.stringify([[...placedSeen], [...slots]]));
  ok('across those runs both team starts (placed, solo table) and ' + slots.size + ' different demo slots came up');
  ok('12 more random runs finished all four chapters clean and won; AI rule/challenge combos covered: ' + [...seen].sort().join(', '));
  if (incSeen.size < 6) fail('the eight random incidents should vary across runs, saw ' + JSON.stringify([...incSeen]));
  ok('across those runs ' + incSeen.size + ' of the 8 random incidents came up: ' + [...incSeen].sort().join(', '));

  // Mixed play: a clean weekend up to chapter 3, then a middling chapter 4. Seed 13 gives shift 0, so the
  // cut-offs are exactly 80 (1st), 66 (2nd) and 52 (3rd) of 95. Covers the places the all-good/all-bad runs never reach.
  const MIXED = [
    ['second place', 2, 66, 79, ['rehearse', 'offline', 'sorry', 'say', 'tested', 'legal', 'ai']],
    ['third place', 3, 52, 65, ['rehearse', 'offline', 'sorry', 'hide', 'trust', 'dunno', 'ai']]
  ];
  for (const [name, want, lo, hi, list] of MIXED) {
    await playRun(13, GOOD_BAG, GOOD());
    await playCh2(goodPolicy);
    await playCh3(C3_GOOD);
    const m = await playCh4(list);
    console.log(`mixed play (${name}): place ${m.place} score ${m.pts.total} ${JSON.stringify(m.pts)}`);
    if (m.place !== want) fail(`mixed play: expected ${name} (${want}), got place ${m.place} with ${m.pts.total} of 95`);
    if (m.pts.total < lo || m.pts.total > hi) fail(`mixed play: ${name} score ${m.pts.total} is outside ${lo} to ${hi}`);
    if (!ch4fix(m).length) fail(`mixed play: ${name} should collect at least one chapter 4 "do differently" lesson`);
  }
  ok('mixed play reaches second place (66 to 79) and third place (52 to 65), each with chapter 4 lessons to fix');
  await js('window.__sim.newRun(5)'); await sleep(60);
  const carry = await js(`[!document.getElementById('rolllast').hidden, document.querySelectorAll('#rolllast-list li').length, (window.__sim.state().history.slice(-1)[0] || {}).fixes]`);
  if (!carry[0] || !carry[1] || !Array.isArray(carry[2]) || !carry[2].length) fail('the roll screen should list what last run said to do differently: ' + JSON.stringify(carry));
  ok('the roll screen carries over last run\'s "do differently" lines (' + carry[1] + ' shown, ' + carry[2].length + ' saved)');
  if (!hackClocked) fail('the password terminal never showed its clock');
  ok('the password terminal runs on the clock like the other terminals');

  await js('window.__sim.newRun(7)'); await js(`window.__sim.pack(['laptop','notebook'])`);
  await interactAt(3, 11, 'up'); await sleep(1500);
  await shot('play.png');
  const narrow = await js(`(() => { const c = document.getElementById('cv'), s = document.getElementById('screen'); return [c.getBoundingClientRect().width, c.width, s.clientWidth]; })()`);
  if (narrow[1] % 320 || narrow[1] < 640) fail('on a phone the venue should be drawn from a sharp 2x (or bigger) picture, got ' + JSON.stringify(narrow));
  if (narrow[0] < narrow[2] - 1) fail('on a phone the venue should fill the frame width, got ' + JSON.stringify(narrow));
  ok(`on a phone the venue fills the width (${Math.round(narrow[0])}px) from a sharp ${narrow[1] / 320}x picture`);

  // laptop / full screen: the venue fills the left, the side column holds the rest, and nothing scrolls
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await js('window.__sim.newRun(7)'); await js(`window.__sim.pack(['laptop','notebook'])`);
  await interactAt(3, 11, 'up'); await sleep(1500);
  const wide = await js(`(() => {
    const c = document.getElementById('cv').getBoundingClientRect(), s = document.getElementById('screen').getBoundingClientRect(), d = document.getElementById('dlg').getBoundingClientRect();
    const cvs = document.getElementById('cv');
    return { cw: c.width, ch: c.height, sw: s.width, sh: s.height, bw: cvs.width, bh: cvs.height, inside: c.left >= s.left - 0.5 && c.right <= s.right + 0.5 && c.top >= s.top - 0.5 && c.bottom <= s.bottom + 0.5,
             dlgRight: d.left > s.right, dlgShown: d.bottom <= innerHeight + 0.5 && d.height > 0,
             scroll: [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth],
             font: getComputedStyle(document.getElementById('txt')).fontSize };
  })()`);
  if (wide.scroll[0] > wide.scroll[1] || wide.scroll[2] > wide.scroll[3]) fail('at 1280x800 the play screen should not scroll: ' + JSON.stringify(wide.scroll));
  if (!wide.inside) fail('at 1280x800 the venue spills outside its frame');
  if (wide.bw % 320 || wide.bh % 224 || wide.bw / 320 !== wide.bh / 224 || wide.bw < 640) fail('at 1280x800 the venue should be drawn from a sharp whole-number picture of 2x or more, got ' + wide.bw + 'x' + wide.bh);
  const fill = Math.max(wide.cw / (wide.sw - 4), wide.ch / (wide.sh - 4));
  if (fill < 0.8) fail('at 1280x800 the venue should fill most of its frame, fills ' + Math.round(fill * 100) + '%');
  if (!wide.dlgRight || !wide.dlgShown) fail('at 1280x800 the dialogue should sit in the side column, fully on screen');
  ok(`at 1280x800 the venue fills ${Math.round(fill * 100)}% of the left side (${Math.round(wide.cw)}x${Math.round(wide.ch)}, sharp ${wide.bw / 320}x picture), dialogue in the side column, no scrolling, text ${wide.font}`);
  const faceIn = await js(`(() => { const f = document.getElementById('face'), d = document.getElementById('dlg').getBoundingClientRect(), r = f.getBoundingClientRect();
    return [f.hidden, r.left >= d.left && r.right <= d.right && r.top >= d.top && r.bottom <= d.bottom, document.getElementById('who').textContent]; })()`);
  if (faceIn[0] || !faceIn[1]) fail('at 1280x800 the speaker portrait should sit inside the dialogue box: ' + JSON.stringify(faceIn));
  ok('at 1280x800 the speaker portrait sits inside the dialogue box (' + faceIn[2] + ')');
  const mus = await js(`(() => { const b = document.getElementById('music'); const was = window.__sim.music(); b.click(); const off = window.__sim.music(); b.click(); return [was, off, window.__sim.music(), b.textContent]; })()`);
  if (!mus[0] || mus[1] || !mus[2]) fail('the Music button should stop and restart the music: ' + JSON.stringify(mus));
  ok('music plays during play, and the Music button stops and restarts it');
  await shot('wide.png');

  // every close-up (and each variant) draws a full, detailed picture with its label, then hands back to the venue
  mkdirSync(join(here, 'closeups'), { recursive: true });
  const all = await js('window.__sim.allCloseups()');
  const variants = all.map(id => [id, '']).concat([['stage', 'spin'], ['stage', 'bug'], ['stage', 'over'], ['receiver', 'tx'], ['crash', 'caught']]);
  for (const [id, m] of variants) {
    await js(`window.__sim.showCloseup('${id}', '${m}')`); await sleep(320);
    const r = await js(`(() => { const c = document.getElementById('cv'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
      const t = document.getElementById('cutag'); return [window.__sim.closeup(), seen.size, !t.hidden && t.getBoundingClientRect().width > 0]; })()`);
    if (r[0] !== id) fail(`close-up "${id}" did not come on screen`);
    if (r[1] < 8) fail(`close-up "${id}${m ? ' ' + m : ''}" looks blank: only ${r[1]} colours`);
    if (!r[2]) fail(`close-up "${id}" should show its label over the picture`);
    await shot(join('closeups', id + (m ? '-' + m : '') + '.png'));
  }
  await js(`window.__sim.showCloseup(null)`); await sleep(100);
  if (await js('window.__sim.closeup()') || !(await js(`document.getElementById('cutag').hidden`))) fail('turning a close-up off should bring back the venue and hide the label');
  ok(`all ${all.length} close-ups and ${variants.length - all.length} variants draw a detailed picture with a label (screenshots in check\\closeups), then hand back to the venue`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: false });

  if (errors.length) fail('page errors:\n' + errors.join('\n'));
  ok('no script errors or console errors');
} catch (e) {
  if (!process.exitCode) { console.log('FAIL: ' + e.message); process.exitCode = 1; }
} finally {
  try { await cdp('Browser.close'); } catch {}
  ws.close(); await sleep(500); try { edge.kill(); } catch {}
  try { rmSync(prof, { recursive: true, force: true }); } catch {}
}

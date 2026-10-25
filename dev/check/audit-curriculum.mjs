// Read-only curriculum audit (structure and consistency over the whole course). Prints a report:
// module order and numbering, per-lesson step rules per step type, exam composition, duplicates,
// answer integrity for fill/bug/write steps, level cross-references, dated claims, old-name sweep.
// Run: node check/audit-curriculum.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const lines = readFileSync(join(root, 'index.html'), 'utf8').replace(/\r/g, '').split('\n');
const a = lines.findIndex(l => l.startsWith('const ANT_URL')), c = lines.findIndex(l => l.startsWith('const COURSE = ['));
let b = c; while (!/^\];/.test(lines[b])) b++;
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(lines.slice(a, b + 1).join('\n') + '\n;globalThis.__out = COURSE;', ctx);
const COURSE = ctx.__out;

let bad = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { bad++; console.log('FAIL ' + msg); } };
const say = (msg) => console.log('     ' + msg);
const allLessons = [];
const idsSeen = new Set(), namesSeen = new Map();
const claims = [];
const levelRefs = [];
const textsOf = (o) => {
  const out = [];
  const walk = (x) => {
    if (typeof x === 'string') out.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(o);
  return out;
};

console.log('== module order and numbering ==');
const levelNums = [];
for (const m of COURSE) {
  const mm = /Level (\d+)/.exec(m.name);
  if (mm) levelNums.push(Number(mm[1]));
  ok(m.id !== 'sec' || /optional/i.test(m.name + ' ' + (m.blurb || '')), 'the sec module is visibly optional');
  if (!['all'].includes(m.id)) ok(!!m.blurb && m.blurb.length > 40, m.id + ': has a real blurb');
}
say('levels found: ' + levelNums.join(','));
ok(levelNums.join(',') === '3,4,5,6,7,8,9,10,11,12', 'Level numbers run 3..12 (python is named Level 3; term and git are named modules)');
ok(COURSE[0].id === 'term' && COURSE[COURSE.length - 1].id === 'all', 'course starts with term and ends with the weekend sprint');
const idsOrder = COURSE.map(m => m.id).join(',');
ok(idsOrder.indexOf(',sec,') >= 0, 'the sec track sits between the level modules and the sprint');

console.log('== per module structure ==');
for (const m of COURSE) {
  const items = [].concat(m.lessons || [], m.extra || [], m.project ? [m.project] : [], m.exam ? [m.exam] : []);
  for (const l of items) allLessons.push({ m, l });
  if (m.id === 'all') continue;
  ok((m.lessons || []).length > 0, m.id + ': has lessons');
  if (!['power', 'sky', 'python'].includes(m.id)) ok(!!m.project, m.id + ': has a project');
  if (['dsa', 'net', 'web', 'data', 'llmapi', 'llm', 'swe', 'hired', 'ml', 'sec'].includes(m.id)) ok(!!m.exam, m.id + ': has a final test');
  const mins = items.reduce((t, l) => t + (l.mins || 0), 0);
  say(m.id + ': ' + (m.lessons || []).length + ' lessons' + (m.extra ? ' + ' + m.extra.length + ' optional' : '') + (m.project ? ' + project' : '') + (m.exam ? ' + exam' : '') + ', ~' + mins + ' min');
}

console.log('== lesson and step rules ==');
for (const { m, l } of allLessons) {
  if (idsSeen.has(l.id)) ok(false, 'duplicate lesson id: ' + l.id);
  idsSeen.add(l.id);
  const nm = l.name || '?';
  if (namesSeen.has(nm)) ok(false, 'duplicate lesson name: ' + nm + ' (' + namesSeen.get(nm) + ' and ' + l.id + ')');
  namesSeen.set(nm, l.id);
  const steps = l.steps || [];
  if (l.exam) {
    ok(steps.length >= 10 && steps.length <= 16, l.id + ': exam has 10 to 16 questions (' + steps.length + ')');
    ok(l.exam.pass === 0.8, l.id + ': exam pass mark is 0.8');
    ok(steps.every(s => ['mc', 'fill', 'bug', 'cmd'].includes(s.t)), l.id + ': exam questions are all auto-marked');
  } else if (l.proj && steps.length) {
    ok(steps.length >= 8 && steps.length <= 10, l.id + ': project has 8 to 10 steps (' + steps.length + ')');
  } else if (l.proj && !steps.length) {
    ok(!!l.term || (l.p || []).length >= 1, l.id + ': terminal project has content');
  } else if (steps.length) {
    ok(steps.length >= 4 && steps.length <= 8, l.id + ': lesson has 4 to 8 steps (' + steps.length + ')');
  }
  if (steps.length) {
    ok((l.recap || []).length >= 1, l.id + ': has a recap');
    ok(typeof l.mins === 'number' && l.mins > 0, l.id + ': has minutes');
  }
  steps.forEach((s, i) => {
    const key = l.id + '.' + i;
    if (s.t === 'mc') {
      const corr = (s.opts || []).filter(o => o[1] === true);
      ok(corr.length === 1, key + ': exactly one correct option');
      ok((s.opts || []).length >= 2, key + ': at least two options');
      ok((s.opts || []).every(o => Array.isArray(o) && o.length >= 2 && typeof o[0] === 'string' && typeof o[1] === 'boolean'), key + ': every option is [text, bool, feedback?]');
    } else if (s.t === 'fill') {
      ok(Array.isArray(s.ans) && Array.isArray(s.blanks) && s.ans.length === s.blanks.length, key + ': fill ans and blanks line up');
      ok(Array.isArray(s.w) && s.w.length === s.ans.length, key + ': fill has one width per blank');
      (s.ans || []).forEach((x, k) => {
        const entry = s.blanks[k] || [];
        const accepted = entry.some(e => (e && typeof e.test === 'function' ? e.test(String(x)) : String(e).toLowerCase() === String(x).toLowerCase()));
        ok(accepted, key + ': answer ' + JSON.stringify(x) + ' is accepted by blanks[' + k + ']');
      });
    } else if (s.t === 'bug') {
      ok(Array.isArray(s.code) && Number.isInteger(s.line) && s.line >= 0 && s.line < s.code.length, key + ': bug line is inside the code');
      ok(!!s.why, key + ': bug explains why');
    } else if (s.t === 'write') {
      ok(typeof s.ans === 'string' && s.ans.length > 0, key + ': write has a model answer');
      const testOk = typeof s.test === 'string' && s.test.length > 0 && (s.lang === 'sql' || /["']ok["']/i.test(s.test));
      ok(testOk || (Array.isArray(s.rules) && s.rules.length >= 1), key + ': write step runs a test (ok marker or SQL expected result), or is compare-only with rules');
      ok(Array.isArray(s.bad) && s.bad.length >= 1, key + ': write has bad answers');
    } else if (s.t === 'todo') {
      ok(Array.isArray(s.items) && s.items.length >= 2, key + ': todo lists at least 2 items');
    } else if (s.t === 'explain') {
      ok(Array.isArray(s.points) && s.points.length >= 3, key + ': explain lists at least 3 points');
    } else if (s.t === 'read' || s.t === 'ant') {
      ok(s.t === 'ant' || (Array.isArray(s.p) && s.p.length >= 1), key + ': read has text');
    } else if (s.t === 'cmd') {
      ok(typeof s.ans === 'string', key + ': cmd has an answer');
    } else {
      ok(false, key + ': unknown step type ' + s.t);
    }
    for (const t of textsOf(s)) {
      const lv = t.match(/Level \d+/g); if (lv) lv.forEach(x => levelRefs.push(l.id + ' -> ' + x));
      if (/\b(19|20)\d\d\b/.test(t) || /checked/i.test(t)) claims.push(key + ': ' + t.replace(/\s+/g, ' ').slice(0, 150));
    }
  });
}

console.log('== step inventory ==');
const flat = allLessons.flatMap(({ l }) => (l.steps || []).map(s => s.t));
const counts = {}; flat.forEach(t => counts[t] = (counts[t] || 0) + 1);
say(JSON.stringify(counts));

console.log('== level cross-references (spot check these point at the right level) ==');
const uniq = {};
levelRefs.forEach(r => { uniq[r] = (uniq[r] || 0) + 1; });
Object.keys(uniq).sort().forEach(r => say(r + ' (x' + uniq[r] + ')'));

console.log('== dated or numeric claims (verify at source when they age) ==');
const uniqClaims = [...new Set(claims)];
say('claim-bearing steps: ' + uniqClaims.length);
uniqClaims.slice(0, 45).forEach(c => say(c));

console.log('== old name sweep ==');
const oldName = allLessons.flatMap(({ l }) => textsOf(l)).filter(t => /Hackathon Sim/i.test(t));
ok(oldName.length === 0, 'no lesson text says the old course name (' + oldName.length + ' found)');
oldName.slice(0, 5).forEach(t => say(t.slice(0, 120)));

console.log(n + ' checks, failed: ' + bad + '; lessons audited: ' + allLessons.length);
process.exit(bad ? 1 : 0);
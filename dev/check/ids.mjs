// Lesson ids and their order, per module, compared with check/expected-ids.json. A renamed id or a swapped lesson fails here.
// Run: node check/ids.mjs           (prints ok/FAIL lines)
//      node check/ids.mjs --update  (rewrites expected-ids.json after you changed the course on purpose)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const lines = readFileSync(join(root, 'index.html'), 'utf8').replace(/\r/g, '').split('\n');
const a = lines.findIndex(l => l.startsWith('const ANT_URL')), c = lines.findIndex(l => l.startsWith('const COURSE = ['));
let b = c; while (!/^\];/.test(lines[b])) b++;
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(lines.slice(a, b + 1).join('\n') + '\n;globalThis.__out = COURSE.map(m => [m.id, m.lessons.map(l => l.id).concat(m.project ? [m.project.id] : [], m.exam ? [m.exam.id] : [], (m.extra || []).map(l => l.id))]);', ctx);
const now = Object.fromEntries(ctx.__out), file = join(here, 'expected-ids.json');
if (process.argv.includes('--update')) { writeFileSync(file, JSON.stringify(now, null, 1) + '\n'); console.log('expected-ids.json updated: ' + Object.keys(now).length + ' modules'); process.exit(0); }
const want = JSON.parse(readFileSync(file, 'utf8'));
let bad = 0, n = 0; const ok = (cond, msg) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) bad++; };
ok(JSON.stringify(Object.keys(now)) === JSON.stringify(Object.keys(want)), 'the modules are the same and in the same order: ' + Object.keys(now).join(', '));
for (const m of Object.keys(want)) ok(JSON.stringify(now[m]) === JSON.stringify(want[m]), `${m}: lesson ids and their order are unchanged (${(want[m] || []).length} items)` + (JSON.stringify(now[m]) === JSON.stringify(want[m]) ? '' : ' now: ' + JSON.stringify(now[m])));
const all = Object.values(now).flat(); ok(new Set(all).size === all.length, 'no lesson id is used twice (' + all.length + ' ids)');
console.log(`${n} checks, failed: ${bad}`);
process.exit(bad ? 1 : 0);

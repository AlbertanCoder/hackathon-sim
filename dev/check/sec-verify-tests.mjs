// Verifies every write step of the Security track the way check/pyrun.mjs does: the stored test must
// print ok for the model answer and every accepted alternative, and must NOT print ok for the bad ones.
// Run: node check/sec-verify-tests.mjs   (writes temp files into the system temp folder)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const root = 'C:/Users/SHADHUNTER/Desktop/Hackathon Game Plan/hackathon-sim/check';
const order = ['sec-refs.js', 'sec4a.js', 'sec4b.js', 'sec5a.js', 'sec5b.js'];
let src = order.map(f => readFileSync(join(root, f), 'utf8')).join('\n');
src = src.replace(/const LX_SEC/g, 'var LX_SEC');
const sandbox = {};
new Function('exports', src + '\nexports.a = LX_SEC4; exports.b = LX_SEC5;')(sandbox);

const steps = [sandbox.a, sandbox.b].flatMap(l => l.steps.filter(s => s.t === 'write'));
let bad = 0, n = 0;
const ok = (cond, msg) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) bad++; };

for (const l of [sandbox.a, sandbox.b]) {
  for (const [si, s] of l.steps.entries()) {
    if (s.t !== 'write') continue;
    const key = l.id + '.' + si;
    const run = (answer) => {
      const file = join(os.tmpdir(), 'sec-verify-step.py');
      writeFileSync(file, answer + '\n' + s.test);
      try {
        const out = execFileSync('python', [file], { encoding: 'utf8' });
        return out.includes('ok');
      } catch (e) {
        return false;
      }
    };
    ok(run(s.ans), key + ': the model answer passes the test');
    for (const [ai, alt] of (s.alt || []).entries()) ok(run(alt), key + ': alternative ' + (ai + 1) + ' passes the test');
    for (const [bi, b] of (s.bad || []).entries()) ok(!run(b), key + ': bad answer ' + (bi + 1) + ' fails the test');
  }
}
console.log('write-step tests:', n, 'checks, failed:', bad);
process.exit(bad ? 1 : 0);
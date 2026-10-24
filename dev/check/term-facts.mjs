// Re-runs every terminal answer in the course inside a fresh download of the public CDTH Data Kit and compares
// the real output with what the lesson shows. Usage: node term_facts.mjs <app folder> <kit clone folder>
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourse } from './lessons-from-source.mjs';
const [root, kit] = process.argv.slice(2);
const course = loadCourse(join(root, 'index.html'));
const steps = course.flatMap(m => m.items).filter(l => l.steps).flatMap(l => l.steps.map((s, i) => ({key: l.id + '.' + (i + 1), t: s.t, ans: s.ans, out: s.out || [], pre: s.pre || [], prompt: s.prompt || '', ex: s.ex || []})));
// which kit folder each practice prompt stands in; anything else (home folder, made-up repos, the bot, the .venv) is skipped
const where = p => /practice-kit\$$/.test(p) ? '' : /practice-kit\/challenges\$$/.test(p) ? 'challenges' : /02_eyes_on_the_sky\$$/.test(p) && !/\.venv/.test(p) ? 'challenges/02_eyes_on_the_sky' : /03_stay_connected\$$/.test(p) ? 'challenges/03_stay_connected' : null;
const bash = 'C:/Program Files/Git/bin/bash.exe';
const run = (cmd, dir) => { const r = spawnSync(bash, ['-c', cmd], { cwd: join(kit, dir), encoding: 'utf8' }); return (r.stdout + r.stderr).replace(/\r/g, '').split('\n').map(x => x.trimEnd()).filter(Boolean); };
const words = l => l.split(/\s+/).filter(Boolean);
let ran = 0, bad = 0, skipped = 0, later = [];
const check = (key, cmd, shown, dir) => {
  // a shown line counts if it is not a comment (#), a made-up error (!) or a shortened line (...)
  const lines = shown.filter(l => !/^#/.test(l) && !/\.\.\.|…/.test(l) && l.trim()).map(l => l.replace(/^! /, ''));   // ! marks real error text in red
  if (!lines.length) return;
  if (/\bwork\/|predict\.py/.test(cmd)) { later.push(key); return; }   // needs files the learner makes later (the starter notebook, the project)
  const real = run(cmd, dir); ran++;
  // ls prints columns that depend on the window width, so ls output is compared as a set of names
  const ok = /^ls\b/.test(cmd) ? (() => { const have = new Set(real.flatMap(words)); return lines.flatMap(words).every(x => have.has(x)); })()
    : lines.every(l => real.includes(l.trimEnd()));
  if (!ok) { bad++; console.log(`FAIL ${key} \`${cmd}\` in ${dir || 'practice-kit'}\n     shown: ${JSON.stringify(lines).slice(0, 400)}\n     real:  ${JSON.stringify(real).slice(0, 400)}`); }
  else console.log(`ok   ${key} \`${cmd}\` (${lines.length} line${lines.length === 1 ? '' : 's'} match)`);
};
for (const s of steps) {
  const dir = where(s.prompt);
  if (dir === null) { if (s.t === 'cmd' || s.ex.length) skipped++; continue; }
  if (s.t === 'cmd' && typeof s.ans === 'string') check(s.key, s.ans, s.out, dir);
  // the example terminal and the "terminal so far" lines: each "$ command" followed by its output lines
  for (const block of [s.ex, s.pre]) {
    for (let i = 0; i < block.length; i++) {
      if (!block[i].startsWith('$ ')) continue;
      let cmd = block[i].slice(2), j = i + 1;
      if (/^source \S+activate$/.test(cmd) && /^\(\.venv\) \$ /.test(block[j] || '')) { cmd += ' && ' + block[j].replace(/^\(\.venv\) \$ /, ''); j++; }   // switch the kit's Python on, then run
      else if (/^source /.test(cmd)) continue;
      const out = []; for (; j < block.length && !block[j].startsWith('$ ') && !/^\(\.venv\) \$ /.test(block[j]); j++) out.push(block[j]);
      if (/^\$ (cd|python|py|pip|git|claude|code|nano|mkdir|rm|mv|cp)\b/.test(block[i])) continue;   // changes things or needs more than the kit
      check(s.key + ' example', cmd, out, dir);
    }
  }
}
console.log(`${ran} commands re-run in the fresh kit, ${skipped} steps skipped (home folder, made-up repos, the .venv or the bot)`);
console.log(`${later.length} need files the learner makes later, not in a fresh kit: ${later.join(', ')}`);
console.log(bad ? `term facts: ${bad} failed` : 'term facts: all passed');
process.exit(bad ? 1 : 0);

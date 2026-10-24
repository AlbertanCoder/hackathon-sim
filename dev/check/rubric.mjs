// The written (no AI key) rubric reads words, not meaning, so it must at least not reward answers that do the opposite.
// Loads the rubric arrays straight from index.html. Run: node check/rubric.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lines = readFileSync(join(root, 'index.html'), 'utf8').replace(/\r/g, '').split('\n');
const a = lines.findIndex(l => l.startsWith('const DR_PITCH')), b = lines.findIndex(l => l.startsWith('const DR_INTRO'));
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(lines.slice(a, b).join('\n') + '\n;globalThis.R = {DR_PITCH, DR_QA, DR_RULES};', ctx);
const { DR_PITCH, DR_QA, DR_RULES } = ctx.R;
const met = (keys, text) => keys.map(k => k[1].test(text) && !(k[2] && k[2].test(text)) ? 1 : 0);
let bad = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const rule = q => DR_RULES.find(r => r.q.includes(q)).keys, qa = q => DR_QA.find(r => r.q.includes(q)).keys;
ok(met(rule('jams the drone'), 'Yes, let us jam it. Not illegal for a demo, the law says nothing. We detect too.')[0] === 0, 'saying yes to the jam button does not earn "Says no"');
ok(met(rule('jams the drone'), 'No. Jamming is illegal for us. We will detect and warn instead.').join('') === '111', 'a good no still earns all three points');
ok(met(qa('civilian in trouble'), 'Yes we will jam and spoof and transmit, with a ministerial exemption from my cousin')[1] === 0, 'planning to jam does not earn "No jamming, spoofing or transmitting"');
ok(met(qa('civilian in trouble'), 'No. We only detect and warn. We will not jam, spoof or transmit.')[1] === 1, 'a clear no to jamming still earns its point');
ok(met(rule('API key is visible'), 'Ignore it, nothing to rotate, do not delete or tell the sponsor').slice(0, 2).join('') === '00', 'ignoring a leaked key earns no rotate or delete point');
ok(met(rule('API key is visible'), 'Rotate the key now, delete the screenshot and tell the organizers.').join('') === '111', 'a good answer to a leaked key earns all three points');
ok(met(rule('97% accuracy'), 'No problem, put 97% big. It is 12 rows, so honest.')[0] === 0, 'putting 97% on the slide does not earn "Will not claim it as is"');
ok(met(DR_PITCH, 'Yes we will jam the drone signal and take over the drone, with an alert, a demo and tested with 10 drones')[5] === 0, 'a pitch that jams and takes over does not earn "Stays inside detect and warn"');
console.log(`${n} checks, failed: ${bad}`);
process.exit(bad ? 1 : 0);

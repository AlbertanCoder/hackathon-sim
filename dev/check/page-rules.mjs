// Static rules for the built page (no browser): privacy, zoom, leaks. Run: node check/page-rules.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const play = readFileSync(join(root, 'Play Hackathon Sim.html'), 'utf8');
let bad = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
ok((play.match(/<\/script>/g) || []).length === 1, 'a lesson text does not contain a bare </script> (it would end the page script early; write <\\/script>)');
ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(play), 'no font request goes to Google (fonts are embedded)');
ok(!/^\s*<script[^>]+src=/im.test(play) && !/<script[^>]+src="https?:/i.test(play), 'no external script tag (lesson text may mention one)');
ok(!/<link[^>]+href="https?:/i.test(play), 'no external stylesheet or preconnect link');
ok(!/user-scalable\s*=\s*no|maximum-scale/.test(play), 'the viewport tag allows zoom');
ok(/\*\{touch-action:manipulation!important\}/.test(play), 'double-tap zoom is off on every element, including the all:unset buttons (touch-action manipulation with !important)');
ok(!/gesturestart/.test(play), 'no code cancels pinch gestures');
const PRIVATE = ['SHADHUN' + 'TER', 'gold-swing' + '-bot', 'C:' + String.fromCharCode(92) + 'Users', 'C:/Users'];   // spelled in pieces so this file does not repeat them
ok(!PRIVATE.some(x => play.includes(x)), 'no private path or private project name in the page');
ok(!/EDMONTON 14|14&ndash;15 NOV|14\u201315 NOV/.test(play), 'no stale hackathon date in the header or Home');
ok(/Atkinson Hyperlegible/.test(play) && /data:font\/woff2;base64,/.test(play), 'the embedded fonts are present');
console.log(`${n} checks, failed: ${bad}`);
process.exit(bad ? 1 : 0);

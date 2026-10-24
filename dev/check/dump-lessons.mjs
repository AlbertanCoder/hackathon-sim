// Prints every lesson of one module (or all) as JSON, straight from index.html. Used by the facts scripts.
// Run: node check/dump-lessons.mjs [moduleId|all]  (default: all)
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadCourse } from './lessons-from-source.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const want = process.argv[2] || 'all';
const course = loadCourse(join(resolve(here, '..'), 'index.html'));
const out = {};
for (const m of course) if (want === 'all' || m.id === want) for (const l of m.items) out[l.id] = { module: m.id, name: l.name, steps: l.steps || [], setup: l.setup || '', setup_js: l.setup_js || '', setup_html: l.setup_html || '', setup_sql: l.setup_sql || '', refs: l.refs || [], exam: l.exam || null, proj: !!l.proj, optional: !!l.optional, recap: l.recap || null, mins: l.mins || 0, real: l.real || null };
process.stdout.write(JSON.stringify(out));

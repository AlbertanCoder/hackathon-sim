// throwaway analysis: shapes of the inline modules and how the engine treats explain/model
import { loadCourse } from './lessons-from-source.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'index.html');
const c = loadCourse(indexPath);
const inline = ['term', 'git', 'claude', 'power', 'hack', 'sky', 'python', 'sec'];
for (const mod of c) {
  if (!inline.includes(mod.id)) continue;
  const items = mod.items;
  console.log(mod.id + ': lessons=' + items.filter(x => !x.proj && !x.exam).length
    + ' projects=' + items.filter(x => x.proj).map(x => x.id + '(' + (x.steps || []).length + ')').join(',')
    + ' exams=' + items.filter(x => x.exam).map(x => x.id).join(',')
    + ' | noRecap=' + items.filter(x => !x.recap).map(x => x.id).join(',')
    + ' | noRefs=' + items.filter(x => !(x.refs || []).length).map(x => x.id).join(','));
}
const h = readFileSync(indexPath, 'utf8');
for (const needle of ['t==="explain"', "t==='explain'", 'lx-explain', '.model']) {
  const i = h.indexOf(needle);
  console.log('--- needle ' + JSON.stringify(needle) + ' at ' + i + ' ---');
  if (i >= 0) console.log(h.slice(Math.max(0, i - 300), i + 500).replace(/\r\n/g, '\n'));
}
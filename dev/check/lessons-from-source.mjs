// Loads the course's lesson data straight from index.html (the game's own code is wrapped, so a page script cannot reach it).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
export function loadCourse(indexPath) {
  const lines = readFileSync(indexPath, 'utf8').replace(/\r/g, '').split('\n');
  const a = lines.findIndex(l => l.startsWith('const ANT_URL')), c = lines.findIndex(l => l.startsWith('const COURSE = ['));
  let b = c; while (!/^\];/.test(lines[b])) b++;
  const src = lines.slice(a, b + 1).join('\n') + '\n;globalThis.__out = COURSE.map(m => ({id: m.id, items: m.lessons.concat(m.project ? [m.project] : [], m.exam ? [m.exam] : [], m.extra || [])}));';
  const ctx = { console }; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.__out;
}

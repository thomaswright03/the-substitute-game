// Fails when the game's modules import each other in a circle. A cycle only works while no
// module in it runs code at import time, so one new top-level statement could break start-up
// in an order-dependent way; this keeps the import graph a strict hierarchy.
//
//   node scripts/check-cycles.mjs [dir]   (default: src/)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dir = resolve(root, process.argv[2] || 'src');

function files(d) {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
  });
}

// static imports and re-exports of relative modules: `import x from './a.js'`, `import './a.js'`,
// `export { y } from './b.js'`
const IMPORT = /^\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;

export function importGraph(sources) {
  const graph = new Map();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const deps = [...text.matchAll(IMPORT)].map((m) => resolve(dirname(file), m[1]));
    graph.set(file, deps.filter((d) => sources.includes(d)));
  }
  return graph;
}

// Every cycle, found as the strongly connected components with more than one module (or a
// module importing itself), using Tarjan's algorithm.
export function cycles(graph) {
  let index = 0;
  const stack = [], onStack = new Set(), idx = new Map(), low = new Map(), out = [];
  const visit = (v) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) || []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1 || (graph.get(v) || []).includes(v)) out.push(scc.reverse());
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) visit(v);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = cycles(importGraph(files(dir)));
  if (found.length) {
    console.error('Import cycles in ' + relative(root, dir) + '/:');
    for (const c of found) console.error('  ' + c.map((f) => relative(dir, f)).join(' <-> '));
    process.exit(1);
  }
  console.log('No import cycles in ' + relative(root, dir) + '/.');
}

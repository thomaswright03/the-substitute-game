// The game's modules import each other as a strict hierarchy, with no cycles.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { cycles, importGraph } from '../../scripts/check-cycles.mjs';

const src = fileURLToPath(new URL('../../src/', import.meta.url));

describe('imports', () => {
  test('the cycle finder finds a cycle, and a self-import', () => {
    const graph = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['a']], ['e', ['e']]]);
    const found = cycles(graph).map((c) => [...c].sort().join(','));
    assert.deepEqual(found.sort(), ['a,b,c', 'e']);
    assert.deepEqual(cycles(new Map([['a', ['b']], ['b', []]])), []);
  });

  test('no module in src/ imports itself back through others', () => {
    const files = readdirSync(src).filter((f) => f.endsWith('.js')).map((f) => join(src, f));
    const graph = importGraph(files);
    // the graph really is being read: main.js imports most of the game
    assert.ok(graph.get(join(src, 'main.js')).length > 10);
    assert.deepEqual(cycles(graph), []);
  });
});

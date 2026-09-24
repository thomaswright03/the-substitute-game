// Every element the game looks up by id is in the page, so a renamed id fails here rather than
// on a player's screen as a start-up error.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const page = read('index.html');
const pageIds = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// $('id') and $('id', Type) in the game's modules; byId('id') in the start-up script
function idsLookedUp(source) {
  return [...source.matchAll(/(?:\$|byId|getElementById)\(\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('page elements', () => {
  const files = readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.js'));

  test('the lookup finds the ids the game uses', () => {
    const all = files.flatMap((f) => idsLookedUp(read('src/' + f)));
    // the HUD's own elements, looked up in dom.js, are among them
    for (const id of ['gl', 'hud', 'log', 'startOverlay', 'pauseOverlay']) assert.ok(all.includes(id), id);
  });

  for (const file of files) {
    const ids = idsLookedUp(read('src/' + file));
    if (!ids.length) continue;
    test(`every id src/${file} looks up is in index.html`, () => {
      for (const id of ids) assert.ok(pageIds.has(id), `#${id} (src/${file}) is not in index.html`);
    });
  }

  test('no id is used twice in the page', () => {
    const all = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(all.filter((id, i) => all.indexOf(id) !== i), []);
  });
});

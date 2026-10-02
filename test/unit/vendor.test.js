import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the vendored three.js matches the version pinned in package.json', () => {
  const pinned = JSON.parse(read('package.json')).devDependencies.three;
  assert.match(pinned, /^\d+\.\d+\.\d+$/, 'three is pinned to an exact version');
  const revision = pinned.split('.')[1];
  for (const file of ['lib/three/three.core.js', 'lib/three/three.module.js']) {
    assert.ok(read(file).startsWith(`// three.js r${revision} `), `${file} is r${revision}; run npm run vendor-three`);
  }
  assert.equal(existsSync(new URL('lib/three.min.js', root)), false, 'the old global build is gone');
});

test('every three.js addon the game imports is vendored', () => {
  const html = read('index.html');
  assert.match(html, /"three": "\.\/lib\/three\/three\.module\.js"/);
  assert.match(html, /"three\/addons\/": "\.\/lib\/three\/addons\/"/);
  for (const file of ['world.js', 'characters.js']) {
    for (const m of read('src/' + file).matchAll(/from 'three\/addons\/([^']+)'/g)) {
      assert.ok(existsSync(new URL('lib/three/addons/' + m[1], root)), m[1]);
    }
  }
});

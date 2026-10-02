import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = 18000 + Math.floor(Math.random() * 1000);
let server;

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('the static server (npm start)', () => {
  before(async () => {
    server = spawn(process.execPath, [fileURLToPath(new URL('../../scripts/serve.mjs', import.meta.url)), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve) => server.stdout.once('data', resolve));
  });
  after(() => server.kill());

  test('serves the game page', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body.toString(), /<title>The Substitute<\/title>/);
  });

  test('gzips text and models when the browser accepts it', async () => {
    const plain = readFileSync(new URL('../../lib/three/three.core.js', import.meta.url));
    const res = await get('/lib/three/three.core.js', { 'Accept-Encoding': 'gzip, deflate, br' });
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.ok(res.body.length < plain.length / 2);
    assert.deepEqual(gunzipSync(res.body), plain);
    const glb = await get('/assets/characters/punk-man.glb', { 'Accept-Encoding': 'gzip' });
    assert.equal(glb.headers['content-type'], 'model/gltf-binary');
    assert.equal(glb.headers['content-encoding'], 'gzip');
  });

  test('sends plain bytes to clients that do not accept gzip, and never gzips fonts', async () => {
    const res = await get('/src/main.js');
    assert.equal(res.headers['content-encoding'], undefined);
    const font = await get('/assets/fonts/nunito.woff2', { 'Accept-Encoding': 'gzip' });
    assert.equal(font.status, 200);
    assert.equal(font.headers['content-encoding'], undefined);
  });

  test('answers 404 for missing files and refuses paths outside the project', async () => {
    assert.equal((await get('/nope.js')).status, 404);
    const escape = await get('/../../etc/passwd');
    assert.notEqual(escape.status, 200);
    assert.notEqual((await get('/%2e%2e/%2e%2e/etc/passwd')).status, 200);
  });
});

describe('the static server caches cheaply', () => {
  before(async () => {
    server = spawn(process.execPath, [fileURLToPath(new URL('../../scripts/serve.mjs', import.meta.url)), String(PORT + 1)], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve) => server.stdout.once('data', resolve));
  });
  after(() => server.kill());

  function getFrom(path, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: PORT + 1, path, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  test('a repeat request for an unchanged file is a 304 with no body', async () => {
    const first = await getFrom('/assets/characters/punk-man.glb', { 'Accept-Encoding': 'gzip' });
    assert.equal(first.status, 200);
    assert.ok(first.headers.etag, 'has an ETag');
    assert.ok(first.headers['last-modified'], 'has a Last-Modified date');
    assert.equal(first.headers['cache-control'], 'no-cache');
    const again = await getFrom('/assets/characters/punk-man.glb', { 'Accept-Encoding': 'gzip', 'If-None-Match': first.headers.etag });
    assert.equal(again.status, 304);
    assert.equal(again.body.length, 0);
    const byDate = await getFrom('/src/main.js', { 'If-Modified-Since': new Date(Date.now() + 60_000).toUTCString() });
    assert.equal(byDate.status, 304);
  });

  test('a stale ETag gets the full file', async () => {
    const res = await getFrom('/src/main.js', { 'If-None-Match': 'W/"not-it"' });
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0);
  });
});

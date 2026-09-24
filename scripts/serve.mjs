// Minimal zero-dependency static file server for local play and for the test suite.
//
//   node scripts/serve.mjs [port] [--root <dir>] [--base </path/>]
//
// port defaults to $PORT or 8000; --root serves another folder (e.g. the built _site/);
// --base mounts it under a path, the way GitHub Pages serves a project site.
//
// Text files and the (meshopt-compressed) models are sent gzip-compressed when the browser
// accepts it, which roughly halves the first download. Every response carries an ETag and a
// Last-Modified date with "Cache-Control: no-cache": the browser keeps its copy and asks each
// time whether it changed, so an unchanged file costs a 304 and an edited one is picked up.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip as gzipCb } from 'node:zlib';

const gzip = promisify(gzipCb);

function parseArgs(argv) {
  const opts = { port: Number(process.env.PORT || 8000), root: fileURLToPath(new URL('..', import.meta.url)), base: '/' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--base') opts.base = argv[++i];
    else if (/^\d+$/.test(argv[i])) opts.port = Number(argv[i]);
  }
  opts.root = resolve(opts.root);
  if (!opts.base.startsWith('/')) opts.base = '/' + opts.base;
  if (!opts.base.endsWith('/')) opts.base += '/';
  return opts;
}
const { port: PORT, root: ROOT, base: BASE } = parseArgs(process.argv.slice(2));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
// woff2 and png are already compressed; gzip would only cost time
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.glb', '.svg', '.txt']);
const gzipped = new Map(); // path -> { mtimeMs, body }

async function compressed(file, info, body) {
  const hit = gzipped.get(file);
  if (hit && hit.mtimeMs === info.mtimeMs) return hit.body;
  const out = await gzip(body, { level: 9 });
  gzipped.set(file, { mtimeMs: info.mtimeMs, body: out });
  return out;
}

function notModified(req, etag, info) {
  const inm = req.headers['if-none-match'];
  if (inm) return inm.split(',').some((tag) => tag.trim() === etag || tag.trim() === '*');
  const ims = Date.parse(req.headers['if-modified-since'] || '');
  return !Number.isNaN(ims) && Math.floor(info.mtimeMs / 1000) * 1000 <= ims;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (BASE !== '/' && pathname === BASE.slice(0, -1)) {
      res.writeHead(301, { Location: BASE }).end();
      return;
    }
    if (!pathname.startsWith(BASE)) throw new Error('outside the base path');
    let path = normalize('/' + pathname.slice(BASE.length));
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const ext = extname(file).toLowerCase();
    const gz = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}${gz ? '-gz' : ''}"`;
    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
      'Last-Modified': new Date(info.mtimeMs).toUTCString(),
      Vary: 'Accept-Encoding',
    };
    if (notModified(req, etag, info)) {
      res.writeHead(304, headers).end();
      return;
    }
    let body = await readFile(file);
    if (gz) {
      body = await compressed(file, info, body);
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`The Substitute is being served at http://localhost:${PORT}${BASE}`);
});

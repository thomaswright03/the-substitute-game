// Minimal zero-dependency static file server for local play and for the test suite.
// Usage: node scripts/serve.mjs [port]   (defaults to $PORT or 8000)
//
// Text files and the (meshopt-compressed) models are sent gzip-compressed when the browser
// accepts it, which roughly halves the first download. Compressed copies are cached in memory
// until the file changes on disk.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip as gzipCb } from 'node:zlib';

const gzip = promisify(gzipCb);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8000);

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const ext = extname(file).toLowerCase();
    let body = await readFile(file);
    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
    };
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
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
  console.log(`The Substitute is being served at http://localhost:${PORT}/`);
});

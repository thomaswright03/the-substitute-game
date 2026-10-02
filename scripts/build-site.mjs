// Builds the deployable site: the files the game loads, copied as they are (there is no
// compile step), a service worker that caches them between visits, and a 404 page.
//
//   node scripts/build-site.mjs [outDir] [--base </path/>]      (defaults: _site/ and /)
//
// --base is the path the site is served under: the 404 page, which the host shows at any
// address that isn't part of the game, links back to it (GitHub Pages serves this project
// under /the-substitute-game/).
//
// Used by .github/workflows/pages.yml to publish to GitHub Pages, and by the browser tests.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const opts = { out: join(ROOT, '_site'), base: '/' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') opts.base = argv[++i] || '/';
    else opts.out = argv[i];
  }
  if (!opts.base.startsWith('/')) opts.base = '/' + opts.base;
  if (!opts.base.endsWith('/')) opts.base += '/';
  if (!/^\/[\w\-./]*$/.test(opts.base)) throw new Error('--base: not a URL path: ' + opts.base);
  return { out: resolve(opts.out), base: opts.base };
}
const { out: OUT, base: BASE } = parseArgs(process.argv.slice(2));
// everything the page loads at runtime, and nothing else (no tests, tooling or node_modules)
const INCLUDE = ['index.html', 'css', 'src', 'lib', 'assets'];

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full));
    else out.push(full);
  }
  return out;
}

function buildId() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'local-' + Date.now().toString(36);
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const item of INCLUDE) await cp(join(ROOT, item), join(OUT, item), { recursive: true });

const id = buildId();
// mark the page as a deployed build, which turns on the service worker (src/offline.js)
const htmlPath = join(OUT, 'index.html');
const html = await readFile(htmlPath, 'utf8');
if (!html.includes('<meta charset="utf-8">')) throw new Error('index.html: no charset meta to anchor the build id');
await writeFile(htmlPath, html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta name="substitute-build" content="${id}">`));

// the host's "not found" page, linking back to the game at BASE
const notFound = await readFile(join(ROOT, 'scripts/404.html'), 'utf8');
if (!notFound.includes('{{BASE}}')) throw new Error('404.html: no {{BASE}} to fill in');
await writeFile(join(OUT, '404.html'), notFound.replaceAll('{{BASE}}', BASE));

const files = {};
for (const file of (await listFiles(OUT)).sort()) {
  const path = relative(OUT, file).split('\\').join('/');
  files[path] = createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 16);
}
const sw = await readFile(join(ROOT, 'scripts/service-worker.js'), 'utf8');
const marker = /\/\* BUILD \*\/.*\/\* \/BUILD \*\//;
if (!marker.test(sw)) throw new Error('service-worker.js: BUILD marker not found');
await writeFile(join(OUT, 'sw.js'), sw.replace(marker, () => JSON.stringify({ id, files })));
// GitHub Pages: serve the files as they are, without running Jekyll over them
await writeFile(join(OUT, '.nojekyll'), '');
console.log(`Built ${Object.keys(files).length} files into ${relative(ROOT, OUT) || '.'}/ (build ${id}, served under ${BASE})`);

// Copies the parts of three.js the game uses from node_modules into lib/three/, minified, so
// the game runs as plain ES modules with no build step and no network requests to a CDN.
// Run after changing the pinned "three" version in package.json:  npm run vendor-three
//
// lib/three/three.module.js      <- three/build/three.module.js (imports ./three.core.js)
// lib/three/three.core.js        <- three/build/three.core.js
// lib/three/addons/...           <- three/examples/jsm/... (only the files listed below and
//                                   the files they import)
// index.html's import map points "three" and "three/addons/" at these.
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const THREE = join(ROOT, 'node_modules/three');
const OUT = join(ROOT, 'lib/three');
const ADDONS = [
  'loaders/GLTFLoader.js',
  'utils/SkeletonUtils.js',
  'libs/meshopt_decoder.module.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/UnrealBloomPass.js',
];

const pkg = JSON.parse(await readFile(join(THREE, 'package.json'), 'utf8'));
await rm(OUT, { recursive: true, force: true });

async function emit(from, to) {
  const src = await readFile(from, 'utf8');
  const { code } = await transform(src, { minify: true, format: 'esm', target: 'es2020', legalComments: 'none' });
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, `// three.js r${pkg.version.split('.')[1]} (${relative(THREE, from)}), MIT licence: see LICENSE\n` + code);
  return src;
}

await emit(join(THREE, 'build/three.core.js'), join(OUT, 'three.core.js'));
await emit(join(THREE, 'build/three.module.js'), join(OUT, 'three.module.js'));

// addons, plus every relative import they pull in
const done = new Set();
const queue = ADDONS.map((f) => join(THREE, 'examples/jsm', f));
while (queue.length) {
  const file = queue.shift();
  if (done.has(file)) continue;
  done.add(file);
  const src = await emit(file, join(OUT, 'addons', relative(join(THREE, 'examples/jsm'), file)));
  for (const m of src.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g)) queue.push(resolve(dirname(file), m[1]));
}
await copyFile(join(THREE, 'LICENSE'), join(OUT, 'LICENSE'));
console.log(`three.js ${pkg.version}: ${done.size + 2} files written to ${relative(ROOT, OUT)}/`);

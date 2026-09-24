// Shrinks the character .glb files for the web:
//  - drops every animation clip the game never plays (it only poses characters from
//    "Idle_Neutral"; the principal also uses "Walk"),
//  - removes the data those clips referenced, merges duplicates,
//  - quantizes normals/UVs/skin weights and meshopt-compresses all geometry (EXT_meshopt_compression, decoded at
//    runtime by lib/meshopt_decoder.js).
// Safe to re-run: already-optimized files are decoded and re-encoded.
// Usage: npm run optimize-assets [-- file.glb ...]
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const KEEP_CLIPS = { default: ['Idle_Neutral'], 'business-man.glb': ['Idle_Neutral', 'Walk'] };
const DIR = new URL('../assets/characters/', import.meta.url).pathname;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(DIR)).filter((f) => f.endsWith('.glb')).map((f) => join(DIR, f));

for (const file of files) {
  const before = (await stat(file)).size;
  const doc = await io.read(file);
  const base = file.split('/').pop();
  const keep = KEEP_CLIPS[base] || KEEP_CLIPS.default;
  for (const anim of doc.getRoot().listAnimations()) {
    const name = anim.getName().split('|').pop();
    if (!keep.includes(name)) anim.dispose();
  }
  // POSITION stays float: quantizing it on skinned meshes moves the dequantization into the
  // inverse bind matrices, and the game measures each head's face plate from its raw
  // vertex positions (see attachExpressiveFace in src/characters.js).
  await doc.transform(
    resample(),
    prune(),
    dedup(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ pattern: /^(?!POSITION)/ }),
  );
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(file, doc);
  const after = (await stat(file)).size;
  console.log(`${base}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
}

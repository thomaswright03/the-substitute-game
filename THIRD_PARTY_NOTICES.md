# Third-party notices

The Substitute's own code is under the MIT License (see `LICENSE`). This repository also
bundles the third-party files listed below. Each keeps its own licence; nothing here
relicenses them.

Unless a date is given, every check below was made on 2026-09-24 against the sources linked.

| Component | Files in this repo | Licence | Copyright / creator |
|---|---|---|---|
| three.js r128 | `lib/three.min.js`, `lib/GLTFLoader.js`, `lib/SkeletonUtils.js`, `lib/EffectComposer.js`, `lib/Pass.js`, `lib/RenderPass.js`, `lib/ShaderPass.js`, `lib/CopyShader.js`, `lib/LuminosityHighPassShader.js`, `lib/UnrealBloomPass.js` | MIT | © 2010-2021 three.js authors |
| meshoptimizer 0.18 (JS decoder) | `lib/meshopt_decoder.js` | MIT | © 2016-2022 Arseny Kapoulkine |
| Fredoka font | `assets/fonts/fredoka/` | SIL Open Font License 1.1 | © 2016 The Fredoka Project Authors |
| Nunito font | `assets/fonts/nunito/` | SIL Open Font License 1.1 | © 2014 The Nunito Project Authors |
| JetBrains Mono font | `assets/fonts/jetbrains-mono/` | SIL Open Font License 1.1 | © 2020 The JetBrains Mono Project Authors |
| Character models | `assets/characters/*.glb` | CC0 1.0, and CC BY for two models | Quaternius |

---

## three.js (r128) — MIT

- **Source:** https://github.com/mrdoob/three.js, tag `r128`.
- **Verified:** each file was compared byte-for-byte with the file at the same path under
  `https://raw.githubusercontent.com/mrdoob/three.js/r128/`:
  - `lib/three.min.js` = `build/three.min.js`: **identical** (it keeps its own `@license` header).
  - `lib/GLTFLoader.js` = `examples/js/loaders/GLTFLoader.js`
  - `lib/SkeletonUtils.js` = `examples/js/utils/SkeletonUtils.js`
  - `lib/EffectComposer.js`, `lib/Pass.js`, `lib/RenderPass.js`, `lib/ShaderPass.js`,
    `lib/UnrealBloomPass.js` = `examples/js/postprocessing/<same name>`
  - `lib/CopyShader.js`, `lib/LuminosityHighPassShader.js` = `examples/js/shaders/<same name>`

  The nine example modules had no licence header upstream. This project added a short
  header comment (copyright line, `SPDX-License-Identifier: MIT`, upstream path, and a
  pointer to the licence file) to the top of each. Below that header each file is
  byte-identical to the r128 upstream file.
- **Licence text:** `lib/LICENSE-three.js.txt`, copied verbatim from
  https://raw.githubusercontent.com/mrdoob/three.js/r128/LICENSE. It is reproduced here too:

```
The MIT License

Copyright © 2010-2021 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## meshoptimizer (0.18) — MIT

- **Source:** https://github.com/zeux/meshoptimizer, `js/meshopt_decoder.js`.
- **Verified:** `lib/meshopt_decoder.js` is byte-identical to
  https://raw.githubusercontent.com/zeux/meshoptimizer/v0.18/js/meshopt_decoder.js (its
  own header says "Built from meshoptimizer 0.18"). Unmodified.
- **Licence text:** `lib/LICENSE-meshoptimizer.txt`, copied verbatim from
  https://raw.githubusercontent.com/zeux/meshoptimizer/v0.18/LICENSE.md:

```
MIT License

Copyright (c) 2016-2022 Arseny Kapoulkine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts — SIL Open Font License 1.1

Earlier versions of the game loaded these fonts from Google Fonts at runtime. They are now
bundled locally, so the page makes no requests to Google or any other third party.

All three were downloaded from the `google/fonts` repository on GitHub, branch `main` at
commit `b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04`. The font files are unmodified; only the
file names were changed (the square brackets were dropped).

| Bundled file | Downloaded from | SHA-256 |
|---|---|---|
| `assets/fonts/fredoka/Fredoka-Variable.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf | `2ba02e68b152868aef9ba28e24b3648c7d457fe6f25c761f2c2c53fb61a73fc8` |
| `assets/fonts/nunito/Nunito-Variable.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/Nunito%5Bwght%5D.ttf | `bb55a5ca5c2042335b3991af27c4d0705d0ef41cac6164ac737fd8f2a1e85207` |
| `assets/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf` | https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf | `48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda` |

Each font folder has an `OFL.txt`, copied verbatim from the same folder of `google/fonts`.
It holds the copyright line and the full SIL Open Font License 1.1 text. None of the three
`OFL.txt` files declares a Reserved Font Name. Upstream projects, as named in each font's
`METADATA.pb` in `google/fonts`:

- Fredoka: Copyright 2016 The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One).
  Designers: Milena Brandão, Hafontia.
- Nunito: Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito).
  Designers: Vernon Adams, Cyreal, Jacques Le Bailly.
- JetBrains Mono: Copyright 2020 The JetBrains Mono Project Authors
  (https://github.com/JetBrains/JetBrainsMono). Designers: JetBrains, Philipp Nurullin,
  Konstantin Bulenkov.

## Character models — Quaternius (CC0 / CC BY)

See `assets/characters/CREDITS.txt` for the per-file licence, the CC BY attribution, the
changes made at runtime, and SHA-256 hashes. In short: seven models are CC0 and two
("Suit" and "Worker" from the Ultimate Modular Women Pack) are CC BY. The CC BY version was
not recorded at download and could not be re-checked (see CREDITS.txt).

What was and was not verified:
- The `.glb` files carry no creator or licence metadata. Their glTF headers name only the
  generator, `FBX2glTF v0.9.7`. The creator and licence information comes from the
  download record in `CREDITS.txt`.
- poly.pizza and quaternius.com could not be reached from the environment used for this
  review on 2026-09-24, so the per-model licences were not re-checked against the live
  listings in this pass.

---

## Removed: expressive face model (`assets/face.glb`) — licence unknown

Earlier commits of this repository (up to and including `43e1b65`) contained
`assets/face.glb`, a 52-blend-shape (ARKit-style) head grafted onto each character to show
facial expressions. **It has been removed from the current tree because no licence allowing
its redistribution could be established.**

What was checked:
- The removed file matches three.js's example model `examples/models/gltf/facecap.glb`
  (downloaded from https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/facecap.glb).
  Both have the generator `gltfpack 0.16`, the same node names (`eyeLeft`, `grp_eyeLeft`,
  `eyeRight`, `grp_eyeRight`, `head`, `teeth`, `grp_transform`, `grp_scale`, `Empty`) and
  52 morph targets on the head mesh. The removed copy has had the texture and the
  `KHR_texture_basisu`/`KHR_texture_transform` extensions stripped out. It was a
  **modified copy**.
- The three.js example page that uses it credits it as "model by Face Cap", linking to
  https://www.bannaflak.com/face-cap
  (https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_morphtargets_face.html,
  line 22). It states no licence.
- In the three.js repository (default `dev` branch, file list checked 2026-09-24),
  `examples/models/gltf/` has no licence or README file for `facecap.glb`, though several
  other models there have one (for example `DamagedHelmet/README.md` and
  `LeePerrySmith/LeePerrySmith_License.txt`). three.js's own `LICENSE` covers
  "three.js authors", and it has not been established that this extends to a third-party
  model.
- bannaflak.com could not be reached from this environment on 2026-09-24. A previous review
  on the same date reported finding no licence or redistribution terms on its Face Cap pages.
- An old code comment called this model "CC0". No source for that claim was found, and the
  comment has been corrected.

Current behaviour: the game still runs without the file. If `assets/face.glb` is absent,
the loader falls back and every character keeps its original Quaternius face with no
blend-shape expressions. In that case the browser console shows one 404 for the missing
optional file. `assets/face.glb` is listed in `.gitignore` so a local copy is not
re-committed by accident.

Still open (owner):
- The file remains in this repository's **git history** (commit `43e1b65`). Removing it from
  history needs a history rewrite and force-push, which the owner has to decide on.
- To bring expressions back publicly, either get written redistribution terms from Bannaflak
  (Face Cap), or replace the head with a model whose licence is documented (for example
  CC0 or CC BY) and record it here.

# Third-party notices

The project's own code and documentation are released under the MIT licence (see `LICENSE`).
This file lists the third-party material bundled in the repository and where its licence is.

| Component | Where | Licence | Copyright |
|---|---|---|---|
| three.js r186 (core, `GLTFLoader`, `SkeletonUtils`, bloom post-processing passes, Meshopt decoder) | `lib/three/` | MIT | © 2010-2026 three.js authors |
| Quaternius "Ultimate Modular Men/Women" character models (9 files) | `assets/characters/*.glb` | 7 × CC0 1.0, 2 × CC BY (version not recorded) | Quaternius |
| Fredoka font | `assets/fonts/fredoka.woff2` | SIL Open Font License 1.1 | © 2016 The Fredoka Project Authors |
| Nunito font | `assets/fonts/nunito.woff2` | SIL Open Font License 1.1 | © 2014 The Nunito Project Authors |
| JetBrains Mono font | `assets/fonts/jetbrains-mono.woff2` | SIL Open Font License 1.1 | © 2020 The JetBrains Mono Project Authors |

Development tools (ESLint, Playwright, esbuild, glTF-Transform, meshoptimizer) are installed by
`npm install` into `node_modules/`. They are not part of the published game and are not
committed.

## three.js (r186) — MIT

- **Source:** https://github.com/mrdoob/three.js, the `three` npm package pinned in
  `package.json`.
- **How it got here:** `npm run vendor-three` (`scripts/vendor-three.mjs`) copies the minified
  files from that package into `lib/three/`. A unit test checks that `lib/three/` matches the
  pinned version. Nothing is edited by hand.
- **Licence text:** `lib/three/LICENSE`. The Meshopt decoder module
  (`lib/three/addons/libs/meshopt_decoder.module.js`) is three.js's copy of Arseny Kapoulkine's
  meshoptimizer decoder, also MIT; its header points at that licence.

## Character models — Quaternius

Per-file licences, the required CC BY attribution, the changes made to the files and their
checksums are in [`assets/characters/CREDITS.txt`](assets/characters/CREDITS.txt).

Open item (owner): the CC BY version (3.0 or 4.0) for the two women-pack models, "Suit" and
"Worker", was not recorded at download. Confirm it on the poly.pizza listing.

## Fonts — SIL Open Font License 1.1

The full licence text for each font is in `assets/fonts/OFL-Fredoka.txt`,
`assets/fonts/OFL-Nunito.txt` and `assets/fonts/OFL-JetBrainsMono.txt`. The fonts are served
from this repository; the page does not load them from Google or any other host.

## Removed: expressive face model (`assets/face.glb`) — licence unknown

An earlier version of this repository (root commit `43e1b65`, still in git history) contained
`assets/face.glb`, a 52-blend-shape head grafted onto each character. It was a modified copy
of the "Face Cap" model from three.js's examples (`examples/models/gltf/facecap.glb`; the
example page credits it to Bannaflak, https://www.bannaflak.com/face-cap). No licence allowing
redistribution was found, so the file is no longer in the current tree, and **the game does
not use it**. Facial expressions now come from `src/face.js`, which adds blend shapes to each
character's own eye and brow meshes and generates a mouth.

Still open (owner): the file remains in git history. Removing it needs a history rewrite and
force-push, which is the repository owner's decision.

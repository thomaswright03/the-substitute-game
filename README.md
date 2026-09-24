# The Substitute

A browser-based 3D classroom-management game built with Three.js. You play a substitute teacher: take attendance, watch for students acting up, and step in before things escalate.

## How to run it

No build step — it's a static site.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Gameplay

- **Attendance** — pick up name cards from the chalkboard and deliver them to the right student. Your back is turned to the class every trip.
- **Misbehavior** — students show physical "tells" (phone out, passing notes, dozing off, arguing, spinning in a chair) before things escalate. Walk over and step in.
- **Discipline** — a stern talking-to, detention, a call to the principal, or (if you're desperate) a lightning zap.
- **Catch thrown objects** — someone may throw something whenever your back is turned to the class; turn around fast enough and you catch them.
- **Reassign seats** — swap two students' desks to break up trouble.

Controls: WASD to move, mouse to look, E to interact, F for discipline, R to reassign seats, Q for roll call.

## Tech

Vanilla HTML/CSS/JS on Three.js (r128), with `GLTFLoader`, `SkeletonUtils`, and a Meshopt decoder for compressed geometry. No backend and no build tooling. All scripts, 3D models and fonts are local files in this repository (fonts are self-hosted from `assets/fonts/`). The page makes no requests to any third party: no analytics, no CDN or Google Fonts links, and no `fetch`/XHR/WebSocket/beacon calls in the game code. The only requests are the ones your browser makes for the game's own files (HTML, `lib/*.js`, fonts, and the `.glb` models, which three.js's `GLTFLoader` loads with relative paths) from whatever server you load it from.

Characters are built at runtime from:
- Body/clothing rigs from Quaternius's low-poly "Ultimate Modular Men/Women" packs (seven models CC0, two CC BY; see below).
- *Optional:* an expressive head (52 ARKit blend shapes) grafted onto each body's neck bone, so students and the principal can show facial expressions driven by their behaviour. **This head (`assets/face.glb`) is not included in the repository** because its licence could not be established (see [Asset credits](#asset-credits)). Without it, the game runs normally and characters keep their original Quaternius faces, with no expressions.

## Privacy and data

- **No personal data is collected or sent anywhere.** There are no accounts, forms, analytics, ads, cookies or third-party requests. You can check this in `index.html`: it loads only local files by relative path, and its code contains no network calls apart from loading its own models.
- **One value is stored on your device:** your best survival time, in the browser's `localStorage` under the key `substitute_best`. It never leaves your browser. You can view or clear it in-game under **Credits, licences & privacy** → **Reset best time**, or by clearing this site's data in your browser.
- **Hosting:** the game is not deployed anywhere. Whoever serves the files (for example `python3 -m http.server` on your own machine) receives ordinary web-server requests for them, like any web page. If the game is ever hosted publicly, this section should be revisited for that host's logging.

## Content note and intended audience

All characters are fictional. The game's humour includes crude, innuendo-style pun names for students and a cartoon "lightning zap" discipline option. **It is intended for adults and is not designed for or directed at children.** Review the content against the target platform's rules before hosting or distributing it anywhere.

## Licence

The project's own code (`index.html`) and documentation are released under the [MIT License](LICENSE), © 2026 Thomas Wright.

Bundled third-party files keep their own licences. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for sources, verification notes and full licence texts.

## Asset credits

- **Character models:** by [Quaternius](https://quaternius.com), from the "Ultimate Modular Men" and "Ultimate Modular Women" packs, obtained via poly.pizza. "Suit" and "Worker" (women pack) are **CC BY**. The other seven are **CC0**. The CC BY version was not recorded at download and still needs confirming. See [`assets/characters/CREDITS.txt`](assets/characters/CREDITS.txt) for the per-file licence, the attribution, and what the game changes at runtime (posing only; the files are unmodified).
- **three.js r128** (`lib/three.min.js` and nine example modules): © 2010-2021 three.js authors, MIT. See `lib/LICENSE-three.js.txt`.
- **meshoptimizer 0.18 decoder** (`lib/meshopt_decoder.js`): © 2016-2022 Arseny Kapoulkine, MIT. See `lib/LICENSE-meshoptimizer.txt`.
- **Fonts:** Fredoka, Nunito and JetBrains Mono, under the SIL Open Font License 1.1. See `assets/fonts/*/OFL.txt`.
- **Expressive face (removed):** earlier commits included `assets/face.glb`, a modified copy of the "Face Cap" example model from three.js's examples (credited upstream to Bannaflak). No licence allowing its redistribution was found, so it was removed from the current tree. It is still in git history. Details are in `THIRD_PARTY_NOTICES.md`.

The same credits and the data statement are shown in the game: **Credits, licences & privacy**, on the start and end screens.

## Status

Working prototype. The core gameplay loop and character models are in place; facial expressions need the optional face asset (see above). Not deployed anywhere; runs locally only.

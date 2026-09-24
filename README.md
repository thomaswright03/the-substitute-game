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

Vanilla HTML/CSS/JS on Three.js (r128), with `GLTFLoader`, `SkeletonUtils`, and a Meshopt decoder for compressed geometry. No backend, no build tooling, no external network calls at runtime — everything ships as local files.

Characters are built by combining two things at runtime:
- Body/clothing rigs from Quaternius's CC0 low-poly character packs.
- A shared, separately-sourced expressive head (52 ARKit blend shapes) grafted onto each body's neck bone, so every student and the principal can show real facial expressions — smiles, frowns, raised brows, closed eyes — driven by their current behavior state.

## Asset credits

- **Character bodies**: Quaternius "Ultimate Modular Men/Women" packs (CC0 / CC BY per-model — see `assets/characters/CREDITS.txt` for the exact split and required attribution).
- **Expressive face**: adapted from the "Face Cap" model bundled with three.js's own official examples, re-processed locally to drop its baked-in KTX2 textures (unused, since it's retinted per character at runtime) — see `assets/face.glb`.

## Status

Working prototype — the core gameplay loop, character models, and facial expressions are all in place. Not deployed anywhere; runs locally only.

# The Substitute

A browser-based 3D classroom-management game built with Three.js. You're the substitute
teacher in Room 204: take attendance, keep the class from boiling over, and make it to the
bell at 9:50.

## How to run it

It's a static site with no build step. From the project folder:

```bash
npm start
```

Then open <http://localhost:8000>. `npm start` runs a small static server
(`scripts/serve.mjs`) with no dependencies, so you don't need `npm install` just to play.
Any other static server works too, for example `python3 -m http.server 8000`.

The game has to be served over `http://`. Browsers block the game's scripts and 3D models
when `index.html` is opened directly from disk (`file://`). If you open it that way, the page
explains this and shows the command above.

It needs a browser with WebGL (any recent Chrome, Edge, Firefox or Safari with hardware
acceleration switched on). Without WebGL the page says so instead of loading.

## How to play

A round is one 3rd-period class (two minutes of real time, 9:05 to 9:50).

1. **Take attendance first.** Pick up a name card from the chalkboard and hand it to that
   student. If you're not sure who that is, use **roll call**. The student answers, and the
   attendance panel tells you which direction the voice came from. Every card must be
   handed out before the bell. Otherwise the period doesn't count and you lose.
2. **The class won't wait.** Students start acting up during attendance too (a little more
   gently than later on). Each one has a physical tell and a ring that fills as they
   escalate. Walk over and **help** (E). If anyone reaches 100%, they get hurt or leave, and
   you lose.
   - The phone takes two presses: a warning, then taking the phone.
   - The arguer can only be calmed while he pauses for breath (his ring glows green).
     Interrupting him makes it worse.
3. **Watch your back.** While you face the board, someone may throw something. If it hits
   you, the thrower and everyone acting up get rowdier. Turn around in time and you catch
   the thrower, who you can then discipline.
4. **Split up friends.** Three pairs of friends start out sitting side by side, and a friend
   next door makes a misbehaving student escalate 60% faster. Open the **seating chart** (R)
   to swap seats. The log tells you when a swap splits friends up (or puts them together).
5. **Discipline has a price.** Discipline (F) only works on a student who is acting up, or
   one you just caught throwing. The menu shows each option's cost before you choose:
   - *Stern talking-to*: −50% escalation. Free, but it may not fully settle them.
   - *Detention*: quiet for the rest of the period, but the class grumbles (+10% to others
     acting up). Two per period.
   - *Call the principal*: the student is marched out and the room sobers up (−20% to
     others). Once per period, and it costs report points.
   - *Zap*: instant calm, but the commotion sets another student off. 20-second cooldown.

Reach the bell and you get a report card (A to D). Points come off for hits taken, heavy
discipline and close calls.

### Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Walk | WASD or ↑/↓ | left stick |
| Turn | ←/→ or mouse (click the view to lock the pointer) | drag the view |
| Help / pick up / give card | E | action button |
| Discipline | F, then 1–4 | Discipline button |
| Seating chart | R (Tab / Enter to pick seats) | Seats button |
| Roll call | Q | Roll call button |
| Pause | Esc or P | pause button |

The whole game can be played with the keyboard alone. Menus take focus when they open and
give it back when they close.

## Development

```bash
npm install        # dev tools only: ESLint, Playwright, glTF tools
npm test           # lint + unit tests + browser tests
npm run lint
npm run test:unit  # rules tests (node:test), a few seconds
npm run test:e2e   # Playwright tests in headless Chromium with software WebGL
```

The browser tests need Chromium for Playwright. On a fresh machine, install it once with
`npx playwright install chromium`. CI (`.github/workflows/ci.yml`) runs the whole suite on
every push and pull request.

### Project layout

| Path | What it is |
|---|---|
| `index.html`, `css/game.css` | Page markup and styles |
| `src/boot.js` | Start-up checks that run before anything else: `file://`, WebGL, load failures, progress |
| `src/rules.js` | The rules of a period, as pure functions with no DOM or three.js. Unit-tested. |
| `src/data.js` | The roster, seating, friendships and every tuning number |
| `src/strings.js` | Every piece of user-facing text in one table (see below) |
| `src/main.js` | Rendering, input, HUD, dialogs and the main loop |
| `src/scene.js`, `src/characters.js` | The classroom, and the character models with their grafted faces |
| `test/unit`, `test/e2e` | Rules tests and browser tests |
| `scripts/` | Static server and the asset optimizer |

The rules advance on real elapsed time, not frames, so a period lasts two minutes of
unpaused play on any machine. The game pauses itself when the tab is hidden.

**Text and translation.** Static page text is tagged with `data-i18n` and filled from
`src/strings.js`, and all text built during play goes through the same table. To translate,
provide a table with the same keys and pass it to `setStrings()`.

**Test hooks.** Adding `?test` to the URL exposes `window.__substitute` for the browser
tests. Nothing is exposed without it.

## Tech

Vanilla HTML/CSS/JS modules on Three.js r128 (`lib/`), with `GLTFLoader`, `SkeletonUtils`,
the bloom post-processing passes, and the Meshopt decoder. Everything the game loads ships
in this repository, including the fonts, so it makes no requests to other hosts at runtime.

Characters combine two things at runtime:
- Body and clothing rigs from Quaternius's low-poly character packs. They have no sit
  animation, so each character is frozen on its idle pose and its legs are bent into a
  seated pose in code.
- A shared expressive head with 52 ARKit blend shapes (smiles, frowns, raised brows, closed
  eyes), attached to each body's Head bone in place of the original head skin. It is sized
  and positioned from that character's own posed head, so every costume gets a fitted face
  whose expression follows the student's behaviour.

The character files were re-packed for the web with `npm run optimize-assets`: unused
animation clips were removed and the geometry meshopt-compressed (about 520 KB per
character instead of 1.4 MB). The principal's model only downloads after the classroom is
ready. `npm start` sends scripts, styles and models gzip-compressed, so the first load is
about 3 MB on the wire (it was 13.6 MB). If you host the game somewhere else, turn on gzip or
Brotli compression for `.html`, `.js`, `.css` and `.glb` files there too.

## Asset credits

- **Character bodies**: Quaternius "Ultimate Modular Men/Women" packs (CC0 / CC BY per
  model). See `assets/characters/CREDITS.txt` for the exact split, the required attribution
  and the modifications made.
- **Expressive face**: adapted from the "Face Cap" model bundled with three.js's official
  examples, re-processed locally to drop its baked-in KTX2 textures (unused, since it's
  retinted per character at runtime). See `assets/face.glb`.
- **Fonts**: Fredoka, Nunito and JetBrains Mono, under the SIL Open Font License. The
  licence texts are in `assets/fonts/`.

## Status

The core loop, attendance, discipline, seating, characters and facial expressions are all
in place, with automated tests. Not deployed anywhere. It runs locally.

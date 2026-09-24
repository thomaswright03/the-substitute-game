# The Substitute

A browser-based 3D classroom-management game built with Three.js. You're the substitute
teacher in Room 204: take attendance, keep the class from boiling over, and make it to the
bell at 9:50.

## Play it

Once GitHub Pages is switched on (see [Hosting](#hosting)), the game is at
<https://thomaswright03.github.io/the-substitute-game/>. It needs a browser with WebGL (any
recent Chrome, Edge, Firefox or Safari with hardware acceleration switched on). Without WebGL
the page says so instead of loading.

## Run it locally

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

## How to play

A round is one 3rd-period class, 9:05 to 9:50 on the clock: two minutes of real time on Standard, four on Relaxed.

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
| Look up / down | Shift+↑/↓ or Page Up / Page Down, or the mouse | drag the view |
| Help / pick up / give card | E | action button |
| Discipline | F, then 1–4 | Discipline button |
| Seating chart | R (Tab / Enter to pick seats) | Seats button |
| Roll call | Q | Roll call button |
| Pause | Esc or P | pause button |
| Sound on / off | M, or the speaker button | speaker button (on a narrow phone, the pause screen) |

Keys are bound by where they sit on the keyboard, not by the letter printed on them, so on a
French AZERTY keyboard you walk with ZQSD, and roll call is the key marked A. The controls
card, the hint bar and the prompts name the keys as printed on the player's own keyboard: the
browser reports the layout where it can (Chrome and Edge), a French or Belgian browser starts
from AZERTY names otherwise, and pressing a key corrects its name.

The whole game can be played with the keyboard alone. Menus take focus when they open and
give it back when they close. While the mouse is captured for looking, the Seats and Roll call
buttons turn into key hints, since there is no cursor to click them with; Esc frees the mouse.

## Hosting

The game is published to GitHub Pages by `.github/workflows/pages.yml`. Every push to `main`
runs the full test suite, builds the site and deploys it. Nothing else deploys.

**Switching it on (once).** In the repository on GitHub, open *Settings > Pages* and under
*Build and deployment* set *Source* to **GitHub Actions**. The next push to `main` publishes
the game at <https://thomaswright03.github.io/the-substitute-game/> (the pattern is
`https://<owner>.github.io/<repository>/`). The deploy job's summary in the *Actions* tab
shows the URL too.

**What gets published.** `npm run build` writes `_site/`: `index.html`, `css/`, `src/`, `lib/`
and `assets/` copied as they are, a `.nojekyll` marker, and `sw.js`, a service worker listing
a content hash for every file. Every URL in the game is relative, so it works under the
`/the-substitute-game/` sub-path. To try the published build locally, run `npm run preview`
and open <http://localhost:8080/the-substitute-game/>.

**Compression and caching.** GitHub Pages sends `.html`, `.js`, `.css` and `.glb` files
gzip-compressed (a little over 3 MB for a first visit) with a 10-minute browser cache and ETags. On
top of that, the service worker keeps every file in the browser under its content hash, so a
repeat visit loads the models, fonts and three.js from that cache without touching the
network, and a new deploy only downloads the files that changed. The page itself is always
fetched fresh first, so players see a new deploy on their next visit. `npm start` never
registers the service worker. To check a live deploy:

```bash
curl -sI -H 'Accept-Encoding: gzip' https://thomaswright03.github.io/the-substitute-game/assets/characters/punk-man.glb | grep -i -E 'content-encoding|cache-control'
```

**Redeploying and rolling back.** To redeploy the current `main`, push to it (an empty
commit works: `git commit --allow-empty -m "Redeploy" && git push`). To roll back, either
revert the bad commit on `main` and push, or open *Actions > Deploy to GitHub Pages*, pick the
last good run and choose *Re-run all jobs*, which rebuilds and redeploys that run's commit.

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
| `src/three-setup.js` | Imported first: sets three.js up to keep the look the game was designed with (see [Tech](#tech)) |
| `src/rules.js` | The rules of a period, as pure functions with no DOM or three.js. Unit-tested. |
| `src/data.js` | The roster, seating, friendships and every tuning number |
| `src/strings.js`, `src/i18n/` | Every piece of user-facing text in one table, and its Spanish and French translations (see below) |
| `src/main.js` | Start-up and the frame loop |
| `src/world.js`, `src/quality.js`, `src/player.js` | The three.js renderer and classroom, the students' poses each frame; the graphics levels and the automatic step-down; the teacher's movement |
| `src/input.js`, `src/keys.js`, `src/aim.js` | Keyboard, mouse, touch and stick input; the key bindings and the names of the player's keys; what the teacher is aiming at and what E / F do |
| `src/hud.js`, `src/dialogs.js`, `src/rollcall.js` | HUD, log, prompts and buttons; modal dialogs and focus; roll-call bubble and arrow |
| `src/seating.js`, `src/discipline.js`, `src/principal.js`, `src/effects.js` | Seating chart, discipline menu, the principal's visit, hit / zap / throw effects |
| `src/events.js`, `src/round.js`, `src/session.js`, `src/dom.js` | Rule events to log lines and effects; starting, pausing and ending a round; shared UI state; the page elements the game drives |
| `src/bus.js`, `src/pointer.js`, `src/log.js` | The small event bus that keeps the UI modules free of import cycles (`npm run lint` checks for cycles); pointer lock; the play log |
| `src/audio.js`, `src/settings.js` | Synthesised sound cues; the sound, volume, language, graphics and difficulty controls |
| `src/offline.js` | Registers the service worker on a deployed build only |
| `src/testhooks.js` | The `?test` API for the browser tests |
| `src/scene.js`, `src/characters.js` | The classroom, and the character models: seating, arm poses and body language |
| `src/face.js`, `src/props.js` | The expressive face (blend shapes on each costume's own head, and its mouth); the props for each behaviour |
| `test/unit`, `test/e2e` | Rules tests and browser tests |
| `lib/three/` | The vendored three.js modules |
| `docs/playtests.md` | How to run a playtest, and the notes from each one |
| `scripts/` | Static server, site build and service worker, three.js vendoring, and the asset optimizer |

The rules advance on real elapsed time, not frames, so a period lasts the same on any machine:
two minutes of unpaused play on Standard, four on Relaxed. The game pauses itself when the tab
is hidden.

**Difficulty and balance.** The start screen offers Relaxed (a four-minute period, a calmer
class, fewer throws and a gentle first minute; see `docs/playtests.md`) and Standard (the
two-minute period the game was designed around). A first visit starts on Relaxed and the choice is
remembered; each difficulty keeps its own best grade. `test/unit/balance.test.js` plays many
seeded periods with a simulated first-time player that has to find each card's owner by roll
call and walking, and sometimes tries the wrong desk, and checks the win-rate targets stated
there. Notes from real playtests go in `docs/playtests.md`.

**Graphics.** The start and pause screens have a Graphics setting, kept in the browser like
the other settings. Automatic (the default) starts with the full look and, when frames keep
taking longer than 50 ms (under 20 frames a second) for three seconds, steps down one level
at a time: a pixel ratio of 1, then no glow, then no shadows, then drawing at 60% of the
resolution. The setting then reads, for example, "Automatic · Low". Choosing a level fixes it.
Since the period runs on real time, this keeps a slow device playable rather than letting the
bell ring while the teacher can barely move.

**Sound.** `src/audio.js` synthesises every cue with the Web Audio API, so there are no
audio files: the school bell at the start and end of the period, a tick for each of the last
ten seconds, a thrower's wind-up (panned toward where they sit), the hit or the catch, the zap
and the principal's knock. Nothing plays until the first tap, click or key press. Sound can be
switched off and the volume set on the start and pause screens, with the HUD speaker button or
with M; the choice is kept in the browser's local storage.

**Text and translation.** The game is in English, Spanish and French. Static page text is
tagged with `data-i18n` and filled from `src/strings.js`, and all text built during play
(including the chalkboard, roll-call answers and every student's lines) goes through the same
table. The Spanish and French tables in `src/i18n/` have exactly the English keys, list lengths
and `{placeholders}`, which a unit test checks, and a second test fails if a key in the table
isn't used by the source or the page. A language switcher sits on the start and pause screens;
the choice is remembered, a first visit follows the browser's language, and the page's `lang`
attribute follows it. A key with a sibling named `<key>Touch` (for example `seating.close` and
`seating.closeTouch`) supplies the text used on touch screens, so no phone player is told to
press a key. To add a language, add a table with the same keys to `src/i18n/` and list it in
`LANGUAGES` in `src/strings.js`.

**Look and styling.** The game has one art direction on purpose: a dark wooden frame around the
3D classroom, with the HUD and every dialog drawn as cream paper and chalk. It doesn't switch
with the system's light or dark setting, because the classroom is lit the same either way and
the paper panels already read as light on dark. `css/game.css` takes every colour from the
tokens at its top (translucent shades mix a token with `transparent`) and every margin, padding
and gap from a ten-step spacing scale; a unit test (`test/unit/css.test.js`) fails on a raw
colour or an off-scale space anywhere else. Sizes are multiples of `--px`, which is 1px except
on the in-game HUD: there it grows with the stage, from 1px on a stage about 1100px wide to 2px,
so the HUD keeps its share of a large monitor and phones keep text at 12px or more.

**Test hooks.** Adding `?test` to the URL exposes `window.__substitute` for the browser
tests. Nothing is exposed without it.

## Tech

Vanilla HTML/CSS/JS, loaded as native ES modules with no build step. three.js r186 (pinned in
`package.json`) is vendored, minified, into `lib/three/` and mapped with an import map in
`index.html`: the core, `GLTFLoader`, `SkeletonUtils`, the bloom post-processing passes and the
Meshopt decoder. To move to another three.js release, change the pinned version, run
`npm install && npm run vendor-three`, and run the tests (a unit test checks that `lib/three/`
matches the pinned version). Everything the game loads ships in this repository, including the
fonts, so it makes no requests to other hosts at runtime.

The look was designed on three.js r128, and `src/three-setup.js` and `src/world.js` keep it:
colours are used as linear values, lights use r128's intensity scale, and the frame is
tone-mapped the way r128's bloom pipeline did it.

Characters are Quaternius's low-poly character rigs, brought to life in code:
- They have no sit animation, so each character is frozen on its idle pose and its legs are
  bent into a seated pose in code.
- Each costume keeps its own head (hair, hat, skin, eyes and brows), and `src/face.js` makes
  it expressive. When a character is built it finds the eyes and brows on the posed head and
  adds blend shapes to those meshes (blink, squint, wide, looking down; brows down and
  worried), and it adds a flat-shaded mouth, placed between the nose and the chin by tracing
  the face's profile, curved to the face, with its own shapes (smile, frown, open, pulled to
  one side). The shapes use the ARKit names (`eyeBlink_L`, `mouthSmile_R`, `jawOpen`...), and
  each behaviour poses the face with them; calm students blink now and then.

The character files were re-packed for the web with `npm run optimize-assets`: unused
animation clips were removed and the geometry meshopt-compressed (about 520 KB per
character instead of 1.4 MB). The principal's model only downloads after the classroom is
ready. `npm start` and GitHub Pages send scripts, styles and models gzip-compressed, so the
first load is a little over 3 MB on the wire. If you host the game somewhere else, turn on gzip or
Brotli compression for `.html`, `.js`, `.css` and `.glb` files there too.

## Asset credits

- **Character bodies**: Quaternius "Ultimate Modular Men/Women" packs (CC0 / CC BY per
  model). See `assets/characters/CREDITS.txt` for the exact split, the required attribution
  and the modifications made.
- **Fonts**: Fredoka, Nunito and JetBrains Mono, under the SIL Open Font License. The
  licence texts are in `assets/fonts/`.

## Status

The core loop, attendance, discipline, seating, characters and facial expressions are all
in place, with automated tests. Deployment to GitHub Pages is set up and runs once Pages is
switched on in the repository settings (see [Hosting](#hosting)).

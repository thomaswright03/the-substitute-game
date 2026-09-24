// Keyboard bindings. Every key is bound by its physical position (KeyboardEvent.code), so
// walking uses the W/A/S/D positions on any layout: ZQSD on a French AZERTY keyboard, with
// nothing else bound to those keys. The letters shown in the controls, the hint bar and the
// prompts are the ones printed on the player's own keyboard.

// action -> the physical key it is bound to (named after the key in the US layout)
export const BINDINGS = {
  forward: 'KeyW',
  left: 'KeyA',
  back: 'KeyS',
  right: 'KeyD',
  help: 'KeyE',
  discipline: 'KeyF',
  seats: 'KeyR',
  rollCall: 'KeyQ',
  pause: 'KeyP',
  mute: 'KeyM',
};

// Keys held down to walk, turn and look. Shift turns the up and down arrows into looking up
// and down, so the whole game can be played from the arrow keys.
export const HELD_KEYS = new Set([
  BINDINGS.forward, BINDINGS.left, BINDINGS.back, BINDINGS.right,
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'ShiftLeft', 'ShiftRight',
]);

// The digit keys that choose an option in a menu, on the main row or the number pad. (On AZERTY
// the main row types & é " ' without Shift, so these go by position too.)
export const DIGITS = {
  Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4,
};

// Without KeyboardEvent.code (some on-screen keyboards), a letter stands for its US position.
export function eventCode(e) {
  if (e.code) return e.code;
  const k = String(e.key || '');
  if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
  if (/^[1-4]$/.test(k)) return 'Digit' + k;
  return k;
}

// The action bound to a physical key, or null.
const ACTION_OF = Object.fromEntries(Object.entries(BINDINGS).map(([action, code]) => [code, action]));
export function actionFor(code) {
  return ACTION_OF[code] || null;
}

/* ---------------- what the keys are called on this keyboard ---------------- */

// Layouts whose letters differ from QWERTY on the bound keys. Used until the browser says what
// the keyboard is (navigator.keyboard.getLayoutMap) or the player presses one of the keys.
const AZERTY = { KeyQ: 'A', KeyW: 'Z', KeyA: 'Q', KeyM: ',' };

// A guess from the browser's language: France and Belgium type on AZERTY. Canadian and Swiss
// French keyboards are QWERTY and QWERTZ, which label the bound keys as QWERTY does.
export function guessLayout(languages) {
  const [lang, region] = String((languages && languages[0]) || '').split('-').map((p) => p.toUpperCase());
  if (lang === 'FR' && region !== 'CA' && region !== 'CH') return 'azerty';
  if (lang === 'NL' && region === 'BE') return 'azerty';
  return 'qwerty';
}

const labels = {}; // code -> label, as far as it is known
let fallback = {};
const listeners = [];
let version = 0;

function defaultLabel(code) {
  if (fallback[code]) return fallback[code];
  return code.startsWith('Key') ? code.slice(3) : code;
}

// The label printed on the key bound to `action` (or on the physical key `code`).
export function keyLabel(actionOrCode) {
  const code = BINDINGS[actionOrCode] || actionOrCode;
  return labels[code] || defaultLabel(code);
}

// The four walking keys as the player sees them, e.g. "WASD" or "ZQSD".
export function moveKeysLabel() {
  return ['forward', 'left', 'back', 'right'].map(keyLabel).join('');
}

// Named labels for the text tables: "{moveKeys} move · {helpKey} help".
export function keyNames() {
  return {
    moveKeys: moveKeysLabel(),
    helpKey: keyLabel('help'),
    disciplineKey: keyLabel('discipline'),
    seatsKey: keyLabel('seats'),
    rollCallKey: keyLabel('rollCall'),
    pauseKey: keyLabel('pause'),
    muteKey: keyLabel('mute'),
  };
}

// Changes with every change of label, so text drawn from them can tell when to redraw.
export function keyLabelsVersion() {
  return version;
}

export function onKeyLabelsChange(fn) {
  listeners.push(fn);
}

function setLabel(code, label) {
  const upper = String(label).toUpperCase();
  if (!upper || labels[code] === upper) return false;
  labels[code] = upper;
  return true;
}

function changed() {
  version++;
  for (const fn of listeners) fn();
}

// A key press tells what that key is called: learn it when the browser couldn't say.
let fromLayoutMap = false;
export function learnFromKeyEvent(e) {
  if (fromLayoutMap || e.ctrlKey || e.metaKey || e.altKey) return;
  const code = e.code;
  if (!code || !Object.values(BINDINGS).includes(code)) return;
  const key = e.key;
  if (typeof key !== 'string' || key.length !== 1 || key === ' ') return;
  if (setLabel(code, key)) changed();
}

// Reads the keyboard layout where the browser offers it (Chrome, Edge), else guesses from the
// browser's language. Returns a promise that settles once the labels are known.
export function setupKeyLabels(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  fallback = guessLayout(nav.languages || [nav.language]) === 'azerty' ? AZERTY : {};
  changed();
  const kb = nav.keyboard;
  if (!kb || typeof kb.getLayoutMap !== 'function') return Promise.resolve();
  let request;
  try {
    request = Promise.resolve(kb.getLayoutMap());
  } catch {
    return Promise.resolve();
  }
  return request.then((map) => {
    let any = false;
    for (const code of Object.values(BINDINGS)) {
      const label = map && typeof map.get === 'function' ? map.get(code) : null;
      if (label) any = setLabel(code, label) || any;
    }
    fromLayoutMap = true;
    if (any) changed();
  }, () => { /* not allowed here (e.g. in a frame): keep the guess */ });
}

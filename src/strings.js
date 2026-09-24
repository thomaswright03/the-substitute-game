// Every piece of user-facing text in the game, in one table.
//
// Static page text is tagged in index.html with data-i18n="key" (textContent) or
// data-i18n-attr="attr:key;attr:key" and is filled from this table at start-up by
// applyStaticStrings(). Text built while playing goes through t(key, params).
// Translations live in src/i18n/ with exactly the same keys (a unit test checks this); to add
// one, add its table to LANGUAGES below.

import ES from './i18n/es.js';
import FR from './i18n/fr.js';
import { keyNames } from './keys.js';

const EN = {
  common: {
    listSeparator: ', ',
    listAnd: ' and ',
  },
  // keyed by each student's `pronoun` in data.js
  pronoun: {
    he: { possessive: 'his' },
    she: { possessive: 'her' },
  },
  boot: {
    loading: 'Chalking up the classroom…',
    loadingDetail: 'Loading the class ({percent}%)',
    loadingSlow: 'This is taking longer than usual. A slow connection can take a minute; it will keep trying.',
    noWebglTitle: 'Your browser can’t show 3D graphics',
    noWebglBody: 'The Substitute needs WebGL, which is turned off or unavailable in this browser. Try a recent version of Chrome, Firefox, Edge or Safari, and make sure hardware acceleration (graphics acceleration) is switched on in your browser settings.',
    fileTitle: 'Open the game through a local web server',
    fileBody: 'Browsers block a game opened straight from a file, so the classroom can’t load this way. In the game’s folder, run the command below, then open http://localhost:8000 in your browser.',
    fileCommand: 'npm start',
    loadFailTitle: 'The classroom couldn’t load',
    loadFailBody: 'Some of the game’s files didn’t arrive. Check your connection and try again.',
    retry: 'Try again',
    crashTitle: 'Something went wrong',
    crashBody: 'The game ran into a problem it can’t recover from. Reloading starts the class again.',
  },
  // written on the chalkboard at the front of the room
  board: {
    room: 'Room 204',
    motto: '3rd Period · Be Kind, Rewind',
  },
  hud: {
    clock: 'Bell Schedule',
    title: 'The Substitute',
    room: 'Rm 204 · 3rd Period',
    chaos: 'Chaos Level',
    pause: 'Pause',
    resume: 'Resume',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    canvas: 'The classroom, seen through the substitute teacher’s eyes',
    hintKeys: '{moveKeys} move · ←/→ or mouse turn · {helpKey} help · {disciplineKey} discipline · {seatsKey} seats · {rollCallKey} roll call · Esc pause',
  },
  start: {
    kicker: 'First Day Sub Plans',
    title: 'The Substitute',
    intro: 'Keep Room 204 in one piece until the bell at 9:50.',
    rules: [
      {
        lead: 'Take attendance first.',
        body: 'Pick up a name card at the chalkboard and hand it to that student. Every card must be handed out before the bell, or the period doesn’t count.',
      },
      {
        lead: 'The class won’t wait.',
        body: 'Students start acting up during attendance too. Walk over and help before their ring fills up. If anyone reaches 100%, you lose.',
      },
      {
        lead: 'Watch your back.',
        body: 'Face the board and someone may throw something: listen for the wind-up. A hit makes the thrower and the rest of the class rowdier. Turn around in time and you catch them.',
      },
      {
        lead: 'Split up friends.',
        body: 'Friends sitting side by side egg each other on and escalate 60% faster. Open the seating chart to swap seats.',
      },
      {
        lead: 'Discipline has a price.',
        body: 'Discipline only works on a student who is acting up. You get 2 detentions and 1 principal call per period, and a zap sets someone else off.',
      },
    ],
    controlsTitle: 'Controls',
    rulesTitle: 'How to play',
    best: 'Best grade',
    bestNone: '—',
    start: 'Start class',
  },
  controls: {
    keyboard: [
      ['{moveKeys} / ↑↓', 'walk'],
      ['←/→ or mouse', 'turn'],
      ['Shift+↑↓ or PgUp/PgDn', 'look up / down'],
      ['{helpKey}', 'help / pick up / give card'],
      ['{disciplineKey}', 'discipline'],
      ['{seatsKey}', 'seating chart'],
      ['{rollCallKey}', 'roll call'],
      ['1–4', 'choose in menus'],
      ['Esc / {pauseKey}', 'pause'],
      ['{muteKey}', 'sound on / off'],
    ],
    touch: [
      ['Left stick', 'walk'],
      ['Drag the view', 'look around'],
      ['Action button', 'help / pick up / give card'],
      ['Discipline', 'for a student acting up'],
      ['Seats', 'seating chart'],
      ['Roll call', 'ask who’s here'],
      ['Pause button', 'pause'],
      ['Pause screen', 'sound and volume'],
    ],
  },
  settings: {
    difficulty: 'Difficulty',
    relaxed: 'Relaxed',
    relaxedNote: 'A four-minute period and a calmer class',
    standard: 'Standard',
    standardNote: 'Two minutes, and they don’t wait',
    sound: 'Sound',
    volume: 'Volume',
    mute: 'Mute',
    language: 'Language',
    graphics: 'Graphics',
    // Automatic starts at High and steps down on a device that can't keep up
    quality: {
      auto: 'Automatic',
      autoNow: 'Automatic · {level}',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      veryLow: 'Very low',
      minimum: 'Minimum',
    },
  },
  pause: {
    kicker: 'Class Paused',
    title: 'Take a Breath',
    body: 'The clock and the kids are frozen. Resume whenever you’re ready.',
    resume: 'Resume',
    restart: 'Restart the period',
    menu: 'Back to menu',
  },
  // asked before a period in progress is thrown away
  confirm: {
    restartTitle: 'Restart the period?',
    restartBody: 'This period’s progress is lost and the clock goes back to 9:05.',
    restartYes: 'Restart',
    menuTitle: 'Leave this period?',
    menuBody: 'This period’s progress is lost. You go back to the menu, where you can change the difficulty.',
    menuYes: 'Leave the period',
    cancel: 'Keep this period',
  },
  end: {
    wonKicker: 'Bell Rings · 9:50',
    wonTitle: 'You Made It',
    lostHurtKicker: 'Incident Report',
    lostHurtTitle: 'Someone Got Hurt',
    lostLeftKicker: 'Student Missing',
    lostLeftTitle: 'A Student Left',
    lostAttendanceKicker: 'Bell Rings · 9:50',
    lostAttendanceTitle: 'Attendance Not Taken',
    lostAttendanceText: 'The bell rang with {count} {students} still unmarked. Without an attendance sheet, the office can’t count the period. Hand out every card before 9:50.',
    student: 'student',
    students: 'students',
    wonAllStayed: 'Every kid stayed in their seat and in one piece for the whole period.',
    wonRemoved: '{names} spent the rest of the period in the principal’s office. Everyone else made it through in one piece.',
    wonDetainedOne: '{name} served detention at {possessive} desk.',
    wonDetainedMany: '{names} served detention at their desks.',
    wonHits: 'You took {count} {hits} to the back of the head.',
    hit: 'hit',
    hits: 'hits',
    wonCoffee: 'Somewhere, a real teacher owes you a coffee.',
    grade: 'Sub report',
    gradeClean: 'A clean period. Nothing to deduct.',
    deduction: {
      hits: 'hit by thrown objects ×{count}: −{points}',
      detentions: 'detentions ×{count}: −{points}',
      principal: 'principal calls ×{count}: −{points}',
      zaps: 'zaps ×{count}: −{points}',
      closeCall: 'too close a call: −{points}',
    },
    statInterventions: 'Interventions',
    statChaos: 'Closest Call',
    statDetentions: 'Detentions',
    statPrincipal: 'Principal',
    statZaps: 'Zaps',
    statHits: 'Hits Taken',
    again: 'Sub again',
    menu: 'Back to menu',
    best: 'Best grade · {difficulty}',
    newBest: 'New personal best!',
    tipLabel: 'Tip:',
    // shown on a lost round: for running out of time, or for the kind of student who was lost
    tip: {
      attendance: 'Take a card every time you pass the board, and when you don’t know whose it is, ask with roll call ({rollCallKey}) instead of searching desk by desk.',
      attendanceTouch: 'Take a card every time you pass the board, and when you don’t know whose it is, ask with Roll call instead of searching desk by desk.',
      notes: 'The note-writer builds up slowly but never stops. One Help settles her; go before her ring turns red.',
      phone: 'The phone takes two presses of Help: a warning, then taking it. Press again before the warning wears off.',
      phoneTouch: 'The phone takes two taps of Help: a warning, then taking it. Tap again before the warning wears off.',
      plane: 'The plane-folder winds up faster than anyone. Help him as soon as his ring appears.',
      tip: 'The chair-tipper is quick, and quicker next to his friend. Swap seats to split them up.',
      argue: 'The arguer only listens in a pause: wait for the green glow around his ring, then help. Helping mid-rant makes it worse.',
      sleep: 'The sleeper builds up slowly, which makes her easy to forget. Look around the room between cards.',
      snack: 'The snacker builds up steadily. A quick Help settles her; don’t let her ring pass half while you carry a card.',
      spin: 'The spinner is quick, and quicker next to her friend. Swap seats to split them up.',
    },
  },
  attendance: {
    kicker: 'Taking Attendance',
    cardsLeft: '{count} name {cards} left on the board',
    card: 'card',
    cards: 'cards',
    goToBoard: 'Go to the chalkboard and pick up a name card. All cards must be handed out before the bell.',
    carrying: 'Carrying {name}’s card',
    findStudent: 'Find {name} and hand it over. Not sure who that is? Ask with roll call ({rollCallKey}).',
    findStudentTouch: 'Find {name} and hand it over. Not sure who that is? Ask with Roll call.',
    answered: '{name} answered from {where}: “{line}”',
  },
  where: {
    ahead: 'straight ahead',
    aheadLeft: 'ahead, to your left',
    aheadRight: 'ahead, to your right',
    left: 'your left',
    right: 'your right',
    behind: 'behind you',
    behindLeft: 'behind you, to the left',
    behindRight: 'behind you, to the right',
  },
  rollCall: {
    button: 'Is {name} here?',
    lines: [
      'Present and accounted for!',
      'Alive and unfortunately awake.',
      'Physically, yes. Mentally? Pending.',
      'Here, as always!',
      'In the building!',
      'Reporting for duty.',
      'I have materialized.',
      'Yep, over here!',
    ],
  },
  prompt: {
    pickUp: 'Pick up {name}’s card',
    give: 'Give {held}’s card to {name}',
    help: 'Help {name}',
    helpPhoneFirst: 'Tell {name} to put the phone away. It takes two presses: warn, then take it.',
    helpPhoneFirstTouch: 'Tell {name} to put the phone away. It takes two taps: warn, then take it.',
    helpPhoneSecond: 'Press again now to take {name}’s phone',
    helpPhoneSecondTouch: 'Tap Help again now to take {name}’s phone',
    helpArgueWait: '{name} is mid-rant. Wait for the green glow, then help.',
    helpArgueReady: '{name} paused. Help now!',
    discipline: 'Discipline {name}',
    calmStudent: '{name} is behaving',
    detainedStudent: '{name} is in detention',
    swapPick: 'Pick {name} to move',
    swapWith: 'Swap {first} with {name}',
    throwCue: 'Something’s coming. Turn around!',
    friendNear: 'egged on by {name}',
  },
  actions: {
    pickUp: 'Pick up card',
    give: 'Give card',
    help: 'Help',
    discipline: 'Discipline',
    seats: 'Seats',
    swap: 'Choose',
  },
  discipline: {
    kicker: 'Disciplinary Action',
    talk: 'Stern talking-to',
    talkNote: '−{calm}% escalation. Free, but may not fully settle them.',
    detention: 'Detention',
    detentionNote: 'Quiet for the rest of the period. The class grumbles (+{bump}% to others acting up). {left} of {max} left.',
    detentionNoneLeft: 'No detention slips left this period.',
    principal: 'Call the principal',
    principalNote: 'Removed from class; the room sobers up (−{calm}% to others). {left} of {max} left. Costs {points} report points.',
    principalNoneLeft: 'The principal has already been called this period.',
    zap: 'Zap with lightning',
    zapNote: 'Instant calm, but the commotion sets another student off. {cooldown}s cooldown.',
    zapCooling: 'Recharging: ready in {seconds}s.',
    cancel: 'Never mind (Esc)',
    cancelTouch: 'Never mind',
  },
  seating: {
    title: 'Seating chart',
    // the class isn't paused while the chart is open, and the chart says so
    live: 'The class keeps going while you plan: the clock is still running.',
    hint: 'Pick two students to swap their seats. Friends (same colour) sitting side by side egg each other on.',
    front: 'Front of the room · chalkboard',
    empty: 'Empty desk',
    together: 'next to friend',
    close: 'Done ({seatsKey})',
    closeTouch: 'Done',
    legend: 'Same colour = friends',
    picked: 'Now pick who swaps with {name}.',
  },
  log: {
    bell: 'The bell rings. Take attendance: the class is already restless.',
    cardPicked: 'You grab {name}’s name card from the board.',
    cardDelivered: '{name} takes the card. Marked present.',
    wrongStudent: '{name}: “That’s not my name.” Find {held} instead.',
    cardResolvedByOffice: 'The office marks {name} as present. One less card to deliver.',
    attendanceComplete: 'Attendance complete. Time to teach, and to keep an eye on them.',
    nearlyLost: '{name} is about to lose it!',
    eggedOn: '{name} and {friend} are egging each other on. Swap seats ({seatsKey}) to split them up.',
    eggedOnTouch: '{name} and {friend} are egging each other on. Swap seats (Seats) to split them up.',
    swap: '{a} and {b} swap seats.',
    swapSeparated: '{a} and {b} are split up. They’ll settle down faster now.',
    swapTogether: 'Careful: {a} and {b} are friends, and now they sit side by side.',
    moveToEmpty: '{a} moves to the empty desk.',
    helpMissed: '{name} argues back even harder! Wait for the pause.',
    talk: 'A stern talking-to. {name} settles down.',
    talkPartial: 'A stern talking-to. {name} settles down… some.',
    detention: '{name} gets detention and goes quiet. The class grumbles about it.',
    principal: '*knock knock*: the principal steps in for {name}.',
    principalDone: '{name} gets marched out by the principal. The room goes quiet.',
    principalDelayed: 'The principal is on the way…',
    principalNoShow: 'The principal is held up in the office, so {name} walks down there alone.',
    zap: 'You zap {name} with a bolt of lightning. Attitude: adjusted.',
    zapSetOff: 'The commotion sets {name} off!',
    throwWindup: '{name} winds up while your back is turned…',
    throwCancelled: '{name} thinks better of it.',
    hit: 'Thwack! {name} hits you in the back of the head. The class laughs: {name} and everyone acting up get rowdier.',
    hitFirst: 'Getting hit costs you: the thrower escalates and the whole class gets bolder. Turn around when you hear a wind-up.',
    caught: 'Caught! You turn just in time to catch {name} red-handed.',
    notEligible: '{name} isn’t acting up. You can only discipline a student who is.',
    detainedAlready: '{name} is already in detention.',
  },
  students: {
    dixieNormous: {
      active: 'Dixie Normous starts scribbling a secret note…',
      calm: 'You catch Dixie Normous mid-fold. She puts the note away.',
      fail: 'Dixie Normous bursts into tears over the note and bolts for the bathroom.',
    },
    benDover: {
      active: 'Ben Dover’s phone lights up under the desk.',
      warn: '“Phone away, Ben Dover.” He hesitates, thumb still on the screen.',
      calm: 'Ben Dover finally pockets the phone.',
      fail: 'Ben Dover slips out to take the call in the hallway.',
    },
    moeLester: {
      active: 'Moe Lester folds a suspiciously aerodynamic paper triangle.',
      calm: 'You confiscate Moe Lester’s plane before liftoff.',
      fail: 'Moe Lester’s paper airplane hits a classmate right in the eye!',
    },
    steve: {
      active: 'Steve leans back on two chair legs, grinning at the class.',
      calm: '“Four legs, please.” Steve settles his chair down.',
      fail: 'Steve tips too far back and cracks his head on the floor!',
    },
    hughJass: {
      active: 'Hugh Jass raises a hand: “Actually, that’s not even right—”',
      calm: 'Hugh Jass actually hears you out. Progress.',
      fail: 'Hugh Jass slams his book shut (“I don’t need this class!”) and storms out.',
    },
    mikeHunt: {
      active: 'Mike Hunt’s eyelids are getting heavy…',
      calm: 'A gentle nudge, and Mike Hunt snaps back awake.',
      fail: 'Mike Hunt sleepwalks straight out the door, looking for the nurse’s office.',
    },
    gabeIches: {
      active: 'Gabe Iches unwraps something suspiciously crinkly.',
      calm: 'Gabe Iches’s wrapper disappears into her desk.',
      fail: 'Gabe Iches makes a break for the vending machine before you can stop her.',
    },
    mikeOxlong: {
      active: 'Mike Oxlong gives her chair a slow, testing spin.',
      calm: 'Mike Oxlong stops spinning and plants her feet on the floor.',
      fail: 'Mike Oxlong spins one too many times and crashes into the bookshelf!',
    },
  },
};

/** @typedef {Record<string, unknown>} StringTable a table of text, nested by key */
/** @typedef {Record<string, string | number>} Params values for a text's {placeholders} */

// Each language is listed under its own name, so a player can find theirs in any language.
/** @type {Record<string, {name: string, table: StringTable}>} */
export const LANGUAGES = {
  en: { name: 'English', table: EN },
  es: { name: 'Español', table: ES },
  fr: { name: 'Français', table: FR },
};

/** @type {StringTable} */
let table = EN;
let language = 'en';
let touch = false;
/** @type {((code: string) => void)[]} */
const languageListeners = [];

/**
 * Replaces the table the text comes from (the tests use this to check for text that isn't in it).
 * @param {StringTable | null} next
 */
export function setStrings(next) {
  table = next || EN;
}

export function currentLanguage() {
  return language;
}

/**
 * Switches every string to another language and tells the page and the modules that draw text.
 * @param {string} code
 */
export function setLanguage(code) {
  if (!LANGUAGES[code]) code = 'en';
  language = code;
  table = LANGUAGES[code].table;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    applyStaticStrings(document);
  }
  for (const fn of languageListeners) fn(code);
}

/** @param {(code: string) => void} fn */
export function onLanguageChange(fn) {
  languageListeners.push(fn);
}

// On touch screens a key with a sibling named <key>Touch uses that text instead, so nothing
// tells a phone player to press a key they do not have.
/** @param {boolean} on */
export function setTouchStrings(on) {
  touch = !!on;
}

/** @param {string} key */
function variant(key) {
  if (touch) {
    const v = lookup(key + 'Touch');
    if (v !== undefined) return v;
  }
  return lookup(key);
}

/**
 * @param {string} key
 * @returns {unknown} whatever the table holds there (text, a list, a group), or undefined
 */
export function lookup(key) {
  /** @type {unknown} */
  let node = table;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object' || !(part in node)) return undefined;
    node = /** @type {Record<string, unknown>} */ (node)[part];
  }
  return node;
}

// Fills {placeholders} from `params`, and the keyboard's own key names ({helpKey},
// {moveKeys}...; see keys.js) wherever they appear.
/**
 * @param {string} text
 * @param {Params} [params]
 */
export function fill(text, params) {
  if (text.indexOf('{') < 0) return text;
  /** @type {Record<string, string> | null} */
  let keys = null;
  return text.replace(/\{(\w+)\}/g, (m, name) => {
    if (params && name in params) return String(params[name]);
    keys = keys || keyNames();
    return name in keys ? keys[name] : m;
  });
}

// t('attendance.carrying', {name:'Mike Oxlong'}) -> "Carrying Mike Oxlong’s card".
// A missing key is returned as-is so a gap in a translation is visible, not silent.
/**
 * @param {string} key
 * @param {Params} [params]
 */
export function t(key, params) {
  const value = variant(key);
  if (typeof value !== 'string') return key;
  return fill(value, params);
}

/**
 * @param {number} count
 * @param {string} singularKey
 * @param {string} pluralKey
 */
export function plural(count, singularKey, pluralKey) {
  return t(count === 1 ? singularKey : pluralKey);
}

// Joins names as "A", "A and B", "A, B and C".
/** @param {string[]} names */
export function listNames(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(t('common.listSeparator')) + t('common.listAnd') + names[names.length - 1];
}

/** @param {ParentNode} root */
export function applyStaticStrings(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = variant(el.getAttribute('data-i18n') || '');
    if (typeof value === 'string') el.textContent = fill(value);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of (el.getAttribute('data-i18n-attr') || '').split(';')) {
      const [attr, key] = pair.split(':');
      const value = variant(key);
      if (attr && typeof value === 'string') el.setAttribute(attr, fill(value));
    }
  });
}

export const ENGLISH = EN;

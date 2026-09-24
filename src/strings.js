// Every piece of user-facing text in the game, in one table.
//
// Static page text is tagged in index.html with data-i18n="key" (textContent) or
// data-i18n-attr="attr:key;attr:key" and is filled from this table at start-up by
// applyStaticStrings(). Text built while playing goes through t(key, params).
// To translate the game, provide another table with the same keys and pass it to setStrings().

const EN = {
  meta: {
    title: 'The Substitute',
  },
  common: {
    listSeparator: ', ',
    listAnd: ' and ',
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
    hintKeys: 'WASD move · ←/→ or mouse turn · E help · F discipline · R seats · Q roll call · Esc pause',
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
        body: 'Face the board and someone may throw something. A hit makes the thrower and the rest of the class rowdier. Turn around in time and you catch them.',
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
    best: 'Best grade',
    bestNone: '—',
    start: 'Start class',
  },
  controls: {
    keyboard: [
      ['WASD / ↑↓', 'walk'],
      ['←/→ or mouse', 'turn'],
      ['E', 'help / pick up / give card'],
      ['F', 'discipline'],
      ['R', 'seating chart'],
      ['Q', 'roll call'],
      ['1–4', 'choose in menus'],
      ['Esc / P', 'pause'],
    ],
    touch: [
      ['Left stick', 'walk'],
      ['Drag the view', 'look around'],
      ['Action button', 'help / pick up / give card'],
      ['Discipline', 'for a student acting up'],
      ['Seats', 'seating chart'],
      ['Roll call', 'ask who’s here'],
      ['Pause button', 'pause'],
    ],
  },
  pause: {
    kicker: 'Class Paused',
    title: 'Take a Breath',
    body: 'The clock and the kids are frozen. Resume whenever you’re ready.',
    resume: 'Resume',
    restart: 'Restart the period',
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
    wonDetained: '{names} served detention at their desk.',
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
  },
  attendance: {
    kicker: 'Taking Attendance',
    cardsLeft: '{count} name {cards} left on the board',
    card: 'card',
    cards: 'cards',
    goToBoard: 'Go to the chalkboard and pick up a name card. All cards must be handed out before the bell.',
    carrying: 'Carrying {name}’s card',
    findStudent: 'Find {name} and hand it over. Not sure who that is? Ask with roll call.',
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
    helpPhoneSecond: 'Press again now to take {name}’s phone',
    helpArgueWait: '{name} is mid-rant. Wait for the green glow, then help.',
    helpArgueReady: '{name} paused. Help now!',
    discipline: 'Discipline {name}',
    calmStudent: '{name} is behaving',
    detainedStudent: '{name} is in detention',
    swapPick: 'Pick {name} to move',
    swapWith: 'Swap {first} with {name}',
    keyE: 'E',
    keyF: 'F',
    throwCue: 'Something’s coming. Turn around!',
    friendNear: 'egged on by {name}',
  },
  actions: {
    pickUp: 'Pick up card',
    give: 'Give card',
    help: 'Help',
    discipline: 'Discipline',
    seats: 'Seats',
    rollCall: 'Roll call',
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
    notEligibleCalm: '{name} isn’t acting up, so there’s nothing to discipline.',
    notEligibleDetained: '{name} is already in detention.',
  },
  seating: {
    title: 'Seating chart',
    hint: 'Pick two students to swap their seats. Friends (same colour) sitting side by side egg each other on.',
    front: 'Front of the room · chalkboard',
    empty: 'Empty desk',
    together: 'next to friend',
    close: 'Done (R)',
    picked: 'Now pick who swaps with {name}.',
    banner: 'Seating chart open: aim at a student and press E, or use the chart.',
  },
  log: {
    bell: 'The bell rings. Take attendance: the class is already restless.',
    cardPicked: 'You grab {name}’s name card from the board.',
    cardDelivered: '{name} takes the card. Marked present.',
    wrongStudent: '{name}: “That’s not my name.” Find {held} instead.',
    cardResolvedByOffice: 'The office marks {name} as present. One less card to deliver.',
    attendanceComplete: 'Attendance complete. Time to teach, and to keep an eye on them.',
    nearlyLost: '{name} is about to lose it!',
    eggedOn: '{name} and {friend} are egging each other on. Swap seats (R) to split them up.',
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
      calm: 'Mike Oxlong plants all four wheels back on the floor.',
      fail: 'Mike Oxlong spins one too many times and crashes into the bookshelf!',
    },
  },
};

let table = EN;

export function setStrings(next) {
  table = next || EN;
}

export function getStrings() {
  return table;
}

export function lookup(key) {
  let node = table;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

// t('attendance.carrying', {name:'Mike Oxlong'}) -> "Carrying Mike Oxlong’s card".
// A missing key is returned as-is so a gap in a translation is visible, not silent.
export function t(key, params) {
  const value = lookup(key);
  if (typeof value !== 'string') return key;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

export function plural(count, singularKey, pluralKey) {
  return t(count === 1 ? singularKey : pluralKey);
}

// Joins names as "A", "A and B", "A, B and C".
export function listNames(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(t('common.listSeparator')) + t('common.listAnd') + names[names.length - 1];
}

export function applyStaticStrings(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = lookup(el.getAttribute('data-i18n'));
    if (typeof value === 'string') el.textContent = value;
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
      const [attr, key] = pair.split(':');
      const value = lookup(key);
      if (attr && typeof value === 'string') el.setAttribute(attr, value);
    }
  });
}

export const ENGLISH = EN;

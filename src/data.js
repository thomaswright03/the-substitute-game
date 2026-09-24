// Static game data: the class roster, seating, and every tuning number the rules use.
// Nothing in here touches the DOM or three.js, so the rules can be unit-tested in Node.

// Seats are a 2 x 4 grid. Row 0 is the front row (nearest the chalkboard).
// Two students are "next to each other" when they share a row and their columns differ by one.
//
// `friend` names another student's id. Friends seated next to each other egg each other on
// (see TUNING.friendBoost). The starting chart deliberately seats three pairs of friends
// together, so reassigning seats is worth the player's time.

/** @typedef {'notes' | 'phone' | 'plane' | 'tip' | 'argue' | 'sleep' | 'snack' | 'spin'} Behaviour */

/**
 * One student in the roster.
 * @typedef {object} StudentConfig
 * @property {string} id
 * @property {string} name the name shown in the game
 * @property {'he' | 'she'} pronoun
 * @property {string} model the character file in assets/characters/ (without .glb)
 * @property {Behaviour} type how they act up
 * @property {number} rate escalation per second while acting up, in percent
 * @property {'LEAVE' | 'HURT'} fail what happens when they reach 100%
 * @property {number} row the seat they start in
 * @property {number} col
 * @property {string | null} friend the id of the friend who eggs them on, if any
 */

/** @type {StudentConfig[]} */
export const STUDENTS = [
  {
    id: 'dixieNormous', name: 'Dixie Normous', pronoun: 'she', model: 'suit-woman',
    type: 'notes', rate: 4.0, fail: 'LEAVE', row: 0, col: 0, friend: 'benDover',
  },
  {
    id: 'benDover', name: 'Ben Dover', pronoun: 'he', model: 'casual-man',
    type: 'phone', rate: 5.2, fail: 'LEAVE', row: 0, col: 1, friend: 'dixieNormous',
  },
  {
    id: 'moeLester', name: 'Moe Lester', pronoun: 'he', model: 'hoodie-man',
    type: 'plane', rate: 7.4, fail: 'HURT', row: 0, col: 2, friend: 'steve',
  },
  {
    id: 'steve', name: 'Steve', pronoun: 'he', model: 'worker-man',
    type: 'tip', rate: 6.3, fail: 'HURT', row: 0, col: 3, friend: 'moeLester',
  },
  {
    id: 'hughJass', name: 'Hugh Jass', pronoun: 'he', model: 'punk-man',
    type: 'argue', rate: 4.6, fail: 'LEAVE', row: 1, col: 0, friend: null,
  },
  {
    id: 'mikeHunt', name: 'Mike Hunt', pronoun: 'she', model: 'worker-woman',
    type: 'sleep', rate: 2.6, fail: 'LEAVE', row: 1, col: 1, friend: null,
  },
  {
    id: 'gabeIches', name: 'Gabe Iches', pronoun: 'she', model: 'punk-woman',
    type: 'snack', rate: 3.8, fail: 'LEAVE', row: 1, col: 2, friend: 'mikeOxlong',
  },
  {
    id: 'mikeOxlong', name: 'Mike Oxlong', pronoun: 'she', model: 'casual-woman',
    type: 'spin', rate: 6.7, fail: 'HURT', row: 1, col: 3, friend: 'gabeIches',
  },
];

export const PRINCIPAL_MODEL = 'business-man';

// The room's floor plan in metres (the chalkboard is at frontZ), shared by the 3D scene and the
// simulated player in the balance tests.
export const ROOM = {
  halfWidth: 4.6,
  frontZ: -6.2,
  backZ: 6.2,
  height: 3.15,
  colsX: [-2.6, -0.87, 0.87, 2.6],
  rowsZ: [-3.0, -0.75],
  doorX: -2.6,
};

// The teacher walks at this speed (m/s) and starts each period at the back of the room.
export const TEACHER = { speed: 3.1, startZ: ROOM.backZ - 1.7 };

// Difficulty presets, applied over TUNING. Standard is the two-minute period the game was
// designed around. The balance tests show that a player a little slower than the simulated
// first-timer (slower to react, to aim and to find each card's owner) loses almost every
// Standard period, mostly by running out of time for attendance; Relaxed doubles the period and
// calms the class so that player wins most rounds. It also starts gently, for a player still
// learning the controls: the first student acts up later, and until the first name card is
// handed out nobody throws anything and nobody sitting next to a friend starts (a friend beside
// them makes them escalate 60% faster). See test/unit/balance.test.js.
/** @typedef {'relaxed' | 'standard'} Difficulty */
/** @type {Record<Difficulty, Partial<Tuning>>} */
export const DIFFICULTY = {
  relaxed: {
    period: 240,
    firstSpawnDelay: 15,
    gentleStart: true,
    rateScale: 0.7,
    attendanceRateScale: 0.5,
    throwChanceAttendance: 0.08,
    throwChanceLesson: 0.15,
  },
  standard: {},
};
/** @type {Difficulty} */
export const DEFAULT_DIFFICULTY = 'relaxed';

/**
 * @param {unknown} value
 * @returns {value is Difficulty}
 */
export function isDifficulty(value) {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTY, value);
}

/** @type {Record<Behaviour, string>} */
export const ICON = {
  notes: '📝', phone: '📱', plane: '✈️', tip: '🪑', argue: '💬', sleep: '💤', snack: '🍪', spin: '🌀',
};

/** @typedef {typeof TUNING} Tuning */
export const TUNING = {
  // One class period, in seconds of unpaused real time (shown as 9:05 -> 9:50).
  period: 120,

  // Misbehaviour spawning. The interval shrinks as the period goes on.
  firstSpawnDelay: 7,
  // true: until the first card is handed out, nobody throws and no one sitting next to a friend
  // starts acting up (by the spawn timer or a zap's commotion)
  gentleStart: false,
  spawnIntervalStart: 13,
  spawnIntervalShrink: 8.5,
  // While attendance is still being taken the class is still settling in: students act up
  // less often and escalate more slowly, but they do act up.
  attendanceSpawnScale: 1.35,
  attendanceRateScale: 0.7,

  // Multiplies every student's escalation rate (the relaxed difficulty lowers it).
  rateScale: 1,

  // Escalation thresholds (percent).
  warnAt: 80,
  failAt: 100,

  // How the HUD shows escalation (percent): each student's ring and the chaos meter turn yellow
  // at `warning` and red at `danger`, where the ring also shakes and so does the student.
  hud: {
    warning: 40,
    danger: 75,
  },

  // A misbehaving student escalates this many times faster while their friend sits next to them.
  friendBoost: 1.6,

  // E / "Help": the teacherly response. Free and unlimited.
  helpCalm: 45,
  phoneWarnCalm: 14,
  phoneWarnWindow: 2.6,
  argueCycle: 3.0,
  argueReadyWindow: 0.95,
  argueCalm: 55,
  argueMissPenalty: 10,
  helpRepeatGuard: 0.28,

  // Discipline menu (F). Only for a student who is acting up, or who was just caught throwing.
  talkCalm: 50,
  detentionsPerPeriod: 2,
  detentionClassBump: 10,
  principalCallsPerPeriod: 1,
  principalClassCalm: 20,
  zapCooldown: 20,
  zapCommotionEscalation: 15,

  // Thrown objects: only while the teacher faces the board.
  throwChanceAttendance: 0.18,
  throwChanceLesson: 0.28,
  throwWindup: 0.8,
  throwFlight: 0.6,
  hitThrowerBump: 20,
  hitClassBump: 8,
  caughtWindow: 6,

  // End-of-period report card for a round that reaches the bell: points off 100 for each of
  // these, and the lowest score that earns each grade (below C is a D).
  report: {
    hit: 4,
    detention: 5,
    principal: 15,
    zap: 10,
    closeCall: 5, // the period's closest call reached closeCallAt
    closeCallAt: 75,
    veryCloseCall: 10, // the period's closest call reached veryCloseCallAt
    veryCloseCallAt: 90,
    grades: { A: 90, B: 80, C: 70 },
  },
};

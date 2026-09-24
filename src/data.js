// Static game data: the class roster, seating, and every tuning number the rules use.
// Nothing in here touches the DOM or three.js, so the rules can be unit-tested in Node.

// Seats are a 2 x 4 grid. Row 0 is the front row (nearest the chalkboard).
// Two students are "next to each other" when they share a row and their columns differ by one.
//
// `friend` names another student's id. Friends seated next to each other egg each other on
// (see TUNING.friendBoost). The starting chart deliberately seats three pairs of friends
// together, so reassigning seats is worth the player's time.
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

export const ICON = {
  notes: '📝', phone: '📱', plane: '✈️', tip: '🪑', argue: '💬', sleep: '💤', snack: '🍪', spin: '🌀',
};

export const TUNING = {
  // One class period, in seconds of unpaused real time (shown as 9:05 -> 9:50).
  period: 120,

  // Misbehaviour spawning. The interval shrinks as the period goes on.
  firstSpawnDelay: 7,
  spawnIntervalStart: 13,
  spawnIntervalShrink: 8.5,
  // While attendance is still being taken the class is still settling in: students act up
  // less often and escalate more slowly, but they do act up.
  attendanceSpawnScale: 1.35,
  attendanceRateScale: 0.7,

  // Escalation thresholds (percent).
  warnAt: 80,
  failAt: 100,

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

  // End-of-period report card for a round that reaches the bell.
  report: {
    hit: 4,
    detention: 5,
    principal: 15,
    zap: 10,
    closeCall: 5, // closest call at or above 75%
    veryCloseCall: 10, // closest call at or above 90%
  },
};

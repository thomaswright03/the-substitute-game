// The state of the current session that the UI modules share. The rules' own state lives in
// `S.game` (see rules.js); everything else here is about what is on screen.
import { DEFAULT_DIFFICULTY, STUDENTS } from './data.js';
import { createGame } from './rules.js';

/**
 * The latest roll-call answer, and where its bubble was last drawn.
 * @typedef {object} Speech
 * @property {string} id who answered
 * @property {number} until game time the answer shows until
 * @property {number} line which of the roll-call lines they said
 * @property {string} where the key of the text saying where the voice came from
 * @property {string} answer the sentence the attendance panel shows, in the current language
 * @property {number} [bw] the bubble's size, measured the first frame it shows
 * @property {number} [bh]
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [tail]
 */

/**
 * The principal's visit to collect a student.
 * @typedef {object} PrincipalVisit
 * @property {string} id the student he collects
 * @property {'waiting' | 'walkIn' | 'grab' | 'dragOut'} phase
 * @property {number} t seconds into this phase
 * @property {number} startX where the student sat
 * @property {number} startZ
 */

/** @typedef {{mesh: import('three').Mesh, from: import('three').Vector3}} Projectile */

export const S = {
  // the current round (on the start screen, the fresh one the next period starts from)
  game: createGame({ difficulty: DEFAULT_DIFFICULTY }),
  running: false, // a round is being played (false on the start and end screens)
  paused: false,
  seatChartOpen: false,
  /** @type {string | null} the student picked first in the seating chart */
  seatFirst: null,
  /** @type {string | null} the student the discipline menu is open for */
  disciplineTarget: null,
  /** @type {PrincipalVisit | null} the principal's walk, while it plays */
  principalSeq: null,
  /** @type {Projectile | null} */
  projectile: null,
  /** @type {Speech | null} the latest roll-call answer */
  speech: null,
  /** @type {{studentId: string | null, cardId: string | null}} what the teacher is aiming at */
  aim: { studentId: null, cardId: null },
  isTouch: false,
  /** @type {string | null} */
  lastBestGrade: null,
};

export const TEST_MODE = new URLSearchParams(window.location.search).has('test');

// The class is frozen while a menu or the principal's visit is on screen.
export function frozen() {
  return S.paused || S.disciplineTarget !== null || S.principalSeq !== null;
}

/**
 * Students are always called by their full name: two of them share a first name.
 * @param {string} id
 */
export function name(id) {
  const s = STUDENTS.find((x) => x.id === id);
  return s ? s.name : id;
}

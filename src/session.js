// The state of the current session that the UI modules share. The rules' own state lives in
// `S.game` (see rules.js); everything else here is about what is on screen.
import { STUDENTS } from './data.js';

export const S = {
  game: null, // the current round, from rules.createGame()
  running: false, // a round is being played (false on the start and end screens)
  paused: false,
  seatChartOpen: false,
  seatFirst: null, // the student picked first in the seating chart
  disciplineTarget: null, // the student the discipline menu is open for
  principalSeq: null, // the principal's walk, while it plays
  projectile: null,
  speech: null, // the latest roll-call answer: {id, until, answer}
  aim: { studentId: null, cardId: null },
  isTouch: false,
  lastBestGrade: null,
};

export const TEST_MODE = new URLSearchParams(window.location.search).has('test');

// The class is frozen while a menu or the principal's visit is on screen.
export function frozen() {
  return S.paused || S.disciplineTarget !== null || S.principalSeq !== null;
}

// Students are always called by their full name: two of them share a first name.
export function name(id) {
  const s = STUDENTS.find((x) => x.id === id);
  return s ? s.name : id;
}

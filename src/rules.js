// The rules of a class period, independent of rendering and input.
//
// A game is a plain object created by createGame(). The UI calls tick() once per frame with
// the unpaused real time that passed, plus the player's action functions (pickupCard, help,
// discipline, ...). The rules never produce text: they push semantic events onto
// game.events, which the UI drains and turns into log lines, sounds and effects.
import { DIFFICULTY, STUDENTS, TUNING } from './data.js';

export const DISCIPLINE_OPTIONS = ['talk', 'detention', 'principal', 'zap'];

export function createGame(options = {}) {
  const roster = options.students || STUDENTS;
  const difficulty = DIFFICULTY[options.difficulty] ? options.difficulty : 'standard';
  const tuning = { ...TUNING, ...DIFFICULTY[difficulty], ...(options.tuning || {}) };
  const game = {
    roster,
    tuning,
    difficulty,
    rng: options.rng || Math.random,
    phase: 'attendance', // 'attendance' -> 'lesson' -> 'over'
    outcome: null, // set when phase becomes 'over'
    elapsed: 0,
    spawnTimer: tuning.firstSpawnDelay,
    seats: {},
    students: {},
    attendance: {
      remaining: roster.map((s) => s.id),
      holding: null,
      delivered: 0,
      asked: false,
    },
    counters: {
      helps: 0, talks: 0, detentions: 0, principalCalls: 0, zaps: 0, hits: 0, catches: 0,
    },
    zapReadyAt: 0,
    throw: null,
    maxChaos: 0,
    events: [],
  };
  for (const s of roster) {
    game.seats[s.id] = { row: s.row, col: s.col };
    game.students[s.id] = {
      escalation: 0,
      active: false,
      detained: false,
      removed: false,
      activatedAt: 0,
      warnedUntil: -1,
      warnedHigh: false,
      caughtUntil: -1,
      lastHelpAt: -Infinity,
      eggedOnNoted: false,
    };
  }
  return game;
}

/* ---------------- queries ---------------- */

export function studentConfig(game, id) {
  for (const s of game.roster) if (s.id === id) return s;
  return null;
}

// Present in the room and free to misbehave (not in detention, not marched out).
export function canMisbehave(game, id) {
  const st = game.students[id];
  return !!st && !st.removed && !st.detained;
}

export function seatNeighbours(game, id) {
  const seat = game.seats[id];
  return game.roster
    .map((s) => s.id)
    .filter((other) => {
      if (other === id || game.students[other].removed) return false;
      const o = game.seats[other];
      return o.row === seat.row && Math.abs(o.col - seat.col) === 1;
    });
}

// The friend sitting right next to this student, if they are in a position to egg them on.
export function adjacentFriend(game, id) {
  const cfg = studentConfig(game, id);
  if (!cfg || !cfg.friend || !canMisbehave(game, cfg.friend)) return null;
  return seatNeighbours(game, id).includes(cfg.friend) ? cfg.friend : null;
}

// Escalation per second for an acting-up student under the current conditions.
export function escalationRate(game, id) {
  const cfg = studentConfig(game, id);
  const t = game.tuning;
  let rate = cfg.rate * t.rateScale;
  if (game.phase === 'attendance') rate *= t.attendanceRateScale;
  if (adjacentFriend(game, id)) rate *= t.friendBoost;
  return rate;
}

export function spawnInterval(game) {
  const t = game.tuning;
  const frac = game.elapsed / t.period;
  const base = t.spawnIntervalStart - frac * t.spawnIntervalShrink;
  return game.phase === 'attendance' ? base * t.attendanceSpawnScale : base;
}

export function chaos(game) {
  let max = 0;
  for (const s of game.roster) {
    const st = game.students[s.id];
    if (st.active && canMisbehave(game, s.id)) max = Math.max(max, st.escalation);
  }
  return Math.min(100, max);
}

// The arguing student can only be talked down while he pauses for breath.
export function argueReady(game, id) {
  const st = game.students[id];
  const t = game.tuning;
  const since = game.elapsed - st.activatedAt;
  return since % t.argueCycle < t.argueReadyWindow;
}

export function timeUntilArgueReady(game, id) {
  const st = game.students[id];
  const t = game.tuning;
  const phase = (game.elapsed - st.activatedAt) % t.argueCycle;
  return phase < t.argueReadyWindow ? 0 : t.argueCycle - phase;
}

export function phoneWarned(game, id) {
  return game.elapsed < game.students[id].warnedUntil;
}

/* ---------------- internal helpers ---------------- */

function emit(game, type, data = {}) {
  game.events.push({ type, t: game.elapsed, ...data });
}

function activate(game, id, escalation = 0) {
  const st = game.students[id];
  st.active = true;
  st.escalation = escalation;
  st.activatedAt = game.elapsed;
  st.warnedUntil = -1;
  st.warnedHigh = false;
  st.eggedOnNoted = false;
  emit(game, 'activate', { id });
}

function calm(game, id) {
  const st = game.students[id];
  st.active = false;
  st.escalation = 0;
  st.warnedUntil = -1;
  st.warnedHigh = false;
}

function finish(game, outcome) {
  if (game.phase === 'over') return;
  // a student reaching 100% ends the tick before the usual update, so record the peak here
  game.maxChaos = Math.max(game.maxChaos, chaos(game));
  game.phase = 'over';
  game.outcome = outcome;
  game.throw = null;
  emit(game, 'over', { outcome });
}

function changeEscalation(game, id, delta) {
  const st = game.students[id];
  st.escalation = Math.max(0, st.escalation + delta);
  if (st.active && st.escalation <= 0) calm(game, id);
  checkFail(game, id);
}

function checkFail(game, id) {
  const st = game.students[id];
  if (game.phase === 'over' || !st.active) return;
  if (!st.warnedHigh && st.escalation >= game.tuning.warnAt) {
    st.warnedHigh = true;
    emit(game, 'nearlyLost', { id });
  }
  if (st.escalation >= game.tuning.failAt) {
    st.escalation = game.tuning.failAt;
    finish(game, { won: false, reason: 'student', culpritId: id });
  }
}

function bumpOthers(game, exceptId, delta) {
  for (const s of game.roster) {
    if (s.id === exceptId || !canMisbehave(game, s.id)) continue;
    if (game.students[s.id].active) changeEscalation(game, s.id, delta);
  }
}

function pick(game, list) {
  return list[Math.floor(game.rng() * list.length)];
}

function calmPool(game) {
  const pool = game.roster.filter((s) => canMisbehave(game, s.id) && !game.students[s.id].active);
  if (game.tuning.gentleStart && game.attendance.delivered === 0) return pool.filter((s) => !adjacentFriend(game, s.id));
  return pool;
}

function completeAttendanceIfDone(game) {
  if (game.phase === 'attendance' && game.attendance.delivered >= game.roster.length) {
    game.phase = 'lesson';
    game.spawnTimer = Math.min(game.spawnTimer, spawnInterval(game));
    emit(game, 'attendanceComplete');
  }
}

/* ---------------- the clock ---------------- */

// view.facingBoard: the teacher is at the chalkboard with their back to the class.
export function tick(game, dt, view = {}) {
  if (game.phase === 'over' || !(dt > 0)) return;
  const t = game.tuning;
  game.elapsed = Math.min(t.period, game.elapsed + dt);

  // misbehaviour starts on its own timer, during attendance as well as the lesson
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    const pool = calmPool(game);
    if (pool.length) activate(game, pick(game, pool).id);
    game.spawnTimer = spawnInterval(game);
  }

  for (const s of game.roster) {
    const st = game.students[s.id];
    if (!st.active || !canMisbehave(game, s.id)) continue;
    const friend = adjacentFriend(game, s.id);
    if (friend && !st.eggedOnNoted) {
      st.eggedOnNoted = true;
      // one message for the pair, even when both of them are acting up
      if (game.students[friend].active) game.students[friend].eggedOnNoted = true;
      emit(game, 'eggedOn', { id: s.id, friendId: friend });
    }
    st.escalation += escalationRate(game, s.id) * dt;
    checkFail(game, s.id);
    if (game.phase === 'over') return;
  }

  updateThrow(game, dt, !!view.facingBoard);
  if (game.phase === 'over') return;

  game.maxChaos = Math.max(game.maxChaos, chaos(game));

  if (game.elapsed >= t.period) {
    if (game.phase === 'attendance') {
      finish(game, { won: false, reason: 'attendance', unmarked: game.roster.length - game.attendance.delivered });
    } else {
      finish(game, { won: true, reason: 'bell' });
    }
  }
}

/* ---------------- attendance ---------------- */

export function pickupCard(game, id) {
  const a = game.attendance;
  if (game.phase !== 'attendance' || a.holding || !a.remaining.includes(id)) return false;
  a.remaining.splice(a.remaining.indexOf(id), 1);
  a.holding = id;
  a.asked = false;
  emit(game, 'cardPicked', { id });
  return true;
}

// Returns 'delivered', 'wrong' or null when there is nothing to deliver.
export function deliverCard(game, targetId) {
  const a = game.attendance;
  if (game.phase !== 'attendance' || !a.holding || game.students[targetId].removed) return null;
  const heldId = a.holding;
  if (targetId !== heldId) {
    emit(game, 'wrongStudent', { id: targetId, heldId });
    return 'wrong';
  }
  a.holding = null;
  a.delivered++;
  emit(game, 'cardDelivered', { id: heldId });
  completeAttendanceIfDone(game);
  return 'delivered';
}

export function canRollCall(game) {
  const a = game.attendance;
  return game.phase === 'attendance' && !!a.holding && !a.asked;
}

// Asks "Is <name> present?" once per card. Returns the id of the student who answers.
export function rollCall(game) {
  if (!canRollCall(game)) return null;
  game.attendance.asked = true;
  emit(game, 'rollCall', { id: game.attendance.holding });
  return game.attendance.holding;
}

// A student marched out by the principal can't take their card, so the office marks them.
function resolveAttendanceForRemoved(game, id) {
  const a = game.attendance;
  if (game.phase !== 'attendance') return;
  if (a.holding === id) {
    a.holding = null;
    a.delivered++;
  } else if (a.remaining.includes(id)) {
    a.remaining.splice(a.remaining.indexOf(id), 1);
    a.delivered++;
  } else {
    return;
  }
  emit(game, 'cardResolvedByOffice', { id });
  completeAttendanceIfDone(game);
}

/* ---------------- helping (E) ---------------- */

// Returns what happened: 'warned', 'calmed', 'eased', 'missed', or null if nothing to do.
export function help(game, id) {
  const st = game.students[id];
  const cfg = studentConfig(game, id);
  const t = game.tuning;
  if (game.phase === 'over' || !st || !st.active || !canMisbehave(game, id)) return null;
  if (game.elapsed - st.lastHelpAt < t.helpRepeatGuard) return null;
  st.lastHelpAt = game.elapsed;
  game.counters.helps++;

  let result;
  if (cfg.type === 'phone' && !phoneWarned(game, id)) {
    st.warnedUntil = game.elapsed + t.phoneWarnWindow;
    changeEscalation(game, id, -t.phoneWarnCalm);
    result = 'warned';
  } else if (cfg.type === 'phone') {
    changeEscalation(game, id, -st.escalation);
    result = 'calmed';
  } else if (cfg.type === 'argue' && !argueReady(game, id)) {
    changeEscalation(game, id, t.argueMissPenalty);
    result = 'missed';
  } else {
    changeEscalation(game, id, cfg.type === 'argue' ? -t.argueCalm : -t.helpCalm);
    result = st.active ? 'eased' : 'calmed';
  }
  emit(game, 'help', { id, result });
  return result;
}

/* ---------------- discipline (F) ---------------- */

// Why the discipline menu can or can't open for this student.
/** @typedef {Readonly<{ok: true}> | Readonly<{ok: false, reason: 'over' | 'removed' | 'detained' | 'calm'}>} Eligibility */
/** @type {Record<string, Eligibility>} */
const ELIGIBILITY = {
  ok: Object.freeze({ ok: true }),
  over: Object.freeze({ ok: false, reason: 'over' }),
  removed: Object.freeze({ ok: false, reason: 'removed' }),
  detained: Object.freeze({ ok: false, reason: 'detained' }),
  calm: Object.freeze({ ok: false, reason: 'calm' }),
};

// Whether `id` can be disciplined now. The UI asks every frame, so the answers are shared constants.
/** @returns {Eligibility} */
export function disciplineEligibility(game, id) {
  const st = game.students[id];
  if (game.phase === 'over' || !st) return ELIGIBILITY.over;
  if (st.removed) return ELIGIBILITY.removed;
  if (st.detained) return ELIGIBILITY.detained;
  if (st.active || game.elapsed < st.caughtUntil) return ELIGIBILITY.ok;
  return ELIGIBILITY.calm;
}

// The state of each option for the menu: whether it can be chosen and what's left of it.
export function disciplineMenu(game, id) {
  const t = game.tuning;
  const c = game.counters;
  const eligible = disciplineEligibility(game, id).ok;
  const detentionsLeft = t.detentionsPerPeriod - c.detentions;
  const principalLeft = t.principalCallsPerPeriod - c.principalCalls;
  const zapIn = Math.max(0, game.zapReadyAt - game.elapsed);
  return {
    talk: { available: eligible },
    detention: { available: eligible && detentionsLeft > 0, left: detentionsLeft },
    principal: { available: eligible && principalLeft > 0, left: principalLeft },
    zap: { available: eligible && zapIn === 0, cooldown: zapIn },
  };
}

export function discipline(game, id, option) {
  const t = game.tuning;
  const menu = disciplineMenu(game, id);
  if (!menu[option] || !menu[option].available) return false;
  const st = game.students[id];
  st.caughtUntil = -1;

  switch (option) {
    case 'talk':
      game.counters.talks++;
      changeEscalation(game, id, -t.talkCalm);
      emit(game, 'talk', { id, stillActive: st.active });
      break;
    case 'detention':
      game.counters.detentions++;
      calm(game, id);
      st.detained = true;
      emit(game, 'detention', { id, left: t.detentionsPerPeriod - game.counters.detentions });
      bumpOthers(game, id, t.detentionClassBump);
      break;
    case 'principal':
      game.counters.principalCalls++;
      calm(game, id);
      st.removed = true;
      emit(game, 'principal', { id });
      bumpOthers(game, id, -t.principalClassCalm);
      resolveAttendanceForRemoved(game, id);
      break;
    case 'zap': {
      game.counters.zaps++;
      calm(game, id);
      game.zapReadyAt = game.elapsed + t.zapCooldown;
      const pool = calmPool(game).filter((s) => s.id !== id);
      const setOff = pool.length ? pick(game, pool).id : null;
      emit(game, 'zap', { id, setOffId: setOff });
      if (setOff) activate(game, setOff, t.zapCommotionEscalation);
      break;
    }
  }
  return true;
}

/* ---------------- seating (R) ---------------- */

function friendPairsSeatedTogether(game) {
  const pairs = new Set();
  for (const s of game.roster) {
    if (s.friend && adjacentFriend(game, s.id)) pairs.add([s.id, s.friend].sort().join('+'));
  }
  return pairs;
}

// Swap two students' seats. A removed student's seat is empty, so swapping with them
// simply moves the other student into the empty desk.
export function swapSeats(game, idA, idB) {
  if (game.phase === 'over' || idA === idB || !game.seats[idA] || !game.seats[idB]) return false;
  if (game.students[idA].removed && game.students[idB].removed) return false;
  const before = friendPairsSeatedTogether(game);
  const tmp = game.seats[idA];
  game.seats[idA] = game.seats[idB];
  game.seats[idB] = tmp;
  const after = friendPairsSeatedTogether(game);
  const separated = [...before].filter((p) => !after.has(p)).map((p) => p.split('+'));
  const together = [...after].filter((p) => !before.has(p)).map((p) => p.split('+'));
  for (const pair of together) {
    for (const id of pair) game.students[id].eggedOnNoted = false;
  }
  emit(game, 'swap', { a: idA, b: idB, separated, together });
  return true;
}

/* ---------------- thrown objects ---------------- */

function throwCandidates(game) {
  return game.roster.filter((s) => {
    if (!canMisbehave(game, s.id)) return false;
    // while attendance is on, anyone might chance it; later only the kids already acting up
    return game.phase === 'attendance' || game.students[s.id].active;
  });
}

function updateThrow(game, dt, facingBoard) {
  const t = game.tuning;
  const th = game.throw;
  if (!th) {
    if (!facingBoard) return;
    const chance = game.phase === 'attendance' ? t.throwChanceAttendance : t.throwChanceLesson;
    if (game.rng() < chance * dt) {
      const pool = throwCandidates(game);
      if (!pool.length) return;
      const id = pick(game, pool).id;
      game.throw = { id, phase: 'windup', t: 0 };
      emit(game, 'throwWindup', { id });
    }
    return;
  }
  if (!canMisbehave(game, th.id)) {
    game.throw = null;
    emit(game, 'throwCancelled', { id: th.id });
    return;
  }
  th.t += dt;
  if (th.phase === 'windup' && th.t >= t.throwWindup) {
    th.phase = 'flight';
    th.t = 0;
    emit(game, 'throwLaunched', { id: th.id });
  } else if (th.phase === 'flight' && th.t >= t.throwFlight) {
    game.throw = null;
    if (facingBoard) throwHit(game, th.id);
    else throwCaught(game, th.id);
  }
}

function throwHit(game, id) {
  const t = game.tuning;
  const st = game.students[id];
  game.counters.hits++;
  emit(game, 'hit', { id, first: game.counters.hits === 1 });
  if (!st.active) activate(game, id, 0);
  bumpOthers(game, id, t.hitClassBump);
  if (game.phase !== 'over') changeEscalation(game, id, t.hitThrowerBump);
}

function throwCaught(game, id) {
  game.counters.catches++;
  game.students[id].caughtUntil = game.elapsed + game.tuning.caughtWindow;
  emit(game, 'caught', { id });
}

/* ---------------- end of period ---------------- */

export function interventions(game) {
  const c = game.counters;
  return c.helps + c.talks + c.detentions + c.principalCalls + c.zaps;
}

// The report card for a round that reached the bell. Every deduction is listed.
export function report(game) {
  const p = game.tuning.report;
  const c = game.counters;
  const deductions = [];
  if (c.hits) deductions.push({ kind: 'hits', count: c.hits, points: c.hits * p.hit });
  if (c.detentions) deductions.push({ kind: 'detentions', count: c.detentions, points: c.detentions * p.detention });
  if (c.principalCalls) deductions.push({ kind: 'principal', count: c.principalCalls, points: c.principalCalls * p.principal });
  if (c.zaps) deductions.push({ kind: 'zaps', count: c.zaps, points: c.zaps * p.zap });
  if (game.maxChaos >= 90) deductions.push({ kind: 'closeCall', count: 1, points: p.veryCloseCall });
  else if (game.maxChaos >= 75) deductions.push({ kind: 'closeCall', count: 1, points: p.closeCall });
  const score = Math.max(0, 100 - deductions.reduce((sum, d) => sum + d.points, 0));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';
  return { score, grade, deductions };
}

export function removedStudents(game) {
  return game.roster.filter((s) => game.students[s.id].removed).map((s) => s.id);
}

export function detainedStudents(game) {
  return game.roster.filter((s) => game.students[s.id].detained).map((s) => s.id);
}

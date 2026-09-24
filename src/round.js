// Rounds: starting, pausing, and the end-of-period screen with its report card.
import { STUDENTS } from './data.js';
import * as R from './rules.js';
import { listNames, plural, t } from './strings.js';
import { $, el } from './dom.js';
import { S, name } from './session.js';
import { resetStudentVisuals } from './world.js';
import { releaseKeys, resetPlayer } from './player.js';
import { closeDialog, openDialog } from './dialogs.js';
import { clearLog, pushLog } from './log.js';
import { invalidateAttendancePanel } from './hud.js';
import { clearSpeech } from './rollcall.js';
import { closeSeatChartForRoundEnd } from './seating.js';
import { clearProjectile } from './effects.js';
import { releaseLook, requestLook, stopHoverLook } from './pointer.js';
import { on } from './bus.js';
import { play } from './audio.js';
import { difficulty, onDifficultyChange } from './settings.js';

/** @typedef {import('./data.js').Difficulty} Difficulty */
/** @typedef {import('./rules.js').Game} Game */
/** @typedef {import('./rules.js').Outcome} Outcome */

// Standard keeps the key best grades were saved under before there was a choice of difficulty.
/** @type {Record<Difficulty, string>} */
const BEST_GRADE_KEYS = { standard: 'substitute_best_grade', relaxed: 'substitute_best_grade_relaxed' };
const GRADE_ORDER = ['A', 'B', 'C', 'D'];

/* ---------------- best grade ---------------- */

/** @param {Difficulty} level */
function bestGrade(level) {
  try { return localStorage.getItem(BEST_GRADE_KEYS[level]); } catch { return null; }
}

/**
 * Keeps `grade` if it beats the best so far at this difficulty; says whether it did.
 * @param {Difficulty} level
 * @param {string} grade
 */
function saveBestGrade(level, grade) {
  const prev = bestGrade(level);
  if (prev && GRADE_ORDER.indexOf(prev) <= GRADE_ORDER.indexOf(grade)) return false;
  try { localStorage.setItem(BEST_GRADE_KEYS[level], grade); } catch { /* storage unavailable */ }
  return true;
}

// The best grade at the difficulty that is currently chosen (start menu), and at the
// difficulty the last period was played at (end screen).
export function showBest() {
  el.bestStart.textContent = bestGrade(difficulty()) || t('start.bestNone');
  const level = S.game.difficulty;
  el.endBestLabel.textContent = t('end.best', { difficulty: t('settings.' + level) });
  el.endBestGrade.textContent = bestGrade(level) || t('start.bestNone');
}

/* ---------------- pause ---------------- */

// The HUD buttons whose label depends on the state (and on the language).
export function refreshButtonLabels() {
  iconOf(el.pauseBtn).textContent = S.paused ? '▶' : '⏸';
  const pauseLabel = t(S.paused ? 'hud.resume' : 'hud.pause');
  el.pauseBtn.setAttribute('aria-label', pauseLabel);
  el.pauseBtn.title = pauseLabel;
  const full = !!document.fullscreenElement;
  iconOf(el.fullscreenBtn).textContent = full ? '⤡' : '⛶';
  const fullLabel = t(full ? 'hud.exitFullscreen' : 'hud.fullscreen');
  el.fullscreenBtn.setAttribute('aria-label', fullLabel);
  el.fullscreenBtn.title = fullLabel;
}

/**
 * The icon inside one of the HUD's icon buttons.
 * @param {HTMLElement} button
 */
function iconOf(button) {
  const icon = button.firstElementChild;
  if (!icon) throw new Error('#' + button.id + ' has no icon');
  return icon;
}

/** @param {boolean} p */
export function setPaused(p) {
  if (!S.running || S.paused === p) return;
  S.paused = p;
  refreshButtonLabels();
  releaseKeys();
  if (p) {
    releaseLook();
    stopHoverLook();
    openDialog(el.pauseOverlay, el.resumeBtn);
  } else {
    closeDialog(el.pauseOverlay);
    requestLook();
  }
}

/* ---------------- start and end ---------------- */

function resetVisuals() {
  resetStudentVisuals();
  clearProjectile();
  clearSpeech();
  clearLog();
  closeSeatChartForRoundEnd();
  S.principalSeq = null;
  invalidateAttendancePanel();
}

export function startRound() {
  S.game = R.createGame({ difficulty: difficulty() });
  resetVisuals();
  resetPlayer();
  S.paused = false;
  S.disciplineTarget = null;
  S.running = true;
  for (const node of [el.confirmOverlay, el.startOverlay, el.endOverlay, el.pauseOverlay, el.discOverlay]) {
    if (!node.hidden) closeDialog(node);
  }
  el.canvas.focus({ preventScroll: true });
  pushLog(t('log.bell'));
  play('bell');
  lastTick = null;
  requestLook();
}

// A tick for each of the last ten seconds before the bell.
const COUNTDOWN_SECONDS = 10;
/** @type {number | null} */
let lastTick = null;
export function updateCountdown() {
  const game = S.game;
  if (!game || !S.running) return;
  const left = Math.ceil(game.tuning.period - game.elapsed);
  if (left > 0 && left <= COUNTDOWN_SECONDS && left !== lastTick) {
    lastTick = left;
    play('tick');
  }
}

/** @param {Game} game */
function fillStats(game) {
  const c = game.counters;
  $('statInterventions').textContent = String(R.interventions(game));
  $('statChaos').textContent = Math.round(game.maxChaos) + '%';
  $('statHits').textContent = String(c.hits);
  $('statDetentions').textContent = String(c.detentions);
  $('statPrincipal').textContent = String(c.principalCalls);
  $('statZaps').textContent = String(c.zaps);
}

/**
 * @param {string} id
 * @returns {import('./data.js').StudentConfig}
 */
function student(id) {
  const s = STUDENTS.find((x) => x.id === id);
  if (!s) throw new Error('No student ' + id);
  return s;
}

/** @param {Game} game */
function describeWin(game) {
  const c = game.counters;
  const removed = R.removedStudents(game).map(name);
  const detainedIds = R.detainedStudents(game);
  const sentences = [removed.length ? t('end.wonRemoved', { names: listNames(removed) }) : t('end.wonAllStayed')];
  if (detainedIds.length === 1) {
    const who = student(detainedIds[0]);
    sentences.push(t('end.wonDetainedOne', { name: name(who.id), possessive: t('pronoun.' + who.pronoun + '.possessive') }));
  } else if (detainedIds.length) {
    sentences.push(t('end.wonDetainedMany', { names: listNames(detainedIds.map(name)) }));
  }
  if (c.hits) sentences.push(t('end.wonHits', { count: c.hits, hits: plural(c.hits, 'end.hit', 'end.hits') }));
  sentences.push(t('end.wonCoffee'));
  return sentences.join(' ');
}

/** @param {Game} game */
function showReportCard(game) {
  const r = R.report(game);
  $('gradeValue').textContent = r.grade;
  const notes = $('gradeNotes');
  notes.textContent = '';
  const lines = r.deductions.length ? r.deductions.map((d) => t('end.deduction.' + d.kind, d)) : [t('end.gradeClean')];
  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    notes.append(li);
  }
  S.lastBestGrade = r.grade;
  return saveBestGrade(game.difficulty, r.grade);
}

/** @param {Outcome} outcome */
export function endRound(outcome) {
  const game = S.game;
  S.running = false;
  if (S.disciplineTarget !== null) { S.disciplineTarget = null; closeDialog(el.discOverlay); }
  cancelConfirm();
  if (!el.pauseOverlay.hidden) { S.paused = false; closeDialog(el.pauseOverlay); }
  closeSeatChartForRoundEnd();
  el.attPanel.hidden = true;
  clearProjectile();
  releaseLook();
  el.cabinet.classList.remove('final-bell');

  const emoji = $('endEmoji'), kicker = $('endKicker'), title = $('endTitle'), text = $('endText');
  const reportCard = $('reportCard');
  fillStats(game);
  // a lost round says what would have helped: for the clock, or for this kind of student
  const tip = outcome.reason === 'bell' ? '' : outcome.reason === 'attendance' ? 'end.tip.attendance'
    : 'end.tip.' + student(outcome.culpritId).type;
  $('endTip').hidden = !tip;
  $('endTipText').textContent = tip ? t(tip) : '';

  let newBest = false;
  if (outcome.reason === 'bell') {
    emoji.textContent = '🔔';
    kicker.textContent = t('end.wonKicker');
    title.textContent = t('end.wonTitle');
    text.textContent = describeWin(game);
    reportCard.hidden = false;
    newBest = showReportCard(game);
  } else if (outcome.reason === 'attendance') {
    emoji.textContent = '📋';
    kicker.textContent = t('end.lostAttendanceKicker');
    title.textContent = t('end.lostAttendanceTitle');
    text.textContent = t('end.lostAttendanceText', { count: outcome.unmarked, students: plural(outcome.unmarked, 'end.student', 'end.students') });
    reportCard.hidden = true;
  } else {
    const culprit = student(outcome.culpritId);
    const hurt = culprit.fail === 'HURT';
    emoji.textContent = hurt ? '🚑' : '🚪';
    kicker.textContent = t(hurt ? 'end.lostHurtKicker' : 'end.lostLeftKicker');
    title.textContent = t(hurt ? 'end.lostHurtTitle' : 'end.lostLeftTitle');
    text.textContent = t('students.' + culprit.id + '.fail');
    reportCard.hidden = true;
  }
  showBest();
  el.endNewBest.hidden = !newBest;
  openDialog(el.endOverlay, el.restartBtn);
}

/* ---------------- the menu, and leaving a period ---------------- */

// Back to the start menu (difficulty, rules, best grade), with a fresh classroom behind it.
export function backToMenu() {
  S.running = false;
  S.paused = false;
  S.disciplineTarget = null;
  for (const node of [el.confirmOverlay, el.pauseOverlay, el.endOverlay, el.discOverlay]) {
    if (!node.hidden) closeDialog(node);
  }
  releaseLook();
  releaseKeys();
  S.game = R.createGame({ difficulty: difficulty() });
  resetVisuals();
  resetPlayer();
  el.attPanel.hidden = true;
  el.cabinet.classList.remove('final-bell');
  refreshButtonLabels();
  showBest();
  openDialog(el.startOverlay, el.startBtn);
}

// Asks before a period in progress is thrown away; Escape or "Keep this period" says no.
/** @type {(() => void) | null} */
let onConfirm = null;
/**
 * @param {'restart' | 'menu'} kind
 * @param {() => void} action what happens on "yes"
 */
function confirmLeaving(kind, action) {
  onConfirm = action;
  el.confirmTitle.textContent = t('confirm.' + kind + 'Title');
  el.confirmBody.textContent = t('confirm.' + kind + 'Body');
  el.confirmYes.textContent = t('confirm.' + kind + 'Yes');
  openDialog(el.confirmOverlay, el.confirmNo);
}

export function cancelConfirm() {
  if (el.confirmOverlay.hidden) return;
  onConfirm = null;
  closeDialog(el.confirmOverlay);
}

function acceptConfirm() {
  const action = onConfirm;
  cancelConfirm();
  if (action) action();
}

function restartPeriod() {
  closeDialog(el.pauseOverlay);
  S.paused = false;
  startRound();
}

/* ---------------- buttons, fullscreen and a hidden tab ---------------- */

export function setupRound() {
  el.startBtn.addEventListener('click', startRound);
  onDifficultyChange(showBest);
  el.restartBtn.addEventListener('click', startRound);
  el.pauseBtn.addEventListener('click', () => setPaused(!S.paused));
  el.resumeBtn.addEventListener('click', () => setPaused(false));
  el.endMenuBtn.addEventListener('click', backToMenu);
  el.restartFromPause.addEventListener('click', () => confirmLeaving('restart', restartPeriod));
  el.pauseMenuBtn.addEventListener('click', () => confirmLeaving('menu', backToMenu));
  el.confirmYes.addEventListener('click', acceptConfirm);
  el.confirmNo.addEventListener('click', cancelConfirm);
  on('pauseRequested', () => setPaused(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  el.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      const c = /** @type {any} */ (el.cabinet); // older Safari has only the prefixed call
      const req = c.requestFullscreen ? c.requestFullscreen() : c.webkitRequestFullscreen ? c.webkitRequestFullscreen() : null;
      if (req && req.catch) req.catch(() => { /* fullscreen unavailable: still playable windowed */ });
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  });
  document.addEventListener('fullscreenchange', refreshButtonLabels);
}

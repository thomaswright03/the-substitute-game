// Rounds: starting, pausing, and the end-of-period screen with its report card.
import { STUDENTS } from './data.js';
import * as R from './rules.js';
import { listNames, plural, t } from './strings.js';
import { $, el } from './dom.js';
import { S, name } from './session.js';
import { resetStudentVisuals } from './world.js';
import { releaseKeys, resetPlayer } from './player.js';
import { closeDialog, openDialog } from './dialogs.js';
import { clearLog, invalidateAttendancePanel, pushLog } from './hud.js';
import { clearSpeech } from './rollcall.js';
import { closeSeatChartForRoundEnd } from './seating.js';
import { clearProjectile } from './effects.js';
import { releaseLook, requestLook, stopHoverLook } from './input.js';
import { play } from './audio.js';
import { difficulty, onDifficultyChange } from './settings.js';

// Standard keeps the key best grades were saved under before there was a choice of difficulty.
const BEST_GRADE_KEYS = { standard: 'substitute_best_grade', relaxed: 'substitute_best_grade_relaxed' };
const GRADE_ORDER = ['A', 'B', 'C', 'D'];

/* ---------------- best grade ---------------- */

function bestGrade(level) {
  try { return localStorage.getItem(BEST_GRADE_KEYS[level]); } catch { return null; }
}

function saveBestGrade(level, grade) {
  const prev = bestGrade(level);
  if (prev && GRADE_ORDER.indexOf(prev) <= GRADE_ORDER.indexOf(grade)) return;
  try { localStorage.setItem(BEST_GRADE_KEYS[level], grade); } catch { /* storage unavailable */ }
}

// The best grade at the difficulty that is currently chosen.
export function showBest() {
  el.bestStart.textContent = bestGrade(difficulty()) || t('start.bestNone');
}

/* ---------------- pause ---------------- */

export function setPaused(p) {
  if (!S.running || S.paused === p) return;
  S.paused = p;
  el.pauseBtn.firstElementChild.textContent = p ? '▶' : '⏸';
  const label = t(p ? 'hud.resume' : 'hud.pause');
  el.pauseBtn.setAttribute('aria-label', label);
  el.pauseBtn.title = label;
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
  for (const node of [el.startOverlay, el.endOverlay, el.pauseOverlay, el.discOverlay]) {
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

function fillStats(game) {
  const c = game.counters;
  $('statInterventions').textContent = R.interventions(game);
  $('statChaos').textContent = Math.round(game.maxChaos) + '%';
  $('statHits').textContent = c.hits;
  $('statDetentions').textContent = c.detentions;
  $('statPrincipal').textContent = c.principalCalls;
  $('statZaps').textContent = c.zaps;
}

function describeWin(game) {
  const c = game.counters;
  const removed = R.removedStudents(game).map(name);
  const detainedIds = R.detainedStudents(game);
  const sentences = [removed.length ? t('end.wonRemoved', { names: listNames(removed) }) : t('end.wonAllStayed')];
  if (detainedIds.length === 1) {
    const who = STUDENTS.find((x) => x.id === detainedIds[0]);
    sentences.push(t('end.wonDetainedOne', { name: name(who.id), possessive: t('pronoun.' + who.pronoun + '.possessive') }));
  } else if (detainedIds.length) {
    sentences.push(t('end.wonDetainedMany', { names: listNames(detainedIds.map(name)) }));
  }
  if (c.hits) sentences.push(t('end.wonHits', { count: c.hits, hits: plural(c.hits, 'end.hit', 'end.hits') }));
  sentences.push(t('end.wonCoffee'));
  return sentences.join(' ');
}

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
  saveBestGrade(game.difficulty, r.grade);
  S.lastBestGrade = r.grade;
}

export function endRound(outcome) {
  const game = S.game;
  S.running = false;
  if (S.disciplineTarget !== null) { S.disciplineTarget = null; closeDialog(el.discOverlay); }
  if (!el.pauseOverlay.hidden) { S.paused = false; closeDialog(el.pauseOverlay); }
  closeSeatChartForRoundEnd();
  el.attPanel.hidden = true;
  clearProjectile();
  releaseLook();
  el.cabinet.classList.remove('final-bell');

  const emoji = $('endEmoji'), kicker = $('endKicker'), title = $('endTitle'), text = $('endText');
  const reportCard = $('reportCard');
  fillStats(game);

  if (outcome.won) {
    emoji.textContent = '🔔';
    kicker.textContent = t('end.wonKicker');
    title.textContent = t('end.wonTitle');
    text.textContent = describeWin(game);
    reportCard.hidden = false;
    showReportCard(game);
  } else if (outcome.reason === 'attendance') {
    emoji.textContent = '📋';
    kicker.textContent = t('end.lostAttendanceKicker');
    title.textContent = t('end.lostAttendanceTitle');
    text.textContent = t('end.lostAttendanceText', { count: outcome.unmarked, students: plural(outcome.unmarked, 'end.student', 'end.students') });
    reportCard.hidden = true;
  } else {
    const culprit = STUDENTS.find((s) => s.id === outcome.culpritId);
    const hurt = culprit.fail === 'HURT';
    emoji.textContent = hurt ? '🚑' : '🚪';
    kicker.textContent = t(hurt ? 'end.lostHurtKicker' : 'end.lostLeftKicker');
    title.textContent = t(hurt ? 'end.lostHurtTitle' : 'end.lostLeftTitle');
    text.textContent = t('students.' + culprit.id + '.fail');
    reportCard.hidden = true;
  }
  showBest();
  openDialog(el.endOverlay, el.restartBtn);
}

/* ---------------- buttons, fullscreen and a hidden tab ---------------- */

export function setupRound() {
  el.startBtn.addEventListener('click', startRound);
  onDifficultyChange(showBest);
  el.restartBtn.addEventListener('click', startRound);
  el.pauseBtn.addEventListener('click', () => setPaused(!S.paused));
  el.resumeBtn.addEventListener('click', () => setPaused(false));
  el.restartFromPause.addEventListener('click', () => {
    closeDialog(el.pauseOverlay);
    S.paused = false;
    startRound();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  el.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      const c = el.cabinet;
      const req = c.requestFullscreen ? c.requestFullscreen() : c.webkitRequestFullscreen ? c.webkitRequestFullscreen() : null;
      if (req && req.catch) req.catch(() => { /* fullscreen unavailable: still playable windowed */ });
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const full = !!document.fullscreenElement;
    el.fullscreenBtn.firstElementChild.textContent = full ? '⤡' : '⛶';
    const label = t(full ? 'hud.exitFullscreen' : 'hud.fullscreen');
    el.fullscreenBtn.setAttribute('aria-label', label);
    el.fullscreenBtn.title = label;
  });
}

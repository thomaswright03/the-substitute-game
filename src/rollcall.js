// Roll call: the answering student's speech bubble, or an arrow toward them when they are
// off screen. Floating hints are kept inside the part of the stage the HUD doesn't cover.
import * as THREE from 'three';
import * as R from './rules.js';
import { lookup, t } from './strings.js';
import { el } from './dom.js';
import { S, frozen, name } from './session.js';
import { project, world } from './world.js';
import { player } from './player.js';
import { characterData } from './characters.js';
import { pushLog } from './log.js';
import { emit } from './bus.js';
import { speak } from './voice.js';

const ANSWER_SECONDS = 9; // of play: a pause doesn't use them up
/** @type {number} the roll-call line used last, so the next answer is a different one */
let lastRollLine = -1;

/**
 * Angle to a world point from where the teacher faces: 0 ahead, +PI/2 right, +-PI behind.
 * @param {THREE.Vector3} worldPos
 */
function relativeDirection(worldPos) {
  const dx = worldPos.x - player.x, dz = worldPos.z - player.z;
  const f = dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw);
  const r = dx * Math.cos(player.yaw) + dz * -Math.sin(player.yaw);
  return Math.atan2(r, f);
}

/**
 * Where the voice came from, as a key of the `where` texts.
 * @param {number} angle
 */
function directionKey(angle) {
  const a = Math.abs(angle) * 180 / Math.PI;
  const side = angle >= 0 ? 'Right' : 'Left';
  if (a < 25) return 'where.ahead';
  if (a < 70) return 'where.ahead' + side;
  if (a < 110) return 'where.' + side.toLowerCase();
  if (a < 155) return 'where.behind' + side;
  return 'where.behind';
}

/** The roll-call answers in the current language. */
function rollCallLines() {
  const table = lookup('rollCall.lines');
  return Array.isArray(table) ? table.filter((line) => typeof line === 'string') : [];
}

/**
 * Writes an answer's text in the current language: the line the student says (in the bubble)
 * and the sentence the attendance panel shows.
 * @param {import('./session.js').Speech} speech
 */
function writeSpeech(speech) {
  const line = rollCallLines()[speech.line] || '';
  speech.answer = t('attendance.answered', { name: name(speech.id), where: t(speech.where), line });
  el.bubbleText.textContent = line;
  // the bubble is measured again, the next frame it shows
  delete speech.bw;
  delete speech.bh;
}

// After a change of language: the answer on screen is written again in the new language.
export function refreshSpeech() {
  if (S.speech) writeSpeech(S.speech);
}

export function askRollCall() {
  if (!S.running || frozen()) return;
  R.rollCall(S.game);
  emit('rulesChanged');
}

/** @param {string} id who answers */
export function showRollCallAnswer(id) {
  const count = rollCallLines().length;
  let line = Math.floor(Math.random() * count);
  if (count > 1 && line === lastRollLine) line = (line + 1) % count;
  lastRollLine = line;
  const g = world.students[id];
  const where = directionKey(relativeDirection(characterData(g).headWorld || g.position));
  /** @type {import('./session.js').Speech} */
  const speech = { id, until: S.game.elapsed + ANSWER_SECONDS, line, where, answer: '' };
  writeSpeech(speech);
  S.speech = speech;
  pushLog(speech.answer);
  // the answer matters most: nothing else a student says cuts it off
  speak(id, rollCallLines()[line] || '', { priority: 3 });
}

export function clearSpeech() {
  S.speech = null;
  el.speechBubble.hidden = true;
  el.dirArrow.hidden = true;
}

// The bubble (or the arrow toward the speaker) lasts ANSWER_SECONDS of play, and goes as soon
// as the teacher no longer holds that student's card: delivered, or marked by the office.
const bubbleAnchor = new THREE.Vector3();
export function updateSpeech() {
  const speech = S.speech;
  if (!speech) return;
  if (!S.running || S.game.elapsed > speech.until || S.game.attendance.holding !== speech.id) {
    clearSpeech();
    return;
  }
  const head = characterData(world.students[speech.id]).headWorld;
  if (!head) return;
  const pos = project(bubbleAnchor.copy(head).setY(head.y + 0.3));
  const safe = freeArea();
  if (S.seatChartOpen) {
    // the chart covers the middle of the screen; the answer stays readable in the log
    el.speechBubble.hidden = true;
    el.dirArrow.hidden = true;
  } else if (pos.onScreen) {
    el.dirArrow.hidden = true;
    placeBubble(el.speechBubble, speech, pos, safe);
  } else {
    el.speechBubble.hidden = true;
    // an arrow at the edge of the free play area, pointing toward the student
    const ang = relativeDirection(head);
    const dx = Math.sin(ang), dy = -Math.cos(ang);
    const cx = (safe.left + safe.right) / 2, cy = (safe.top + safe.bottom) / 2;
    const hx = Math.max(0, (safe.right - safe.left) / 2 - 26), hy = Math.max(0, (safe.bottom - safe.top) / 2 - 26);
    const k = Math.min(dx ? hx / Math.abs(dx) : Infinity, dy ? hy / Math.abs(dy) : Infinity);
    el.dirArrow.hidden = false;
    el.dirArrow.style.left = cx + dx * k + 'px';
    el.dirArrow.style.top = cy + dy * k + 'px';
    el.dirArrowGlyph.style.display = 'inline-block';
    el.dirArrowGlyph.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
  }
}

/**
 * Shows a speech bubble over a point on screen, kept whole on screen and below the HUD, with its
 * tail still pointing at the speaker. `state` remembers the bubble's size (measured once, the
 * first frame it shows: it only changes with the text) and where it was last put.
 * @param {HTMLElement} bubble
 * @param {{bw?: number, bh?: number, x?: number, y?: number, tail?: number}} state
 * @param {{x: number, y: number}} pos
 * @param {{left: number, right: number, top: number}} safe
 */
export function placeBubble(bubble, state, pos, safe) {
  bubble.hidden = false;
  if (!state.bw || !state.bh) {
    state.bw = bubble.offsetWidth;
    state.bh = bubble.offsetHeight;
  }
  const bw = state.bw, bh = state.bh;
  const x = Math.round(Math.max(safe.left + bw / 2, Math.min(safe.right - bw / 2, pos.x)));
  const y = Math.round(Math.max(safe.top + bh, pos.y));
  const tail = Math.round(Math.max(-(bw / 2 - 16), Math.min(bw / 2 - 16, pos.x - x)));
  if (x !== state.x || y !== state.y || tail !== state.tail) {
    state.x = x;
    state.y = y;
    state.tail = tail;
    bubble.style.left = x + 'px';
    bubble.style.top = y + 'px';
    bubble.style.setProperty('--tail', tail + 'px');
  }
}

// The part of the stage not covered by HUD panels (top band, attendance panel, seating chart,
// log and buttons), in stage pixels. Floating hints are kept inside it. It is measured again
// only when the stage or one of those panels changes size (including appearing or hiding).
const free = { left: 0, right: 0, top: 0, bottom: 0 };
let freeStale = true;
/** @type {ResizeObserver | null} */
let freeObserver = null;
export function freeArea() {
  if (!freeObserver) {
    freeObserver = new ResizeObserver(() => { freeStale = true; });
    for (const node of [el.stage, el.hud, el.attPanel, el.banner, el.seatChart, el.log, el.actions]) freeObserver.observe(node);
  }
  if (freeStale) {
    measureFreeArea();
    freeStale = false;
  }
  return free;
}

function measureFreeArea() {
  const stage = el.stage.getBoundingClientRect();
  const margin = 8;
  let top = 0, bottom = stage.height;
  for (const node of [el.hud, el.attPanel, el.banner, el.seatChart]) {
    if (node.hidden || !node.offsetParent) continue;
    const r = node.getBoundingClientRect();
    if (r.height) top = Math.max(top, r.bottom - stage.top);
  }
  for (const node of [el.log, el.actions]) {
    if (!node.offsetParent) continue;
    const r = node.getBoundingClientRect();
    if (r.height) bottom = Math.min(bottom, r.top - stage.top);
  }
  if (bottom - top < 80) bottom = Math.min(stage.height, top + 80);
  free.left = margin;
  free.right = stage.width - margin;
  free.top = top + margin;
  free.bottom = bottom - margin;
}

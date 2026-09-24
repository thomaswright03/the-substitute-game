// The heads-up display: clock, chaos meter, the rings over students' heads, the aim
// prompt, the action buttons and the attendance panel.
import { ICON, STUDENTS } from './data.js';
import * as R from './rules.js';
import { currentLanguage, plural, t } from './strings.js';
import { el, keyedLabel, setText } from './dom.js';
import { S, frozen, name } from './session.js';
import { project, world } from './world.js';
import { currentContext, disciplineAction, primaryAction } from './aim.js';
import { askRollCall } from './rollcall.js';
import { toggleSeatChart } from './seating.js';
import { keyLabel, keyLabelsVersion } from './keys.js';

/* ---------------- rings and name tags over the students ---------------- */

const tagEls = {};
const RING_R = 18, RING_C = 2 * Math.PI * RING_R;

export function buildTags() {
  el.studentLayer.textContent = '';
  for (const s of STUDENTS) {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML =
      '<div class="ring-wrap"><svg class="ring" width="44" height="44" viewBox="0 0 44 44">' +
      '<circle class="track" cx="22" cy="22" r="' + RING_R + '" fill="none" stroke-width="4"></circle>' +
      '<circle class="fill" cx="22" cy="22" r="' + RING_R + '" fill="none" stroke-width="4" stroke-dasharray="' + RING_C + '" stroke-dashoffset="' + RING_C + '"></circle>' +
      '</svg><div class="icon"></div></div><div class="name"></div><div class="note"></div>';
    tag.querySelector('.icon').textContent = ICON[s.type];
    tag.querySelector('.name').textContent = s.name;
    el.studentLayer.appendChild(tag);
    tagEls[s.id] = { tag, fill: tag.querySelector('.ring .fill'), note: tag.querySelector('.note'), pct: -1, friend: undefined, x: NaN, y: NaN };
  }
}

// Runs every frame: each DOM write happens only when its value has changed.
export function updateTags() {
  const game = S.game;
  for (const s of STUDENTS) {
    const tagEl = tagEls[s.id];
    const { tag, fill, note } = tagEl;
    const st = game.students[s.id];
    const head = world.students[s.id].userData.headWorld;
    const targeted = S.aim.studentId === s.id;
    const show = S.running && head && !st.removed && (targeted || (st.active && R.canMisbehave(game, s.id)));
    const pos = show ? project(head) : null;
    if (!show || !pos.onScreen) { tag.classList.remove('show'); continue; }
    tag.classList.add('show');
    tag.classList.toggle('target', targeted);
    tag.classList.toggle('calm', !st.active);
    const x = Math.round(pos.x), y = Math.round(pos.y); // the stylesheet lifts the tag above this point
    if (x !== tagEl.x || y !== tagEl.y) {
      tagEl.x = x;
      tagEl.y = y;
      tag.style.translate = x + 'px ' + y + 'px'; // leaves `transform` to the stylesheet's scale
    }
    const pct = st.active ? Math.round(Math.min(100, st.escalation)) : 0;
    if (pct !== tagEl.pct) {
      tagEl.pct = pct;
      fill.setAttribute('stroke-dashoffset', String(RING_C - (pct / 100) * RING_C));
      fill.style.stroke = pct >= 75 ? 'var(--marker-red-bright)' : pct >= 40 ? 'var(--pencil-yellow)' : 'var(--calm-green-bright)';
      tag.classList.toggle('critical', pct >= 75);
    }
    tag.classList.toggle('ready', st.active && s.type === 'argue' && R.argueReady(game, s.id));
    const friend = st.active ? R.adjacentFriend(game, s.id) : null;
    if (friend !== tagEl.friend) {
      tagEl.friend = friend;
      note.textContent = friend ? t('prompt.friendNear', { name: name(friend) }) : '';
      note.classList.toggle('on', !!friend);
    }
  }
}

// Forgets what the tags show, so the next frame rewrites them (after a change of language).
export function invalidateTags() {
  for (const id in tagEls) tagEls[id].friend = undefined;
}

/* ---------------- aim prompt and action buttons ---------------- */

function renderPrompt(parts) {
  el.prompt.textContent = '';
  // one line per action, so a long hint never wraps into the middle of the next action
  for (const part of parts) {
    const line = document.createElement('span');
    line.className = 'promptLine';
    keyedLabel(line, part.key, part.text);
    el.prompt.append(line);
  }
  el.prompt.classList.toggle('show', parts.length > 0);
}

function helpPromptText(id) {
  const game = S.game;
  const cfg = R.studentConfig(game, id);
  const n = name(id);
  if (cfg.type === 'phone') return t(R.phoneWarned(game, id) ? 'prompt.helpPhoneSecond' : 'prompt.helpPhoneFirst', { name: n });
  if (cfg.type === 'argue') return t(R.argueReady(game, id) ? 'prompt.helpArgueReady' : 'prompt.helpArgueWait', { name: n });
  return t('prompt.help', { name: n });
}

function setButton(node, key, label) {
  const sig = key + ' ' + label + S.isTouch;
  if (node.dataset.label === sig) return;
  node.dataset.label = sig;
  keyedLabel(node, key, label);
}

// Everything the prompt and the buttons depend on, compared field by field each frame so they
// are only rebuilt when something changed.
const shown = { kind: null, id: null, seatFirst: null, holding: null, phase: 0, canAsk: false, running: false, chart: false, touch: false, language: null, keys: -1 };
function samePromptInputs(ctx, game, canAsk) {
  const kind = ctx ? ctx.kind : null, id = ctx ? ctx.id : null;
  // the help prompt for the phone and the arguer changes with their state
  let phase = 0;
  if (kind === 'help') {
    const type = R.studentConfig(game, id).type;
    if (type === 'phone') phase = R.phoneWarned(game, id) ? 1 : 0;
    else if (type === 'argue') phase = R.argueReady(game, id) ? 1 : 0;
  }
  const holding = game ? game.attendance.holding : null;
  const same = kind === shown.kind && id === shown.id && S.seatFirst === shown.seatFirst && holding === shown.holding
    && phase === shown.phase && canAsk === shown.canAsk && S.running === shown.running && S.seatChartOpen === shown.chart
    && S.isTouch === shown.touch && currentLanguage() === shown.language && keyLabelsVersion() === shown.keys;
  if (same) return true;
  Object.assign(shown, { kind, id, seatFirst: S.seatFirst, holding, phase, canAsk, running: S.running, chart: S.seatChartOpen, touch: S.isTouch, language: currentLanguage(), keys: keyLabelsVersion() });
  return false;
}

export function updatePromptAndActions() {
  const game = S.game;
  const ctx = S.running && !frozen() ? currentContext() : null;
  const canAsk = S.running && !frozen() && R.canRollCall(game);
  if (samePromptInputs(ctx, game, canAsk)) return;
  const parts = [];
  let primary = null;
  let showDiscipline = false;
  if (ctx) {
    const n = name(ctx.id);
    switch (ctx.kind) {
      case 'pickup':
        parts.push({ key: keyLabel('help'), text: t('prompt.pickUp', { name: n }) });
        primary = t('actions.pickUp');
        break;
      case 'give':
        parts.push({ key: keyLabel('help'), text: t('prompt.give', { held: name(game.attendance.holding), name: n }) });
        primary = t('actions.give');
        break;
      case 'help':
        parts.push({ key: keyLabel('help'), text: helpPromptText(ctx.id) });
        parts.push({ key: keyLabel('discipline'), text: t('prompt.discipline', { name: n }) });
        primary = t('actions.help') + ' ' + n;
        showDiscipline = true;
        break;
      case 'caught':
        parts.push({ key: keyLabel('discipline'), text: t('prompt.discipline', { name: n }) });
        showDiscipline = true;
        break;
      case 'swap':
        parts.push({ key: keyLabel('help'), text: S.seatFirst ? t('prompt.swapWith', { first: name(S.seatFirst), name: n }) : t('prompt.swapPick', { name: n }) });
        primary = t('actions.swap') + ' ' + n;
        break;
      case 'detained':
        parts.push({ key: null, text: t('prompt.detainedStudent', { name: n }) });
        break;
      default:
        parts.push({ key: null, text: t('prompt.calmStudent', { name: n }) });
    }
  }
  renderPrompt(parts);
  el.crosshair.classList.toggle('target', !!ctx && ctx.kind !== 'calm' && ctx.kind !== 'detained');

  el.actPrimary.hidden = !primary;
  if (primary) setButton(el.actPrimary, keyLabel('help'), primary);
  el.actDiscipline.hidden = !showDiscipline;
  if (showDiscipline) setButton(el.actDiscipline, keyLabel('discipline'), t('actions.discipline'));
  el.actRollCall.hidden = !canAsk;
  if (canAsk) setButton(el.actRollCall, keyLabel('rollCall'), t('rollCall.button', { name: name(game.attendance.holding) }));
  el.actSeats.hidden = !S.running;
  setButton(el.actSeats, keyLabel('seats'), t('actions.seats'));
  el.actSeats.setAttribute('aria-pressed', String(S.seatChartOpen));
}

export function setupActionButtons() {
  /** @type {[HTMLElement, () => void][]} */
  const buttons = [
    [el.actPrimary, primaryAction],
    [el.actDiscipline, disciplineAction],
    [el.actRollCall, askRollCall],
    [el.actSeats, () => toggleSeatChart(false)],
  ];
  for (const [btn, fn] of buttons) {
    btn.addEventListener('click', fn);
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}

/* ---------------- attendance panel ---------------- */

const attShown = { valid: false, holding: null, remaining: -1, answer: null };
export function invalidateAttendancePanel() {
  attShown.valid = false;
}

export function updateAttendancePanel() {
  const game = S.game;
  const a = game && S.running && game.phase === 'attendance' && !S.seatChartOpen ? game.attendance : null;
  el.attPanel.hidden = !a;
  if (!a) return;
  const speech = S.speech;
  const answerNow = speech ? speech.answer : null;
  if (attShown.valid && attShown.holding === a.holding && attShown.remaining === a.remaining.length && attShown.answer === answerNow) return;
  attShown.valid = true;
  attShown.holding = a.holding;
  attShown.remaining = a.remaining.length;
  attShown.answer = answerNow;
  if (!a.holding) {
    const n = a.remaining.length;
    setText(el.attQuestion, t('attendance.cardsLeft', { count: n, cards: plural(n, 'attendance.card', 'attendance.cards') }));
    setText(el.attHint, t('attendance.goToBoard'));
  } else {
    setText(el.attQuestion, t('attendance.carrying', { name: name(a.holding) }));
    setText(el.attHint, t('attendance.findStudent', { name: name(a.holding) }));
  }
  const answer = speech && speech.answer && a.holding === speech.id ? speech.answer : '';
  el.attAnswer.hidden = !answer;
  setText(el.attAnswer, answer);
}

/* ---------------- clock and chaos meter ---------------- */

function clockText(frac) {
  const startMin = 9 * 60 + 5, endMin = 9 * 60 + 50;
  const total = startMin + frac * (endMin - startMin);
  let h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  if (h > 12) h -= 12;
  return h + ':' + String(m).padStart(2, '0');
}

// Runs every frame, and writes to the page only when a shown value changes. When a period
// ends the HUD keeps its final clock and chaos, so a loss shows the 100% that caused it.
const hudShown = { minute: -1, clockTenths: -1, chaos: -1, chaosTenths: -1, finalBell: null };
export function updateHud() {
  const game = S.game;
  const frac = game ? Math.min(1, game.elapsed / game.tuning.period) : 0;
  const minute = Math.floor(frac * 45);
  if (minute !== hudShown.minute) {
    hudShown.minute = minute;
    setText(el.clockValue, clockText(frac));
  }
  const clockTenths = Math.round(frac * 1000);
  if (clockTenths !== hudShown.clockTenths) {
    hudShown.clockTenths = clockTenths;
    el.clockFill.style.width = clockTenths / 10 + '%';
  }
  const c = game ? R.chaos(game) : 0;
  const pct = Math.round(c);
  if (pct !== hudShown.chaos) {
    hudShown.chaos = pct;
    setText(el.chaosValue, pct + '%');
    el.chaosBadge.classList.toggle('mid', pct >= 40 && pct < 75);
    el.chaosBadge.classList.toggle('hot', pct >= 75);
    el.chaosBadge.setAttribute('aria-valuenow', String(pct));
  }
  const chaosTenths = Math.round(Math.min(100, c) * 10);
  if (chaosTenths !== hudShown.chaosTenths) {
    hudShown.chaosTenths = chaosTenths;
    el.chaosFill.style.width = chaosTenths / 10 + '%';
  }
  const left = game ? game.tuning.period - game.elapsed : Infinity;
  const finalBell = S.running && left <= 15 && left > 0;
  if (finalBell !== hudShown.finalBell) {
    hudShown.finalBell = finalBell;
    el.cabinet.classList.toggle('final-bell', finalBell);
  }
}

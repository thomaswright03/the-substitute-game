// The heads-up display: clock, chaos meter, the rings over students' heads, the aim
// prompt, the action buttons and the attendance panel.
import { ICON, STUDENTS } from './data.js';
import * as R from './rules.js';
import { currentLanguage, formatClock, formatPercent, plural, t } from './strings.js';
import { el, keyedLabel, setText } from './dom.js';
import { S, frozen, name } from './session.js';
import { project, world } from './world.js';
import { characterData } from './characters.js';
import { currentContext, disciplineAction, primaryAction } from './aim.js';
import { askRollCall } from './rollcall.js';
import { toggleSeatChart } from './seating.js';
import { keyLabel, keyLabelsVersion } from './keys.js';

/**
 * How the HUD colours an escalation of `pct` percent (see TUNING.hud).
 * @param {import('./rules.js').Game} game
 * @param {number} pct
 * @returns {'calm' | 'warning' | 'danger'}
 */
function escalationLevel(game, pct) {
  const h = game.tuning.hud;
  return pct >= h.danger ? 'danger' : pct >= h.warning ? 'warning' : 'calm';
}

/* ---------------- rings and name tags over the students ---------------- */

/**
 * A student's tag, and what it shows now (each is written to the page only when it changes).
 * @typedef {object} Tag
 * @property {HTMLElement} tag
 * @property {HTMLElement | SVGElement} fill the ring's filled arc
 * @property {HTMLElement} note the "egged on by" line
 * @property {number} pct
 * @property {string | null | undefined} friend undefined: not drawn yet
 * @property {number} x
 * @property {number} y
 */
/** @type {Record<string, Tag>} */
const tagEls = {};
const RING_R = 18, RING_C = 2 * Math.PI * RING_R;

/**
 * The element matching `selector` inside a tag that buildTags() just made.
 * @param {HTMLElement} tag
 * @param {string} selector
 */
function part(tag, selector) {
  const node = tag.querySelector(selector);
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) throw new Error('A student tag has no ' + selector);
  return node;
}

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
    part(tag, '.icon').textContent = ICON[s.type];
    part(tag, '.name').textContent = s.name;
    el.studentLayer.appendChild(tag);
    const note = part(tag, '.note');
    if (!(note instanceof HTMLElement)) throw new Error('A student tag\'s note is not an HTML element');
    tagEls[s.id] = { tag, fill: part(tag, '.ring .fill'), note, pct: -1, friend: undefined, x: NaN, y: NaN };
  }
}

// Runs every frame: each DOM write happens only when its value has changed.
export function updateTags() {
  const game = S.game;
  for (const s of STUDENTS) {
    const tagEl = tagEls[s.id];
    const { tag, fill, note } = tagEl;
    const st = game.students[s.id];
    const head = characterData(world.students[s.id]).headWorld;
    const targeted = S.aim.studentId === s.id;
    const show = S.running && head && !st.removed && (targeted || (st.active && R.canMisbehave(game, s.id)));
    const pos = show && head ? project(head) : null;
    if (!pos || !pos.onScreen) { tag.classList.remove('show'); continue; }
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
      const level = escalationLevel(game, pct);
      fill.style.stroke = level === 'danger' ? 'var(--marker-red-bright)' : level === 'warning' ? 'var(--pencil-yellow)' : 'var(--calm-green-bright)';
      tag.classList.toggle('critical', level === 'danger');
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

/** @param {{key: string | null, text: string}[]} parts */
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

/** @param {string} id */
function helpPromptText(id) {
  const game = S.game;
  const cfg = R.studentConfig(game, id);
  const n = name(id);
  if (cfg && cfg.type === 'phone') return t(R.phoneWarned(game, id) ? 'prompt.helpPhoneSecond' : 'prompt.helpPhoneFirst', { name: n });
  if (cfg && cfg.type === 'argue') return t(R.argueReady(game, id) ? 'prompt.helpArgueReady' : 'prompt.helpArgueWait', { name: n });
  return t('prompt.help', { name: n });
}

/**
 * @param {HTMLElement} node
 * @param {string} key
 * @param {string} label
 */
function setButton(node, key, label) {
  const sig = key + ' ' + label + S.isTouch;
  if (node.dataset.label === sig) return;
  node.dataset.label = sig;
  keyedLabel(node, key, label);
}

// Everything the prompt and the buttons depend on, compared field by field each frame so they
// are only rebuilt when something changed.
/**
 * @typedef {object} PromptInputs
 * @property {string | null} kind
 * @property {string | null} id
 * @property {string | null} seatFirst
 * @property {string | null} holding
 * @property {number} phase
 * @property {boolean} canAsk
 * @property {boolean} running
 * @property {boolean} chart
 * @property {boolean} touch
 * @property {string | null} language
 * @property {number} keys
 */
/** @type {PromptInputs} */
const shown = { kind: null, id: null, seatFirst: null, holding: null, phase: 0, canAsk: false, running: false, chart: false, touch: false, language: null, keys: -1 };
/**
 * @param {{kind: string, id: string} | null} ctx
 * @param {import('./rules.js').Game} game
 * @param {boolean} canAsk
 */
function samePromptInputs(ctx, game, canAsk) {
  const kind = ctx ? ctx.kind : null, id = ctx ? ctx.id : null;
  // the help prompt for the phone and the arguer changes with their state
  let phase = 0;
  if (kind === 'help' && id) {
    const cfg = R.studentConfig(game, id);
    const type = cfg ? cfg.type : null;
    if (type === 'phone') phase = R.phoneWarned(game, id) ? 1 : 0;
    else if (type === 'argue') phase = R.argueReady(game, id) ? 1 : 0;
  }
  const holding = game.attendance.holding;
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
  /** @type {{key: string | null, text: string}[]} */
  const parts = [];
  /** @type {string | null} */
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
        parts.push({ key: keyLabel('help'), text: t('prompt.give', { held: name(game.attendance.holding || ''), name: n }) });
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
  const holding = game.attendance.holding;
  el.actRollCall.hidden = !canAsk || !holding;
  if (canAsk && holding) setButton(el.actRollCall, keyLabel('rollCall'), t('rollCall.button', { name: name(holding) }));
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

/** @type {{valid: boolean, holding: string | null, remaining: number, answer: string | null}} */
const attShown = { valid: false, holding: null, remaining: -1, answer: null };
export function invalidateAttendancePanel() {
  attShown.valid = false;
}

export function updateAttendancePanel() {
  const game = S.game;
  const a = S.running && game.phase === 'attendance' && !S.seatChartOpen ? game.attendance : null;
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

/** @param {number} frac how far through the period, 0 to 1 */
function clockText(frac) {
  const startMin = 9 * 60 + 5, endMin = 9 * 60 + 50;
  const total = startMin + frac * (endMin - startMin);
  let h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  if (h > 12) h -= 12;
  return formatClock(h, m);
}

// Runs every frame, and writes to the page only when a shown value changes. When a period
// ends the HUD keeps its final clock and chaos, so a loss shows the 100% that caused it.
/** @type {{minute: number, clockTenths: number, chaos: number, chaosTenths: number, finalBell: boolean | null}} */
const hudShown = { minute: -1, clockTenths: -1, chaos: -1, chaosTenths: -1, finalBell: null };

// Forgets the clock and chaos text, so the next frame writes them again (after a change of language).
export function invalidateHud() {
  hudShown.minute = -1;
  hudShown.chaos = -1;
}
export function updateHud() {
  const game = S.game;
  const frac = Math.min(1, game.elapsed / game.tuning.period);
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
  const c = R.chaos(game);
  const pct = Math.round(c);
  if (pct !== hudShown.chaos) {
    hudShown.chaos = pct;
    setText(el.chaosValue, formatPercent(pct));
    const level = escalationLevel(game, pct);
    el.chaosBadge.classList.toggle('mid', level === 'warning');
    el.chaosBadge.classList.toggle('hot', level === 'danger');
    el.chaosBadge.setAttribute('aria-valuenow', String(pct));
  }
  const chaosTenths = Math.round(Math.min(100, c) * 10);
  if (chaosTenths !== hudShown.chaosTenths) {
    hudShown.chaosTenths = chaosTenths;
    el.chaosFill.style.width = chaosTenths / 10 + '%';
  }
  const left = game.tuning.period - game.elapsed;
  const finalBell = S.running && left <= 15 && left > 0;
  if (finalBell !== hudShown.finalBell) {
    hudShown.finalBell = finalBell;
    el.cabinet.classList.toggle('final-bell', finalBell);
  }
}

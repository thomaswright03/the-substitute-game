// The heads-up display: log, clock, chaos meter, the rings over students' heads, the aim
// prompt, the action buttons and the attendance panel.
import { ICON, STUDENTS } from './data.js';
import * as R from './rules.js';
import { plural, t } from './strings.js';
import { el, keyedLabel, setText } from './dom.js';
import { S, frozen, name } from './session.js';
import { project, world } from './world.js';
import { currentContext, disciplineAction, primaryAction } from './aim.js';
import { askRollCall } from './rollcall.js';
import { toggleSeatChart } from './seating.js';

const LOG_LINES = 12; // kept in the log; CSS shows the newest few and fades the rest out

/* ---------------- log ---------------- */

export function pushLog(text) {
  const line = document.createElement('div');
  line.textContent = text;
  el.log.appendChild(line);
  while (el.log.children.length > LOG_LINES) el.log.removeChild(el.log.firstChild);
}

export function clearLog() {
  el.log.textContent = '';
}

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
    tagEls[s.id] = { tag, fill: tag.querySelector('.ring .fill'), note: tag.querySelector('.note') };
  }
}

export function updateTags() {
  const game = S.game;
  for (const s of STUDENTS) {
    const { tag, fill, note } = tagEls[s.id];
    const st = game.students[s.id];
    const head = world.students[s.id].userData.headWorld;
    const targeted = S.aim.studentId === s.id;
    const show = S.running && head && !st.removed && (targeted || (st.active && R.canMisbehave(game, s.id)));
    const pos = show ? project(head) : null;
    if (!show || !pos.onScreen) { tag.classList.remove('show'); continue; }
    tag.classList.add('show');
    tag.classList.toggle('target', targeted);
    tag.classList.toggle('calm', !st.active);
    tag.style.left = pos.x - 22 + 'px';
    tag.style.top = pos.y - 100 + 'px';
    const pct = st.active ? Math.min(100, st.escalation) : 0;
    fill.setAttribute('stroke-dashoffset', String(RING_C - (pct / 100) * RING_C));
    fill.style.stroke = pct >= 75 ? 'var(--marker-red-bright)' : pct >= 40 ? 'var(--pencil-yellow)' : 'var(--calm-green-bright)';
    tag.classList.toggle('critical', pct >= 75);
    tag.classList.toggle('ready', st.active && s.type === 'argue' && R.argueReady(game, s.id));
    const friend = st.active ? R.adjacentFriend(game, s.id) : null;
    note.textContent = friend ? t('prompt.friendNear', { name: name(friend) }) : '';
    note.classList.toggle('on', !!friend);
  }
}

/* ---------------- aim prompt and action buttons ---------------- */

let lastPromptKey = '';
function renderPrompt(parts) {
  const sig = JSON.stringify(parts) + S.isTouch;
  if (sig === lastPromptKey) return;
  lastPromptKey = sig;
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
  const sig = label + S.isTouch;
  if (node.dataset.label === sig) return;
  node.dataset.label = sig;
  keyedLabel(node, key, label);
}

export function updatePromptAndActions() {
  const game = S.game;
  const ctx = S.running && !frozen() ? currentContext() : null;
  const parts = [];
  let primary = null;
  let showDiscipline = false;
  if (ctx) {
    const n = name(ctx.id);
    switch (ctx.kind) {
      case 'pickup':
        parts.push({ key: 'E', text: t('prompt.pickUp', { name: n }) });
        primary = t('actions.pickUp');
        break;
      case 'give':
        parts.push({ key: 'E', text: t('prompt.give', { held: name(game.attendance.holding), name: n }) });
        primary = t('actions.give');
        break;
      case 'help':
        parts.push({ key: 'E', text: helpPromptText(ctx.id) });
        parts.push({ key: 'F', text: t('prompt.discipline', { name: n }) });
        primary = t('actions.help') + ' ' + n;
        showDiscipline = true;
        break;
      case 'caught':
        parts.push({ key: 'F', text: t('prompt.discipline', { name: n }) });
        showDiscipline = true;
        break;
      case 'swap':
        parts.push({ key: 'E', text: S.seatFirst ? t('prompt.swapWith', { first: name(S.seatFirst), name: n }) : t('prompt.swapPick', { name: n }) });
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
  if (primary) setButton(el.actPrimary, 'E', primary);
  el.actDiscipline.hidden = !showDiscipline;
  if (showDiscipline) setButton(el.actDiscipline, 'F', t('actions.discipline'));
  const canAsk = S.running && !frozen() && R.canRollCall(game);
  el.actRollCall.hidden = !canAsk;
  if (canAsk) setButton(el.actRollCall, 'Q', t('rollCall.button', { name: name(game.attendance.holding) }));
  el.actSeats.hidden = !S.running;
  setButton(el.actSeats, 'R', t('actions.seats'));
  el.actSeats.setAttribute('aria-pressed', String(S.seatChartOpen));
}

export function setupActionButtons() {
  for (const [btn, fn] of [
    [el.actPrimary, primaryAction],
    [el.actDiscipline, disciplineAction],
    [el.actRollCall, askRollCall],
    [el.actSeats, () => toggleSeatChart(false)],
  ]) {
    btn.addEventListener('click', fn);
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}

/* ---------------- attendance panel ---------------- */

let attSig = '';
export function invalidateAttendancePanel() {
  attSig = '';
}

export function updateAttendancePanel() {
  const game = S.game;
  const a = game && S.running && game.phase === 'attendance' && !S.seatChartOpen ? game.attendance : null;
  el.attPanel.hidden = !a;
  if (!a) return;
  const speech = S.speech;
  const sig = [a.holding, a.remaining.length, speech && speech.answer].join('|');
  if (sig === attSig) return;
  attSig = sig;
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

export function updateHud() {
  const game = S.game;
  const frac = game ? game.elapsed / game.tuning.period : 0;
  setText(el.clockValue, clockText(frac));
  el.clockFill.style.width = frac * 100 + '%';
  const c = game && S.running ? R.chaos(game) : 0;
  const pct = Math.round(c);
  setText(el.chaosValue, pct + '%');
  el.chaosFill.style.width = Math.min(100, c) + '%';
  el.chaosBadge.classList.toggle('mid', c >= 40 && c < 75);
  el.chaosBadge.classList.toggle('hot', c >= 75);
  if (el.chaosBadge.getAttribute('aria-valuenow') !== String(pct)) el.chaosBadge.setAttribute('aria-valuenow', String(pct));
  const left = game ? game.tuning.period - game.elapsed : Infinity;
  el.cabinet.classList.toggle('final-bell', S.running && left <= 15 && left > 0);
}

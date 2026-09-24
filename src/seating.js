// The seating chart: pick two students to swap their seats.
import { STUDENTS } from './data.js';
import * as R from './rules.js';
import { t } from './strings.js';
import { el } from './dom.js';
import { S, frozen, name } from './session.js';
import { animateSeatSwap } from './world.js';
import { drainEvents } from './events.js';
import { invalidateAttendancePanel, pushLog } from './hud.js';
import { releaseLook, stopHoverLook } from './input.js';

const FRIEND_COLORS = ['var(--friend-1)', 'var(--friend-2)', 'var(--friend-3)', 'var(--friend-4)'];
const friendColor = {};
STUDENTS.forEach((s) => {
  if (!s.friend || friendColor[s.id]) return;
  const color = FRIEND_COLORS[Object.keys(friendColor).length / 2 % FRIEND_COLORS.length];
  friendColor[s.id] = color;
  friendColor[s.friend] = color;
});

export function renderSeatChart() {
  const game = S.game;
  if (!game || !S.seatChartOpen) return;
  const hadFocus = el.seatGrid.contains(document.activeElement) ? document.activeElement.dataset.seat : null;
  el.seatGrid.textContent = '';
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const id = STUDENTS.map((s) => s.id).find((sid) => game.seats[sid].row === row && game.seats[sid].col === col);
      const st = game.students[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seat';
      btn.dataset.seat = row + '-' + col;
      btn.dataset.id = id;
      if (st.removed) {
        btn.classList.add('empty');
        btn.textContent = t('seating.empty');
        btn.disabled = !S.seatFirst;
      } else {
        btn.textContent = name(id);
        if (friendColor[id]) btn.style.setProperty('--friend', friendColor[id]);
        const note = R.adjacentFriend(game, id) ? t('seating.together') : '';
        if (note) {
          const small = document.createElement('span');
          small.className = 'seatNote';
          small.textContent = note;
          btn.append(small);
        }
      }
      btn.classList.toggle('selected', S.seatFirst === id);
      btn.setAttribute('aria-pressed', String(S.seatFirst === id));
      btn.addEventListener('click', () => pickSeat(id));
      el.seatGrid.append(btn);
    }
  }
  if (hadFocus) {
    const again = el.seatGrid.querySelector('[data-seat="' + hadFocus + '"]');
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
  el.banner.hidden = !S.seatFirst;
  if (S.seatFirst) el.banner.textContent = t('seating.picked', { name: name(S.seatFirst) });
}

export function setSeatChart(open, focusFirst = false) {
  if (open && (!S.running || frozen())) return;
  S.seatChartOpen = open;
  S.seatFirst = null;
  el.seatChart.hidden = !open;
  el.banner.hidden = true;
  invalidateAttendancePanel();
  if (open) {
    releaseLook();
    stopHoverLook();
    renderSeatChart();
    if (focusFirst) {
      const first = el.seatGrid.querySelector('button:not([disabled])');
      if (first) first.focus({ preventScroll: true });
    }
  } else if (el.seatChart.contains(document.activeElement)) {
    el.canvas.focus({ preventScroll: true });
  }
}

export function toggleSeatChart(focusFirst = false) {
  setSeatChart(!S.seatChartOpen, focusFirst);
}

export function pickSeat(id) {
  if (!S.running || frozen()) return;
  if (!S.seatFirst) {
    if (S.game.students[id].removed) return;
    S.seatFirst = id;
  } else if (S.seatFirst === id) {
    S.seatFirst = null;
  } else {
    R.swapSeats(S.game, S.seatFirst, id);
    S.seatFirst = null;
    drainEvents();
  }
  renderSeatChart();
}

// A swap happened in the rules: slide the students over and say what it changed.
export function onSwap(e) {
  const game = S.game;
  animateSeatSwap([e.a, e.b]);
  if (game.students[e.b].removed) pushLog(t('log.moveToEmpty', { a: name(e.a) }));
  else if (game.students[e.a].removed) pushLog(t('log.moveToEmpty', { a: name(e.b) }));
  else pushLog(t('log.swap', { a: name(e.a), b: name(e.b) }));
  for (const [a, b] of e.separated) pushLog(t('log.swapSeparated', { a: name(a), b: name(b) }));
  for (const [a, b] of e.together) pushLog(t('log.swapTogether', { a: name(a), b: name(b) }));
  renderSeatChart();
}

export function closeSeatChartForRoundEnd() {
  S.seatChartOpen = false;
  S.seatFirst = null;
  el.seatChart.hidden = true;
  el.banner.hidden = true;
}

export function setupSeating() {
  el.seatClose.addEventListener('click', () => setSeatChart(false));
}

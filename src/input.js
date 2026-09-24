// Keyboard, mouse, touch and the on-screen stick, turned into look, walk and action calls.
import { applyStaticStrings, lookup, setTouchStrings } from './strings.js';
import { el } from './dom.js';
import { S, frozen } from './session.js';
import { applyLookDelta, joy, keys, look, releaseKeys } from './player.js';
import { topDialog } from './dialogs.js';
import { justPausedByEsc, requestLook, setupPointerLock, stopHoverLook, takeSkipNextMove } from './pointer.js';
import { disciplineAction, primaryAction } from './aim.js';
import { askRollCall } from './rollcall.js';
import { setSeatChart, toggleSeatChart } from './seating.js';
import { chooseDiscipline, closeDiscipline } from './discipline.js';
import { cancelConfirm, refreshButtonLabels, setPaused } from './round.js';
import { audioPrefs, setMuted } from './audio.js';

const LOOK_SENS = 0.0034;
const POINTER_LOCK_SENS = 0.0024;
const MAX_LOCKED_DELTA = 250; // browsers sometimes report one huge jump right after locking
const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

let lastPX = 0, lastPY = 0;
let touchLookId = null;

/* ---------------- device ---------------- */

const touchListeners = [];
// Called with the new value whenever the player switches between touch and keyboard/mouse.
export function onInputModeChange(fn) {
  touchListeners.push(fn);
}

export function setTouch(on) {
  if (S.isTouch === on) return;
  S.isTouch = on;
  document.body.classList.toggle('touch', on);
  setTouchStrings(on);
  applyStaticStrings(document);
  refreshButtonLabels();
  renderControlsLists();
  for (const fn of touchListeners) fn(on);
}

export function renderControlsLists() {
  const rows = lookup(S.isTouch ? 'controls.touch' : 'controls.keyboard') || [];
  document.querySelectorAll('[data-controls]').forEach((dl) => {
    dl.textContent = '';
    for (const [key, what] of rows) {
      const item = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = what;
      item.append(dt, dd);
      dl.append(item);
    }
  });
}

/* ---------------- mouse and touch look ---------------- */

function setupPointer() {
  setupPointerLock();
  el.canvas.addEventListener('click', () => {
    if (!S.isTouch) requestLook();
  });
  el.canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    setTouch(true);
    if (touchLookId === null) {
      touchLookId = e.pointerId;
      lastPX = e.clientX;
      lastPY = e.clientY;
      try { el.canvas.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
    }
  });
  el.canvas.addEventListener('pointermove', (e) => {
    if (look.pointerLocked) return;
    if (e.pointerType === 'touch') {
      if (e.pointerId !== touchLookId) return;
      if (S.running && !frozen()) applyLookDelta(e.clientX - lastPX, e.clientY - lastPY, LOOK_SENS);
      lastPX = e.clientX;
      lastPY = e.clientY;
      return;
    }
    // mouse without pointer lock: relative look while the cursor moves over the classroom
    if (S.running && !frozen() && look.hoverInside && !S.seatChartOpen) applyLookDelta(e.clientX - lastPX, e.clientY - lastPY, LOOK_SENS);
    lastPX = e.clientX;
    lastPY = e.clientY;
    look.hoverInside = true;
    const rect = el.canvas.getBoundingClientRect();
    look.edgeX = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)));
    look.edgeY = Math.max(-1, Math.min(1, (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)));
  });
  // leaving the canvas (to the pause button, a panel, or out of the window) stops edge turning at once
  el.canvas.addEventListener('pointerleave', stopHoverLook);
  el.canvas.addEventListener('pointerout', stopHoverLook);
  window.addEventListener('blur', stopHoverLook);
  const endTouchLook = (e) => {
    if (e.pointerId === touchLookId) touchLookId = null;
  };
  el.canvas.addEventListener('pointerup', endTouchLook);
  el.canvas.addEventListener('pointercancel', endTouchLook);
  window.addEventListener('mousemove', (e) => {
    if (!look.pointerLocked || !S.running || frozen()) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (takeSkipNextMove() || Math.abs(dx) > MAX_LOCKED_DELTA || Math.abs(dy) > MAX_LOCKED_DELTA) return;
    applyLookDelta(dx, dy, POINTER_LOCK_SENS);
  });
}

/* ---------------- the on-screen stick ---------------- */

function setupJoystick() {
  el.joystick.addEventListener('pointerdown', (e) => {
    joy.active = true;
    joy.id = e.pointerId;
    try { el.joystick.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
    e.preventDefault();
  });
  el.joystick.addEventListener('pointermove', (e) => {
    if (!joy.active || e.pointerId !== joy.id) return;
    const r = el.joystick.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.min(Math.hypot(dx, dy), max);
    const ang = Math.atan2(dy, dx);
    const kx = Math.cos(ang) * len, ky = Math.sin(ang) * len;
    el.knob.style.left = 'calc(50% + ' + kx + 'px)';
    el.knob.style.top = 'calc(50% + ' + ky + 'px)';
    joy.x = kx / max;
    joy.y = ky / max;
  });
  const joyReset = (e) => {
    if (e && e.pointerId !== joy.id) return;
    joy.active = false;
    joy.x = joy.y = 0;
    el.knob.style.left = '50%';
    el.knob.style.top = '50%';
  };
  el.joystick.addEventListener('pointerup', joyReset);
  el.joystick.addEventListener('pointercancel', joyReset);
}

/* ---------------- keyboard ---------------- */

function onKeyDown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const top = topDialog();

  if (top === el.discOverlay) {
    const option = { 1: 'talk', 2: 'detention', 3: 'principal', 4: 'zap' }[k];
    if (option) { e.preventDefault(); chooseDiscipline(option); }
    else if (k === 'escape') { e.preventDefault(); closeDiscipline(); }
    return;
  }
  if (top === el.confirmOverlay) {
    if (k === 'escape') { e.preventDefault(); cancelConfirm(); }
    return;
  }
  if (top === el.pauseOverlay) {
    // some browsers deliver the Esc that released pointer lock (and paused) as a key press too
    if ((k === 'escape' && !justPausedByEsc()) || k === 'p') { e.preventDefault(); setPaused(false); }
    return;
  }
  if (top) return; // start / end screens: their buttons handle Enter and Space

  if (!S.running) return;
  if (MOVEMENT_KEYS.has(k)) {
    keys[k] = true;
    if (k.startsWith('arrow')) e.preventDefault();
    return;
  }
  if (e.repeat) return;
  switch (k) {
    case 'e': primaryAction(); break;
    case 'f': disciplineAction(); break;
    case 'r': toggleSeatChart(true); break; // keyboard users land on the chart's first seat
    case 'q': askRollCall(); break;
    case 'p': setPaused(true); break;
    case 'm': setMuted(!audioPrefs().muted); break;
    case 'escape':
      if (S.seatChartOpen) setSeatChart(false);
      else if (!justPausedByEsc()) setPaused(true);
      break;
    default: return;
  }
  e.preventDefault();
}

export function setupInput() {
  setupPointer();
  setupJoystick();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', releaseKeys);
}

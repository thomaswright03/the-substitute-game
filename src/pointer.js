// Pointer lock: mouse-look captures the pointer while a round is played, and lets it go
// whenever a menu, a dialog or the seating chart needs the cursor.
import { el } from './dom.js';
import { S, frozen } from './session.js';
import { look } from './player.js';
import { topDialog } from './dialogs.js';
import { emit } from './bus.js';

let ownUnlock = false;
let pausedByUnlockAt = -Infinity;
let skipNextMove = false;

// Something on screen needs the cursor: a dialog, the seating chart, or no round in play.
function cursorNeeded() {
  return !S.running || frozen() || S.seatChartOpen || topDialog() !== null;
}

export function requestLook() {
  if (S.isTouch || look.pointerLocked || cursorNeeded() || !el.canvas.requestPointerLock) return;
  try {
    const p = el.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { /* refused: hover-look still works */ });
  } catch { /* unsupported: hover-look still works */ }
}

export function releaseLook() {
  if (!look.pointerLocked || !document.exitPointerLock) return;
  ownUnlock = true;
  document.exitPointerLock();
}

export function stopHoverLook() {
  look.hoverInside = false;
  look.edgeX = look.edgeY = 0;
}

// An Esc that released pointer lock also paused the game; don't let the same key unpause it.
export function justPausedByEsc() {
  return performance.now() - pausedByUnlockAt < 400;
}

// The first mouse movement after locking is often one huge jump: skip it (read once).
export function takeSkipNextMove() {
  const skip = skipNextMove;
  skipNextMove = false;
  return skip;
}

export function setupPointerLock() {
  document.addEventListener('pointerlockchange', () => {
    look.pointerLocked = document.pointerLockElement === el.canvas;
    el.stage.classList.toggle('locked', look.pointerLocked);
    if (look.pointerLocked) {
      stopHoverLook();
      skipNextMove = true;
      // The lock can arrive late: after the player already opened the seating chart or a menu
      // (a quick R right after Start). Whatever is open needs the cursor, so give it back.
      if (cursorNeeded()) releaseLook();
      return;
    }
    // the browser releases the lock itself when the player presses Esc: treat that as "pause"
    if (ownUnlock) ownUnlock = false;
    else if (!cursorNeeded()) {
      pausedByUnlockAt = performance.now();
      emit('pauseRequested');
    }
  });
}

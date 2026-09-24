// The page elements the game drives, and small DOM helpers.
import { S } from './session.js';

export const $ = (id) => document.getElementById(id);

export const el = {
  cabinet: $('cabinet'), stage: $('stage'), canvas: $('gl'), studentLayer: $('studentLayer'), hud: $('hud'),
  log: $('log'), chaosBadge: $('chaosBadge'), chaosValue: $('chaosValue'), chaosFill: $('chaosFill'),
  clockValue: $('clockValue'), clockFill: $('clockFill'),
  crosshair: $('crosshair'), prompt: $('prompt'), threatCue: $('threatCue'),
  speechBubble: $('speechBubble'), bubbleText: $('bubbleText'), dirArrow: $('dirArrow'), dirArrowGlyph: $('dirArrowGlyph'),
  pauseBtn: $('pauseBtn'), fullscreenBtn: $('fullscreenBtn'),
  startOverlay: $('startOverlay'), startBtn: $('startBtn'), bestStart: $('bestStart'),
  endOverlay: $('endOverlay'), restartBtn: $('restartBtn'),
  endMenuBtn: $('endMenuBtn'), endBestLabel: $('endBestLabel'), endBestGrade: $('endBestGrade'), endNewBest: $('endNewBest'),
  pauseOverlay: $('pauseOverlay'), resumeBtn: $('resumeBtn'), restartFromPause: $('restartFromPause'), pauseMenuBtn: $('pauseMenuBtn'),
  confirmOverlay: $('confirmOverlay'), confirmTitle: $('confirmTitle'), confirmBody: $('confirmBody'), confirmYes: $('confirmYes'), confirmNo: $('confirmNo'),
  discOverlay: $('disciplineOverlay'), discName: $('discName'), discCancel: $('discCancel'),
  flash: $('flash'), hitVignette: $('hitVignette'),
  attPanel: $('attendancePanel'), attQuestion: $('attQuestion'), attHint: $('attHint'), attAnswer: $('attAnswer'),
  banner: $('reassignBanner'), seatChart: $('seatChart'), seatThreat: $('seatThreat'), seatGrid: $('seatGrid'), seatClose: $('seatClose'),
  actions: $('actions'), actPrimary: $('actPrimary'), actDiscipline: $('actDiscipline'), actRollCall: $('actRollCall'), actSeats: $('actSeats'),
  joystick: $('joystick'), knob: $('knob'),
};

export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

// A button or prompt line that shows its keyboard key first (keyboard players only).
export function keyedLabel(node, key, text) {
  node.textContent = '';
  if (key && !S.isTouch) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    node.append(kbd);
  }
  node.append(document.createTextNode(text));
}

// Replays a CSS animation that is triggered by a class.
export function restartAnimation(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// The page elements the game drives, and small DOM helpers.
import { S } from './session.js';

/**
 * The page element with this id. A missing element is a mistake in the page or the code, so it
 * stops the game at start-up with a message naming the id (test/unit/dom.test.js also checks that
 * every id the game asks for is in index.html).
 * @template {HTMLElement} [T=HTMLElement]
 * @param {string} id
 * @param {{new (): T, prototype: T}} [type] the element's class, when the code needs more than HTMLElement
 * @returns {T}
 */
export function $(id, type) {
  const node = document.getElementById(id);
  if (!node) throw new Error('The page has no element #' + id);
  if (!(node instanceof (type || HTMLElement))) throw new Error('#' + id + ' is not a ' + (type || HTMLElement).name);
  return /** @type {T} */ (node);
}

/**
 * Every form control on the page that matches `selector` (each setting has a copy on the start
 * and the pause screen).
 * @param {string} selector
 * @returns {HTMLInputElement[]}
 */
export function allInputs(selector) {
  return /** @type {HTMLInputElement[]} */ ([...document.querySelectorAll(selector)]);
}

/**
 * @param {string} selector
 * @returns {HTMLSelectElement[]}
 */
export function allSelects(selector) {
  return /** @type {HTMLSelectElement[]} */ ([...document.querySelectorAll(selector)]);
}

export const el = {
  cabinet: $('cabinet'), stage: $('stage'), canvas: $('gl', HTMLCanvasElement), studentLayer: $('studentLayer'), hud: $('hud'),
  log: $('log'), chaosBadge: $('chaosBadge'), chaosValue: $('chaosValue'), chaosFill: $('chaosFill'),
  clockValue: $('clockValue'), clockFill: $('clockFill'),
  crosshair: $('crosshair'), prompt: $('prompt'), threatCue: $('threatCue'),
  speechBubble: $('speechBubble'), bubbleText: $('bubbleText'), dirArrow: $('dirArrow'), dirArrowGlyph: $('dirArrowGlyph'),
  pauseBtn: $('pauseBtn', HTMLButtonElement), fullscreenBtn: $('fullscreenBtn', HTMLButtonElement),
  startOverlay: $('startOverlay'), startBtn: $('startBtn', HTMLButtonElement), bestStart: $('bestStart'),
  endOverlay: $('endOverlay'), restartBtn: $('restartBtn', HTMLButtonElement),
  endMenuBtn: $('endMenuBtn', HTMLButtonElement), endBestLabel: $('endBestLabel'), endBestGrade: $('endBestGrade'), endNewBest: $('endNewBest'),
  pauseOverlay: $('pauseOverlay'), resumeBtn: $('resumeBtn', HTMLButtonElement), restartFromPause: $('restartFromPause', HTMLButtonElement), pauseMenuBtn: $('pauseMenuBtn', HTMLButtonElement),
  confirmOverlay: $('confirmOverlay'), confirmTitle: $('confirmTitle'), confirmBody: $('confirmBody'), confirmYes: $('confirmYes', HTMLButtonElement), confirmNo: $('confirmNo', HTMLButtonElement),
  discOverlay: $('disciplineOverlay'), discName: $('discName'), discCancel: $('discCancel', HTMLButtonElement),
  flash: $('flash'), hitVignette: $('hitVignette'),
  attPanel: $('attendancePanel'), attQuestion: $('attQuestion'), attHint: $('attHint'), attAnswer: $('attAnswer'),
  banner: $('reassignBanner'), seatChart: $('seatChart'), seatThreat: $('seatThreat'), seatGrid: $('seatGrid'), seatClose: $('seatClose', HTMLButtonElement),
  actions: $('actions'), actPrimary: $('actPrimary', HTMLButtonElement), actDiscipline: $('actDiscipline', HTMLButtonElement), actRollCall: $('actRollCall', HTMLButtonElement), actSeats: $('actSeats', HTMLButtonElement),
  joystick: $('joystick'), knob: $('knob'),
};

/**
 * @param {Node} node
 * @param {string} text
 */
export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * A button or prompt line that shows its keyboard key first (keyboard players only).
 * @param {HTMLElement} node
 * @param {string | null} key
 * @param {string} text
 */
export function keyedLabel(node, key, text) {
  node.textContent = '';
  if (key && !S.isTouch) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    node.append(kbd);
  }
  node.append(document.createTextNode(text));
}

/**
 * Replays a CSS animation that is triggered by a class.
 * @param {HTMLElement} node
 * @param {string} cls
 */
export function restartAnimation(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// Sheets: the screens that open over another screen without ending it (how to play, the
// settings, the Voice studio). The start and pause screens have buttons that open them
// (data-open="<id>"); a sheet closes with its own close buttons (data-close), a click outside
// it, or Escape (see input.js).
import { closeDialog, openDialog } from './dialogs.js';
import { $ } from './dom.js';

/** @type {Map<string, (() => void)[]>} what to do when a sheet opens, by the sheet's id */
const openers = new Map();

/**
 * Runs `fn` every time the sheet is opened, so it can show what is current.
 * @param {string} id
 * @param {() => void} fn
 */
export function onSheetOpen(id, fn) {
  openers.set(id, [...(openers.get(id) || []), fn]);
}

/** @param {string} id */
function openSheet(id) {
  const sheet = $(id);
  for (const fn of openers.get(id) || []) fn();
  openDialog(sheet);
}

/** @param {HTMLElement} sheet */
export function closeSheet(sheet) {
  closeDialog(sheet);
}

/** @param {HTMLElement | null} node whether this is a sheet that is open on top of something */
export function isSheet(node) {
  return !!node && node.classList.contains('sheetOverlay');
}

export function setupSheets() {
  for (const button of document.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => openSheet(button.getAttribute('data-open') || ''));
  }
  for (const sheet of document.querySelectorAll('.sheetOverlay')) {
    if (!(sheet instanceof HTMLElement)) continue;
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(sheet); });
    for (const button of sheet.querySelectorAll('[data-close]')) button.addEventListener('click', () => closeSheet(sheet));
  }
}

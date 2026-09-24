// Modal dialogs: a stack that remembers where focus came from, and a focus trap.
import { el } from './dom.js';

/** @type {{node: HTMLElement, returnTo: Element | null}[]} open dialogs, the top one last */
const dialogStack = [];
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * What Tab can reach inside `root`, in order.
 * @param {HTMLElement} root
 */
function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)]
    .filter((n) => n instanceof HTMLElement && !n.closest('[hidden]') && n.offsetParent !== null)
    .map((n) => /** @type {HTMLElement} */ (n));
}

/**
 * @param {HTMLElement} node
 * @param {HTMLElement} [focusTarget] what takes focus (else the first thing Tab reaches)
 */
export function openDialog(node, focusTarget) {
  node.hidden = false;
  if (!dialogStack.some((d) => d.node === node)) dialogStack.push({ node, returnTo: document.activeElement });
  const target = focusTarget || focusables(node)[0];
  if (target) target.focus({ preventScroll: true });
  node.scrollTop = 0;
}

/** @param {HTMLElement} node */
export function closeDialog(node) {
  node.hidden = true;
  const i = dialogStack.findIndex((d) => d.node === node);
  if (i < 0) return;
  const [entry] = dialogStack.splice(i, 1);
  const back = entry.returnTo;
  if (back instanceof HTMLElement && back !== document.body && back.isConnected && back.offsetParent !== null && !back.closest('[hidden]')) {
    back.focus({ preventScroll: true });
  } else {
    el.canvas.focus({ preventScroll: true });
  }
}

export function topDialog() {
  return dialogStack.length ? dialogStack[dialogStack.length - 1].node : null;
}

// keep Tab / Shift+Tab inside the open dialog
export function setupDialogs() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const top = topDialog();
    if (!top) return;
    const items = focusables(top);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    const inside = top.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  });
}

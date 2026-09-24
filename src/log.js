// The log at the bottom of the screen: what just happened, newest last.
import { el } from './dom.js';

const LOG_LINES = 12; // kept in the log; CSS shows the newest few and fades the rest out

export function pushLog(text) {
  const line = document.createElement('div');
  line.textContent = text;
  el.log.appendChild(line);
  while (el.log.children.length > LOG_LINES) el.log.removeChild(el.log.firstChild);
}

export function clearLog() {
  el.log.textContent = '';
}

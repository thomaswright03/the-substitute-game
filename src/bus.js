// A small event bus. The game's modules form a strict hierarchy (scripts/check-cycles.mjs keeps
// it that way), so a module lower down asks for something a higher one does by emitting a
// named event; the higher module subscribes when the game is set up.
//
//   'rulesChanged'  a player action changed the rules' state: turn its events into effects now
//   'pauseRequested'  the browser released the pointer lock (the player pressed Esc)
/** @typedef {'rulesChanged' | 'pauseRequested'} BusEvent */

/** @type {Map<BusEvent, (() => void)[]>} */
const handlers = new Map();

/**
 * @param {BusEvent} type
 * @param {() => void} fn
 */
export function on(type, fn) {
  const list = handlers.get(type) || [];
  list.push(fn);
  handlers.set(type, list);
}

/** @param {BusEvent} type */
export function emit(type) {
  for (const fn of handlers.get(type) || []) fn();
}

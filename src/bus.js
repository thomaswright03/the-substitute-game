// A small event bus. The game's modules form a strict hierarchy (scripts/check-cycles.mjs keeps
// it that way), so a module lower down asks for something a higher one does by emitting a
// named event; the higher module subscribes when the game is set up.
//
//   'rulesChanged'  a player action changed the rules' state: turn its events into effects now
//   'pauseRequested'  the browser released the pointer lock (the player pressed Esc)
const handlers = new Map();

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
}

export function emit(type, ...args) {
  for (const fn of handlers.get(type) || []) fn(...args);
}

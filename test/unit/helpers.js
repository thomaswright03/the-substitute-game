import { createGame, tick } from '../../src/rules.js';

// Small deterministic PRNG so every rules test is reproducible.
export function seeded(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGame(opts = {}) {
  return createGame({ rng: seeded(opts.seed ?? 1), ...opts });
}

// Advance the clock in small steps, the way the render loop does.
export function run(game, seconds, view = {}, step = 1 / 30) {
  let left = seconds;
  while (left > 1e-9 && game.phase !== 'over') {
    const dt = Math.min(step, left);
    tick(game, dt, view);
    left -= dt;
  }
}

export function eventsOf(game, type) {
  return game.events.filter((e) => e.type === type);
}

// Hand out every card instantly (for tests that are about the lesson, not attendance).
export function finishAttendance(game, deliver, pickup) {
  while (game.attendance.remaining.length) {
    const id = game.attendance.remaining[0];
    pickup(game, id);
    deliver(game, id);
  }
}

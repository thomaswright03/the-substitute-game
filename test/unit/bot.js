// A simulated "competent human" used to check that a well-played round can be won.
// It walks at human speed (every trip costs seconds), reacts to misbehaviour after a delay,
// faces the board while taking cards (so throws can hit it), and never uses discipline
// unless it catches a thrower.
import {
  argueReady, deliverCard, discipline, help, phoneWarned, pickupCard, swapSeats, tick,
} from '../../src/rules.js';

const DT = 0.1;

export function playWell(game, opts = {}) {
  const reaction = opts.reaction ?? 2.5; // seconds before noticing a student acting up
  const walk = opts.walk ?? 2.5; // seconds to walk to a desk
  const boardTrip = opts.boardTrip ?? 3; // seconds to walk to the board and grab a card
  const splitFriends = opts.splitFriends ?? true;

  let busyUntil = 0;
  let facingBoard = false;
  let helping = null; // id of the student being helped once we have arrived
  let nextPress = 0;
  let pendingCard = null; // card taken, walking to its owner
  let caught = null;

  if (splitFriends) {
    // spend a few seconds re-seating the three pairs of friends
    swapSeats(game, 'benDover', 'mikeHunt');
    swapSeats(game, 'steve', 'hughJass');
    swapSeats(game, 'gabeIches', 'moeLester');
    advance(3);
  }

  function advance(seconds) {
    for (let s = 0; s < seconds - 1e-9 && game.phase !== 'over'; s += DT) {
      const before = game.events.length;
      tick(game, DT, { facingBoard });
      for (const e of game.events.slice(before)) if (e.type === 'caught') caught = e.id;
    }
  }

  function mostUrgent() {
    let best = null;
    for (const s of game.roster) {
      const st = game.students[s.id];
      if (!st.active || st.detained || st.removed) continue;
      if (game.elapsed - st.activatedAt < reaction) continue;
      if (!best || st.escalation > game.students[best].escalation) best = s.id;
    }
    return best;
  }

  while (game.phase !== 'over') {
    if (game.elapsed < busyUntil) {
      advance(DT);
      continue;
    }
    facingBoard = false;

    if (caught) {
      discipline(game, caught, 'talk');
      caught = null;
      continue;
    }

    if (helping) {
      const st = game.students[helping];
      const cfg = game.roster.find((s) => s.id === helping);
      if (!st.active) {
        helping = null;
        continue;
      }
      if (game.elapsed >= nextPress) {
        const canPress = cfg.type !== 'argue' || argueReady(game, helping);
        if (canPress) {
          help(game, helping);
          nextPress = game.elapsed + (cfg.type === 'phone' && phoneWarned(game, helping) ? 0.4 : 0.5);
        }
      }
      advance(DT);
      continue;
    }

    const urgent = mostUrgent();
    const lessPressing = pendingCard && urgent && game.students[urgent].escalation < 35;
    if (urgent && !lessPressing) {
      helping = urgent;
      busyUntil = game.elapsed + walk;
      continue;
    }

    if (pendingCard) {
      deliverCard(game, pendingCard);
      pendingCard = null;
      continue;
    }

    if (game.phase === 'attendance' && game.attendance.remaining.length) {
      const id = game.attendance.remaining[0];
      facingBoard = true; // back to the class while reading the cards
      advance(boardTrip * 0.5);
      facingBoard = false;
      pickupCard(game, id);
      pendingCard = id;
      busyUntil = game.elapsed + walk;
      continue;
    }

    advance(DT);
  }
  return game.outcome;
}

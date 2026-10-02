// A simulated first-time player, used to check that a round can be won by someone who has never
// seen the class before.
//
// It knows only what a new player can see. Names show when you aim at a student, so it learns
// a student's name only by walking up to them (to help, or to hand over a card, right or wrong).
// For a card whose owner it hasn't met, it asks "Is ... present?" (roll call), reads the answer
// and walks toward the voice, and sometimes goes to the wrong neighbour first. Every trip is
// timed from the floor plan at the teacher's walking speed, plus time to turn and aim. It faces
// the board while reading the name cards (so throws can hit it), reacts to misbehaviour after a
// delay, and only disciplines a thrower it has caught.
import {
  argueReady, deliverCard, discipline, help, phoneWarned, pickupCard, rollCall, swapSeats, tick,
} from '../../src/rules.js';
import { ROOM, TEACHER } from '../../src/data.js';
import { seeded } from './helpers.js';

const DT = 0.1;
const BOARD = { x: 0, z: ROOM.frontZ + 1.3 }; // where the teacher stands to take a card

export const FIRST_TIMER = {
  reaction: 2.5, // seconds before noticing a student acting up
  aim: 0.7, // seconds to turn, find the student and line up the crosshair after a walk
  pathFactor: 1.25, // real paths weave between desks: this much longer than the straight line
  readCards: 1.5, // seconds facing the board to read the cards and take one
  readAnswer: 1.5, // seconds to read a roll-call answer and turn toward the voice
  wrongNeighbour: 0.3, // chance of going to a neighbour of the student who answered first
  splitFriends: false, // a first-timer doesn't know about friends yet
};

export function playWell(game, opts = {}) {
  const o = { ...FIRST_TIMER, ...opts };
  const rng = seeded(opts.botSeed ?? 1);
  const known = new Set(); // students whose name the bot has seen

  let pos = { x: 0, z: TEACHER.startZ };
  let busyUntil = 0;
  let facingBoard = false;
  let helping = null; // id of the student being helped once we have arrived
  let nextPress = 0;
  let pendingCard = null; // card taken, walking to its owner
  let target = null; // where the card is being taken: the owner, or a neighbour by mistake
  let caught = null;

  function advance(seconds) {
    for (let s = 0; s < seconds - 1e-9 && game.phase !== 'over'; s += DT) {
      const before = game.events.length;
      tick(game, DT, { facingBoard });
      for (const e of game.events.slice(before)) if (e.type === 'caught') caught = e.id;
    }
  }

  function spotOf(id) {
    // in front of the student's desk, where the crosshair can reach their face
    const seat = game.seats[id];
    return { x: ROOM.colsX[seat.col], z: ROOM.rowsZ[seat.row] - 0.9 };
  }

  // Starts a walk; the bot is busy until it has arrived and aimed.
  function walkTo(spot) {
    const metres = Math.hypot(spot.x - pos.x, spot.z - pos.z) * o.pathFactor;
    busyUntil = game.elapsed + metres / TEACHER.speed + o.aim;
    pos = spot;
  }

  function neighbourOf(id) {
    const seat = game.seats[id];
    const beside = game.roster.map((s) => s.id).filter((other) => {
      const s2 = game.seats[other];
      return other !== id && !game.students[other].removed && s2.row === seat.row && Math.abs(s2.col - seat.col) === 1;
    });
    return beside.length ? beside[Math.floor(rng() * beside.length)] : null;
  }

  function mostUrgent() {
    let best = null;
    for (const s of game.roster) {
      const st = game.students[s.id];
      if (!st.active || st.detained || st.removed) continue;
      if (game.elapsed - st.activatedAt < o.reaction) continue;
      if (!best || st.escalation > game.students[best].escalation) best = s.id;
    }
    return best;
  }

  if (o.splitFriends) {
    swapSeats(game, 'benDover', 'mikeHunt');
    swapSeats(game, 'steve', 'hughJass');
    swapSeats(game, 'gabeIches', 'moeLester');
    advance(3);
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
      known.add(urgent); // aiming at them shows their name
      walkTo(spotOf(urgent));
      continue;
    }

    if (pendingCard && target) {
      // arrived (possibly after an interruption, which leaves pos elsewhere: walk back first)
      const spot = spotOf(target);
      if (pos.x !== spot.x || pos.z !== spot.z) {
        walkTo(spot);
        continue;
      }
      known.add(target);
      if (game.students[pendingCard].removed) {
        pendingCard = null; // the office marked them
        target = null;
        continue;
      }
      const result = deliverCard(game, target);
      if (result === 'delivered' || result === null) {
        pendingCard = null;
        target = null;
      } else {
        target = pendingCard; // "That's not my name": the right desk is next door
        walkTo(spotOf(target));
      }
      continue;
    }

    if (pendingCard && !target) {
      if (known.has(pendingCard)) {
        target = pendingCard;
      } else {
        // "Is ... present?": read the answer, then head for the voice
        rollCall(game);
        advance(o.readAnswer);
        const wrong = rng() < o.wrongNeighbour ? neighbourOf(pendingCard) : null;
        target = wrong || pendingCard;
      }
      walkTo(spotOf(target));
      continue;
    }

    if (game.phase === 'attendance' && game.attendance.remaining.length) {
      if (pos !== BOARD) {
        walkTo(BOARD);
        continue;
      }
      const id = game.attendance.remaining[0];
      facingBoard = true; // back to the class while reading the cards
      advance(o.readCards);
      facingBoard = false;
      if (game.phase !== 'attendance' || !game.attendance.remaining.includes(id)) continue;
      pickupCard(game, id);
      pendingCard = id;
      target = null;
      continue;
    }

    advance(DT);
  }
  return game.outcome;
}

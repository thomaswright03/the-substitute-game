import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentFriend, argueReady, chaos, deliverCard, discipline, disciplineEligibility, disciplineMenu,
  escalationRate, help, interventions, pickupCard, report, rollCall, swapSeats, tick,
  timeUntilArgueReady,
} from '../../src/rules.js';
import { STUDENTS, TUNING } from '../../src/data.js';
import { eventsOf, finishAttendance, newGame, run } from './helpers.js';

function activateNow(game, id, escalation = 0) {
  const st = game.students[id];
  st.active = true;
  st.escalation = escalation;
  st.activatedAt = game.elapsed;
}

// keep the random spawner out of a test that wants to control exactly who acts up
function noSpawns(game) {
  game.spawnTimer = Infinity;
}

describe('an idle round', () => {
  test('never ends in a win', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const game = newGame({ seed });
      run(game, TUNING.period + 5);
      assert.equal(game.phase, 'over', `seed ${seed} should have ended`);
      assert.equal(game.outcome.won, false, `seed ${seed} was won by doing nothing`);
    }
  });

  test('loses to misbehaviour well before the bell', () => {
    const game = newGame({ seed: 7 });
    run(game, TUNING.period);
    assert.equal(game.outcome.reason, 'student');
    assert.ok(game.elapsed < TUNING.period * 0.75, `lost only at ${game.elapsed}s`);
  });

  test('students start acting up during attendance', () => {
    const game = newGame({ seed: 3 });
    run(game, TUNING.firstSpawnDelay + 0.5);
    assert.equal(game.phase, 'attendance');
    assert.equal(eventsOf(game, 'activate').length, 1);
  });

  test('unfinished attendance at the bell is a loss even if nobody acts up', () => {
    const game = newGame({ seed: 1 });
    noSpawns(game);
    game.tuning.throwChanceAttendance = 0;
    pickupCard(game, 'dixieNormous');
    deliverCard(game, 'dixieNormous');
    run(game, TUNING.period + 1);
    assert.deepEqual(game.outcome, { won: false, reason: 'attendance', unmarked: STUDENTS.length - 1 });
  });
});

describe('a round played well', () => {
  test('a finished attendance with no incidents wins at the bell', () => {
    const game = newGame();
    finishAttendance(game, deliverCard, pickupCard);
    assert.equal(game.phase, 'lesson');
    noSpawns(game);
    run(game, TUNING.period + 1);
    assert.deepEqual(game.outcome, { won: true, reason: 'bell' });
  });
});

describe('attendance', () => {
  test('a card goes to its owner and marks them present', () => {
    const game = newGame();
    assert.equal(pickupCard(game, 'gabeIches'), true);
    assert.equal(game.attendance.holding, 'gabeIches');
    assert.equal(pickupCard(game, 'mikeOxlong'), false, 'cannot carry two cards');
    assert.equal(deliverCard(game, 'gabeIches'), 'delivered');
    assert.equal(game.attendance.delivered, 1);
    assert.equal(game.attendance.holding, null);
    assert.ok(!game.attendance.remaining.includes('gabeIches'));
  });

  test('the wrong student rejects the card and you keep holding it', () => {
    const game = newGame();
    pickupCard(game, 'gabeIches');
    assert.equal(deliverCard(game, 'mikeOxlong'), 'wrong');
    assert.equal(game.attendance.holding, 'gabeIches');
    assert.equal(game.attendance.delivered, 0);
    assert.deepEqual(eventsOf(game, 'wrongStudent').map((e) => [e.id, e.heldId]), [['mikeOxlong', 'gabeIches']]);
  });

  test('delivering all eight cards starts the lesson', () => {
    const game = newGame();
    finishAttendance(game, deliverCard, pickupCard);
    assert.equal(game.phase, 'lesson');
    assert.equal(eventsOf(game, 'attendanceComplete').length, 1);
  });

  test('roll call answers once per card, from the card owner', () => {
    const game = newGame();
    assert.equal(rollCall(game), null, 'nothing to ask without a card');
    pickupCard(game, 'moeLester');
    assert.equal(rollCall(game), 'moeLester');
    assert.equal(rollCall(game), null);
  });

  test('a student sent to the principal is marked by the office', () => {
    const game = newGame();
    activateNow(game, 'moeLester', 30);
    discipline(game, 'moeLester', 'principal');
    assert.ok(!game.attendance.remaining.includes('moeLester'));
    assert.equal(game.attendance.delivered, 1);
  });
});

describe('escalation', () => {
  test('reaching 100% loses with the culprit named', () => {
    const game = newGame();
    finishAttendance(game, deliverCard, pickupCard);
    noSpawns(game);
    activateNow(game, 'steve', 95);
    run(game, 5);
    assert.deepEqual(game.outcome, { won: false, reason: 'student', culpritId: 'steve' });
    assert.equal(eventsOf(game, 'nearlyLost').length, 1);
  });

  test('chaos is the worst escalation among students acting up', () => {
    const game = newGame();
    activateNow(game, 'steve', 30);
    activateNow(game, 'mikeOxlong', 55);
    assert.equal(chaos(game), 55);
  });

  test('students escalate more slowly during attendance than in the lesson', () => {
    const game = newGame();
    const duringAttendance = escalationRate(game, 'mikeHunt');
    finishAttendance(game, deliverCard, pickupCard);
    assert.ok(escalationRate(game, 'mikeHunt') > duringAttendance);
  });
});

describe('helping (E)', () => {
  test('lowers escalation and calms a student at zero', () => {
    const game = newGame();
    activateNow(game, 'steve', 40);
    assert.equal(help(game, 'steve'), 'calmed');
    assert.equal(game.students.steve.active, false);
  });

  test('does nothing for a student who is behaving', () => {
    const game = newGame();
    assert.equal(help(game, 'steve'), null);
    assert.equal(game.counters.helps, 0);
  });

  test('the phone takes two presses: a warning, then taking it', () => {
    const game = newGame();
    activateNow(game, 'benDover', 60);
    assert.equal(help(game, 'benDover'), 'warned');
    assert.equal(game.students.benDover.active, true);
    run(game, 0.5);
    assert.equal(help(game, 'benDover'), 'calmed');
    assert.equal(game.students.benDover.active, false);
  });

  test('the phone warning expires if you wait too long', () => {
    const game = newGame();
    noSpawns(game);
    activateNow(game, 'benDover', 20);
    help(game, 'benDover');
    run(game, TUNING.phoneWarnWindow + 0.5);
    assert.equal(help(game, 'benDover'), 'warned');
  });

  test('the arguer only calms during his pause; interrupting makes it worse', () => {
    const game = newGame();
    noSpawns(game);
    activateNow(game, 'hughJass', 50);
    run(game, TUNING.argueReadyWindow + 0.1);
    assert.equal(argueReady(game, 'hughJass'), false);
    const before = game.students.hughJass.escalation;
    assert.equal(help(game, 'hughJass'), 'missed');
    assert.ok(game.students.hughJass.escalation > before);
    run(game, timeUntilArgueReady(game, 'hughJass') + 0.05);
    assert.equal(argueReady(game, 'hughJass'), true);
    assert.notEqual(help(game, 'hughJass'), 'missed');
    assert.ok(game.students.hughJass.escalation < before);
  });
});

describe('discipline (F)', () => {
  test('is refused for a student who is not acting up', () => {
    const game = newGame();
    assert.deepEqual(disciplineEligibility(game, 'dixieNormous'), { ok: false, reason: 'calm' });
    for (const option of ['talk', 'detention', 'principal', 'zap']) {
      assert.equal(discipline(game, 'dixieNormous', option), false, option);
    }
    assert.equal(game.students.dixieNormous.detained, false);
  });

  test('is allowed on a thrower you just caught, even if they look calm', () => {
    const game = newGame();
    game.students.dixieNormous.caughtUntil = game.elapsed + 5;
    assert.equal(disciplineEligibility(game, 'dixieNormous').ok, true);
  });

  test('a stern talking-to lowers escalation but may not fully settle', () => {
    const game = newGame();
    activateNow(game, 'mikeOxlong', 80);
    assert.equal(discipline(game, 'mikeOxlong', 'talk'), true);
    assert.equal(game.students.mikeOxlong.escalation, 80 - TUNING.talkCalm);
    assert.equal(game.students.mikeOxlong.active, true);
    assert.equal(game.counters.talks, 1);
  });

  test('detention silences the student, riles the class, and is limited per period', () => {
    const game = newGame();
    activateNow(game, 'mikeOxlong', 50);
    activateNow(game, 'steve', 20);
    assert.equal(discipline(game, 'mikeOxlong', 'detention'), true);
    assert.equal(game.students.mikeOxlong.detained, true);
    assert.equal(game.students.steve.escalation, 20 + TUNING.detentionClassBump);

    activateNow(game, 'moeLester', 10);
    assert.equal(discipline(game, 'moeLester', 'detention'), true);
    activateNow(game, 'gabeIches', 10);
    assert.equal(disciplineMenu(game, 'gabeIches').detention.available, false);
    assert.equal(disciplineMenu(game, 'gabeIches').detention.left, 0);
    assert.equal(discipline(game, 'gabeIches', 'detention'), false);
    assert.equal(game.students.gabeIches.detained, false);
  });

  test('with every detention used, misbehaviour still happens and the round can be lost', () => {
    const game = newGame({ seed: 11 });
    finishAttendance(game, deliverCard, pickupCard);
    activateNow(game, 'moeLester', 10);
    activateNow(game, 'steve', 10);
    discipline(game, 'moeLester', 'detention');
    discipline(game, 'steve', 'detention');
    run(game, TUNING.period);
    assert.ok(eventsOf(game, 'activate').length > 0);
    assert.equal(game.outcome.won, false);
  });

  test('a detained student never acts up again', () => {
    const game = newGame({ seed: 5 });
    activateNow(game, 'mikeOxlong', 50);
    discipline(game, 'mikeOxlong', 'detention');
    run(game, 80);
    const later = eventsOf(game, 'activate').filter((e) => e.id === 'mikeOxlong');
    assert.equal(later.length, 0);
  });

  test('the principal removes the student, calms the others, and comes once per period', () => {
    const game = newGame();
    activateNow(game, 'moeLester', 50);
    activateNow(game, 'steve', 50);
    assert.equal(discipline(game, 'moeLester', 'principal'), true);
    assert.equal(game.students.moeLester.removed, true);
    assert.equal(game.students.steve.escalation, 50 - TUNING.principalClassCalm);
    assert.equal(disciplineMenu(game, 'steve').principal.available, false);
    assert.equal(discipline(game, 'steve', 'principal'), false);
  });

  test('the zap calms instantly, sets someone else off and then needs to recharge', () => {
    const game = newGame({ seed: 2 });
    noSpawns(game);
    activateNow(game, 'mikeOxlong', 90);
    assert.equal(discipline(game, 'mikeOxlong', 'zap'), true);
    assert.equal(game.students.mikeOxlong.active, false);
    const zap = eventsOf(game, 'zap')[0];
    assert.ok(zap.setOffId && zap.setOffId !== 'mikeOxlong');
    assert.equal(game.students[zap.setOffId].active, true);
    assert.equal(game.students[zap.setOffId].escalation, TUNING.zapCommotionEscalation);

    activateNow(game, 'steve', 40);
    assert.equal(disciplineMenu(game, 'steve').zap.available, false);
    for (const s of STUDENTS) game.students[s.id].active = false;
    run(game, TUNING.zapCooldown + 0.1);
    activateNow(game, 'steve', 40);
    assert.equal(disciplineMenu(game, 'steve').zap.available, true);
  });

  test('no option dominates: each has a limit or a cost the others do not', () => {
    const menuCosts = {
      talk: TUNING.talkCalm < 100, // partial effect
      detention: TUNING.detentionsPerPeriod < STUDENTS.length && TUNING.detentionClassBump > 0,
      principal: TUNING.principalCallsPerPeriod === 1 && TUNING.report.principal > 0,
      zap: TUNING.zapCooldown > 0 && TUNING.zapCommotionEscalation > 0,
    };
    assert.deepEqual(menuCosts, { talk: true, detention: true, principal: true, zap: true });
  });
});

describe('seating', () => {
  test('friends seated side by side escalate faster, and a swap slows them down', () => {
    const game = newGame();
    noSpawns(game);
    finishAttendance(game, deliverCard, pickupCard);
    assert.equal(adjacentFriend(game, 'mikeOxlong'), 'gabeIches');
    const together = escalationRate(game, 'mikeOxlong');

    activateNow(game, 'mikeOxlong', 0);
    run(game, 5);
    const gainedTogether = game.students.mikeOxlong.escalation;

    assert.equal(swapSeats(game, 'gabeIches', 'moeLester'), true);
    assert.equal(adjacentFriend(game, 'mikeOxlong'), null);
    const apart = escalationRate(game, 'mikeOxlong');
    assert.ok(apart < together);
    assert.ok(Math.abs(together / apart - TUNING.friendBoost) < 1e-9);

    game.students.mikeOxlong.escalation = 0;
    run(game, 5);
    assert.ok(game.students.mikeOxlong.escalation < gainedTogether, 'measured escalation should drop after the swap');
  });

  test('the game explains a swap that splits friends up, or seats them together', () => {
    const game = newGame();
    swapSeats(game, 'mikeOxlong', 'hughJass');
    const split = eventsOf(game, 'swap')[0];
    assert.deepEqual(split.separated, [['gabeIches', 'mikeOxlong']]);
    assert.deepEqual(split.together, []);
    swapSeats(game, 'mikeOxlong', 'hughJass');
    const rejoined = eventsOf(game, 'swap')[1];
    assert.deepEqual(rejoined.together, [['gabeIches', 'mikeOxlong']]);
  });

  test('friends egging each other on is announced once per incident', () => {
    const game = newGame();
    noSpawns(game);
    activateNow(game, 'mikeOxlong', 0);
    run(game, 2);
    assert.deepEqual(eventsOf(game, 'eggedOn').map((e) => [e.id, e.friendId]), [['mikeOxlong', 'gabeIches']]);
  });

  test('a detained or removed friend no longer eggs anyone on', () => {
    const game = newGame();
    activateNow(game, 'gabeIches', 10);
    discipline(game, 'gabeIches', 'detention');
    assert.equal(adjacentFriend(game, 'mikeOxlong'), null);
  });

  test('swapping into a removed student’s seat moves into the empty desk', () => {
    const game = newGame();
    activateNow(game, 'moeLester', 50);
    discipline(game, 'moeLester', 'principal');
    const emptySeat = { ...game.seats.moeLester };
    assert.equal(swapSeats(game, 'gabeIches', 'moeLester'), true);
    assert.deepEqual(game.seats.gabeIches, emptySeat);
  });
});

describe('thrown objects', () => {
  function forceThrow(game, id) {
    game.throw = { id, phase: 'windup', t: 0 };
  }

  test('a hit riles the thrower and the rest of the class', () => {
    const game = newGame();
    noSpawns(game);
    activateNow(game, 'steve', 30);
    forceThrow(game, 'dixieNormous');
    run(game, TUNING.throwWindup + TUNING.throwFlight + 0.05, { facingBoard: true });
    assert.equal(game.counters.hits, 1);
    assert.equal(game.students.dixieNormous.active, true);
    assert.ok(game.students.dixieNormous.escalation >= TUNING.hitThrowerBump);
    assert.ok(game.students.steve.escalation >= 30 + TUNING.hitClassBump);
    const hit = eventsOf(game, 'hit')[0];
    assert.equal(hit.first, true);
  });

  test('turning around in time catches the thrower and opens discipline', () => {
    const game = newGame();
    noSpawns(game);
    forceThrow(game, 'dixieNormous');
    run(game, TUNING.throwWindup + TUNING.throwFlight + 0.05, { facingBoard: false });
    assert.equal(game.counters.hits, 0);
    assert.equal(eventsOf(game, 'caught')[0].id, 'dixieNormous');
    assert.equal(disciplineEligibility(game, 'dixieNormous').ok, true);
  });

  test('throws only start while the teacher faces the board', () => {
    const game = newGame({ seed: 9 });
    noSpawns(game);
    run(game, 60, { facingBoard: false });
    assert.equal(eventsOf(game, 'throwWindup').length, 0);
  });
});

describe('the end-of-period report', () => {
  test('counts every kind of intervention', () => {
    const game = newGame();
    activateNow(game, 'steve', 40);
    help(game, 'steve');
    activateNow(game, 'mikeOxlong', 40);
    discipline(game, 'mikeOxlong', 'talk');
    activateNow(game, 'moeLester', 40);
    discipline(game, 'moeLester', 'detention');
    activateNow(game, 'gabeIches', 40);
    discipline(game, 'gabeIches', 'principal');
    activateNow(game, 'hughJass', 40);
    discipline(game, 'hughJass', 'zap');
    assert.equal(interventions(game), 5);
  });

  test('grades a clean period A and deducts for heavy-handed discipline', () => {
    const clean = newGame();
    assert.deepEqual(report(clean), { score: 100, grade: 'A', deductions: [] });

    const heavy = newGame();
    activateNow(heavy, 'moeLester', 40);
    discipline(heavy, 'moeLester', 'principal');
    activateNow(heavy, 'mikeOxlong', 40);
    discipline(heavy, 'mikeOxlong', 'zap');
    const r = report(heavy);
    assert.equal(r.score, 100 - TUNING.report.principal - TUNING.report.zap);
    assert.equal(r.grade, 'C');
    assert.deepEqual(r.deductions.map((d) => d.kind), ['principal', 'zaps']);
  });
});

describe('ticking', () => {
  test('the period lasts exactly its length in unpaused time, whatever the frame rate', () => {
    for (const step of [1 / 144, 1 / 60, 1 / 10, 1 / 3, 1]) {
      const game = newGame();
      finishAttendance(game, deliverCard, pickupCard);
      noSpawns(game);
      let t = 0;
      while (game.phase !== 'over') {
        tick(game, step);
        t += step;
      }
      assert.ok(Math.abs(t - TUNING.period) <= step + 1e-6, `step ${step}: ended after ${t}s`);
    }
  });
});

describe('messages', () => {
  test('two friends acting up together are announced once, not twice', () => {
    const game = newGame();
    game.spawnTimer = Infinity;
    for (const id of ['gabeIches', 'mikeOxlong']) {
      const st = game.students[id];
      st.active = true;
      st.activatedAt = 0;
    }
    run(game, 1);
    assert.equal(eventsOf(game, 'eggedOn').length, 1);
  });
});

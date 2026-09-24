// Balance: can a new player win? These use the simulated first-time player in bot.js, which
// has to find each card's owner the way a person does (roll call, walking toward the voice,
// sometimes the wrong desk first) and pays for every walk at the teacher's speed.
//
// Win-rate targets:
//  - Standard: the simulated first-timer wins at least 90% of seeds.
//  - Relaxed: a markedly slower player (slower to react, to aim, to read and to find each
//    owner) wins at least 80% of seeds, where on Standard the same player almost never wins.
//  - Relaxed starts gently: a player who spends the whole first minute learning the controls,
//    doing nothing useful, has not lost yet, on every seed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/rules.js';
import { DEFAULT_DIFFICULTY } from '../../src/data.js';
import { run, seeded } from './helpers.js';
import { FIRST_TIMER, playWell } from './bot.js';

const SEEDS = 60;
const SLOW_PLAYER = { reaction: 5, aim: 2, pathFactor: 1.6, wrongNeighbour: 0.6, readCards: 4, readAnswer: 3 };

function winRate(difficulty, bot = {}) {
  let wins = 0;
  const losses = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    const game = createGame({ rng: seeded(seed), difficulty });
    const outcome = playWell(game, { botSeed: seed, ...bot });
    if (outcome.won) wins++;
    else losses[outcome.reason] = (losses[outcome.reason] || 0) + 1;
  }
  return { rate: wins / SEEDS, losses };
}

describe('balance', () => {
  test('the simulated player pays to find each card’s owner', () => {
    const game = createGame({ rng: seeded(1), difficulty: 'standard' });
    playWell(game, { botSeed: 1 });
    const asked = game.events.filter((e) => e.type === 'rollCall').length;
    const wrong = game.events.filter((e) => e.type === 'wrongStudent').length;
    // every owner it had not already met was found by roll call, and some trips went astray
    assert.ok(asked >= 4, `${asked} roll calls`);
    assert.ok(asked + wrong >= 5, `${asked} roll calls and ${wrong} wrong desks`);
    assert.equal(FIRST_TIMER.splitFriends, false, 'a first-timer does not know about friends');
  });

  test('a first-time player wins at least 90% of Standard periods', () => {
    const { rate, losses } = winRate('standard');
    assert.ok(rate >= 0.9, `won ${Math.round(rate * 100)}%, lost ${JSON.stringify(losses)}`);
  });

  test('a much slower player wins at least 80% of Relaxed periods', () => {
    const { rate, losses } = winRate('relaxed', SLOW_PLAYER);
    assert.ok(rate >= 0.8, `won ${Math.round(rate * 100)}%, lost ${JSON.stringify(losses)}`);
  });

  test('that slower player is why Relaxed exists: Standard is out of their reach', () => {
    const { rate } = winRate('standard', SLOW_PLAYER);
    assert.ok(rate <= 0.1, `won ${Math.round(rate * 100)}% of Standard periods`);
  });

  test('a first visit starts on Relaxed', () => {
    assert.equal(DEFAULT_DIFFICULTY, 'relaxed');
  });

  test('a player still learning the controls survives the first minute of Relaxed', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const game = createGame({ rng: seeded(seed), difficulty: 'relaxed' });
      run(game, 60);
      assert.notEqual(game.phase, 'over', `seed ${seed}: lost at ${game.elapsed.toFixed(1)} s`);
    }
  });

  test('doing nothing still loses on Relaxed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = createGame({ rng: seeded(seed), difficulty: 'relaxed' });
      run(game, game.tuning.period + 5);
      assert.equal(game.outcome.won, false, `seed ${seed}`);
    }
  });
});

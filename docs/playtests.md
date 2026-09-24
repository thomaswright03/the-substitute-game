# Playtests

## Results so far

No sessions with real first-time players have been recorded yet. Until they have, the game's
difficulty rests on the simulated players in `test/unit/balance.test.js`:

| Simulated player | Standard (2 min) | Relaxed (4 min) |
| --- | --- | --- |
| First-timer: 2.5 s to react, finds every unknown owner by roll call, 30% of trips to the wrong desk first | wins 90% or more of seeds | wins |
| Slower player: 5 s to react, 2 s to aim, 60% of trips to the wrong desk first | wins almost none (mostly runs out of time for attendance) | wins 80% or more of seeds |

Because a player only a little slower than the first-timer loses almost every Standard period,
a first visit starts on Relaxed. The difficulty can be changed on the start screen, and the
choice is remembered.

**The opening of Relaxed.** A new player spends their first minute learning to walk, look and
pick up a card. Before the gentle start below, a player who did nothing useful in that minute
lost it in 86% of seeded Relaxed periods, the earliest at 31 seconds: the phone student sits
next to his friend and escalates 60% faster. Relaxed now starts gently: the first student acts
up after 15 seconds instead of 7, and until the first name card is handed out, nobody throws
anything and nobody sitting next to a friend starts acting up.

The first version of the gentle start still let students throw. A new player spends much of
that minute at the chalkboard with their back to the class, which is exactly when throws
happen, and a hit sets the thrower off and riles everyone acting up. A player who stood at the
board for the whole minute lost it in about nine seeded periods out of ten, the earliest at
15 seconds. The simulated "learning the controls" player now spends most of its first minute
facing the board (at least 30 seconds of it on average), and the unit tests also check a player
who faces the board for the whole minute. Neither has lost yet on any seed at the one-minute
mark (the earliest loss for a player who does nothing, facing the board or not, is at 77
seconds), and doing nothing for the whole period still loses. Standard is unchanged. This was
tuned from the simulation, not from people; the sessions below should confirm it or say
otherwise.

## How to run a session

1. Use someone who has never played or watched the game. Give them the link and nothing else.
2. Clear the site's storage first (or use a private window) so they start on the default.
3. Watch without helping. Note the device, the input (mouse and keyboard, or touch) and the
   difficulty.
4. Record their first round's outcome from the end screen (won, or which loss), the report
   grade if they won, and anything they got stuck on. Ask whether they would play again.
5. Let them play a second round and record it the same way.

## Session log

| Date | Player (first name or code) | Device and input | Difficulty | Round 1 | Round 2 | Notes |
| --- | --- | --- | --- | --- | --- | --- |

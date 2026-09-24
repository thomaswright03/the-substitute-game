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

import { test, expect } from '@playwright/test';
import { freezeRandomness, hooks, openGame, startRound } from './helpers.js';

// Win the current period on the spot: every card handed out, then the bell.
async function winPeriod(page, extra) {
  await freezeRandomness(page);
  await hooks(page, (s, extra) => {
    const g = s.game, R = s.rules;
    for (const id of [...g.attendance.remaining]) { R.pickupCard(g, id); R.deliverCard(g, id); }
    g.spawnTimer = Infinity; // the lesson would start its own timer
    // the report card counts these: a zap and a detention take 15 points, a B
    if (extra === 'penalties') Object.assign(g.counters, { zaps: 1, detentions: 1 });
    s.fastForward(g.tuning.period + 1);
  }, extra);
  await expect(page.locator('#endTitle')).toHaveText('You Made It');
}

test('after a round, the end screen leads back to the menu, where the difficulty can change', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('input[name="difficulty"][value="relaxed"]')).toBeChecked();
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => s.fastForward(s.game.tuning.period + 1));
  await expect(page.locator('#endOverlay')).toBeVisible();
  await expect(page.locator('#endBest')).toContainText('Best grade · Relaxed');

  await page.locator('#endMenuBtn').click();
  await expect(page.locator('#endOverlay')).toBeHidden();
  await expect(page.locator('#startOverlay')).toBeVisible();
  await expect(page.locator('#startBtn')).toBeFocused();
  expect(await hooks(page, (s) => s.running)).toBe(false);
  // the room behind the menu is a fresh one
  await expect(page.locator('#clockValue')).toHaveText('9:05');
  await expect(page.locator('#chaosValue')).toHaveText('0%');

  await page.locator('input[name="difficulty"][value="standard"]').check();
  await startRound(page);
  expect(await hooks(page, (s) => [s.game.difficulty, s.game.tuning.period])).toEqual(['standard', 120]);
  // 9:05 to 9:50 in two minutes of play (paused, so only these fast-forwards count)
  await freezeRandomness(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await hooks(page, (s) => s.fastForward(60));
  await expect(page.locator('#clockValue')).toHaveText('9:27');
  await hooks(page, (s) => s.fastForward(59));
  await expect(page.locator('#clockValue')).toHaveText('9:49');
  await hooks(page, (s) => s.fastForward(1.5));
  await expect(page.locator('#endOverlay')).toBeVisible();
  await expect(page.locator('#endBest')).toContainText('Best grade · Standard');
});

test('the pause screen leads back to the menu too, after asking first', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => s.fastForward(20));
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();

  // Escape backs out of the question and leaves the period as it was
  await page.locator('#pauseMenuBtn').click();
  await expect(page.locator('#confirmOverlay')).toBeVisible();
  await expect(page.locator('#confirmTitle')).toHaveText('Leave this period?');
  await expect(page.locator('#confirmNo')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#confirmOverlay')).toBeHidden();
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await expect(page.locator('#pauseMenuBtn')).toBeFocused();
  expect(await hooks(page, (s) => [s.running, s.paused, s.game.elapsed >= 20])).toEqual([true, true, true]);

  await page.locator('#pauseMenuBtn').click();
  await page.locator('#confirmYes').click();
  await expect(page.locator('#pauseOverlay')).toBeHidden();
  await expect(page.locator('#startOverlay')).toBeVisible();
  await expect(page.locator('#startBtn')).toBeFocused();
  await expect(page.locator('#clockValue')).toHaveText('9:05');
  expect(await hooks(page, (s) => [s.running, s.paused])).toEqual([false, false]);

  await page.locator('input[name="difficulty"][value="standard"]').check();
  await expect(page.locator('#bestStart')).toHaveText('—');
  await startRound(page);
  expect(await hooks(page, (s) => [s.game.difficulty, s.game.tuning.period, s.game.elapsed < 5])).toEqual(['standard', 120, true]);
});

test('restarting from the pause screen asks first; cancelling keeps the period', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => s.fastForward(30));
  await page.keyboard.press('Escape');
  await page.locator('#restartFromPause').click();
  await expect(page.locator('#confirmTitle')).toHaveText('Restart the period?');
  await expect(page.locator('#confirmBody')).toContainText('progress is lost');
  await expect(page.locator('#confirmYes')).toHaveText('Restart');
  await page.locator('#confirmNo').click();
  await expect(page.locator('#confirmOverlay')).toBeHidden();
  expect(await hooks(page, (s) => s.game.elapsed >= 30)).toBe(true);

  await page.locator('#restartFromPause').click();
  await page.locator('#confirmYes').click();
  await expect(page.locator('#pauseOverlay')).toBeHidden();
  expect(await hooks(page, (s) => [s.running, s.paused, s.game.elapsed < 5])).toEqual([true, false, true]);
});

test('the end screen shows the best grade, and says when it is a new one', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await winPeriod(page);
  await expect(page.locator('#gradeValue')).toHaveText('A');
  await expect(page.locator('#endBestGrade')).toHaveText('A');
  await expect(page.locator('#endNewBest')).toBeVisible();

  // a worse grade next time is not a new best, and the best stays A
  await page.locator('#restartBtn').click();
  await page.waitForFunction(() => window.__substitute.running);
  await winPeriod(page, 'penalties');
  await expect(page.locator('#gradeValue')).toHaveText('B');
  await expect(page.locator('#endBestGrade')).toHaveText('A');
  await expect(page.locator('#endNewBest')).toBeHidden();
});

test('reloading or leaving the page mid-period asks first; the start and end screens do not', async ({ page }) => {
  /** every dialog the page opened, each answered "stay on this page" */
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await openGame(page);
  await page.reload();
  await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
  expect(dialogs).toEqual([]);

  await startRound(page);
  await freezeRandomness(page);
  // The reload is held up by the browser's "Leave site?" question, and staying keeps the period:
  // a mark left on the page survives, which a reload would have wiped.
  const reloadAndStay = async (count) => {
    await page.evaluate(() => { window.stayedMark = true; setTimeout(() => location.reload()); });
    await expect.poll(() => dialogs.length).toBe(count);
    expect(await page.evaluate(() => window.stayedMark === true)).toBe(true);
    expect(dialogs.every((type) => type === 'beforeunload')).toBe(true);
  };
  await reloadAndStay(1);
  expect(await hooks(page, (s) => s.running)).toBe(true);
  // paused is still mid-period
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await reloadAndStay(2);
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await page.locator('#resumeBtn').click();

  await winPeriod(page);
  await page.reload();
  await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
  expect(dialogs).toEqual(['beforeunload', 'beforeunload']);
});

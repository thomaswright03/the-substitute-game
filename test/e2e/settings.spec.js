import { test, expect } from '@playwright/test';
import { hooks, openGame, startRound } from './helpers.js';

test('a first visit plays Relaxed; the chosen difficulty is remembered and used', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('input[name="difficulty"][value="relaxed"]')).toBeChecked();
  await startRound(page);
  expect(await hooks(page, (s) => [s.game.difficulty, s.game.tuning.period])).toEqual(['relaxed', 240]);

  await openGame(page);
  await page.locator('input[name="difficulty"][value="standard"]').check();
  await openGame(page);
  await expect(page.locator('input[name="difficulty"][value="standard"]')).toBeChecked();
  await startRound(page);
  expect(await hooks(page, (s) => [s.game.difficulty, s.game.tuning.period])).toEqual(['standard', 120]);
});

test('each difficulty keeps its own best grade', async ({ page }) => {
  await page.goto('/?test');
  await page.evaluate(() => {
    localStorage.setItem('substitute_best_grade', 'B');
    localStorage.setItem('substitute_best_grade_relaxed', 'A');
  });
  await openGame(page);
  await expect(page.locator('#bestStart')).toHaveText('A');
  await page.locator('input[name="difficulty"][value="standard"]').check();
  await expect(page.locator('#bestStart')).toHaveText('B');
});

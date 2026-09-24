import { test, expect } from '@playwright/test';
import { activate, faceStudent, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

test('a principal model that never arrives does not freeze the round', async ({ page }) => {
  test.setTimeout(120_000);
  // a fresh page whose principal download stalls forever
  await page.route('**/business-man.glb', () => new Promise(() => { /* never answer */ }));
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await activate(page, 'hughJass', 40);
  await faceStudent(page, 'hughJass');
  await page.keyboard.press('f');
  await page.keyboard.press('3');
  await expect(page.locator('#log')).toContainText('The principal is on the way');
  const frozenAt = await hooks(page, (s) => s.game.elapsed);
  await expect(page.locator('#log')).toContainText('walks down there alone', { timeout: 12_000 });
  expect(await hooks(page, (s) => s.world.students.hughJass.visible)).toBe(false);
  await page.waitForFunction((t0) => window.__substitute.game.elapsed > t0 + 0.2, frozenAt, { timeout: 20_000 });
});

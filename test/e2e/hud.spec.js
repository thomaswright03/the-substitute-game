import { test, expect } from '@playwright/test';
import { faceCard, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

test('during play only the log is announced to screen readers', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  const live = await page.evaluate(() => [...document.querySelectorAll('#stage [aria-live], #stage [role="alert"], #stage [role="status"], #stage [role="log"]')]
    .filter((n) => n.checkVisibility()).map((n) => n.id));
  expect(live).toEqual(['log']);
});

test('frames with a roll-call answer showing do not measure the page layout', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await faceCard(page, 'moeLester');
  await page.keyboard.press('e');
  await page.keyboard.press('q');
  await expect(page.locator('#dirArrow')).toBeVisible();
  await expect(page.locator('#attAnswer')).toBeVisible();
  // let the panels settle (a panel that changes size is measured again once), then count the
  // layout reads over the next frames
  const reads = await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const proto = Element.prototype;
    const original = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (...args) { count++; return original.apply(this, args); };
    let frames = -3;
    const tick = () => {
      if (frames === 0) count = 0;
      if (++frames < 10) { requestAnimationFrame(tick); return; }
      proto.getBoundingClientRect = original;
      resolve(count);
    };
    requestAnimationFrame(tick);
  }));
  expect(reads).toBe(0);
  expect(await hooks(page, (s) => s.game.attendance.holding)).toBe('moeLester');
});

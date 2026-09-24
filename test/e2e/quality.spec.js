import { test, expect } from '@playwright/test';
import { freezeRandomness, hooks, openGame, startRound } from './helpers.js';

// Makes every frame take at least `ms` milliseconds, like a device that can't keep up.
function slowEveryFrame(page, ms) {
  return page.evaluate((ms) => {
    const spin = () => {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) { /* busy */ }
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }, ms);
}

test('Automatic steps the graphics down, one thing at a time, while frames stay slow', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 800, height: 500 });
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await slowEveryFrame(page, 80);
  const quality = () => hooks(page, (s) => s.quality());
  // each step waits for a few seconds of slow frames: pixel ratio 1, then no glow, then no
  // shadows, then a lower resolution
  const expected = [
    { level: 1, bloom: true, shadows: true },
    { level: 2, bloom: false, shadows: true },
    { level: 3, bloom: false, shadows: false },
    { level: 4, bloom: false, shadows: false },
  ];
  await page.waitForFunction(() => window.__substitute.quality().level >= 4, null, { timeout: 200_000 });
  // every step was taken, in order, from Automatic
  const changes = await hooks(page, (s) => s.qualityChanges());
  expect(changes).toHaveLength(expected.length);
  expected.forEach((step, i) => {
    expect(changes[i]).toMatchObject({ setting: 'auto', ...step });
    expect(changes[i].pixelRatio).toBeLessThanOrEqual(1);
  });
  expect((await quality()).pixelRatio).toBeLessThan(1);
  // the pause screen says where Automatic has got to
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay select[data-quality] option:checked')).toHaveText('Automatic · Minimum');
});

test('a chosen graphics level is used, kept after a reload, and never changed for you', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await startRound(page);
  await page.keyboard.press('Escape');
  await page.locator('#pauseOverlay select[data-quality]').selectOption('low');
  expect(await hooks(page, (s) => s.quality())).toMatchObject({ setting: 'low', level: 2, pixelRatio: 1, bloom: false, shadows: true });
  // both copies of the control agree
  await expect(page.locator('#startOverlay select[data-quality]')).toHaveValue('low');

  await openGame(page);
  await expect(page.locator('#startOverlay select[data-quality]')).toHaveValue('low');
  await startRound(page);
  await freezeRandomness(page);
  await slowEveryFrame(page, 80);
  await page.waitForTimeout(8000);
  expect(await hooks(page, (s) => s.quality())).toMatchObject({ setting: 'low', level: 2, bloom: false, shadows: true });

  // High is the full look: glow and shadows on
  await page.keyboard.press('Escape');
  await page.locator('#pauseOverlay select[data-quality]').selectOption('high');
  expect(await hooks(page, (s) => s.quality())).toMatchObject({ setting: 'high', level: 0, bloom: true, shadows: true });
});

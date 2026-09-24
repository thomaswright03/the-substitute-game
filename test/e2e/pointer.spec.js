import { test, expect } from '@playwright/test';
import { openGame } from './helpers.js';

// Starting a round with the mouse captures the pointer for looking around.
async function startWithMouse(page) {
  await page.locator('#startBtn').click();
  await page.waitForFunction(() => window.__substitute.running);
}

const locked = (page) => page.evaluate(() => document.pointerLockElement === document.getElementById('gl'));

test('while the mouse is captured the action buttons are key hints, and buttons again once it is freed', async ({ page }) => {
  await openGame(page);
  await startWithMouse(page);
  await expect.poll(() => locked(page)).toBe(true);
  const seats = page.locator('#actSeats');
  await expect(seats).toBeVisible();
  await expect(page.locator('#stage')).toHaveClass(/\blocked\b/);
  const style = () => seats.evaluate((b) => {
    const s = getComputedStyle(b);
    return { pointerEvents: s.pointerEvents, boxShadow: s.boxShadow, key: b.querySelector('kbd') && b.querySelector('kbd').textContent };
  });
  // not clickable, not drawn as a button, still naming its key
  expect(await style()).toEqual({ pointerEvents: 'none', boxShadow: 'none', key: 'R' });

  // Esc frees the mouse and pauses: the buttons are buttons again (behind the pause screen)
  await page.keyboard.press('Escape');
  await expect.poll(() => locked(page)).toBe(false);
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await expect(page.locator('#stage')).not.toHaveClass(/\blocked\b/);
  expect((await style()).pointerEvents).toBe('auto');
  // Resume captures the mouse again, and they are key hints again
  await page.locator('#resumeBtn').click();
  await expect.poll(() => locked(page)).toBe(true);
  // (the page hears of the lock by an event that can come a frame after the lock itself)
  await expect(page.locator('#stage')).toHaveClass(/\blocked\b/);
  expect((await style()).pointerEvents).toBe('none');
});

test('where the mouse is never captured, the action buttons take clicks', async ({ page }) => {
  // as when the browser refuses pointer lock (embedded frames, some kiosks)
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('refused')); };
  });
  await openGame(page);
  await startWithMouse(page);
  await expect(page.locator('#stage')).not.toHaveClass(/\blocked\b/);
  await page.locator('#actSeats').click();
  await expect(page.locator('#seatChart')).toBeVisible();
});

test('the seating chart opened in the moment before the mouse is captured still takes clicks', async ({ page }) => {
  await openGame(page);
  await startWithMouse(page);
  // R straight after Start, before the browser has granted the lock
  await page.keyboard.press('r');
  await expect(page.locator('#seatChart')).toBeVisible();
  // the lock may arrive after the chart opened: the game gives the cursor straight back
  await page.waitForTimeout(500);
  expect(await locked(page)).toBe(false);
  const seat = page.locator('#seatGrid .seat', { hasText: 'Hugh Jass' });
  await seat.click();
  await expect(seat).toHaveClass(/\bselected\b/);
});

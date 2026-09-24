import { test, expect } from '@playwright/test';
import { freezeRandomness, hooks, openGame, startRound } from './helpers.js';

test.describe('mouse look without pointer lock', () => {
  test.beforeEach(async ({ page }) => {
    // as when the browser refuses pointer lock (embedded frames, some kiosks)
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.requestPointerLock = function () {
        return Promise.reject(new Error('denied'));
      };
    });
    await openGame(page);
    await startRound(page);
    await freezeRandomness(page);
  });

  test('edge turning stops as soon as the cursor leaves the game', async ({ page }) => {
    const canvas = await page.locator('#gl').boundingBox();
    const y = canvas.y + canvas.height / 2;
    // sweep to the right edge: the view turns while the cursor rests in the edge band
    await page.mouse.move(canvas.x + canvas.width / 2, y);
    await page.mouse.move(canvas.x + canvas.width - 3, y, { steps: 5 });
    await page.waitForTimeout(600);
    const atEdge = await hooks(page, (s) => s.player.yaw);
    // leave the frame entirely and wait: the yaw must not change
    await page.mouse.move(canvas.x + canvas.width + 60, y, { steps: 3 });
    const outside = await hooks(page, (s) => s.player.yaw);
    await page.waitForTimeout(5000);
    expect(await hooks(page, (s) => s.player.yaw)).toBe(outside);
    expect(atEdge).not.toBe(0);
  });

  test('hovering the pause button does not turn the view', async ({ page }) => {
    const btn = await page.locator('#pauseBtn').boundingBox();
    await page.mouse.move(btn.x - 30, btn.y + btn.height / 2);
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2, { steps: 4 });
    const yaw = await hooks(page, (s) => s.player.yaw);
    await page.waitForTimeout(3000);
    expect(await hooks(page, (s) => s.player.yaw)).toBe(yaw);
  });
});

test('the period clock runs on real time, even at a low frame rate', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 480, height: 320 });
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  // remember the timestamp of every frame (this callback runs after the game's own, same timestamp)
  await page.evaluate(() => {
    window.__frames = [];
    const rec = (ts) => { window.__frames.push(ts); requestAnimationFrame(rec); };
    requestAnimationFrame(rec);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
  const sample = () => page.evaluate(() => ({
    game: window.__substitute.game.elapsed,
    frameTs: window.__frames[window.__frames.length - 1] / 1000,
    count: window.__frames.length,
  }));
  await page.waitForFunction(() => window.__frames.length >= 2, null, { timeout: 60_000 });
  const a = await sample();
  await page.waitForTimeout(10_000);
  // on a heavily loaded machine frames can be seconds apart: wait for a few more to land
  await page.waitForFunction((n) => window.__frames.length >= n, a.count + 4, { timeout: 60_000 });
  const b = await sample();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const seconds = b.frameTs - a.frameTs;
  const fps = (b.count - a.count) / seconds;
  expect(fps, 'the scenario should be a slow machine').toBeLessThan(15);
  // A frame-driven clock (the old bug) advances at most 0.06 s per frame, so over these ~10 s
  // at a few fps it would fall far behind. A real-time clock keeps pace with the frames.
  expect(Math.abs((b.game - a.game) / seconds - 1), `fps ${fps.toFixed(1)}, ${seconds.toFixed(2)} s`).toBeLessThan(0.05);
});

test('walking covers the same ground per second of the period at a low frame rate', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 480, height: 320 });
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  // across the open back of the room, facing +x, with nothing in the way for 7 m
  const START_X = -3.5;
  await hooks(page, (s, x) => Object.assign(s.player, { x, z: 3, yaw: -Math.PI / 2, pitch: 0 }), START_X);
  // where the far wall stops the teacher: walk there once, before slowing the page down
  const limit = await page.evaluate(() => new Promise((resolve) => {
    const s = window.__substitute;
    let prev = null, still = 0;
    s.keys.w = true;
    const onFrame = () => {
      still = s.player.x === prev ? still + 1 : 0;
      prev = s.player.x;
      if (still >= 3) {
        s.keys.w = false;
        resolve(s.player.x);
      } else requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  }));
  await hooks(page, (s, x) => { s.player.x = x; }, START_X);
  // slow the page to a few frames a second: less throttling when the machine is already busy
  const baseline = await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const onFrame = (ts) => (ts - t0 >= 1000 ? resolve((n * 1000) / (ts - t0)) : (n++, requestAnimationFrame(onFrame)));
    requestAnimationFrame(onFrame);
  }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Math.min(4, Math.max(1, baseline / 6)) });
  // Hold W, adding up each frame's walk and the period time it took, and step back to the
  // start after every frame. A frame so long that the walk reached the far wall can't show
  // how far the teacher would have gone, so it is left out of both sums.
  const run = await page.evaluate(([startX, wallX]) => new Promise((resolve) => {
    const s = window.__substitute;
    let frames = 0, blocked = 0, metres = 0, seconds = 0, last = null, t0 = null;
    const onFrame = (ts) => {
      if (last === null) {
        t0 = ts;
        s.keys.w = true;
      } else if (s.player.x >= wallX - 0.05) {
        blocked++;
      } else {
        frames++;
        metres += s.player.x - startX;
        seconds += s.game.elapsed - last;
      }
      last = s.game.elapsed;
      s.player.x = startX;
      if ((seconds >= 2 && frames >= 4) || ts - t0 > 60_000) {
        s.keys.w = false;
        resolve({ seconds, metres, frames, blocked, wall: (ts - t0) / 1000 });
        return;
      }
      requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  }), [START_X, limit]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const speed = await hooks(page, (s) => s.teacher.speed);
  const fps = (run.frames + run.blocked) / run.wall;
  const detail = `${run.metres.toFixed(2)} m in ${run.seconds.toFixed(2)} s over ${run.frames} frames (${run.blocked} too long) at ${fps.toFixed(1)} fps`;
  expect(fps, 'the scenario should be a slow machine').toBeLessThan(15);
  expect(run.seconds, detail).toBeGreaterThanOrEqual(2);
  const expected = speed * run.seconds;
  expect(Math.abs(run.metres - expected) / expected, detail).toBeLessThan(0.1);
});

test('keyboard only: seating chart, pause and discipline can all be driven from the keyboard', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__substitute.running);
  await freezeRandomness(page);

  await page.keyboard.press('r');
  await expect(page.locator('#seatGrid .seat').first()).toBeFocused();
  await page.keyboard.press('Enter'); // Dixie Normous
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab'); // Hugh Jass, first seat of the back row
  await page.keyboard.press('Enter');
  await expect(page.locator('#log')).toContainText('Dixie Normous and Hugh Jass swap seats');
  await page.keyboard.press('r');
  await expect(page.locator('#seatChart')).toBeHidden();

  await page.keyboard.press('p');
  await expect(page.locator('#resumeBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pauseOverlay')).toBeHidden();
});

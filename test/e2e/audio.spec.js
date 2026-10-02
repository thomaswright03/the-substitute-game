import { test, expect } from '@playwright/test';
import { freezeRandomness, hooks, openGame, startRound } from './helpers.js';

test('sound starts only after the first interaction, and each event has its cue', async ({ page }) => {
  await openGame(page);
  expect(await hooks(page, (s) => s.audio.started())).toBe(false);
  await startRound(page);
  expect(await hooks(page, (s) => s.audio.started())).toBe(true);
  expect(await hooks(page, (s) => s.audio.cues())).toContain('bell');

  // someone throws while the teacher faces the board: a wind-up, then the hit
  await freezeRandomness(page);
  await hooks(page, (s) => s.lookAt(0, 1.9, -6.2, 0, -4.5));
  await page.waitForFunction(() => window.__substitute.camera.position.z < -4);
  await hooks(page, (s) => { s.game.tuning.gentleStart = false; s.game.tuning.throwChanceAttendance = 1000; });
  await page.waitForFunction(() => {
    const cues = window.__substitute.audio.cues();
    return cues.includes('windup') && cues.indexOf('hit') > cues.indexOf('windup');
  });
  await hooks(page, (s) => { s.game.tuning.throwChanceAttendance = 0; });

  // the last ten seconds tick, and the final bell rings
  await hooks(page, (s) => { s.game.elapsed = s.game.tuning.period - 9; });
  await page.waitForFunction(() => window.__substitute.audio.cues().includes('tick'));
  await expect(page.locator('#endOverlay')).toBeVisible({ timeout: 30_000 });
  const cues = await hooks(page, (s) => s.audio.cues());
  expect(cues[cues.length - 1]).toBe('bell');
});

test('mute and volume are remembered between visits', async ({ page }) => {
  await openGame(page);
  const sound = page.locator('#startOverlay [data-sound]');
  const volume = page.locator('#startOverlay [data-volume]');
  await expect(sound).toBeChecked();
  await volume.fill('40');
  await sound.uncheck();
  await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(volume).toBeDisabled();

  await openGame(page);
  await expect(page.locator('#startOverlay [data-sound]')).not.toBeChecked();
  await expect(page.locator('#startOverlay [data-volume]')).toHaveValue('40');
  await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed', 'true');

  // the HUD button and the pause screen show the same setting
  await startRound(page);
  await freezeRandomness(page);
  await page.keyboard.press('m');
  await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay [data-sound]')).toBeChecked();
});

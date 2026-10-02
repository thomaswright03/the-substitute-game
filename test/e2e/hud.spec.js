import { test, expect } from '@playwright/test';
import { faceCard, faceStudent, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

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

test('the chaos meter and the rings over the students change colour at the tuning table\'s thresholds', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  const { warning, danger } = await hooks(page, (s) => s.game.tuning.hud);
  const steve = await hooks(page, (s) => Object.keys(s.world.students).indexOf('steve'));
  await faceStudent(page, 'steve');
  // the clock stops, so an escalation set just under a threshold stays there while it is checked
  await hooks(page, (s) => s.holdTime());
  const ring = page.locator('#studentLayer .tag').nth(steve);
  const cases = [
    [warning - 1, [], 'var(--calm-green-bright)'],
    [warning, ['mid'], 'var(--pencil-yellow)'],
    [danger - 1, ['mid'], 'var(--pencil-yellow)'],
    [danger, ['hot'], 'var(--marker-red-bright)'],
  ];
  for (const [pct, classes, stroke] of cases) {
    await hooks(page, (s, p) => {
      const st = s.game.students.steve;
      st.active = true;
      st.escalation = p;
      st.activatedAt = s.game.elapsed;
    }, pct);
    await expect(page.locator('#chaosBadge')).toHaveAttribute('aria-valuenow', String(pct));
    const badge = await page.locator('#chaosBadge').evaluate((n) => ['mid', 'hot'].filter((c) => n.classList.contains(c)));
    expect(badge, `${pct}%`).toEqual(classes);
    await expect(ring.locator('.ring .fill')).toHaveCSS('stroke', await page.evaluate((v) => {
      // the colour the token resolves to, as the browser reports a computed stroke
      const probe = document.createElement('div');
      probe.style.color = v;
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, stroke));
    expect(await ring.evaluate((n) => n.classList.contains('critical')), `${pct}%`).toBe(pct >= danger);
  }
});

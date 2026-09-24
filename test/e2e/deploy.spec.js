import { test, expect } from '@playwright/test';
import { SITE_URL } from '../../playwright.config.js';
import { watchPage } from './helpers.js';

// The built site (npm run build), as GitHub Pages serves it: under /the-substitute-game/.
test.describe('the deployed build', () => {
  test('runs from a sub-path with no errors or missing files', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(SITE_URL);
    await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('#startTitle')).toHaveText('The Substitute');
    expect(problems.errors).toEqual([]);
    expect(problems.failed).toEqual([]);
    expect(problems.external).toEqual([]);
  });

  test('a repeat visit loads the models and three.js from the offline cache', async ({ page }) => {
    await page.goto(SITE_URL);
    await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
    await page.waitForFunction(() => navigator.serviceWorker.ready.then((r) => !!r.active));
    // the first visit went to the network; the service worker cached what it fetched from now
    // on, so reload once to let it serve (and cache) everything, then check the next visit
    await page.reload();
    await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
    const sources = {};
    page.on('response', (r) => {
      const url = r.url();
      if (/\.(glb|js)$/.test(url)) sources[url.split('/the-substitute-game/')[1]] = r.fromServiceWorker();
    });
    await page.reload();
    await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
    const glbs = Object.entries(sources).filter(([u]) => u.endsWith('.glb'));
    // the eight classroom costumes (the principal's joins them once he has been needed)
    expect(glbs.length).toBeGreaterThanOrEqual(8);
    for (const [url, fromSw] of Object.entries(sources)) expect(fromSw, url).toBe(true);
  });
});

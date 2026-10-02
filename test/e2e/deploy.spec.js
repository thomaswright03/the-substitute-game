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

  test('an address that is not part of the game shows the themed 404 page, which leads back', async ({ page }) => {
    const problems = watchPage(page);
    for (const path of ['nope', 'a/deeper/path.html']) {
      const response = await page.goto(SITE_URL + path);
      expect(response.status(), path).toBe(404);
      await expect(page.locator('h1')).toHaveText('This page isn’t on the timetable');
      await expect(page.locator('[lang="es"]')).toContainText('Volver al aula');
      await expect(page.locator('[lang="fr"]')).toContainText('Retour en classe');
    }
    // its fonts and icon load from the site's root, even from a deeper address
    expect(problems.failed.filter((f) => !/\/(nope|a\/deeper\/path\.html)$/.test(f))).toEqual([]);
    await page.locator('#home').click();
    await expect(page).toHaveURL(SITE_URL);
    await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
    expect(problems.errors.filter((e) => !/404/.test(e))).toEqual([]);
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

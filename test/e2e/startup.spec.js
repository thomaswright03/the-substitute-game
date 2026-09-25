import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import ES from '../../src/i18n/es.js';
import FR from '../../src/i18n/fr.js';
import { hooks, openGame, startRound, watchPage } from './helpers.js';

test('loads to the start screen with no errors, 404s or external requests', async ({ page }) => {
  const problems = watchPage(page);
  await openGame(page, '');
  await expect(page.locator('#startTitle')).toHaveText('The Substitute');
  await expect(page.locator('#loadingScreen')).toBeHidden();
  expect(problems.errors).toEqual([]);
  expect(problems.failed).toEqual([]);
  expect(problems.external).toEqual([]);
  // the page has a language, a favicon and no debug hooks outside test mode
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => typeof window.__debug)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.__substitute)).toBe('undefined');
});

test('the start screen is keyboard ready: focus is on Start', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#startBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#startOverlay')).toBeHidden();
});

test('the principal model is not part of the first load', async ({ page }) => {
  const glbs = [];
  page.on('request', (r) => { if (r.url().endsWith('.glb')) glbs.push(r.url().split('/').pop()); });
  await page.route('**/business-man.glb', (route) => new Promise(() => { /* never answer */ void route; }));
  await openGame(page);
  expect(glbs.filter((g) => g !== 'business-man.glb')).toHaveLength(8);
});

test('without WebGL a plain-language message appears instead of a hang', async ({ page }) => {
  const problems = watchPage(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(String(type))) return null;
      return original.call(this, type, ...rest);
    };
  });
  await page.goto('/');
  await expect(page.locator('#noWebgl')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#noWebgl')).toContainText('hardware acceleration');
  await expect(page.locator('#loadingCard')).toBeHidden();
  expect(problems.errors).toEqual([]);
});

test('a missing model shows a friendly error with a working Try again button', async ({ page }) => {
  let block = true;
  await page.route('**/assets/characters/punk-man.glb', (route) => (block ? route.fulfill({ status: 404, body: 'nope' }) : route.continue()));
  await page.goto('/?test');
  const failed = page.locator('#loadFailed');
  await expect(failed).toBeVisible({ timeout: 60_000 });
  await expect(failed).toContainText('Check your connection and try again');
  await expect(failed).not.toContainText('console');
  block = false;
  await page.locator('#retryBtn').click();
  await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
});

test('an error during play stops the game with a plain message, and Try again reloads', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await hooks(page, (s) => s.failNextFrame('broken on purpose'));
  const card = page.locator('#crashed');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Something went wrong');
  // keyboard focus is on Try again (read directly: the page itself may not have the window's focus)
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('crashRetryBtn');
  // the loop stopped: the period clock no longer moves
  const elapsed = await hooks(page, (s) => s.game.elapsed);
  await page.waitForTimeout(1000);
  expect(await hooks(page, (s) => s.game.elapsed)).toBe(elapsed);
  // the error is still reported for whoever looks at the console
  expect(errors.join('\n')).toContain('broken on purpose');
  await page.locator('#crashRetryBtn').click();
  await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
  await expect(card).toBeHidden();
  expect(await hooks(page, (s) => s.running)).toBe(false);
});

test('opened as a file, the game explains how to serve it', async ({ page }) => {
  const file = fileURLToPath(new URL('../../index.html', import.meta.url));
  await page.goto('file://' + file);
  const card = page.locator('#fileProtocol');
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card).toContainText('npm start');
});

test('the string table drives the on-screen text', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const s = window.__substitute;
    return import('/src/strings.js').then((mod) => {
      const copy = JSON.parse(JSON.stringify(mod.ENGLISH));
      copy.start.title = 'Le Remplaçant';
      copy.start.start = 'Commencer';
      copy.hud.chaos = 'Chaos';
      s.setStrings(copy);
    });
  });
  await expect(page.locator('#startTitle')).toHaveText('Le Remplaçant');
  await expect(page.locator('#startBtn')).toContainText('Commencer');
  await expect(page.locator('#chaosLabel')).toHaveText('Chaos');
});

test('if three.js itself fails to download, the friendly error appears', async ({ page }) => {
  await page.route('**/lib/three/three.core.js', (route) => route.fulfill({ status: 404, body: 'nope' }));
  await page.goto('/');
  await expect(page.locator('#loadFailed')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#loadingCard')).toBeHidden();
});

// The start-up cards come from src/boot.js, which runs before (and without) the game's modules.
test('when the game script can’t load, a Spanish browser is told so in Spanish', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-ES' });
  const page = await context.newPage();
  await page.route('**/src/main.js', (route) => route.fulfill({ status: 404, body: 'nope' }));
  await page.goto('/');
  const failed = page.locator('#loadFailed');
  await expect(failed).toBeVisible({ timeout: 30_000 });
  await expect(failed.locator('h1')).toHaveText(ES.boot.loadFailTitle);
  await expect(failed.locator('p')).toHaveText(ES.boot.loadFailBody);
  await expect(page.locator('#retryBtn')).toHaveText(ES.boot.retry);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await context.close();
});

test('without WebGL, a French browser is told so in French', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(String(type))) return null;
      return original.call(this, type, ...rest);
    };
  });
  await page.goto('/');
  const card = page.locator('#noWebgl');
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card.locator('h1')).toHaveText(FR.boot.noWebglTitle);
  await expect(card.locator('p')).toHaveText(FR.boot.noWebglBody);
  await context.close();
});

test('the start-up cards follow the language the player chose over the browser’s', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('substitute.language', 'fr'));
  await page.route('**/src/main.js', (route) => route.fulfill({ status: 404, body: 'nope' }));
  await page.goto('/');
  await expect(page.locator('#loadFailed h1')).toHaveText(FR.boot.loadFailTitle);
});

test('opened as a file in a Spanish browser, the explanation is in Spanish', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-ES' });
  const page = await context.newPage();
  const file = fileURLToPath(new URL('../../index.html', import.meta.url));
  await page.goto('file://' + file);
  const card = page.locator('#fileProtocol');
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(card.locator('h1')).toHaveText(ES.boot.fileTitle);
  await context.close();
});

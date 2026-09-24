import { test, expect } from '@playwright/test';
import FR from '../../src/i18n/fr.js';
import { activate, faceCard, faceStudent, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

// A French text with its {placeholders} filled.
function french(text, params) {
  return text.replace(/\{(\w+)\}/g, (m, key) => (key in params ? params[key] : m));
}

async function switchLanguageFromPause(page, code) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await page.locator('#pauseOverlay [data-language]').selectOption(code);
  await page.locator('#resumeBtn').click();
  await expect(page.locator('#pauseOverlay')).toBeHidden();
}

// Every element of the open panel and the HUD whose text is wider than its box.
function overflowing(page) {
  return page.evaluate(() => [...document.querySelectorAll('#stage *')]
    .filter((n) => n.checkVisibility() && n.childElementCount === 0 && n.textContent.trim())
    .filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible')
    .map((n) => (n.id || n.className) + ': ' + n.textContent.trim()));
}

test('the language switcher changes the page, is remembered, and sets lang', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#startOverlay [data-language]').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#startTitle')).toHaveText('El Sustituto');
  await expect(page.locator('#startOverlay .controls')).toContainText('pasar lista');

  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#startOverlay [data-language]')).toHaveValue('es');
  await expect(page.locator('#startBtn')).toContainText('Empezar la clase');

  // the chalkboard is redrawn, and play text uses the new language
  await startRound(page);
  await freezeRandomness(page);
  await expect(page.locator('#log')).toContainText('Suena el timbre');
  await expect(page.locator('#attQuestion')).toContainText('Quedan 8 tarjetas');

  // the pause screen has the switcher too
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await page.locator('#pauseOverlay [data-language]').selectOption('fr');
  await expect(page.locator('#pauseTitle')).toHaveText('Respirez');
  await expect(page.locator('#resumeBtn')).toContainText('Reprendre');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect(await hooks(page, () => document.getElementById('pauseBtn').getAttribute('aria-label'))).toBe('Reprendre');
});

test('a browser set to French starts in French', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();
  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#startTitle')).toHaveText('Le Remplaçant');
  await context.close();
});

for (const [w, h] of [[375, 667], [1440, 900]]) {
  for (const code of ['es', 'fr']) {
    test(`${code} text fits at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openGame(page);
      await page.locator('#startOverlay [data-language]').selectOption(code);
      expect(await overflowing(page)).toEqual([]);
      await startRound(page);
      await freezeRandomness(page);
      await expect(page.locator('#attendancePanel')).toBeVisible();
      expect(await overflowing(page)).toEqual([]);
    });
  }
}

test('the text over the classroom switches language with the rest of the page', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  // Ben Dover sits next to his friend Dixie Normous at the start, so she eggs him on
  await activate(page, 'benDover', 30);
  await faceStudent(page, 'benDover');
  const note = page.locator('#studentLayer .tag.target .note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText('egged on by Dixie Normous');

  await switchLanguageFromPause(page, 'fr');
  await expect(note).toHaveText(french(FR.prompt.friendNear, { name: 'Dixie Normous' }));
  await expect(page.locator('#prompt')).toContainText('Ben Dover');
  await expect(page.locator('#prompt')).not.toContainText('Help');
});

test('a roll-call answer on screen switches language too', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await faceCard(page, 'moeLester');
  await page.keyboard.press('e');
  await page.keyboard.press('q');
  await expect(page.locator('#attAnswer')).toContainText('Moe Lester answered from');
  await hooks(page, (s) => { s.speech.until = s.game.elapsed + 600; });
  const line = await hooks(page, (s) => s.speech.line);

  await switchLanguageFromPause(page, 'fr');
  await expect(page.locator('#attAnswer')).toContainText('Moe Lester a répondu depuis');
  await expect(page.locator('#attAnswer')).toContainText(FR.rollCall.lines[line]);
  expect(await page.locator('#bubbleText').textContent()).toBe(FR.rollCall.lines[line]);
});

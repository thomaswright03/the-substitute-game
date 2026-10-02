import { test, expect } from '@playwright/test';
import ES from '../../src/i18n/es.js';
import FR from '../../src/i18n/fr.js';
import { activate, faceStudent, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

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
  await hooks(page, (s) => s.holdTime());
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
  // the clock stops, so the answer stays on screen however slowly the machine draws frames
  await hooks(page, (s) => {
    s.holdTime();
    s.rules.pickupCard(s.game, 'moeLester');
  });
  await page.keyboard.press('q');
  await expect(page.locator('#attAnswer')).toContainText('Moe Lester answered from');
  const line = await hooks(page, (s) => s.speech.line);

  await switchLanguageFromPause(page, 'fr');
  await expect(page.locator('#attAnswer')).toContainText('Moe Lester a répondu depuis');
  await expect(page.locator('#attAnswer')).toContainText(FR.rollCall.lines[line]);
  expect(await page.locator('#bubbleText').textContent()).toBe(FR.rollCall.lines[line]);
});

test('the pause screen repeats the five rules, in each language', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  const rules = page.locator('#pauseRules');
  // folded away until asked for, so the pause screen still leads with Resume
  await expect(rules.locator('li').first()).toBeHidden();
  await rules.locator('summary').click();
  await expect(rules.locator('li')).toHaveCount(5);
  await expect(rules.locator('li').first()).toBeVisible();
  const table = { en: null, es: ES, fr: FR };
  for (const code of ['en', 'es', 'fr']) {
    await page.locator('#pauseOverlay [data-language]').selectOption(code);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    const onPause = await rules.locator('li').allTextContents();
    const onStart = await page.locator('#startOverlay .rules li').allTextContents();
    expect(onPause).toEqual(onStart);
    expect(onPause.every((text) => text.trim().length > 20)).toBe(true);
    if (table[code]) {
      await expect(rules.locator('summary')).toHaveText(table[code].start.rulesTitle);
      for (const [i, rule] of table[code].start.rules.entries()) expect(onPause[i]).toContain(rule.lead);
    }
  }
});

// The clock and the chaos meter on a small phone, at their widest (a two-digit minute and 100%).
for (const [w, h] of [[320, 568], [375, 667]]) {
  for (const locale of ['en-US', 'es-ES', 'fr-FR']) {
    test(`the HUD's labels and values fit their badges at ${w}px in ${locale}`, async ({ browser }) => {
      const context = await browser.newContext({ locale, viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('substitute.quality', 'minimum'));
      await openGame(page);
      await startRound(page);
      await freezeRandomness(page);
      await hooks(page, (s) => {
        s.holdTime();
        s.game.elapsed = s.game.tuning.period * (43.5 / 45);
        const st = s.game.students.hughJass;
        st.active = true;
        st.escalation = 99.8;
      });
      await expect(page.locator('#chaosValue')).toHaveText(/^100/);
      await expect(page.locator('#clockValue')).toHaveText(/48$/);
      const parts = await page.evaluate(() => [...document.querySelectorAll('#hud .label, #hud .value')]
        .filter((n) => n.checkVisibility())
        .map((n) => {
          const r = n.getBoundingClientRect();
          const b = n.closest('.badge').getBoundingClientRect();
          return {
            text: n.textContent,
            fontSize: parseFloat(getComputedStyle(n).fontSize),
            overflow: n.scrollWidth - n.clientWidth,
            inside: r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5,
          };
        }));
      expect(parts.length).toBe(4);
      for (const p of parts) {
        expect(p.overflow, `"${p.text}" is wider than its box`).toBeLessThanOrEqual(0);
        expect(p.inside, `"${p.text}" spills out of its badge`).toBe(true);
        expect(p.fontSize, `"${p.text}" is too small to read`).toBeGreaterThanOrEqual(12);
      }
      await context.close();
    });
  }
}

test('the clock and the chaos meter are written the way the chosen language writes them', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => {
    s.holdTime();
    s.game.elapsed = s.game.tuning.period * (5 / 45);
    const st = s.game.students.hughJass;
    st.active = true;
    st.escalation = 42;
  });
  await expect(page.locator('#clockValue')).toHaveText('9:10');
  await expect(page.locator('#chaosValue')).toHaveText('42%');

  await switchLanguageFromPause(page, 'fr');
  await expect(page.locator('#clockValue')).toHaveText('9 h 10');
  await expect(page.locator('#chaosValue')).toHaveText('42 %');
  // the same conventions as the French rules and end-of-period text
  expect(FR.start.intro).toContain('9 h 50');
  expect(FR.start.rules[1].body).toContain('100 %');

  await switchLanguageFromPause(page, 'es');
  await expect(page.locator('#clockValue')).toHaveText('9:10');
  await expect(page.locator('#chaosValue')).toHaveText('42 %');
  expect(ES.start.rules[1].body).toContain('100 %');

  // the end screen's closest call too
  await hooks(page, (s) => {
    s.game.maxChaos = 64;
    s.game.elapsed = s.game.tuning.period - 0.05;
    return s.advance(200);
  });
  await expect(page.locator('#endOverlay')).toBeVisible();
  await expect(page.locator('#statChaos')).toHaveText('64\u00a0%');
});

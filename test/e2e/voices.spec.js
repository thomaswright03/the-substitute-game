import { test, expect } from '@playwright/test';
import { activate, faceStudent, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

// Stands in for the browser's speech voices, recording what each utterance would have said.
async function fakeSpeech(page) {
  await page.addInitScript(() => {
    const said = [];
    window.__said = said;
    const synth = {
      speaking: false,
      pending: false,
      getVoices: () => [],
      addEventListener() {},
      cancel() { this.speaking = false; },
      speak(u) { said.push({ text: u.text, pitch: u.pitch, rate: u.rate, lang: u.lang }); },
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  });
}

test('a stern talking-to gets a grunt, a sigh and a line said aloud over the student’s head', async ({ page }) => {
  await fakeSpeech(page);
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await activate(page, 'steve');
  await faceStudent(page, 'steve');
  await page.keyboard.press('f');
  await expect(page.locator('#disciplineOverlay')).toBeVisible();
  await page.keyboard.press('1');
  await expect(page.locator('#disciplineOverlay')).toBeHidden();

  // the bubble names who said it
  await expect(page.locator('#shoutBubble')).toBeVisible();
  await expect(page.locator('#shoutName')).toHaveText('Steve');
  const talkLines = ['Ugh. Fine.', 'Okay, okay, jeez.', 'Whatever.'];
  expect(talkLines).toContain(await page.locator('#shoutText').textContent());

  const cues = await hooks(page, (s) => s.audio.cues());
  expect(cues.indexOf('sigh')).toBeGreaterThan(cues.indexOf('grunt'));
  expect(cues).toContain('grunt');

  // the line is spoken after the sigh, in the bubble's words
  await page.waitForFunction(() => window.__said.length > 0);
  const said = await page.evaluate(() => window.__said);
  expect(said.at(-1).text).toBe(await page.locator('#shoutText').textContent());
  expect(said.at(-1).lang).toBe('en-US');
});

test('each student has their own voice, and muting or switching voices off silences them', async ({ page }) => {
  await fakeSpeech(page);
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  const ids = await hooks(page, (s) => Object.keys(s.world.students));
  expect(ids).toHaveLength(8);
  for (const [i, id] of ids.entries()) {
    await hooks(page, (s, sid) => {
      s.game.elapsed += 5; // a new line, not one cut short by the last
      s.game.events.push({ type: 'zap', id: sid, setOffId: null, t: s.game.elapsed });
      s.fastForward(0);
    }, id);
    await page.waitForFunction((n) => window.__said.length > n, i);
  }
  const voices = await page.evaluate(() => window.__said.map((u) => u.pitch + '/' + u.rate));
  expect(new Set(voices).size).toBe(8);

  // switched off: the bubble still shows, but nothing is said
  await page.keyboard.press('Escape');
  await page.locator('#pauseOverlay [data-voices]').uncheck();
  await page.locator('#resumeBtn').click();
  const before = await page.evaluate(() => window.__said.length);
  await hooks(page, (s) => {
    s.game.events.push({ type: 'caught', id: 'steve', t: s.game.elapsed });
    s.fastForward(0);
  });
  await expect(page.locator('#shoutName')).toHaveText('Steve');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__said.length)).toBe(before);

  // the setting is remembered, and is greyed out while all sound is muted
  await openGame(page);
  await expect(page.locator('#startOverlay [data-voices]')).not.toBeChecked();
  await page.locator('#startOverlay [data-sound]').uncheck();
  await expect(page.locator('#startOverlay [data-voices]')).toBeDisabled();
});

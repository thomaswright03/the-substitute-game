import { test, expect } from '@playwright/test';
import { activate, closeSheet, faceStudent, fakeSpeech, freezeRandomness, hooks, openGame, openSettings, startRound } from './helpers.js';

// A short, valid sound: a tone in a 16-bit mono WAV file.
function wav(seconds = 0.2, rate = 8000) {
  const samples = Math.floor(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
const sound = (name) => ({ name, mimeType: 'audio/wav', buffer: wav() });

async function openStudio(page) {
  await page.locator('#studioBtn').click();
  await expect(page.locator('#studioOverlay')).toBeVisible();
}

const row = (page, slot) => page.locator(`#studioLines .lineRow[data-slot="${slot}"]`);

// Presses Upload on a line and gives the file chooser that opens a file.
async function upload(page, slot, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`#studioLines [data-slot="${slot}"][data-tool="upload"]`).click();
  await (await chooser).setFiles(file);
}

const tab = (page, name) => page.locator('#studioTabs .studioTab', { hasText: name });

test('the Voice studio lists every line, for each student and for the whole class', async ({ page }) => {
  await openGame(page);
  await openStudio(page);
  await expect(page.locator('#studioTabs .studioTab')).toHaveCount(9);
  await expect(tab(page, 'Whole class')).toHaveAttribute('aria-selected', 'false');
  await expect(tab(page, 'Dixie Normous')).toHaveAttribute('aria-selected', 'true');
  // the 8 ways of acting up have 3 lines each, so a student has their own 3, the 11 shared kinds, and the roll call (and the note-passer, whose notes get read out, 3 more)
  await expect(page.locator('#studioLines .lineRow')).toHaveCount(47);
  await expect(row(page, 'active.notes.0')).toContainText('Pass it on, pass it on!');
  await expect(row(page, 'active.notes.0')).toContainText('Placeholder voice');
  await expect(page.locator('#studioCount')).toHaveText('0 of 47 lines recorded');

  await tab(page, 'Moe Lester').click();
  await expect(row(page, 'active.plane.0')).toContainText('Incoming!');
  await expect(row(page, 'active.notes.0')).toHaveCount(0);

  await tab(page, 'Whole class').click();
  await expect(page.locator('#studioLines .lineRow')).toHaveCount(68);
  await expect(row(page, 'active.spin.2')).toContainText('Faster, faster!');
});

test('an uploaded recording is that line’s voice, and is remembered between visits', async ({ page }) => {
  await openGame(page);
  await openStudio(page);
  await tab(page, 'Steve').click();
  await upload(page, 'talk.1', sound('whatever.wav'));
  await expect(row(page, 'talk.1')).toContainText('Your recording');
  await expect(row(page, 'talk.1')).toContainText('whatever.wav');
  await expect(row(page, 'talk.1')).toHaveClass(/recorded/);
  await expect(page.locator('#studioCount')).toHaveText('1 of 44 lines recorded');
  await expect(tab(page, 'Steve')).toContainText('1/44');
  // another student still has the placeholder
  await tab(page, 'Ben Dover').click();
  await expect(row(page, 'talk.1')).toContainText('Placeholder voice');

  await page.reload();
  await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
  await openStudio(page);
  await tab(page, 'Steve').click();
  await expect(row(page, 'talk.1')).toContainText('whatever.wav');
});

test('replacing and removing a recording', async ({ page }) => {
  await openGame(page);
  await openStudio(page);
  await upload(page, 'calm.0', sound('first.wav'));
  await expect(row(page, 'calm.0')).toContainText('first.wav');
  await upload(page, 'calm.0', sound('second.wav'));
  await expect(row(page, 'calm.0')).toContainText('second.wav');
  await expect(row(page, 'calm.0')).not.toContainText('first.wav');
  await row(page, 'calm.0').locator('[data-tool="remove"]').click();
  await expect(row(page, 'calm.0')).toContainText('Placeholder voice');
  await expect(page.locator('#studioCount')).toHaveText('0 of 47 lines recorded');

  // all of a student's recordings can go at once, after a second press
  await upload(page, 'calm.0', sound('a.wav'));
  await upload(page, 'calm.1', sound('b.wav'));
  await expect(page.locator('#studioCount')).toHaveText('2 of 47 lines recorded');
  await page.locator('#studioClear').click();
  await expect(page.locator('#studioClear')).toContainText('Tap again');
  await page.locator('#studioClear').click();
  await expect(page.locator('#studioCount')).toHaveText('0 of 47 lines recorded');
  await expect(page.locator('#studioClear')).toBeDisabled();
});

test('a file that isn’t a sound, or is too big, is turned away and nothing is saved', async ({ page }) => {
  await openGame(page);
  await openStudio(page);
  await upload(page, 'zap.0', { name: 'notes.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('this is not audio') });
  await expect(row(page, 'zap.0').locator('.lineError')).toContainText('couldn’t read notes.mp3');
  await expect(row(page, 'zap.0')).toContainText('Placeholder voice');
  await upload(page, 'zap.1', { name: 'huge.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(6 * 1024 * 1024 + 1) });
  await expect(row(page, 'zap.1').locator('.lineError')).toContainText('too big');
  await expect(page.locator('#studioCount')).toHaveText('0 of 47 lines recorded');
});

test('a line with a recording plays it, and the speech voice stays quiet', async ({ page }) => {
  await fakeSpeech(page);
  await openGame(page);
  await openStudio(page);
  await tab(page, 'Steve').click();
  // every stern-talking-to reply, so whichever one he picks has a recording
  for (const i of [0, 1, 2]) await upload(page, 'talk.' + i, sound(`steve-talk-${i}.wav`));
  await closeSheet(page);
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => s.holdTime());
  await activate(page, 'steve');
  await faceStudent(page, 'steve');
  await page.keyboard.press('f');
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__substitute.voice.clips().length > 0);
  const clips = await hooks(page, (s) => s.voice.clips());
  expect(clips[0]).toMatch(/^en\/steve\/talk\.[012]$/);
  const lines = await hooks(page, (s) => s.voice.lines());
  expect(lines.at(-1)).toMatchObject({ id: 'steve', source: 'upload' });
  expect(await page.evaluate(() => window.__said.length)).toBe(0);
  // the bubble still shows the words
  expect(['Ugh. Fine.', 'Okay, okay, jeez.', 'Whatever.']).toContain(await page.locator('#shoutText').textContent());
});

test('a recording for the whole class is used by a student who has none of their own', async ({ page }) => {
  await fakeSpeech(page);
  await openGame(page);
  await openStudio(page);
  await tab(page, 'Whole class').click();
  for (const i of [0, 1, 2]) await upload(page, 'zap.' + i, sound(`class-ow-${i}.wav`));
  await tab(page, 'Mike Hunt').click();
  await expect(row(page, 'zap.0')).toContainText('whole class’s recording');
  await closeSheet(page);
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => s.holdTime());
  await hooks(page, (s) => {
    s.game.events.push({ type: 'zap', id: 'mikeHunt', setOffId: null, t: s.game.elapsed });
    s.fastForward(0);
  });
  await page.waitForFunction(() => window.__substitute.voice.clips().length > 0);
  expect((await hooks(page, (s) => s.voice.clips()))[0]).toMatch(/^en\/all\/zap\.[012]$/);
  expect(await page.evaluate(() => window.__said.length)).toBe(0);
});

test('with no recording the speech voice reads the line, as before', async ({ page }) => {
  await fakeSpeech(page);
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => s.holdTime());
  await hooks(page, (s) => {
    s.game.events.push({ type: 'zap', id: 'steve', setOffId: null, t: s.game.elapsed });
    s.fastForward(0);
  });
  await page.waitForFunction(() => window.__said.length > 0);
  expect((await hooks(page, (s) => s.voice.lines())).at(-1)).toMatchObject({ id: 'steve', source: 'speech' });
  expect(await hooks(page, (s) => s.voice.clips())).toEqual([]);
});

test('the studio opens from the settings and the pause screen, closes with Escape and gives focus back', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  await page.locator('#settingsOverlay [data-open="studioOverlay"]').click();
  await expect(page.locator('#studioOverlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#studioOverlay')).toBeHidden();
  await expect(page.locator('#settingsOverlay')).toBeVisible();
  await expect(page.locator('#settingsOverlay [data-open="studioOverlay"]')).toBeFocused();
  await closeSheet(page);
  await expect(page.locator('#settingsBtn')).toBeFocused();
  // the arrow keys move between the students
  await openStudio(page);
  await tab(page, 'Dixie Normous').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Ben Dover')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Ben Dover')).toBeFocused();
  await closeSheet(page);

  await startRound(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await openSettings(page);
  await page.locator('#settingsOverlay [data-open="studioOverlay"]').click();
  await expect(page.locator('#studioOverlay')).toBeVisible();
  // each press of Escape closes only the top sheet: the period stays paused
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  expect(await hooks(page, (s) => s.paused)).toBe(true);
});

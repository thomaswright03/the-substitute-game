import { test, expect } from '@playwright/test';
import { freezeRandomness, hooks, openGame, startRound } from './helpers.js';

// What navigator.keyboard.getLayoutMap() reports for a French AZERTY keyboard, for the keys
// the game binds (the browser's map is keyed by physical position, valued by the printed key).
const AZERTY_MAP = {
  KeyW: 'z', KeyA: 'q', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyF: 'f', KeyR: 'r', KeyQ: 'a', KeyP: 'p', KeyM: ',',
};

// A real (trusted) key event with a physical position and a typed character that differ, the
// way an AZERTY keyboard sends them.
async function physicalKey(page, type, code, key) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', {
    type, code, key, text: type === 'keyDown' ? key : undefined, unmodifiedText: type === 'keyDown' ? key : undefined,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
  await cdp.detach();
}

test.describe('on a French AZERTY keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((map) => {
      Object.defineProperty(Navigator.prototype, 'keyboard', {
        configurable: true,
        get: () => ({ getLayoutMap: () => Promise.resolve(new Map(Object.entries(map))) }),
      });
      localStorage.setItem('substitute.language', 'fr');
    }, AZERTY_MAP);
  });

  test('the controls, the hint bar and the prompts name the keys printed on it', async ({ page }) => {
    await openGame(page);
    const controls = page.locator('#startOverlay .controls');
    await expect(controls).toContainText('ZQSD / ↑↓');
    await expect(controls.locator('div', { hasText: 'faire l’appel' }).locator('dt')).toHaveText('A');
    await expect(page.locator('#hint')).toContainText('ZQSD se déplacer');
    await expect(page.locator('#hint')).toContainText('A appel');
    await startRound(page);
    await freezeRandomness(page);
    await hooks(page, (s) => { s.rules.pickupCard(s.game, 'moeLester'); });
    await expect(page.locator('#actRollCall kbd')).toHaveText('A');
    await expect(page.locator('#attHint')).toContainText('Faites l’appel (A)');
  });

  test('the key in the Q position strafes left and never calls the roll', async ({ page }) => {
    await openGame(page);
    await startRound(page);
    await freezeRandomness(page);
    await hooks(page, (s) => {
      s.rules.pickupCard(s.game, 'moeLester');
      Object.assign(s.player, { x: 0, z: 4.5, yaw: 0, pitch: 0 });
    });
    // AZERTY's "Q" key sits where QWERTY has A: it types q, and is the strafe-left key
    await physicalKey(page, 'keyDown', 'KeyA', 'q');
    await page.waitForFunction(() => window.__substitute.player.x < -0.3, null, { timeout: 60_000 });
    await physicalKey(page, 'keyUp', 'KeyA', 'q');
    const after = await hooks(page, (s) => ({ z: s.player.z, asked: s.game.attendance.asked }));
    expect(after.asked).toBe(false);
    expect(Math.abs(after.z - 4.5)).toBeLessThan(0.05);
    await expect(page.locator('#attAnswer')).toBeHidden();

    // and the key printed "A" (the Q position) asks the roll call
    await physicalKey(page, 'keyDown', 'KeyQ', 'a');
    await physicalKey(page, 'keyUp', 'KeyQ', 'a');
    await expect.poll(() => hooks(page, (s) => s.game.attendance.asked)).toBe(true);
    // the answer is in the log (it leaves the panel after a few seconds of play, which a slow
    // machine can use up between two looks)
    await expect(page.locator('#log div').last()).toContainText('Moe Lester');
  });

  test('menu choices are the digit keys by position, which type & é " \' on AZERTY', async ({ page }) => {
    await openGame(page);
    await startRound(page);
    await freezeRandomness(page);
    await hooks(page, (s) => {
      const st = s.game.students.steve;
      st.active = true;
      st.escalation = 30;
      st.activatedAt = s.game.elapsed;
    });
    await hooks(page, (s) => {
      const g = s.world.students.steve;
      const head = g.userData.headWorld || g.position;
      s.lookAt(head.x, head.y, head.z, head.x, head.z - 1.6);
    });
    await page.waitForFunction(() => { const c = window.__substitute.context(); return c && c.id === 'steve'; });
    await physicalKey(page, 'keyDown', 'KeyF', 'f');
    await physicalKey(page, 'keyUp', 'KeyF', 'f');
    await expect(page.locator('#disciplineOverlay')).toBeVisible();
    await physicalKey(page, 'keyDown', 'Digit1', '&');
    await physicalKey(page, 'keyUp', 'Digit1', '&');
    await expect(page.locator('#disciplineOverlay')).toBeHidden();
    expect(await hooks(page, (s) => s.game.counters.talks)).toBe(1);
  });
});

test.describe('where the browser cannot tell the layout', () => {
  test.use({ locale: 'fr-FR' });

  test('a French browser starts from AZERTY names, and a key press corrects them', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'keyboard', { configurable: true, get: () => undefined });
    });
    await openGame(page);
    await expect(page.locator('#startOverlay .controls')).toContainText('ZQSD / ↑↓');
    await startRound(page);
    await freezeRandomness(page);
    // this player's keyboard types w in the W position after all (a QWERTY keyboard)
    await physicalKey(page, 'keyDown', 'KeyW', 'w');
    await physicalKey(page, 'keyUp', 'KeyW', 'w');
    await expect(page.locator('#hint')).toContainText('WQSD');
  });
});

test('keyboard only: look up at the board and take a top-row card while the bottom row is full', async ({ page }) => {
  // The page's clock is the test's: frames come 16 ms apart however busy the machine is, so a
  // held key moves the teacher by the same amount every run.
  await page.clock.install();
  // small and at the cheapest graphics, so each of those frames draws quickly
  await page.setViewportSize({ width: 480, height: 320 });
  await page.addInitScript(() => localStorage.setItem('substitute.quality', 'minimum'));
  await openGame(page);
  await expect(page.locator('#startOverlay .controls')).toContainText('look up / down');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__substitute.running, null, { polling: 100 });
  await freezeRandomness(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const hold = async (key, done) => {
    await page.keyboard.down(key);
    for (let i = 0; i < 200 && !(await done()); i++) await page.clock.runFor(50);
    await page.keyboard.up(key);
    await page.clock.runFor(50);
  };
  // walk up the middle aisle until the board is in reach, a step back from it, where the cards
  // are in view
  await hold('w', () => hooks(page, (s) => s.player.z < -3.7));
  const z = await hooks(page, (s) => s.player.z);
  expect(z).toBeLessThan(-3.7);
  expect(z).toBeGreaterThan(-5.2);
  // level, the crosshair is on the bottom row; look up until it is on the top row
  const TOP = ['dixieNormous', 'benDover', 'moeLester', 'steve'];
  const topCard = () => page.evaluate((top) => {
    const c = window.__substitute.context();
    return c && c.kind === 'pickup' && top.includes(c.id) ? c.id : null;
  }, TOP);
  expect(await topCard()).toBe(null);
  await hold('PageUp', topCard);
  const id = await topCard();
  expect(TOP).toContain(id);
  await page.keyboard.press('e');
  await page.clock.runFor(100);
  await expect(page.locator('#attQuestion')).toContainText('Carrying');
  const a = await hooks(page, (s) => ({ holding: s.game.attendance.holding, remaining: s.game.attendance.remaining }));
  expect(a.holding).toBe(id);
  // every bottom-row card is still on the board
  for (const bottom of ['hughJass', 'mikeHunt', 'gabeIches', 'mikeOxlong']) expect(a.remaining).toContain(bottom);
});

test('Shift with the arrow keys looks up and down instead of walking', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  const before = await hooks(page, (s) => ({ z: s.player.z, pitch: s.player.pitch }));
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction((p0) => window.__substitute.player.pitch > p0 + 0.2, before.pitch, { timeout: 30_000 });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Shift');
  expect(Math.abs((await hooks(page, (s) => s.player.z)) - before.z)).toBeLessThan(0.01);
});

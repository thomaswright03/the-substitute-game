import { test, expect } from '@playwright/test';
import {
  activate, faceCard, faceStudent, freezeRandomness, hooks, lastLog, openGame, startRound,
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startRound(page);
});

test('an idle round does not end on the win screen', async ({ page }) => {
  await hooks(page, (s) => s.fastForward(s.game.tuning.period + 5));
  await expect(page.locator('#endOverlay')).toBeVisible();
  await expect(page.locator('#endTitle')).not.toHaveText('You Made It');
});

test('attendance: pick up a card, get rejected by the wrong student, deliver to the right one', async ({ page }) => {
  await freezeRandomness(page);
  await faceCard(page, 'gabeIches');
  await page.keyboard.press('e');
  await expect(page.locator('#attQuestion')).toHaveText('Carrying Gabe Iches’s card');

  await faceStudent(page, 'mikeOxlong');
  await page.keyboard.press('e');
  await expect(lastLog(page)).toContainText('That’s not my name');
  expect(await hooks(page, (s) => s.game.attendance.holding)).toBe('gabeIches');

  await faceStudent(page, 'gabeIches');
  await page.keyboard.press('e');
  await expect(lastLog(page)).toContainText('Marked present');
  await expect(page.locator('#attQuestion')).toHaveText('7 name cards left on the board');
});

test('roll call: the answer is readable without turning around', async ({ page }) => {
  await freezeRandomness(page);
  await faceCard(page, 'moeLester');
  await page.keyboard.press('e');
  await expect(page.locator('#actRollCall')).toBeVisible();
  await page.keyboard.press('q');
  const answer = page.locator('#attAnswer');
  await expect(answer).toBeVisible();
  await expect(answer).toContainText('Moe Lester answered from behind you');
  await expect(page.locator('#dirArrow')).toBeVisible();

  // the arrow counts only time in play: pausing doesn't use it up
  await page.keyboard.press('Escape');
  const pausedAt = await hooks(page, (s) => s.game.elapsed);
  await page.waitForTimeout(1500);
  expect(await hooks(page, (s) => s.game.elapsed)).toBe(pausedAt);
  await page.locator('#resumeBtn').click();
  await expect(page.locator('#dirArrow')).toBeVisible();

  // and it goes the moment the card is handed over, however long it had left
  await hooks(page, (s) => { s.speech.until = s.game.elapsed + 600; });
  await faceStudent(page, 'moeLester');
  await expect(page.locator('#speechBubble')).toBeVisible();
  await page.keyboard.press('e');
  await expect(lastLog(page)).toContainText('Marked present');
  await expect(page.locator('#speechBubble')).toBeHidden();
  await expect(page.locator('#dirArrow')).toBeHidden();
  expect(await hooks(page, (s) => s.speech)).toBe(null);
});

test('a lost round keeps its final HUD values; the stats sit three by two', async ({ page }) => {
  await freezeRandomness(page);
  await activate(page, 'steve', 99.95);
  await expect(page.locator('#endOverlay')).toBeVisible();
  await expect(page.locator('#chaosValue')).toHaveText('100%');
  await expect(page.locator('#chaosBadge')).toHaveAttribute('aria-valuenow', '100');
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    const boxes = await page.locator('#endOverlay .stats > div').evaluateAll((nodes) => nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top)];
    }));
    expect(new Set(boxes.map(([, y]) => y)).size, `rows at ${width}px`).toBe(2);
    expect(new Set(boxes.map(([x]) => x)).size, `columns at ${width}px`).toBe(3);
  }
});

test('a student reaching 100% ends the round with the right copy', async ({ page }) => {
  await freezeRandomness(page);
  await activate(page, 'steve', 99.95);
  await expect(page.locator('#endOverlay')).toBeVisible();
  await expect(page.locator('#endTitle')).toHaveText('Someone Got Hurt');
  await expect(page.locator('#endText')).toContainText('Steve tips too far back');
  await expect(page.locator('#endTip')).toContainText('The chair-tipper is quick');
  await expect(page.locator('#restartBtn')).toBeFocused();
});

test('unfinished attendance at the bell is a loss', async ({ page }) => {
  await freezeRandomness(page);
  await hooks(page, (s) => s.fastForward(s.game.tuning.period + 1));
  await expect(page.locator('#endTitle')).toHaveText('Attendance Not Taken');
  await expect(page.locator('#endText')).toContainText('8 students still unmarked');
  await expect(page.locator('#endTip')).toContainText('ask with roll call (Q)');
});

test('discipline is refused for a student who is behaving', async ({ page }) => {
  await freezeRandomness(page);
  await faceStudent(page, 'dixieNormous');
  await expect(page.locator('#prompt')).toContainText('Dixie Normous is behaving');
  await page.keyboard.press('f');
  await expect(lastLog(page)).toContainText('Dixie Normous isn’t acting up');
  await expect(page.locator('#disciplineOverlay')).toBeHidden();
});

test('discipline menu: shows costs, traps focus, and detention runs out', async ({ page }) => {
  await freezeRandomness(page);
  for (const [i, id] of ['mikeOxlong', 'steve', 'moeLester'].entries()) {
    await activate(page, id, 20);
    await faceStudent(page, id);
    await page.keyboard.press('f');
    const dialog = page.locator('#disciplineOverlay');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#discTalk')).toBeFocused();
    if (i === 0) {
      await expect(page.locator('#discDetentionNote')).toContainText('2 of 2 left');
      await expect(page.locator('#discPrincipalNote')).toContainText('1 of 1 left');
      await expect(page.locator('#discZapNote')).toContainText('sets another student off');
      // Tab and Shift+Tab stay inside the menu
      for (let k = 0; k < 6; k++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.getElementById('disciplineOverlay').contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.getElementById('disciplineOverlay').contains(document.activeElement))).toBe(true);
    }
    if (i < 2) {
      await page.keyboard.press('2');
      await expect(dialog).toBeHidden();
      await expect(lastLog(page)).toContainText('gets detention');
    } else {
      await expect(page.locator('#discDetention')).toBeDisabled();
      await expect(page.locator('#discDetentionNote')).toHaveText('No detention slips left this period.');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  }
  expect(await hooks(page, (s) => s.game.counters.detentions)).toBe(2);
});

test('calling the principal marches the student out', async ({ page }) => {
  await freezeRandomness(page);
  await activate(page, 'hughJass', 40);
  await faceStudent(page, 'hughJass');
  await page.keyboard.press('f');
  await page.keyboard.press('3');
  await page.waitForFunction(() => window.__substitute.principalSeq !== null);
  // the walk is played by its own clock, not by frames, so a busy machine can't time it out
  expect(await hooks(page, (s) => s.runCutscene())).toBe(true);
  await expect(lastLog(page)).toContainText('marched out by the principal');
  expect(await hooks(page, (s) => ({ removed: s.game.students.hughJass.removed, visible: s.world.students.hughJass.visible })))
    .toEqual({ removed: true, visible: false });
});

test('seat swaps change escalation and the game says why', async ({ page }) => {
  await freezeRandomness(page);
  const before = await hooks(page, (s) => s.rules.escalationRate(s.game, 'mikeOxlong'));
  await page.keyboard.press('r');
  await expect(page.locator('#seatChart')).toBeVisible();
  await expect(page.locator('#seatGrid .seat').first()).toBeFocused();
  await page.locator('#seatGrid .seat', { hasText: 'Mike Oxlong' }).click();
  await page.locator('#seatGrid .seat', { hasText: 'Hugh Jass' }).click();
  await expect(page.locator('#log')).toContainText('Gabe Iches and Mike Oxlong are split up');
  const after = await hooks(page, (s) => s.rules.escalationRate(s.game, 'mikeOxlong'));
  expect(after).toBeLessThan(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('#seatChart')).toBeHidden();
});

test('the seating chart says the class keeps going, and the clock does', async ({ page }) => {
  await page.keyboard.press('r');
  await expect(page.locator('#seatChart')).toBeVisible();
  await expect(page.locator('#seatLive')).toBeVisible();
  await expect(page.locator('#seatLive')).toHaveText('The class keeps going while you plan: the clock is still running.');
  const start = await hooks(page, (s) => s.game.elapsed);
  await page.waitForFunction((t) => window.__substitute.game.elapsed > t + 1, start);
  expect(await hooks(page, (s) => s.seatChartOpen)).toBe(true);
});

test('getting hit by a throw has a visible cost', async ({ page }) => {
  await freezeRandomness(page);
  await activate(page, 'steve', 10);
  // stand at the board, back to the class, then someone throws
  await hooks(page, (s) => s.lookAt(0, 1.9, -6.2, 0, -4.5));
  await page.waitForFunction(() => window.__substitute.camera.position.z < -4);
  await hooks(page, (s) => { s.game.throw = { id: 'dixieNormous', phase: 'windup', t: 0 }; });
  await expect(page.locator('#log')).toContainText('hits you in the back of the head');
  await expect(page.locator('#log')).toContainText('Getting hit costs you');
  const esc = await hooks(page, (s) => ({ steve: s.game.students.steve.escalation, dixieNormous: s.game.students.dixieNormous.escalation }));
  expect(esc.steve).toBeGreaterThanOrEqual(18);
  expect(esc.dixieNormous).toBeGreaterThanOrEqual(20);
});

test('the phone and the arguer explain their rules before you act', async ({ page }) => {
  await freezeRandomness(page);
  await activate(page, 'benDover', 30);
  await faceStudent(page, 'benDover');
  await expect(page.locator('#prompt')).toContainText('It takes two presses');
  await page.keyboard.press('e');
  await expect(page.locator('#prompt')).toContainText('Press again now to take Ben Dover’s phone');

  await activate(page, 'hughJass', 30);
  await hooks(page, (s) => { s.game.students.hughJass.activatedAt = s.game.elapsed - 1.5; });
  await faceStudent(page, 'hughJass');
  await expect(page.locator('#prompt')).toContainText('Wait for the green glow');
});

test('Esc pauses the class and freezes the clock; Resume carries on', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  await expect(page.locator('#resumeBtn')).toBeFocused();
  const t0 = await hooks(page, (s) => s.game.elapsed);
  await page.waitForTimeout(1500);
  expect(await hooks(page, (s) => s.game.elapsed)).toBe(t0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeHidden();
});

test('arrow keys turn the view, so the game needs no mouse', async ({ page }) => {
  const yaw0 = await hooks(page, (s) => s.player.yaw);
  await page.keyboard.down('ArrowLeft');
  // on a loaded machine frames can be far apart: hold the key until the view has turned
  await page.waitForFunction((y0) => window.__substitute.player.yaw > y0 + 0.2, yaw0, { timeout: 30_000 });
  await page.keyboard.up('ArrowLeft');
});

test('a won round reports removals, detentions and every intervention', async ({ page }) => {
  await freezeRandomness(page);
  await hooks(page, (s) => {
    const g = s.game, R = s.rules;
    for (const id of [...g.attendance.remaining]) { R.pickupCard(g, id); R.deliverCard(g, id); }
    const act = (id) => { const st = g.students[id]; st.active = true; st.escalation = 30; st.activatedAt = g.elapsed; };
    act('moeLester'); R.discipline(g, 'moeLester', 'principal');
    act('steve'); R.discipline(g, 'steve', 'detention');
    act('mikeOxlong'); R.discipline(g, 'mikeOxlong', 'detention');
    act('gabeIches'); R.help(g, 'gabeIches');
  });
  expect(await hooks(page, (s) => s.runCutscene())).toBe(true);
  await expect(page.locator('#log')).toContainText('marched out');
  await freezeRandomness(page);
  await hooks(page, (s) => s.fastForward(s.game.tuning.period + 1));
  await expect(page.locator('#endTitle')).toHaveText('You Made It');
  const text = page.locator('#endText');
  await expect(text).toContainText('Moe Lester spent the rest of the period in the principal’s office');
  await expect(text).toContainText('Steve and Mike Oxlong served detention at their desks');
  await expect(text).not.toContainText('Every kid stayed in their seat');
  await expect(page.locator('#statInterventions')).toHaveText('4');
  await expect(page.locator('#statDetentions')).toHaveText('2');
  await expect(page.locator('#statPrincipal')).toHaveText('1');
  await expect(page.locator('#gradeValue')).toHaveText('C');
});

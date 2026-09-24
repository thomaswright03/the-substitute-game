import { test, expect } from '@playwright/test';
import { activate, faceStudent, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

const HUD_PARTS = ['#chaosBadge', '.btnRow', '.hint', '#log', '#attendancePanel', '.badge.clock', '#actions'];

async function boxes(page) {
  return page.evaluate((selectors) => {
    const out = {};
    for (const sel of selectors) {
      const node = document.querySelector(sel);
      if (!node) continue;
      const style = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      if (style.display === 'none' || node.closest('[hidden]') || r.width === 0 || r.height === 0) continue;
      out[sel] = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return out;
  }, HUD_PARTS);
}

function overlaps(a, b) {
  return a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
}

for (const [w, h] of [[375, 667], [390, 844], [768, 1024], [1440, 900], [2560, 1440]]) {
  test(`no HUD element overlaps another at ${w}px wide`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openGame(page);
    await startRound(page);
    await freezeRandomness(page);
    await expect(page.locator('#attendancePanel')).toBeVisible();
    const b = await boxes(page);
    expect(Object.keys(b)).toEqual(expect.arrayContaining(['#chaosBadge', '.btnRow', '#log', '#attendancePanel']));
    const names = Object.keys(b);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        expect(overlaps(b[names[i]], b[names[j]]), `${names[i]} overlaps ${names[j]}`).toBe(false);
      }
    }
    // the chaos label and value are not clipped
    const clipped = await page.evaluate(() => [...document.querySelectorAll('#chaosBadge .label, #chaosBadge .value')]
      .some((n) => n.scrollWidth > n.clientWidth + 1));
    expect(clipped).toBe(false);
  });
}

test('the game frame fills most of a large screen', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await openGame(page);
  const r = await page.locator('#cabinet').boundingBox();
  expect((r.width * r.height) / (2560 * 1440)).toBeGreaterThan(0.75);
});

test('the chaos bar changes colour at the same thresholds as the number', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  const colours = [];
  for (const level of [20, 50, 80]) {
    await activate(page, 'mikeHunt', level);
    await expect(page.locator('#chaosValue')).toHaveText(level + '%');
    colours.push(await page.evaluate(() => [
      getComputedStyle(document.getElementById('chaosFill')).backgroundColor,
      getComputedStyle(document.getElementById('chaosValue')).color,
    ]));
  }
  expect(new Set(colours.map((c) => c[0])).size, JSON.stringify(colours)).toBe(3);
  expect(new Set(colours.map((c) => c[1])).size).toBe(3);
});

test('no text is smaller than 12px', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseOverlay')).toBeVisible();
  const tooSmall = await page.evaluate(() => {
    const bad = [];
    for (const node of document.querySelectorAll('body *')) {
      if (!node.childNodes.length || ![...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (size < 12) bad.push(node.id || node.className || node.tagName);
    }
    return bad;
  });
  expect(tooSmall).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test('the start panel scrolls from its first line, in portrait and landscape', async ({ page }) => {
    await openGame(page);
    for (const size of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(size);
      await page.locator('#startOverlay').evaluate((n) => { n.scrollTop = 0; });
      const overlay = await page.locator('#startOverlay').boundingBox();
      const apple = await page.locator('#startOverlay .apple').boundingBox();
      const heading = await page.locator('#startTitle').boundingBox();
      expect(apple.y).toBeGreaterThanOrEqual(overlay.y);
      expect(heading.y).toBeGreaterThanOrEqual(overlay.y);
      await page.locator('#startBtn').scrollIntoViewIfNeeded();
      await expect(page.locator('#startBtn')).toBeInViewport();
    }
  });

  test('touch controls are shown instead of keyboard help', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#startOverlay .controls')).toContainText('Left stick');
    await expect(page.locator('#startOverlay .controls')).not.toContainText('WASD');
    await startRound(page);
    await expect(page.locator('#joystick')).toBeVisible();
    await expect(page.locator('#hint')).toBeHidden();
  });

  test('every action has a 44px on-screen control, and a round can be played by tapping', async ({ page }) => {
    await openGame(page);
    await page.locator('#startBtn').tap();
    await page.waitForFunction(() => window.__substitute.running);
    await freezeRandomness(page);

    for (const sel of ['#pauseBtn', '#fullscreenBtn', '#actSeats']) {
      await expect(page.locator(sel)).toBeVisible();
      const r = await page.locator(sel).boundingBox();
      expect(r.width, sel).toBeGreaterThanOrEqual(44);
      expect(r.height, sel).toBeGreaterThanOrEqual(44);
    }

    // help and discipline an acting-up student
    await activate(page, 'mikeOxlong', 40);
    await faceStudent(page, 'mikeOxlong');
    for (const sel of ['#actPrimary', '#actDiscipline']) {
      await expect(page.locator(sel)).toBeVisible();
      const r = await page.locator(sel).boundingBox();
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#actPrimary')).toHaveText('Help Mike Oxlong');
    await page.locator('#actDiscipline').tap();
    await expect(page.locator('#disciplineOverlay')).toBeVisible();
    await page.locator('#discTalk').tap();
    await expect(page.locator('#disciplineOverlay')).toBeHidden();
    expect(await hooks(page, (s) => s.game.counters.talks)).toBe(1);

    // swap two seats with the seating chart
    await page.locator('#actSeats').tap();
    await expect(page.locator('#seatChart')).toBeVisible();
    await page.locator('#seatGrid .seat', { hasText: 'Ben Dover' }).tap();
    await page.locator('#seatGrid .seat', { hasText: 'Mike Hunt' }).tap();
    await expect(page.locator('#log')).toContainText('Ben Dover and Mike Hunt swap seats');
    const seats = await hooks(page, (s) => [s.game.seats.benDover, s.game.seats.mikeHunt]);
    expect(seats).toEqual([{ row: 1, col: 1 }, { row: 0, col: 1 }]);

    await page.locator('#seatClose').tap();
    await expect(page.locator('#seatChart')).toBeHidden();

    // roll call and pause are reachable too
    await hooks(page, (s) => { s.rules.pickupCard(s.game, 'moeLester'); });
    await expect(page.locator('#actRollCall')).toBeVisible();
    await page.locator('#actRollCall').tap();
    await expect(page.locator('#attAnswer')).toBeVisible();
    await page.locator('#pauseBtn').tap();
    await expect(page.locator('#pauseOverlay')).toBeVisible();
  });
});

test('the roll-call direction arrow stays clear of the HUD panels on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openGame(page);
  await startRound(page);
  await freezeRandomness(page);
  await hooks(page, (s) => {
    const c = s.world.cards.moeLester.position;
    s.lookAt(c.x, c.y, c.z, c.x * 0.6, -4.4);
    s.rules.pickupCard(s.game, 'moeLester');
  });
  await page.keyboard.press('q');
  await expect(page.locator('#dirArrow')).toBeVisible();
  const arrow = await page.locator('#dirArrow').boundingBox();
  for (const sel of ['#attendancePanel', '#log', '#actions', '#hud']) {
    const r = await page.locator(sel).boundingBox();
    const b = { x: r.x, y: r.y, w: r.width, h: r.height };
    const a = { x: arrow.x, y: arrow.y, w: arrow.width, h: arrow.height };
    expect(overlaps(a, b), `arrow overlaps ${sel}`).toBe(false);
  }
  // the answer is also written to the log
  await expect(page.locator('#log')).toContainText('Moe Lester answered from');
});

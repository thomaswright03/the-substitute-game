import { test, expect } from '@playwright/test';
import { activate, faceCard, faceStudent, freezeRandomness, hooks, openGame, startRound } from './helpers.js';

// These tests measure the page, not the 3D view: draw the view at the cheapest graphics level,
// so that the frames that update the HUD come quickly under software rendering, even on a
// 2560x1440 page.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('substitute.quality', 'minimum'));
});

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

// the "Turn around!" warning, over a roll-call answer in the attendance panel
for (const [w, h] of [[800, 500], [1024, 640], [1280, 800], [1440, 900], [375, 667], [2560, 1440]]) {
  test(`the throw warning covers no panel at ${w}×${h}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: w, height: h });
    await openGame(page);
    await startRound(page);
    await freezeRandomness(page);
    await faceCard(page, 'moeLester');
    await page.keyboard.press('e');
    await page.keyboard.press('q');
    await expect(page.locator('#attAnswer')).toBeVisible();
    // a throw that stays in the air while the page is measured
    await hooks(page, (s) => {
      s.game.tuning.throwFlight = 600;
      s.game.throw = { id: 'dixieNormous', phase: 'windup', t: 0 };
    });
    const cue = page.locator('#threatCue');
    await expect(cue).toBeVisible();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const r = await page.evaluate(() => {
      const box = (n) => {
        const b = n.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
      };
      const out = { cue: box(document.getElementById('threatCue')), stage: box(document.getElementById('stage')), others: {} };
      for (const sel of ['#attendancePanel', '#seatChart', '#banner', '#log', '#actions', '.hud', '.hint']) {
        const n = document.querySelector(sel);
        if (!n || !n.checkVisibility()) continue;
        out.others[sel] = box(n);
      }
      return out;
    });
    expect(Object.keys(r.others)).toEqual(expect.arrayContaining(['#attendancePanel', '#log']));
    for (const [sel, b] of Object.entries(r.others)) expect(overlaps(r.cue, b), `the warning overlaps ${sel}`).toBe(false);
    // and it is on the stage, in the upper part of the view where the player is looking
    expect(r.cue.x).toBeGreaterThanOrEqual(r.stage.x);
    expect(r.cue.x + r.cue.w).toBeLessThanOrEqual(r.stage.x + r.stage.w);
    expect(r.cue.y + r.cue.h).toBeLessThan(r.stage.y + r.stage.h * 0.75);

    // with the seating chart open (it can fill a small screen) the warning is inside the chart
    await page.keyboard.press('r');
    await expect(page.locator('#seatChart')).toBeVisible();
    await expect(cue).toBeHidden();
    const inChart = page.locator('#seatThreat');
    await expect(inChart).toBeVisible();
    const [chart, line] = [await page.locator('#seatChart').boundingBox(), await inChart.boundingBox()];
    expect(line.y).toBeGreaterThanOrEqual(chart.y);
    expect(line.y + line.height).toBeLessThanOrEqual(chart.y + chart.height);
    // and back on the view once the chart closes
    await page.keyboard.press('Escape');
    await expect(inChart).toBeHidden();
    await expect(cue).toBeVisible();
  });
}

test('the Start button is in reach without scrolling on a laptop screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page);
  await expect(page.locator('#startBtn')).toBeInViewport();
});

for (const [w, h] of [[1440, 900], [1280, 800]]) {
  test(`the start card's language choice is in view without scrolling at ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openGame(page);
    await expect(page.locator('#startOverlay select[data-language]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#startBtn')).toBeInViewport({ ratio: 1 });
    // in view means on screen, not scrolled into view inside the card either
    const scrolled = await page.evaluate(() => [...document.querySelectorAll('#startOverlay *')].some((n) => n.scrollTop > 0));
    expect(scrolled).toBe(false);
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
  const { warning, danger } = await hooks(page, (s) => s.game.tuning.hud);
  const colours = [];
  // one level in each band: calm, warning and danger
  for (const level of [Math.floor(warning / 2), Math.round((warning + danger) / 2), Math.min(100, danger + 5)]) {
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

test('the HUD keeps its share of the screen from a laptop to a large monitor', async ({ page }) => {
  const shares = [];
  for (const [w, h] of [[1440, 900], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h });
    await openGame(page);
    await startRound(page);
    await expect(page.locator('#attendancePanel')).toBeVisible();
    shares.push(await page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const clock = document.querySelector('.badge.clock').getBoundingClientRect();
      const panel = document.getElementById('attendancePanel').getBoundingClientRect();
      return { clock: clock.height / stage.height, panel: panel.width / stage.width, text: parseFloat(getComputedStyle(document.getElementById('chaosValue')).fontSize) / stage.height };
    }));
  }
  const [laptop, monitor] = shares;
  for (const key of ['clock', 'panel', 'text']) {
    expect(monitor[key] / laptop[key], `${key}: ${JSON.stringify(shares)}`).toBeGreaterThan(0.85);
    expect(monitor[key] / laptop[key], `${key}: ${JSON.stringify(shares)}`).toBeLessThan(1.15);
  }
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

  test('HUD text stays at 12px or more while playing', async ({ page }) => {
    await openGame(page);
    await startRound(page);
    await freezeRandomness(page);
    await activate(page, 'gabeIches', 50);
    await faceStudent(page, 'gabeIches');
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.stage *')]
      .filter((n) => n.offsetParent && !n.closest('.overlay') && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .map((n) => parseFloat(getComputedStyle(n).fontSize)));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

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
      // the Start button is in reach without scrolling
      await expect(page.locator('#startBtn')).toBeInViewport();
    }
  });

  for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
    test(`in portrait at ${size.width}x${size.height} the rules come before Start, and play keeps half the screen for the room`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page);
      // the start card reads intro, rules, then the settings: the first rule is on screen as it opens
      const firstRule = page.locator('#startOverlay .rules li').first();
      await expect(firstRule).toBeInViewport();
      const ruleTop = (await firstRule.boundingBox()).y;
      const setupTop = (await page.locator('#startOverlay .difficulty').boundingBox()).y;
      expect(ruleTop).toBeLessThan(setupTop);
      await expect(page.locator('#startBtn')).toBeInViewport();

      await startRound(page);
      await expect(page.locator('#attendancePanel')).toBeVisible();
      const m = await page.evaluate(() => {
        const box = (sel) => document.querySelector(sel).getBoundingClientRect();
        const question = document.getElementById('attQuestion');
        const range = document.createRange();
        range.selectNodeContents(question);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        const shown = [...document.querySelectorAll('#attendancePanel > *')].filter((n) => n.checkVisibility()).map((n) => n.className);
        return { stage: box('#stage'), panel: box('#attendancePanel'), question: box('#attQuestion'), top: box('.topStack'), bottom: box('#bottomBar'), lines, shown };
      });
      // the attendance panel is the question alone, on one line, plus its padding
      expect(m.lines).toBe(1);
      expect(m.shown).toEqual(['attQuestion']);
      expect(m.panel.height).toBeLessThanOrEqual(m.question.height + 16);
      // between the top HUD and the log/controls, at least half the stage shows the classroom
      expect(m.bottom.top - m.top.bottom).toBeGreaterThan(m.stage.height / 2);
    });
  }

  test('no text on a phone names a keyboard key, and the seating chart explains its colours', async ({ page }) => {
    await openGame(page);
    await startRound(page);
    await freezeRandomness(page);
    const keyed = /\((E|F|R|Q|Esc)\)|\bpress E\b|\bEsc\b/;
    await page.locator('#actSeats').tap();
    await expect(page.locator('#seatChart')).toBeVisible();
    await expect(page.locator('#seatClose')).toHaveText('Done');
    await expect(page.locator('.seatLegend')).toBeVisible();
    await expect(page.locator('.seatLegend')).toHaveText('Same colour = friends');
    await page.locator('#seatClose').tap();
    await hooks(page, (s) => { s.game.events.push({ type: 'eggedOn', id: 'mikeOxlong', friendId: 'gabeIches' }); });
    await expect(page.locator('#log')).toContainText('egging each other on');
    const visibleText = await page.evaluate(() => [...document.querySelectorAll('#stage *')]
      .filter((n) => n.checkVisibility && n.checkVisibility() && n.childElementCount === 0)
      .map((n) => n.textContent).join(' | '));
    expect(visibleText).not.toMatch(keyed);
    expect(await page.locator('#discCancel').textContent()).toBe('Never mind');
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

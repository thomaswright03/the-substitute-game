import { test, expect } from '@playwright/test';
import { hooks, openGame, startRound } from './helpers.js';

test('every expressive face sits on its head (students and principal)', async ({ page }) => {
  await openGame(page);
  await hooks(page, (s) => s.ensurePrincipal());
  const offsets = await hooks(page, (s) => s.faceOffsets());
  expect(Object.keys(offsets)).toHaveLength(9);
  for (const [who, metres] of Object.entries(offsets)) {
    expect(metres, who).not.toBeNull();
    expect(metres, who).toBeLessThan(0.1);
  }
});

test('faces stay on the head while it nods, shakes and the chair spins', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await hooks(page, (s) => {
    s.game.spawnTimer = Infinity;
    s.game.tuning.attendanceRateScale = 0.01;
    for (const id of ['mikeHunt', 'mikeOxlong', 'benDover']) {
      const st = s.game.students[id];
      st.active = true;
      st.escalation = 10;
      st.activatedAt = s.game.elapsed;
    }
  });
  // let a few frames of sleeping, spinning and phone poses play
  await page.waitForTimeout(1500);
  const offsets = await hooks(page, (s) => s.faceOffsets());
  for (const id of ['mikeHunt', 'mikeOxlong', 'benDover']) expect(offsets[id], id).toBeLessThan(0.1);
});

test('the green chalkboard is in front of its frame and behind the name cards', async ({ page }) => {
  await openGame(page);
  const hits = await hooks(page, (s) => {
    const T = s.THREE;
    const ray = new T.Raycaster();
    const names = [];
    // one ray at open board (top-left corner area), one at a card
    for (const target of [[-2.0, 2.7], [-1.65, 2.2]]) {
      ray.set(new T.Vector3(target[0], target[1], 0), new T.Vector3(0, 0, -1));
      const first = ray.intersectObjects(s.scene.children, true).find((h) => h.object.visible);
      names.push(first && first.object.name);
    }
    return names;
  });
  expect(hits).toEqual(['chalkboard', 'card-dixieNormous']);
});

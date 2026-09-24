import { expect } from '@playwright/test';

// Collects console errors, page errors and failed or cross-origin requests for a page.
export function watchPage(page) {
  const problems = { errors: [], failed: [], external: [] };
  page.on('pageerror', (e) => problems.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.errors.push(m.text()); });
  page.on('requestfailed', (r) => problems.failed.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) problems.failed.push(r.status() + ' ' + r.url()); });
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol !== 'data:' && url.protocol !== 'blob:') {
      problems.external.push(r.url());
    }
  });
  return problems;
}

export async function openGame(page, query = '?test') {
  await page.goto('/' + query);
  await expect(page.locator('#startOverlay')).toBeVisible({ timeout: 90_000 });
}

export async function startRound(page) {
  await page.locator('#startBtn').click();
  await expect(page.locator('#startOverlay')).toBeHidden();
  await page.waitForFunction(() => window.__substitute && window.__substitute.running);
}

// Runs a function inside the page with the test API as its first argument.
export function hooks(page, fn, arg) {
  return page.evaluate(([src, a]) => {
    const f = new Function('return ' + src)();
    return f(window.__substitute, a);
  }, [fn.toString(), arg]);
}

// Stops random events and slows time-based rules right down, so a test controls exactly what
// happens even when software rendering makes each frame take a long time.
export function freezeRandomness(page) {
  return hooks(page, (s) => {
    const t = s.game.tuning;
    s.game.spawnTimer = Infinity;
    t.throwChanceAttendance = 0;
    t.throwChanceLesson = 0;
    t.attendanceRateScale = 0.01;
    t.phoneWarnWindow = 600;
  });
}

export function activate(page, id, escalation = 30) {
  return hooks(page, (s, a) => {
    const st = s.game.students[a.id];
    st.active = true;
    st.escalation = a.escalation;
    st.activatedAt = s.game.elapsed;
  }, { id, escalation });
}

// Stand in front of a student's desk, facing them, and wait until they are the aim target.
export async function faceStudent(page, id) {
  await hooks(page, (s, sid) => {
    const g = s.world.students[sid];
    const head = g.userData.headWorld || g.position;
    s.lookAt(head.x, head.y, head.z, head.x, head.z - 1.6);
  }, id);
  await page.waitForFunction((sid) => {
    const c = window.__substitute.context();
    return c && c.id === sid;
  }, id);
}

export async function faceCard(page, id) {
  await hooks(page, (s, cid) => {
    const p = s.world.cards[cid].position;
    s.lookAt(p.x, p.y, p.z, p.x * 0.6, -4.4);
  }, id);
  await page.waitForFunction((cid) => {
    const c = window.__substitute.context();
    return c && c.kind === 'pickup' && c.id === cid;
  }, id);
}

export function lastLog(page) {
  return page.locator('#log div').last();
}

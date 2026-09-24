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

test('every face has painted brows, lips, eyes and teeth', async ({ page }) => {
  await openGame(page);
  await hooks(page, (s) => s.ensurePrincipal());
  const ids = await hooks(page, (s) => [...Object.keys(s.world.students), 'principal']);
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (const id of ids) {
    const c = await hooks(page, (s, id) => s.faceColours(id), id);
    // skin is the most common colour; brows are far darker than it; lips are redder
    expect(c.head.length, id).toBeGreaterThan(10);
    const darkest = c.head[0], lightest = c.head[c.head.length - 1];
    expect(lum(darkest), id).toBeLessThan(lum(lightest) * 0.5);
    expect(c.head.some(([r, g]) => r > g * 1.6), id).toBe(true);
    // two eyeballs, each with a pupil, an iris and a white
    expect(c.eyes, id).toHaveLength(2);
    for (const eye of c.eyes) {
      expect(eye, id).toHaveLength(3);
      expect(lum(eye[2]), id).toBeGreaterThan(lum(eye[0]) * 5);
    }
    expect(lum(c.teeth), id).toBeGreaterThan(lum(lightest));
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

test('every student sits on their chair, knees under the desk and feet on the floor', async ({ page }) => {
  await openGame(page);
  const seated = await hooks(page, (s) => {
    const T = s.THREE;
    const out = {};
    for (const [id, g] of Object.entries(s.world.students)) {
      g.updateMatrixWorld(true);
      const bone = (name) => {
        let found = null;
        g.traverse((o) => { if (o.isBone && o.name === name) found = o; });
        return found.getWorldPosition(new T.Vector3());
      };
      const seat = s.game.seats[id];
      const hips = bone('Hips');
      out[id] = {
        hipsAboveSeat: hips.y - 0.485,
        hipsFromSeatCentre: Math.hypot(hips.x - [-2.6, -0.87, 0.87, 2.6][seat.col], hips.z - ([-3.0, -0.75][seat.row] + 0.5)),
        kneesY: Math.max(bone('LowerLegL').y, bone('LowerLegR').y),
        // each foot, relative to its knee: straight below it, not splayed out or left standing
        feet: ['L', 'R'].map((side) => {
          const knee = bone('LowerLeg' + side), foot = bone('Foot' + side);
          return { y: foot.y, sideways: Math.abs(foot.x - knee.x), below: knee.y - foot.y, forward: Math.abs(foot.z - knee.z) };
        }),
      };
    }
    return out;
  });
  expect(Object.keys(seated)).toHaveLength(8);
  for (const [id, m] of Object.entries(seated)) {
    expect(m.hipsAboveSeat, id).toBeGreaterThan(0.04);
    expect(m.hipsAboveSeat, id).toBeLessThan(0.15);
    expect(m.hipsFromSeatCentre, id).toBeLessThan(0.1);
    // the desk top is 0.695-0.745 m high: the knee joint stays clear of it
    expect(m.kneesY, id).toBeLessThan(0.66);
    for (const f of m.feet) {
      expect(f.y, id + ' foot above the floor').toBeGreaterThan(-0.02);
      expect(f.y, id + ' foot near the floor').toBeLessThan(0.2);
      expect(f.sideways, id + ' foot under its knee').toBeLessThan(0.12);
      expect(f.forward, id + ' shin upright').toBeLessThan(0.15);
      expect(f.below, id).toBeGreaterThan(0.3);
    }
  }
});

test('the teacher has a full-size desk of their own, and can’t walk through it', async ({ page }) => {
  await openGame(page);
  await startRound(page);
  await hooks(page, (s) => { s.game.spawnTimer = Infinity; s.game.tuning.throwChanceAttendance = 0; });
  const desk = await hooks(page, (s) => {
    const d = s.scene.getObjectByName('teacherDesk');
    const box = new s.THREE.Box3().setFromObject(d);
    let seats = 0;
    d.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0x3f5c76) seats++; });
    return { width: box.max.x - box.min.x, depth: box.max.z - box.min.z, height: box.max.y, x: (box.min.x + box.max.x) / 2, front: box.max.z, seats };
  });
  expect(desk.width).toBeGreaterThan(1.4);
  expect(desk.depth).toBeGreaterThan(0.7);
  expect(desk.height).toBeGreaterThan(0.75);
  expect(desk.seats, 'no student chair').toBe(0);
  // walk straight at its front for a while: the teacher stops at the desk
  await hooks(page, (s, d) => { Object.assign(s.player, { x: d.x, z: d.front + 1.2, yaw: 0, pitch: 0 }); s.keys.KeyW = true; }, desk);
  await page.waitForFunction((front) => {
    const s = window.__substitute;
    return s.game.elapsed > 0 && s.player.z < front + 0.5;
  }, desk.front);
  await page.waitForTimeout(1500);
  const z = await hooks(page, (s) => { s.keys.KeyW = false; return s.player.z; });
  expect(z).toBeGreaterThan(desk.front + 0.3);
});

test.describe('behaviour tells', () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await startRound(page);
    await hooks(page, (s) => {
      s.game.spawnTimer = Infinity;
      s.game.tuning.attendanceRateScale = 0.001;
      s.game.tuning.throwChanceAttendance = 0;
      for (const id of Object.keys(s.game.students)) {
        const st = s.game.students[id];
        st.active = true;
        st.escalation = 10;
        st.activatedAt = s.game.elapsed;
      }
    });
    // let the poses apply
    await page.waitForFunction(() => {
      const w = window.__substitute.world.students;
      return w.benDover.userData.parts.prop.visible && w.moeLester.userData.parts.prop.visible;
    });
  });

  test('phone, notes and plane students bow their heads toward the desk', async ({ page }) => {
    const down = await hooks(page, (s) => {
      const out = {};
      for (const [id, type] of [['benDover', 'phone'], ['dixieNormous', 'notes'], ['moeLester', 'plane']]) {
        out[id + ' (' + type + ')'] = s.headForward(id)[1];
      }
      return out;
    });
    // the face points clearly below horizontal (more than about 12 degrees)
    for (const [who, y] of Object.entries(down)) expect(y, who).toBeLessThan(-0.2);
  });

  test('every prop sits above the desk top and can be seen from the front and the aisle', async ({ page }) => {
    const seen = await hooks(page, (s) => {
      const T = s.THREE;
      const deskTop = 0.745;
      // everything except the characters themselves: desks, chairs, walls, other props
      const within = (o, test) => { for (let n = o; n; n = n.parent) if (test(n.name)) return true; return false; };
      const blockers = [];
      s.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const isProp = within(o, (n) => n.startsWith('prop-'));
        if (isProp || !within(o, (n) => /^student-|^principal$/.test(n))) blockers.push(o);
      });
      const out = {};
      for (const id of ['dixieNormous', 'benDover', 'moeLester', 'gabeIches']) {
        const prop = s.world.students[id].userData.parts.prop;
        const box = new T.Box3().setFromObject(prop);
        const centre = box.getCenter(new T.Vector3());
        const seat = s.world.students[id].userData.headWorld;
        const views = {
          front: new T.Vector3(seat.x, 1.62, seat.z - 2),
          aisle: new T.Vector3(seat.x + (seat.x > 0 ? -0.87 : 0.87), 1.62, seat.z - 1.2),
        };
        const result = { bottomAboveDesk: box.min.y >= deskTop - 0.005 };
        for (const [where, from] of Object.entries(views)) {
          const ray = new T.Raycaster(from, centre.clone().sub(from).normalize());
          const first = ray.intersectObjects(blockers, false)[0];
          let hit = first && first.object, isProp = false;
          while (hit) { if (hit === prop) isProp = true; hit = hit.parent; }
          result[where] = isProp;
        }
        out[id] = result;
      }
      return out;
    });
    for (const [id, r] of Object.entries(seen)) {
      expect(r, id).toEqual({ bottomAboveDesk: true, front: true, aisle: true });
    }
  });

  test('the other tells still play: sleeping eyes close, the chair tips, the chair spins', async ({ page }) => {
    const before = await hooks(page, (s) => s.world.students.mikeOxlong.rotation.y);
    // frames can be slow under software rendering: wait for a few to pass
    await page.waitForFunction((y) => window.__substitute.world.students.mikeOxlong.rotation.y !== y, before);
    const r = await hooks(page, (s) => {
      const face = s.world.students.mikeHunt.userData.parts.faceMesh;
      return {
        blink: face.morphTargetInfluences[face.morphTargetDictionary.eyeBlink_L],
        tip: s.world.students.steve.rotation.x,
        spin: s.world.students.mikeOxlong.rotation.y,
      };
    });
    expect(r.blink).toBe(1);
    expect(r.tip).toBeLessThan(-0.1);
    expect(r.spin).not.toBe(before);
  });
});

// The three.js side: renderer, camera, the classroom and its characters, and the students'
// body language each frame.
import { PRINCIPAL_MODEL, STUDENTS } from './data.js';
import * as R from './rules.js';
import { el } from './dom.js';
import { S } from './session.js';
import { buildAttendanceCards, buildDesk, buildRoom, deskPosition, seatPosition } from './scene.js';
import { FACE_URL, buildCharacter, loadAll, loadGLB, modelUrl, poseCharacter } from './characters.js';

export let renderer = null;
export let scene = null;
export let camera = null;
let composer = null;

export const world = { students: {}, cards: {}, principal: null, principalPromise: null, faceTemplate: null, deskColliders: [] };

export function createRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
  camera.rotation.order = 'YXZ';
  // bloom is a progressive enhancement; without it the loop falls back to a plain render
  try {
    if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.86);
      bloom.renderToScreen = true;
      composer.addPass(bloom);
    }
  } catch (err) {
    console.warn('Bloom disabled:', err);
    composer = null;
  }
}

export function resizeRenderer(w, h) {
  if (!renderer) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}

export function render() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function waitForFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const fonts = Promise.all([
    document.fonts.load('600 64px Fredoka'),
    document.fonts.load('700 52px Fredoka'),
  ]).catch(() => {});
  return Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]);
}

// Downloads the models and builds the room. onProgress(fraction) reports the download.
export async function buildWorld(onProgress) {
  const variants = [...new Set(STUDENTS.map((s) => s.model))];
  const urls = [FACE_URL, ...variants.map(modelUrl)];
  onProgress(0);
  const loading = loadAll(urls, onProgress);
  await waitForFonts();
  buildRoom(scene);
  world.cards = buildAttendanceCards(scene, STUDENTS);
  const [face, ...models] = await loading;
  world.faceTemplate = face.scene;
  const byVariant = {};
  variants.forEach((v, i) => { byVariant[v] = models[i]; });

  // desks stay put; students move between them when seats are swapped
  for (const s of STUDENTS) {
    const d = deskPosition(s);
    const desk = buildDesk(1);
    desk.position.set(d.x, 0, d.z);
    scene.add(desk);
    world.deskColliders.push({ x: d.x, z: d.z + 0.25 });
  }
  for (const s of STUDENTS) {
    const group = buildCharacter(byVariant[s.model], world.faceTemplate, { type: s.type, model: s.model });
    group.name = 'student-' + s.id;
    placeInSeat(group, s);
    scene.add(group);
    world.students[s.id] = group;
  }
  onProgress(1);
}

// The principal is only needed if someone gets sent to the office, so the model is fetched
// after the classroom is ready instead of holding up the first load.
export function ensurePrincipal() {
  if (!world.principalPromise) {
    world.principalPromise = loadGLB(modelUrl(PRINCIPAL_MODEL)).then((gltf) => {
      const p = buildCharacter(gltf, world.faceTemplate, { type: null, seated: false, model: PRINCIPAL_MODEL });
      p.scale.multiplyScalar(1.1);
      p.visible = false;
      p.name = 'principal';
      scene.add(p);
      world.principal = p;
      return p;
    }).catch((err) => {
      world.principalPromise = null;
      throw err;
    });
  }
  return world.principalPromise;
}

/* ---------------- students: seats and poses ---------------- */

// Where a seated student's group goes so that their hips rest on the chair of `seat`.
export function seatTarget(group, seat) {
  const p = seatPosition(seat);
  const o = group.userData.seatOffset;
  return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
}

export function placeInSeat(group, seat) {
  const p = seatTarget(group, seat);
  group.position.set(p.x, p.y, p.z);
}

const flashPoses = {}; // id -> {kind, until}
export function flashPose(id, kind, seconds) {
  flashPoses[id] = { kind, until: performance.now() / 1000 + seconds };
}

export function resetStudentVisuals() {
  for (const s of STUDENTS) {
    const g = world.students[s.id];
    g.visible = true;
    g.rotation.set(0, Math.PI, 0);
    placeInSeat(g, s);
    delete g.userData.seatAnim;
    delete g.userData.spinYaw;
    world.cards[s.id].mesh.visible = true;
    delete flashPoses[s.id];
  }
  if (world.principal) world.principal.visible = false;
}

// Slides two students to their new desks after a swap.
export function animateSeatSwap(ids) {
  const now = performance.now() / 1000;
  for (const id of ids) {
    const g = world.students[id];
    const to = seatTarget(g, S.game.seats[id]);
    g.userData.seatAnim = { fromX: g.position.x, fromZ: g.position.z, toX: to.x, toZ: to.z, t0: now, dur: 0.6 };
  }
}

function poseStateFor(s, st, now) {
  const game = S.game;
  const f = flashPoses[s.id];
  if (f && now < f.until) return { kind: f.kind };
  if (game.throw && game.throw.id === s.id && game.throw.phase === 'windup') return { kind: 'throwing' };
  if (st.detained) return { kind: 'detained' };
  if (st.active) return { kind: 'active', type: s.type, argueReady: s.type === 'argue' && R.argueReady(game, s.id) };
  return { kind: 'calm' };
}

export function updateStudents(now) {
  for (const s of STUDENTS) {
    const g = world.students[s.id];
    const st = S.game.students[s.id];
    const beingMarchedOut = S.principalSeq && S.principalSeq.id === s.id;
    if (st.removed && !beingMarchedOut) {
      g.visible = false;
      g.userData.headWorld = null;
      continue;
    }
    g.visible = true;
    if (!beingMarchedOut) {
      const an = g.userData.seatAnim;
      if (an) {
        const k = Math.min(1, (now - an.t0) / an.dur);
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        g.position.x = an.fromX + (an.toX - an.fromX) * ease;
        g.position.z = an.fromZ + (an.toZ - an.fromZ) * ease;
        if (k >= 1) delete g.userData.seatAnim;
      } else {
        placeInSeat(g, S.game.seats[s.id]);
        if (st.active && st.escalation >= 75) g.position.x += Math.sin(now * 20) * 0.02;
      }
      poseCharacter(g, poseStateFor(s, st, now), now);
    }
    g.updateMatrixWorld(true);
    const head = g.userData.parts.head;
    g.userData.headWorld = head ? head.getWorldPosition(g.userData.headWorld || new THREE.Vector3()) : null;
  }
}

const tmpV = new THREE.Vector3();
// Screen position of a world point, in stage pixels.
export function project(worldPos) {
  const p = tmpV.copy(worldPos).project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * el.stage.clientWidth,
    y: (-p.y * 0.5 + 0.5) * el.stage.clientHeight,
    onScreen: p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05,
  };
}

// The three.js side: renderer, camera, the classroom and its characters, and the students'
// body language each frame.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { PRINCIPAL_MODEL, STUDENTS } from './data.js';
import * as R from './rules.js';
import { el } from './dom.js';
import { S } from './session.js';
import { TEACHER_DESK, buildAttendanceCards, buildDesk, buildRoom, deskPosition, seatPosition } from './scene.js';
import { buildCharacter, loadAll, loadGLB, modelUrl, poseCharacter } from './characters.js';

export let renderer = null;
export let scene = null;
export let camera = null;
let composer = null;

export const world = { students: {}, cards: {}, principal: null, principalPromise: null, deskColliders: [], boxColliders: [] };

// The classroom's look was designed with three.js r128 (see three-setup.js), where the scene was
// tone-mapped once when rendered into the bloom's buffer and
// again when the bloom pass drew it to the screen. These settings keep that look exactly.
const EXPOSURE = 1.15;
const ToneMapOnce = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: EXPOSURE } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float exposure;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color) {
      const mat3 inputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= exposure / 0.6;
      color = outputMat * RRTAndODTFit(inputMat * color);
      return clamp(color, 0.0, 1.0);
    }
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(aces(texel.rgb), texel.a);
    }`,
};

// Draws the finished frame to the screen the way the bloom pass does (through the renderer's
// tone mapping), without the glow: the last pass when bloom is switched off.
class ScreenPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.MeshBasicMaterial();
    this.quad = new FullScreenQuad(this.material);
  }

  render(r, writeBuffer, readBuffer) {
    this.material.map = readBuffer.texture;
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    r.clear();
    this.quad.render(r);
  }
}

let bloomPass = null, screenPass = null;

// The graphics levels, from the full look down to the cheapest. A slow device steps down them
// one at a time (see quality.js): first the pixel ratio, then the glow, then the shadows, and
// last the resolution itself (drawn at 60% and scaled up), since a device that still can't
// keep up is usually limited by how many pixels it can fill.
export const QUALITY_LEVELS = [
  { name: 'high', pixelRatio: 2, bloom: true, shadows: true },
  { name: 'medium', pixelRatio: 1, bloom: true, shadows: true },
  { name: 'low', pixelRatio: 1, bloom: false, shadows: true },
  { name: 'veryLow', pixelRatio: 1, bloom: false, shadows: false },
  { name: 'minimum', pixelRatio: 0.6, bloom: false, shadows: false },
];
let qualityLevel = 0;

export function setQualityLevel(level) {
  qualityLevel = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level));
  if (!renderer) return;
  const q = QUALITY_LEVELS[qualityLevel];
  const ratio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
  renderer.setPixelRatio(ratio);
  if (composer) {
    composer.setPixelRatio(ratio);
    bloomPass.enabled = q.bloom;
    screenPass.enabled = !q.bloom;
  }
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    // materials are compiled for shadows on or off: have them rebuilt
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }
  resizeRenderer(stageW, stageH);
}

// What is drawn now (for the settings and the tests).
export function renderState() {
  return {
    level: qualityLevel,
    pixelRatio: renderer ? renderer.getPixelRatio() : 1,
    bloom: !!(composer && bloomPass.enabled),
    shadows: !!(renderer && renderer.shadowMap.enabled),
  };
}

export function createRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
  camera.rotation.order = 'YXZ';
  // bloom is a progressive enhancement; without it the loop falls back to a plain render
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new ShaderPass(ToneMapOnce));
    // the last pass: draws the buffer to the screen (tone-mapped, sRGB) and adds the glow on top
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.86);
    composer.addPass(bloomPass);
    // or, with the glow switched off, only draws the buffer to the screen
    screenPass = new ScreenPass();
    screenPass.enabled = false;
    composer.addPass(screenPass);
  } catch (err) {
    console.warn('Bloom disabled:', err);
    composer = null;
  }
  setQualityLevel(qualityLevel);
}

let stageW = 1, stageH = 1; // the stage's size in CSS pixels, kept by resizeRenderer

export function resizeRenderer(w, h) {
  stageW = w;
  stageH = h;
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
  const urls = variants.map(modelUrl);
  onProgress(0);
  const loading = loadAll(urls, onProgress);
  await waitForFonts();
  buildRoom(scene);
  world.cards = buildAttendanceCards(scene, STUDENTS);
  const models = await loading;
  const byVariant = {};
  variants.forEach((v, i) => { byVariant[v] = models[i]; });

  // desks stay put; students move between them when seats are swapped
  for (const s of STUDENTS) {
    const d = deskPosition(s);
    const desk = buildDesk();
    desk.position.set(d.x, 0, d.z);
    scene.add(desk);
    world.deskColliders.push({ x: d.x, z: d.z + 0.25 });
  }
  const td = TEACHER_DESK;
  world.boxColliders.push({ minX: td.x - td.halfWidth, maxX: td.x + td.halfWidth, minZ: td.z - td.halfDepth, maxZ: td.z + td.halfDepth });
  for (const s of STUDENTS) {
    const group = buildCharacter(byVariant[s.model], { type: s.type, model: s.model });
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
      const p = buildCharacter(gltf, { type: null, seated: false, model: PRINCIPAL_MODEL });
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

// The students' own clock, in seconds: it runs with the frames' real time, so every animation
// plays at the same speed at any frame rate, and it stands still while the game is paused.
let animT = 0;

const flashPoses = {}; // id -> {kind, until}
export function flashPose(id, kind, seconds) {
  flashPoses[id] = { kind, until: animT + seconds };
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
  const now = animT;
  for (const id of ids) {
    const g = world.students[id];
    const to = seatTarget(g, S.game.seats[id]);
    g.userData.seatAnim = { fromX: g.position.x, fromZ: g.position.z, toX: to.x, toZ: to.z, t0: now, dur: 0.6 };
  }
}

const poseState = { kind: 'calm', type: null, argueReady: false };
function pose(kind, type = null, argueReady = false) {
  poseState.kind = kind;
  poseState.type = type;
  poseState.argueReady = argueReady;
  return poseState;
}

// The pose for one student this frame (one shared object, used at once by poseCharacter).
function poseStateFor(s, st, now) {
  const game = S.game;
  const f = flashPoses[s.id];
  if (f && now < f.until) return pose(f.kind);
  if (game.throw && game.throw.id === s.id && game.throw.phase === 'windup') return pose('throwing');
  if (st.detained) return pose('detained');
  if (st.active) return pose('active', s.type, s.type === 'argue' && R.argueReady(game, s.id));
  return pose('calm');
}

// Poses every student for this frame. dt is the time the frame took, in seconds, or 0 to hold
// every student still.
export function updateStudents(dt) {
  animT += dt;
  const now = animT;
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
      poseCharacter(g, poseStateFor(s, st, now), now, dt);
    }
    g.updateMatrixWorld(true);
    const head = g.userData.parts.head;
    if (!g.userData.headVec) g.userData.headVec = new THREE.Vector3();
    g.userData.headWorld = head ? head.getWorldPosition(g.userData.headVec) : null;
  }
}

// Where a sound from `worldPos` sits in the stereo field for the camera: -1 left to 1 right.
const _fwd = new THREE.Vector3();
export function stereoPan(worldPos) {
  camera.getWorldDirection(_fwd);
  const dx = worldPos.x - camera.position.x, dz = worldPos.z - camera.position.z;
  const len = Math.hypot(dx, dz) || 1;
  // the camera's right is (-forward.z, 0, forward.x)
  return (dx * -_fwd.z + dz * _fwd.x) / len / (Math.hypot(_fwd.x, _fwd.z) || 1);
}

// Screen position of a world point, in stage pixels. Returns one shared object, overwritten by
// the next call, since it runs for every student every frame.
const tmpV = new THREE.Vector3();
const projected = { x: 0, y: 0, onScreen: false };
export function project(worldPos) {
  const p = tmpV.copy(worldPos).project(camera);
  projected.x = (p.x * 0.5 + 0.5) * stageW;
  projected.y = (-p.y * 0.5 + 0.5) * stageH;
  projected.onScreen = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
  return projected;
}

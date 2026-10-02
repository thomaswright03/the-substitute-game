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
import { buildCharacter, characterData, loadAll, loadGLB, modelUrl, poseCharacter } from './characters.js';

/** @typedef {import('./characters.js').PoseState} PoseState */
/** @typedef {import('./data.js').StudentConfig} StudentConfig */
/** @typedef {import('./rules.js').StudentState} StudentState */

/** @type {THREE.WebGLRenderer | null} created by createRenderer(), once the page knows WebGL works */
let renderer = null;
/** @type {EffectComposer | null} */
let composer = null;
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
camera.rotation.order = 'YXZ';

/**
 * The classroom's contents: the students (by id), the name cards, the principal once his
 * model has arrived, and what the teacher bumps into.
 */
export const world = {
  /** @type {Record<string, THREE.Object3D>} */
  students: {},
  /** @type {Record<string, import('./scene.js').Card>} */
  cards: {},
  /** @type {THREE.Object3D | null} */
  principal: null,
  /** @type {Promise<THREE.Object3D> | null} */
  principalPromise: null,
  /** @type {{x: number, z: number}[]} */
  deskColliders: [],
  /** @type {{minX: number, maxX: number, minZ: number, maxZ: number}[]} */
  boxColliders: [],
};

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

  /**
   * @param {THREE.WebGLRenderer} r
   * @param {THREE.WebGLRenderTarget} writeBuffer
   * @param {THREE.WebGLRenderTarget} readBuffer
   */
  render(r, writeBuffer, readBuffer) {
    this.material.map = readBuffer.texture;
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    r.clear();
    this.quad.render(r);
  }
}

/** @type {UnrealBloomPass | null} */
let bloomPass = null;
/** @type {ScreenPass | null} */
let screenPass = null;

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

/** @param {number} level an index into QUALITY_LEVELS */
export function setQualityLevel(level) {
  qualityLevel = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level));
  if (!renderer) return;
  const q = QUALITY_LEVELS[qualityLevel];
  const ratio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
  renderer.setPixelRatio(ratio);
  if (composer) composer.setPixelRatio(ratio);
  if (bloomPass && screenPass) {
    bloomPass.enabled = q.bloom;
    screenPass.enabled = !q.bloom;
  }
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    // materials are compiled for shadows on or off: have them rebuilt
    scene.traverse((o) => {
      const material = /** @type {THREE.Mesh} */ (o).material;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true;
    });
  }
  resizeRenderer(stageW, stageH);
}

// What is drawn now (for the settings and the tests).
export function renderState() {
  return {
    level: qualityLevel,
    pixelRatio: renderer ? renderer.getPixelRatio() : 1,
    bloom: !!(composer && bloomPass && bloomPass.enabled),
    shadows: !!(renderer && renderer.shadowMap.enabled),
  };
}

export function createRenderer() {
  const r = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = EXPOSURE;
  renderer = r;
  // bloom is a progressive enhancement; without it the loop falls back to a plain render
  try {
    const c = new EffectComposer(r);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new ShaderPass(ToneMapOnce));
    // the last pass: draws the buffer to the screen (tone-mapped, sRGB) and adds the glow on top
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.86);
    c.addPass(bloom);
    // or, with the glow switched off, only draws the buffer to the screen
    const plain = new ScreenPass();
    plain.enabled = false;
    c.addPass(plain);
    composer = c;
    bloomPass = bloom;
    screenPass = plain;
  } catch (err) {
    console.warn('Bloom disabled:', err);
    composer = null;
    bloomPass = null;
    screenPass = null;
  }
  setQualityLevel(qualityLevel);
}

let stageW = 1, stageH = 1; // the stage's size in CSS pixels, kept by resizeRenderer

/**
 * @param {number} w the stage's size in CSS pixels
 * @param {number} h
 */
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
  else if (renderer) renderer.render(scene, camera);
}

function waitForFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const fonts = Promise.all([
    document.fonts.load('600 64px Fredoka'),
    document.fonts.load('700 52px Fredoka'),
  ]).catch(() => {});
  return Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]);
}

/**
 * Downloads the models and builds the room. onProgress(fraction) reports the download.
 * @param {(fraction: number) => void} onProgress
 */
export async function buildWorld(onProgress) {
  const variants = [...new Set(STUDENTS.map((s) => s.model))];
  const urls = variants.map(modelUrl);
  onProgress(0);
  const loading = loadAll(urls, onProgress);
  await waitForFonts();
  buildRoom(scene);
  world.cards = buildAttendanceCards(scene, STUDENTS);
  const models = await loading;
  /** @type {Record<string, import('./characters.js').GLTF>} */
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
/** @returns {Promise<THREE.Object3D>} */
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

/**
 * Where a seated student's group goes so that their hips rest on the chair of `seat`.
 * @param {THREE.Object3D} group
 * @param {import('./rules.js').Seat} seat
 */
function seatTarget(group, seat) {
  const p = seatPosition(seat);
  const o = characterData(group).seatOffset;
  return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
}

/**
 * @param {THREE.Object3D} group
 * @param {import('./rules.js').Seat} seat
 */
function placeInSeat(group, seat) {
  const p = seatTarget(group, seat);
  group.position.set(p.x, p.y, p.z);
}

// The students' own clock, in seconds: it runs with the frames' real time, so every animation
// plays at the same speed at any frame rate, and it stands still while the game is paused.
let animT = 0;

/** @type {Record<string, {kind: PoseState['kind'], until: number}>} a short pose, by student id */
const flashPoses = {};
/**
 * @param {string} id
 * @param {PoseState['kind']} kind
 * @param {number} seconds
 */
export function flashPose(id, kind, seconds) {
  flashPoses[id] = { kind, until: animT + seconds };
}

export function resetStudentVisuals() {
  for (const s of STUDENTS) {
    const g = world.students[s.id];
    g.visible = true;
    g.rotation.set(0, Math.PI, 0);
    placeInSeat(g, s);
    const data = characterData(g);
    delete data.seatAnim;
    delete data.spinYaw;
    world.cards[s.id].mesh.visible = true;
    delete flashPoses[s.id];
  }
  if (world.principal) world.principal.visible = false;
}

/**
 * Slides two students to their new desks after a swap.
 * @param {string[]} ids
 */
export function animateSeatSwap(ids) {
  const now = animT;
  for (const id of ids) {
    const g = world.students[id];
    const to = seatTarget(g, S.game.seats[id]);
    characterData(g).seatAnim = { fromX: g.position.x, fromZ: g.position.z, toX: to.x, toZ: to.z, t0: now, dur: 0.6 };
  }
}

/** @type {PoseState} */
const poseState = { kind: 'calm', type: null, argueReady: false };
/**
 * @param {PoseState['kind']} kind
 * @param {PoseState['type']} [type]
 * @param {boolean} [argueReady]
 */
function pose(kind, type = null, argueReady = false) {
  poseState.kind = kind;
  poseState.type = type;
  poseState.argueReady = argueReady;
  return poseState;
}

/**
 * The pose for one student this frame (one shared object, used at once by poseCharacter).
 * @param {StudentConfig} s
 * @param {StudentState} st
 * @param {number} now
 */
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
/** @param {number} dt */
export function updateStudents(dt) {
  animT += dt;
  const now = animT;
  for (const s of STUDENTS) {
    const g = world.students[s.id];
    const data = characterData(g);
    const st = S.game.students[s.id];
    const beingMarchedOut = S.principalSeq && S.principalSeq.id === s.id;
    if (st.removed && !beingMarchedOut) {
      g.visible = false;
      data.headWorld = null;
      continue;
    }
    g.visible = true;
    if (!beingMarchedOut) {
      const an = data.seatAnim;
      if (an) {
        const k = Math.min(1, (now - an.t0) / an.dur);
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        g.position.x = an.fromX + (an.toX - an.fromX) * ease;
        g.position.z = an.fromZ + (an.toZ - an.fromZ) * ease;
        if (k >= 1) delete data.seatAnim;
      } else {
        placeInSeat(g, S.game.seats[s.id]);
        // close to losing it: the student fidgets, as their ring shakes (hud.js)
        if (st.active && st.escalation >= S.game.tuning.hud.danger) g.position.x += Math.sin(now * 20) * 0.02;
      }
      poseCharacter(g, poseStateFor(s, st, now), now, dt);
    }
    g.updateMatrixWorld(true);
    const head = data.parts.head;
    if (!data.headVec) data.headVec = new THREE.Vector3();
    data.headWorld = head ? head.getWorldPosition(data.headVec) : null;
  }
}

// Where a sound from `worldPos` sits in the stereo field for the camera: -1 left to 1 right.
const _fwd = new THREE.Vector3();
/** @param {THREE.Vector3} worldPos */
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
/** @param {THREE.Vector3} worldPos */
export function project(worldPos) {
  const p = tmpV.copy(worldPos).project(camera);
  projected.x = (p.x * 0.5 + 0.5) * stageW;
  projected.y = (-p.y * 0.5 + 0.5) * stageH;
  projected.onScreen = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
  return projected;
}

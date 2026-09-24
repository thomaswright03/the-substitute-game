// Only with ?test in the URL: a small API the browser tests use to set up situations directly.
import * as THREE from 'three';
import { STUDENTS, TEACHER, TUNING } from './data.js';
import * as R from './rules.js';
import { applyStaticStrings, setStrings } from './strings.js';
import { S } from './session.js';
import { camera, ensurePrincipal, renderState, scene, updateStudents, world } from './world.js';
import { onQualityChange, qualitySetting } from './quality.js';
import { EYE_HEIGHT, keys, player } from './player.js';
import { headForward, partsOf } from './characters.js';
import { applyExpression, faceMeasure, faceOffsetFromHead, faceReport } from './face.js';
import { currentContext } from './aim.js';
import { drainEvents } from './events.js';
import { renderControlsLists } from './input.js';
import { audioStarted, playedCues } from './audio.js';
import { updatePrincipal } from './principal.js';

/** @type {{position: THREE.Vector3, target: THREE.Vector3} | null} look at the scene from anywhere */
let cameraOverride = null;
/** @type {string | null} an error the next frame throws */
let fault = null;
/** @type {number | null} ms: while set, frames play this time instead of the browser's (see holdTime) */
let heldTime = null;
let frameCount = 0;

// Called by the frame loop: throws the error a test asked for, once.
export function testFault() {
  if (!fault) return;
  const message = fault;
  fault = null;
  throw new Error(message);
}

// Called by the frame loop with the browser's frame time: the time the frame plays.
/** @param {number} now */
export function testFrameTime(now) {
  frameCount++;
  return heldTime === null ? now : heldTime;
}

export function applyCameraOverride() {
  if (!cameraOverride) return;
  camera.position.copy(cameraOverride.position);
  camera.lookAt(cameraOverride.target);
  camera.updateMatrixWorld(true);
}

export function exposeTestHooks() {
  // every change of graphics level, in order, as it was drawn right after the change
  /** @type {object[]} */
  const qualityChanges = [];
  /** @param {string} id a student, or 'principal' */
  const character = (id) => {
    const g = id === 'principal' ? world.principal : world.students[id];
    if (!g) throw new Error('No character ' + id);
    return g;
  };
  /** @param {string} id */
  const faceOf = (id) => partsOf(character(id)).faceMesh;
  onQualityChange(() => qualityChanges.push({ setting: qualitySetting(), ...renderState() }));
  window.__substitute = {
    THREE,
    rules: R,
    tuning: TUNING,
    teacher: TEACHER,
    get game() { return S.game; },
    get running() { return S.running; },
    get paused() { return S.paused; },
    get seatChartOpen() { return S.seatChartOpen; },
    get disciplineTarget() { return S.disciplineTarget; },
    get principalSeq() { return S.principalSeq; },
    get speech() { return S.speech; },
    player,
    keys,
    world,
    camera,
    get scene() { return scene; },
    context: currentContext,
    audio: { started: audioStarted, cues: () => [...playedCues] },
    // run the rules forward as if `seconds` of unpaused play had passed
    /**
     * @param {number} seconds
     * @param {{facingBoard?: boolean}} [view]
     */
    fastForward(seconds, view = {}) {
      const step = 1 / 20;
      for (let s = 0; s < seconds && S.game.phase !== 'over'; s += step) R.tick(S.game, step, view);
      drainEvents();
    },
    // stand the teacher somewhere, looking at a world point
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} fromX
     * @param {number} fromZ
     */
    lookAt(x, y, z, fromX, fromZ) {
      player.x = fromX;
      player.z = fromZ;
      const dx = x - fromX, dz = z - fromZ, dy = y - EYE_HEIGHT;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    faceOffsets() {
      /** @type {Record<string, number | null>} */
      const out = {};
      for (const s of STUDENTS) out[s.id] = faceOffsetFromHead(faceOf(s.id));
      if (world.principal) out.principal = faceOffsetFromHead(faceOf('principal'));
      return out;
    },
    faceReport: (/** @type {string} */ id) => faceReport(faceOf(id)),
    faceMeasure: (/** @type {string} */ id) => faceMeasure(faceOf(id)),
    setExpression: (/** @type {string} */ id, /** @type {Record<string, number> | null} */ weights) => applyExpression(faceOf(id), weights),
    headForward: (/** @type {string} */ id) => {
      const forward = headForward(character(id));
      return forward ? forward.toArray() : null;
    },
    /**
     * Poses the students `frames` times, `dt` seconds apart, as that many frames would.
     * @param {number} dt
     * @param {number} frames
     */
    stepStudents(dt, frames) {
      for (let i = 0; i < frames; i++) updateStudents(dt);
    },
    ensurePrincipal,
    // Plays the principal's visit through to its end straight away, in the steps the frame loop
    // would take, so a test doesn't depend on how quickly frames arrive. Resolves to true when
    // the visit is over.
    async runCutscene() {
      drainEvents(); // a principal call made through the rules starts its visit here
      if (!S.principalSeq) return true;
      await ensurePrincipal();
      await new Promise((r) => setTimeout(r, 0)); // let the visit begin its walk
      for (let i = 0; i < 400 && S.principalSeq; i++) updatePrincipal(1 / 20);
      return S.principalSeq === null;
    },
    // pass null to hand the camera back to the player
    /**
     * @param {[number, number, number] | null} pos
     * @param {[number, number, number]} target
     */
    setCameraOverride(pos, target) {
      cameraOverride = pos ? { position: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) } : null;
    },
    /** @param {import('./strings.js').StringTable | null} table */
    setStrings(table) {
      setStrings(table);
      applyStaticStrings(document);
      renderControlsLists();
    },
    bestGrade: () => S.lastBestGrade,
    // Stops the game's clock: from here on, time passes only by advance(), so a held key moves
    // the teacher by the same amount on a fast machine and a loaded one.
    holdTime() {
      heldTime = performance.now();
    },
    // lets `ms` of play pass, and resolves once a frame has played it
    /** @param {number} ms */
    advance(ms) {
      heldTime = (heldTime === null ? performance.now() : heldTime) + ms;
      const seen = frameCount;
      return new Promise((/** @type {(value?: undefined) => void} */ resolve) => {
        const check = () => (frameCount > seen ? resolve() : requestAnimationFrame(check));
        requestAnimationFrame(check);
      });
    },
    // makes the next frame throw, as a bug would
    failNextFrame(message = 'test fault') {
      fault = message;
    },
    // the graphics setting and what is drawn: {setting, level, pixelRatio, bloom, shadows}
    quality: () => ({ setting: qualitySetting(), ...renderState() }),
    qualityChanges: () => qualityChanges.slice(),
  };
}

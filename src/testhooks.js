// Only with ?test in the URL: a small API the browser tests use to set up situations directly.
import * as THREE from 'three';
import { STUDENTS, TEACHER, TUNING } from './data.js';
import * as R from './rules.js';
import { applyStaticStrings, setStrings } from './strings.js';
import { S } from './session.js';
import { camera, ensurePrincipal, renderState, scene, world } from './world.js';
import { onQualityChange, qualitySetting } from './quality.js';
import { EYE_HEIGHT, keys, player } from './player.js';
import { headForward } from './characters.js';
import { applyExpression, faceMeasure, faceOffsetFromHead, faceReport } from './face.js';
import { currentContext } from './aim.js';
import { drainEvents } from './events.js';
import { renderControlsLists } from './input.js';
import { audioStarted, playedCues } from './audio.js';
import { updatePrincipal } from './principal.js';

let cameraOverride = null; // look at the scene from anywhere

export function applyCameraOverride() {
  if (!cameraOverride) return;
  camera.position.copy(cameraOverride.position);
  camera.lookAt(cameraOverride.target);
  camera.updateMatrixWorld(true);
}

export function exposeTestHooks() {
  // every change of graphics level, in order, as it was drawn right after the change
  const qualityChanges = [];
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
    fastForward(seconds, view = {}) {
      const step = 1 / 20;
      for (let s = 0; s < seconds && S.game.phase !== 'over'; s += step) R.tick(S.game, step, view);
      drainEvents();
    },
    // stand the teacher somewhere, looking at a world point
    lookAt(x, y, z, fromX, fromZ) {
      player.x = fromX;
      player.z = fromZ;
      const dx = x - fromX, dz = z - fromZ, dy = y - EYE_HEIGHT;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    faceOffsets() {
      const out = {};
      for (const s of STUDENTS) out[s.id] = faceOffsetFromHead(world.students[s.id]);
      if (world.principal) out.principal = faceOffsetFromHead(world.principal);
      return out;
    },
    faceReport: (id) => faceReport(world.students[id] || world.principal),
    faceMeasure: (id) => faceMeasure(world.students[id] || world.principal),
    setExpression: (id, weights) => applyExpression((world.students[id] || world.principal).userData.parts.faceMesh, weights),
    headForward: (id) => headForward(world.students[id]).toArray(),
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
    setCameraOverride(pos, target) {
      cameraOverride = pos ? { position: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) } : null;
    },
    setStrings(table) {
      setStrings(table);
      applyStaticStrings(document);
      renderControlsLists();
    },
    bestGrade: () => S.lastBestGrade,
    // the graphics setting and what is drawn: {setting, level, pixelRatio, bloom, shadows}
    quality: () => ({ setting: qualitySetting(), ...renderState() }),
    qualityChanges: () => qualityChanges.slice(),
  };
}

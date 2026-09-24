// Only with ?test in the URL: a small API the browser tests use to set up situations directly.
import * as THREE from 'three';
import { STUDENTS, TUNING } from './data.js';
import * as R from './rules.js';
import { applyStaticStrings, setStrings } from './strings.js';
import { S } from './session.js';
import { camera, ensurePrincipal, scene, world } from './world.js';
import { EYE_HEIGHT, player } from './player.js';
import { faceOffsetFromHead, headForward } from './characters.js';
import { currentContext } from './aim.js';
import { drainEvents } from './events.js';
import { renderControlsLists } from './input.js';

let cameraOverride = null; // look at the scene from anywhere

export function applyCameraOverride() {
  if (!cameraOverride) return;
  camera.position.copy(cameraOverride.position);
  camera.lookAt(cameraOverride.target);
  camera.updateMatrixWorld(true);
}

export function exposeTestHooks() {
  window.__substitute = {
    THREE,
    rules: R,
    tuning: TUNING,
    get game() { return S.game; },
    get running() { return S.running; },
    get paused() { return S.paused; },
    get seatChartOpen() { return S.seatChartOpen; },
    get disciplineTarget() { return S.disciplineTarget; },
    player,
    world,
    camera,
    get scene() { return scene; },
    context: currentContext,
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
    headForward: (id) => headForward(world.students[id]).toArray(),
    ensurePrincipal,
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
  };
}

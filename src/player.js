// The teacher: position, view direction and walking, with collisions against the desks and walls.
import * as THREE from 'three';
import { ROOM, TEACHER } from './data.js';
import { S } from './session.js';
import { world } from './world.js';

export const EYE_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.35;
const DESK_RADIUS = 0.85;
const MOVE_SPEED = TEACHER.speed;
const TURN_SPEED = 2.4; // radians per second for keyboard turning
const EDGE_ASSIST_START = 0.82;
const EDGE_ASSIST_RATE_YAW = 1.1;
const EDGE_ASSIST_RATE_PITCH = 0.85;
const MOVE_STEP = 1 / 30; // movement is integrated in steps no longer than this

const START = { x: 0, z: TEACHER.startZ, yaw: 0, pitch: -0.05 };
export const player = { ...START };

// Held movement keys, the on-screen stick, and the mouse's hover-look state (set by input.js).
export const keys = {};
export const joy = { active: false, id: null, x: 0, y: 0 };
export const look = { pointerLocked: false, hoverInside: false, edgeX: 0, edgeY: 0 };

export const camForward = new THREE.Vector3();

export function resetPlayer() {
  Object.assign(player, START);
}

export function releaseKeys() {
  for (const k in keys) keys[k] = false;
}

function clampPitch() {
  player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch));
}

export function applyLookDelta(dx, dy, sens) {
  player.yaw -= dx * sens;
  player.pitch -= dy * sens;
  clampPitch();
}

function movePlayer(dt) {
  // edge assist: only while the cursor is actually inside the canvas
  if (!look.pointerLocked && look.hoverInside && !S.seatChartOpen) {
    const ax = Math.abs(look.edgeX), ay = Math.abs(look.edgeY);
    if (ax > EDGE_ASSIST_START) player.yaw -= Math.sign(look.edgeX) * ((ax - EDGE_ASSIST_START) / (1 - EDGE_ASSIST_START)) * EDGE_ASSIST_RATE_YAW * dt;
    if (ay > EDGE_ASSIST_START) player.pitch -= Math.sign(look.edgeY) * ((ay - EDGE_ASSIST_START) / (1 - EDGE_ASSIST_START)) * EDGE_ASSIST_RATE_PITCH * dt;
  }
  if (keys.arrowleft) player.yaw += TURN_SPEED * dt;
  if (keys.arrowright) player.yaw -= TURN_SPEED * dt;
  clampPitch();

  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  let mx = 0, mz = 0;
  if (keys.w || keys.arrowup) { mx += fx; mz += fz; }
  if (keys.s || keys.arrowdown) { mx -= fx; mz -= fz; }
  if (keys.a) { mx -= rx; mz -= rz; }
  if (keys.d) { mx += rx; mz += rz; }
  mx += fx * -joy.y + rx * joy.x;
  mz += fz * -joy.y + rz * joy.x;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  player.x += mx * MOVE_SPEED * dt;
  player.z += mz * MOVE_SPEED * dt;

  const minDist = DESK_RADIUS * 0.7 + PLAYER_RADIUS;
  for (const d of world.deskColliders) {
    const dx = player.x - d.x, dz = player.z - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist < minDist && dist > 0.0001) {
      player.x += (dx / dist) * (minDist - dist);
      player.z += (dz / dist) * (minDist - dist);
    }
  }
  const margin = PLAYER_RADIUS + 0.3;
  player.x = Math.max(-ROOM.halfWidth + margin, Math.min(ROOM.halfWidth - margin, player.x));
  player.z = Math.max(ROOM.frontZ + margin, Math.min(ROOM.backZ - margin, player.z));
}

// Advances walking and turning by `dt` seconds, in short steps so it is stable at any frame rate.
// The frame loop passes the same elapsed time it gives the rules, so on a slow machine the
// teacher covers as much ground per second of the period as on a fast one.
export function stepPlayer(dt) {
  let left = dt;
  while (left > 1e-6) {
    const step = Math.min(MOVE_STEP, left);
    movePlayer(step);
    left -= step;
  }
}

export function syncCamera(camera) {
  camera.position.set(player.x, EYE_HEIGHT, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  camera.updateMatrixWorld(true);
  camera.getWorldDirection(camForward);
}

// The teacher is at the chalkboard with their back to the class.
export function facingBoard() {
  return player.z < ROOM.frontZ + 3.2 && camForward.z < -0.8;
}

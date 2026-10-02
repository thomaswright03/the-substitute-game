// Short visual effects: the hit flash, the zap bolt, the thrown item and what lands on the floor.
import * as THREE from 'three';
import { el, restartAnimation } from './dom.js';
import { S } from './session.js';
import { scene, world } from './world.js';
import { EYE_HEIGHT, player } from './player.js';
import { freeArea } from './rollcall.js';
import { partsOf } from './characters.js';
import { buildItem } from './items.js';

export function hitFlash() {
  restartAnimation(el.hitVignette, 'show');
  restartAnimation(el.stage, 'hit');
}

/** @param {string} id */
export function zapVisual(id) {
  restartAnimation(el.flash, 'zap');
  const g = world.students[id];
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 2.7, 5), new THREE.MeshBasicMaterial({ color: 0xfff27a }));
  bolt.rotation.z = 0.16;
  bolt.position.set(g.position.x, 2.55, g.position.z);
  scene.add(bolt);
  setTimeout(() => {
    scene.remove(bolt);
    bolt.geometry.dispose();
    bolt.material.dispose();
  }, 350);
}

const flightTarget = new THREE.Vector3();
// a thrown item is drawn bigger than life, so it can be told apart in the second it is in the air
const FLIGHT_SCALE = 1.7;
// and an item on the floor is bigger still: it is the clue
const FLOOR_SCALE = 2;
const patchGeo = new THREE.CircleGeometry(0.075, 20);
const patchMat = new THREE.MeshBasicMaterial({ color: 0x1b1a17, transparent: true, opacity: 0.28, depthWrite: false });

/** @param {THREE.Object3D} model */
function disposeModel(model) {
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.geometry === patchGeo) return;
    o.geometry.dispose();
    o.material.dispose();
  });
}

/**
 * @param {string} id the thrower
 * @param {import('./data.js').ItemId} item what they threw
 */
export function launchProjectile(id, item) {
  clearProjectile();
  const g = world.students[id];
  const { hand, head } = partsOf(g);
  const from = new THREE.Vector3();
  (hand || head || g).getWorldPosition(from);
  const mesh = buildItem(item);
  mesh.scale.setScalar(FLIGHT_SCALE);
  mesh.position.copy(from);
  scene.add(mesh);
  S.projectile = { mesh, from };
  showThreatCue();
}

export function clearProjectile() {
  el.threatCue.hidden = true;
  el.seatThreat.hidden = true;
  if (!S.projectile) return;
  scene.remove(S.projectile.mesh);
  disposeModel(S.projectile.mesh);
  S.projectile = null;
}

/** @type {THREE.Object3D[]} what has landed on the floor this period */
const onFloor = [];

/**
 * Drops an item that hit the teacher at their feet, a little behind where they stand.
 * @param {import('./data.js').ItemId} item
 */
export function dropOnFloor(item) {
  const mesh = buildItem(item);
  const behind = 0.45 + Math.random() * 0.25;
  const aside = (Math.random() - 0.5) * 0.7;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  // the teacher looks along (-sin, -cos); behind is the opposite way, aside is across it
  mesh.position.set(player.x + sin * behind + cos * aside, 0, player.z + cos * behind - sin * aside);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  mesh.scale.setScalar(FLOOR_SCALE);
  mesh.position.y = 0.002;
  // a dark patch under it, so it stands out on the pale floor
  const patch = new THREE.Mesh(patchGeo, patchMat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.003;
  mesh.add(patch);
  scene.add(mesh);
  onFloor.push(mesh);
}

export function clearFloor() {
  for (const mesh of onFloor.splice(0)) {
    scene.remove(mesh);
    disposeModel(mesh);
  }
}

// The warning goes at the top of the free play area, under the attendance panel or the banner,
// so it never covers what the player is reading. While the seating chart is open (which can
// fill a small screen) it is shown inside the chart instead.
/** @type {number | null} */
let cueTop = null;
function showThreatCue() {
  if (el.threatCue.hidden !== S.seatChartOpen) el.threatCue.hidden = S.seatChartOpen;
  if (el.seatThreat.hidden === S.seatChartOpen) el.seatThreat.hidden = !S.seatChartOpen;
  if (S.seatChartOpen) return;
  const top = Math.round(freeArea().top);
  if (top === cueTop) return;
  cueTop = top;
  el.threatCue.style.top = top + 'px';
}

export function updateProjectile() {
  const game = S.game;
  if (!S.projectile || !game.throw || game.throw.phase !== 'flight') return;
  showThreatCue();
  const k = Math.min(1, game.throw.t / game.tuning.throwFlight);
  flightTarget.set(player.x, EYE_HEIGHT - 0.08, player.z);
  S.projectile.mesh.position.lerpVectors(S.projectile.from, flightTarget, k);
  S.projectile.mesh.position.y += Math.sin(k * Math.PI) * 0.3;
  S.projectile.mesh.rotation.x += 0.35;
}

// Short visual effects: the hit flash, the zap bolt and the thrown paper ball.
import { el, restartAnimation } from './dom.js';
import { S } from './session.js';
import { scene, world } from './world.js';
import { EYE_HEIGHT, player } from './player.js';

export function hitFlash() {
  restartAnimation(el.hitVignette, 'show');
  restartAnimation(el.stage, 'hit');
}

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

let projectileGeo = null, projectileMat = null;
const flightTarget = new THREE.Vector3();

export function launchProjectile(id) {
  clearProjectile();
  if (!projectileGeo) {
    projectileGeo = new THREE.SphereGeometry(0.045, 8, 6);
    projectileMat = new THREE.MeshStandardMaterial({ color: 0xf3ecd8 });
  }
  const g = world.students[id];
  const from = new THREE.Vector3();
  (g.userData.parts.hand || g.userData.parts.head).getWorldPosition(from);
  const mesh = new THREE.Mesh(projectileGeo, projectileMat);
  mesh.position.copy(from);
  scene.add(mesh);
  S.projectile = { mesh, from };
  el.threatCue.hidden = false;
}

export function clearProjectile() {
  el.threatCue.hidden = true;
  if (!S.projectile) return;
  scene.remove(S.projectile.mesh);
  S.projectile = null;
}

export function updateProjectile() {
  const game = S.game;
  if (!S.projectile || !game.throw || game.throw.phase !== 'flight') return;
  const k = Math.min(1, game.throw.t / game.tuning.throwFlight);
  flightTarget.set(player.x, EYE_HEIGHT - 0.08, player.z);
  S.projectile.mesh.position.lerpVectors(S.projectile.from, flightTarget, k);
  S.projectile.mesh.position.y += Math.sin(k * Math.PI) * 0.3;
}

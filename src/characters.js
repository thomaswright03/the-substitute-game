// Character models: loading, building a seated or standing character, and the per-frame body
// language. The expressive face is in face.js and the behaviour props in props.js.
//
// Bodies are Quaternius "Ultimate Modular Men/Women" rigs. They have no sit clip, so each one is
// frozen on the first frame of "Idle_Neutral" and the legs are bent into a seated pose by hand.
// Gameplay "tells" (nodding off, leaning back, raising a hand...) are applied each frame as
// OFFSETS from that frozen rest pose.

import * as THREE from 'three';
import './three-setup.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PROP_BUILDERS, TELL_POSES } from './props.js';
import { applyExpression, attachExpressiveFace } from './face.js';

export const CHAR = {
  scale: 0.95,
  // the rig's model-space forward is +Z; the class faces the board at -Z
  forwardYaw: Math.PI,
  // Seated pose: the thighs swing forward by this much and the shins swing back by the same
  // amount, so the shins return to their standing angle. A little under 90 degrees, because the
  // idle pose already carries the thighs slightly forward: this leaves them level with the seat.
  sitBend: Math.PI / 2 - 0.28,
  // Where the hip joint rests relative to the top-centre of the chair seat, in metres: above the
  // seat by the depth of the pelvis, and a touch toward the backrest.
  hipAboveSeat: 0.09,
  hipBehindSeatCentre: 0.03,
};

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = {};

// Loads a .glb once. onProgress(loadedBytes, totalBytes) is called while it downloads.
export function loadGLB(url, onProgress) {
  if (!cache[url]) {
    cache[url] = new Promise((resolve, reject) => {
      loader.load(
        url,
        resolve,
        (e) => onProgress && onProgress(e.loaded || 0, e.lengthComputable ? e.total : 0),
        (err) => {
          delete cache[url];
          reject(err instanceof Error ? err : new Error('Could not load ' + url));
        },
      );
    });
  }
  return cache[url];
}

export function modelUrl(variant) {
  return 'assets/characters/' + variant + '.glb';
}

// Downloads several files, reporting combined progress as a 0..1 fraction.
export function loadAll(urls, onFraction, estimateBytes = 520000) {
  const loaded = {}, total = {};
  urls.forEach((u) => { loaded[u] = 0; total[u] = estimateBytes; });
  const report = () => {
    let l = 0, t = 0;
    for (const u of urls) {
      l += Math.min(loaded[u], total[u]);
      t += total[u];
    }
    if (onFraction) onFraction(t ? l / t : 0);
  };
  return Promise.all(urls.map((u) => loadGLB(u, (l, t) => {
    loaded[u] = l;
    if (t) total[u] = t;
    report();
  }).then((gltf) => {
    loaded[u] = total[u];
    report();
    return gltf;
  })));
}

/* ---------------- arm poses ---------------- */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

// Cyclic-coordinate-descent IK: turns the forearm, then the upper arm, so that the wrist reaches
// `target` (world space). Runs once per pose when a character is built, not every frame.
function reach(upper, lower, wrist, target, iterations = 16) {
  upper.updateMatrixWorld(true);
  for (let it = 0; it < iterations; it++) {
    for (const bone of [lower, upper]) {
      bone.getWorldPosition(_a);
      wrist.getWorldPosition(_b);
      const toWrist = _b.sub(_a).normalize();
      const toTarget = _c.copy(target).sub(_a).normalize();
      _q.setFromUnitVectors(toWrist, toTarget);
      bone.parent.getWorldQuaternion(_qp);
      bone.getWorldQuaternion(_qb);
      bone.quaternion.copy(_qp.invert().multiply(_q).multiply(_qb));
      bone.updateMatrixWorld(true);
    }
  }
}

// Rotates a bone by `angle` about an axis given in WORLD space, whatever its own axes are.
function turnAboutWorldAxis(bone, axis, angle) {
  bone.parent.getWorldQuaternion(_qp);
  _q.setFromAxisAngle(axis, angle);
  // local' = parentWorld^-1 * turn * parentWorld * local
  bone.quaternion.premultiply(_qb.copy(_qp).invert().multiply(_q).multiply(_qp));
  bone.updateMatrixWorld(true);
}

// Bends the legs into a seated pose. The rigs' leg bones don't share a local axis layout (the
// men's shins bend about a different local axis from the women's), so the bend is made about
// the character's own left-right axis in world space. The feet are separate bones hanging off
// the rig's root, not the shins, so each is carried along with its shin.
function sit(g, bones) {
  g.updateMatrixWorld(true);
  const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
  const across = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const feet = [['LowerLegL', 'FootL'], ['LowerLegR', 'FootR']]
    .filter(([shin, foot]) => bones[shin] && bones[foot] && !bones[shin].getObjectById(bones[foot].id))
    .map(([shin, foot]) => ({
      shin: bones[shin],
      foot: bones[foot],
      // the foot's pose relative to its shin, standing
      rel: new THREE.Matrix4().copy(bones[shin].matrixWorld).invert().multiply(bones[foot].matrixWorld),
    }));
  for (const side of ['L', 'R']) {
    const thigh = bones['UpperLeg' + side], shin = bones['LowerLeg' + side];
    if (thigh) turnAboutWorldAxis(thigh, across, CHAR.sitBend);
    if (shin) turnAboutWorldAxis(shin, across, -CHAR.sitBend);
  }
  g.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  for (const { shin, foot, rel } of feet) {
    m.multiplyMatrices(shin.matrixWorld, rel).premultiply(_m4.copy(foot.parent.matrixWorld).invert());
    m.decompose(foot.position, foot.quaternion, foot.scale);
    foot.updateMatrixWorld(true);
  }
}
const _m4 = new THREE.Matrix4();

function findClip(animations, name) {
  return animations.find((a) => a.name.split('|').pop() === name) || null;
}

// opts: {type, seated, model}
export function buildCharacter(gltf, opts) {
  const seated = opts.seated !== false;
  const g = cloneSkinned(gltf.scene);
  g.scale.setScalar(CHAR.scale);
  g.rotation.y = CHAR.forwardYaw;
  g.traverse((o) => {
    if (/** @type {THREE.Mesh} */ (o).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // posed skinned meshes move outside their bind-pose bounds
      o.frustumCulled = false;
    }
  });

  const bones = {};
  g.traverse((o) => {
    if (/** @type {THREE.Bone} */ (o).isBone) bones[o.name] = o;
  });

  const mixer = new THREE.AnimationMixer(g);
  const idle = findClip(gltf.animations, 'Idle_Neutral');
  const actions = {};
  if (idle) {
    actions.idle = mixer.clipAction(idle);
    actions.idle.play();
    actions.idle.paused = true;
    actions.idle.time = 0;
    mixer.update(0);
  }
  const walk = findClip(gltf.animations, 'Walk');
  if (walk) actions.walk = mixer.clipAction(walk);

  if (seated) sit(g, bones);

  const head = bones.Head || null;
  const arm = bones.UpperArmR || null;
  const hand = bones.WristR || null;
  const armBones = ['UpperArmR', 'LowerArmR', 'UpperArmL', 'LowerArmL'].map((n) => bones[n] || null);
  const armRestQ = armBones.map((b) => (b ? b.quaternion.clone() : null));

  // Measured, not tuned per model: the costumes' rigs differ in proportions and bind pose, so
  // find where this one's hips ended up and offset the whole character to put them on the seat.
  g.userData.seatOffset = new THREE.Vector3();
  if (seated) {
    const hips = bones.Hips || bones.Body || null;
    if (hips) {
      g.position.set(0, 0, 0);
      g.updateMatrixWorld(true);
      const at = hips.getWorldPosition(new THREE.Vector3());
      g.userData.seatOffset.set(-at.x, CHAR.hipAboveSeat - at.y, CHAR.hipBehindSeatCentre - at.z);
    }
  }
  // with the group at the origin, the top-centre of the seat is at -seatOffset
  const seatSpace = (offset) => new THREE.Vector3(...offset).sub(g.userData.seatOffset);

  // Arm poses for this behaviour's tell, solved against this rig's own proportions.
  let tellPose = null;
  let prop = null;
  const tell = seated && opts.type ? TELL_POSES[opts.type] : null;
  if (tell && armBones.every(Boolean) && bones.WristR && bones.WristL) {
    g.updateMatrixWorld(true);
    reach(bones.UpperArmR, bones.LowerArmR, bones.WristR, seatSpace(tell.R));
    reach(bones.UpperArmL, bones.LowerArmL, bones.WristL, seatSpace(tell.L));
    tellPose = armBones.map((b) => b.quaternion.clone());
    armBones.forEach((b, i) => b.quaternion.copy(armRestQ[i]));
    g.updateMatrixWorld(true);
  }
  if (tell && PROP_BUILDERS[opts.type]) {
    prop = PROP_BUILDERS[opts.type]();
    prop.name = 'prop-' + opts.type;
    prop.position.copy(seatSpace(tell.prop));
    prop.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    prop.updateMatrixWorld(true);
    g.updateMatrixWorld(true);
    g.attach(prop); // keeps the seat-space placement, now riding along with the student
    prop.visible = false;
  }

  const faceMesh = attachExpressiveFace(g, head);

  // the direction the face points at rest, in the head bone's own space
  let headForwardLocal = null;
  if (head) {
    g.updateMatrixWorld(true);
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), CHAR.forwardYaw);
    headForwardLocal = forward.applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
  }

  g.userData.parts = {
    head, arm, hand, prop, faceMesh, mixer, actions, armBones, armRestQ, tellPose, headForwardLocal,
    headRest: head ? head.rotation.clone() : new THREE.Euler(),
    armRest: arm ? arm.rotation.clone() : new THREE.Euler(),
  };
  return g;
}

// World-space direction the character's face points (for tests and diagnostics).
export function headForward(group, target = new THREE.Vector3()) {
  const p = group.userData.parts;
  if (!p.head || !p.headForwardLocal) return null;
  group.updateMatrixWorld(true);
  return target.copy(p.headForwardLocal).applyQuaternion(p.head.getWorldQuaternion(_qb)).normalize();
}

// Switches a standing character between its frozen idle pose and its walk cycle.
export function setWalking(group, walking) {
  const { actions } = group.userData.parts;
  if (!actions.walk || !actions.idle) return;
  if (walking) {
    actions.idle.stop();
    actions.walk.play();
  } else {
    actions.walk.stop();
    actions.idle.play();
    actions.idle.paused = true;
    actions.idle.time = 0;
  }
}

/* ---------------- body language ---------------- */

// A calm student blinks every few seconds, each on their own rhythm: how closed the eyes are
// at time t (0 open, 1 shut).
const BLINK_S = 0.16;
function blinkAt(t, seed) {
  const every = 3.6 + (seed % 7) * 0.45;
  const into = (t + seed * 1.37) % every;
  return into < BLINK_S ? Math.sin((into / BLINK_S) * Math.PI) : 0;
}

// state: {kind, type, argueReady, windup}. kind is one of
//  'calm' | 'shake' (wrong card) | 'hand' (marked present) | 'active' | 'detained' | 'throwing'
// t is the animation clock and dt the time since the last pose, both in seconds.
const SPIN_SPEED = 4.8; // radians a second
export function poseCharacter(group, state, t, dt) {
  const p = group.userData.parts;
  const face = p.faceMesh;
  const showTell = state.kind === 'active';
  if (p.prop) p.prop.visible = showTell;
  group.rotation.x = 0;
  if (p.head) p.head.rotation.copy(p.headRest);
  p.armBones.forEach((b, i) => { if (b) b.quaternion.copy(p.armRestQ[i]); });
  if (showTell && p.tellPose) p.armBones.forEach((b, i) => b.quaternion.copy(p.tellPose[i]));
  if (state.kind !== 'active' || state.type !== 'spin') group.rotation.y = CHAR.forwardYaw;

  switch (state.kind) {
    case 'shake':
      if (p.head) p.head.rotation.y = p.headRest.y + Math.sin(t * 22) * 0.3;
      applyExpression(face, { browDown_L: 0.7, browDown_R: 0.7, mouthFrown_L: 0.6, mouthFrown_R: 0.6 });
      return;
    case 'hand':
      if (p.arm) p.arm.rotation.x = p.armRest.x - 1.3;
      if (p.head) p.head.rotation.x = p.headRest.x - 0.08;
      applyExpression(face, { mouthSmile_L: 0.5, mouthSmile_R: 0.5, browInnerUp: 0.4 });
      return;
    case 'throwing':
      if (p.arm) p.arm.rotation.x = p.armRest.x - 2.1;
      applyExpression(face, { mouthSmile_L: 0.9, mouthSmile_R: 0.9, eyeSquint_L: 0.5, eyeSquint_R: 0.5 });
      return;
    case 'detained':
      // head hung, sulking
      if (p.head) p.head.rotation.x = p.headRest.x + 0.22;
      applyExpression(face, { mouthFrown_L: 0.5, mouthFrown_R: 0.5, browInnerUp: 0.5, eyeLookDown_L: 0.5, eyeLookDown_R: 0.5 });
      return;
    case 'active':
      break;
    default: {
      const blink = blinkAt(t, group.id);
      applyExpression(face, blink ? { eyeBlink_L: blink, eyeBlink_R: blink } : null);
      return;
    }
  }

  switch (state.type) {
    case 'tip':
      group.rotation.x = -0.16;
      applyExpression(face, { browDown_L: 0.3, browDown_R: 0.3, mouthLeft: 0.4 });
      break;
    case 'spin':
      group.userData.spinYaw = (group.userData.spinYaw || 0) + SPIN_SPEED * dt;
      group.rotation.y = CHAR.forwardYaw + group.userData.spinYaw;
      applyExpression(face, { mouthSmile_L: 0.8, mouthSmile_R: 0.8, eyeWide_L: 0.3, eyeWide_R: 0.3 });
      break;
    case 'sleep':
      if (p.head) p.head.rotation.x = p.headRest.x - 0.32 + Math.sin(t * 2.4) * 0.06;
      applyExpression(face, { eyeBlink_L: 1, eyeBlink_R: 1, jawOpen: 0.15 + Math.sin(t * 2.4) * 0.05 });
      break;
    case 'phone':
    case 'notes':
      // head bowed over the desk (+x pitches every rig's head forward and down)
      if (p.head) p.head.rotation.x = p.headRest.x + 0.42 + Math.sin(t * 1.7) * 0.03;
      applyExpression(face, { eyeLookDown_L: 0.6, eyeLookDown_R: 0.6, mouthSmile_L: 0.3, mouthSmile_R: 0.3 });
      break;
    case 'snack':
      if (p.head) p.head.rotation.x = p.headRest.x + Math.sin(t * 5) * 0.12;
      applyExpression(face, { jawOpen: 0.25 + Math.sin(t * 5) * 0.2 });
      break;
    case 'argue':
      if (p.arm) p.arm.rotation.x = p.armRest.x + (state.argueReady ? 0 : -1.0);
      if (p.head) p.head.rotation.y = p.headRest.y + (state.argueReady ? 0 : Math.sin(t * 9) * 0.12);
      applyExpression(face, state.argueReady
        ? { browInnerUp: 0.4, jawOpen: 0.05 }
        : { browDown_L: 0.8, browDown_R: 0.8, jawOpen: 0.35 + Math.sin(t * 12) * 0.15 });
      break;
    case 'plane':
      if (p.head) p.head.rotation.x = p.headRest.x + 0.3;
      applyExpression(face, { mouthSmile_L: 0.6, mouthSmile_R: 0.3, eyeSquint_L: 0.3 });
      break;
  }
}


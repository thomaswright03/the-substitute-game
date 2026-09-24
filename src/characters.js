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
import { applyExpression, attachExpressiveFace, isMesh } from './face.js';

/** @typedef {import('three/addons/loaders/GLTFLoader.js').GLTF} GLTF */
/** @typedef {import('./face.js').Face} Face */
/** @typedef {import('./data.js').Behaviour} Behaviour */

/**
 * The parts of a character that its poses move.
 * @typedef {object} CharacterParts
 * @property {THREE.Object3D | null} head the head bone
 * @property {THREE.Object3D | null} arm the right upper arm
 * @property {THREE.Object3D | null} hand the right wrist
 * @property {THREE.Object3D | null} prop the behaviour's prop, if it has one
 * @property {Face | null} faceMesh
 * @property {THREE.AnimationMixer} mixer
 * @property {{idle?: THREE.AnimationAction, walk?: THREE.AnimationAction}} actions
 * @property {(THREE.Object3D | null)[]} armBones upper and lower arm, right then left
 * @property {(THREE.Quaternion | null)[]} armRestQ their rest pose
 * @property {THREE.Quaternion[] | null} tellPose their pose while acting up, if the behaviour has one
 * @property {THREE.Vector3 | null} headForwardLocal where the face points, in the head bone's space
 * @property {THREE.Euler} headRest
 * @property {THREE.Euler} armRest
 */

/**
 * What a character keeps in its group's userData.
 * @typedef {object} CharacterData
 * @property {CharacterParts} parts
 * @property {THREE.Vector3} seatOffset from the seat's top-centre to the group's origin
 * @property {THREE.Vector3 | null} [headWorld] where the head is this frame (world.js); null while not drawn
 * @property {THREE.Vector3} [headVec] the vector headWorld is kept in
 * @property {{fromX: number, fromZ: number, toX: number, toZ: number, t0: number, dur: number}} [seatAnim] a slide to a new desk
 * @property {number} [spinYaw] how far a spinning student has turned
 */

/**
 * The data buildCharacter() keeps on a character.
 * @param {THREE.Object3D} group
 * @returns {CharacterData}
 */
export function characterData(group) {
  if (!group.userData.parts) throw new Error((group.name || 'this object') + ' is not a character');
  return /** @type {CharacterData} */ (group.userData);
}

/** @param {THREE.Object3D} group a character from buildCharacter() */
export function partsOf(group) {
  return characterData(group).parts;
}

const CHAR = {
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

/** @type {Record<string, Promise<GLTF>>} */
const cache = {};

/**
 * Loads a .glb once. onProgress(loadedBytes, totalBytes) is called while it downloads.
 * @param {string} url
 * @param {(loaded: number, total: number) => void} [onProgress]
 * @returns {Promise<GLTF>}
 */
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

/** @param {string} variant */
export function modelUrl(variant) {
  return 'assets/characters/' + variant + '.glb';
}

/**
 * Downloads several files, reporting combined progress as a 0..1 fraction.
 * @param {string[]} urls
 * @param {(fraction: number) => void} [onFraction]
 * @param {number} [estimateBytes] a file's size until the server says
 */
export function loadAll(urls, onFraction, estimateBytes = 520000) {
  /** @type {Record<string, number>} */
  const loaded = {};
  /** @type {Record<string, number>} */
  const total = {};
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
/**
 * @param {THREE.Object3D} upper
 * @param {THREE.Object3D} lower
 * @param {THREE.Object3D} wrist
 * @param {THREE.Vector3} target
 * @param {number} [iterations]
 */
function reach(upper, lower, wrist, target, iterations = 16) {
  upper.updateMatrixWorld(true);
  for (let it = 0; it < iterations; it++) {
    for (const bone of [lower, upper]) {
      bone.getWorldPosition(_a);
      wrist.getWorldPosition(_b);
      const toWrist = _b.sub(_a).normalize();
      const toTarget = _c.copy(target).sub(_a).normalize();
      _q.setFromUnitVectors(toWrist, toTarget);
      parentOf(bone).getWorldQuaternion(_qp);
      bone.getWorldQuaternion(_qb);
      bone.quaternion.copy(_qp.invert().multiply(_q).multiply(_qb));
      bone.updateMatrixWorld(true);
    }
  }
}

/**
 * A bone's parent (every bone this moves has one).
 * @param {THREE.Object3D} bone
 */
function parentOf(bone) {
  if (!bone.parent) throw new Error('Bone ' + bone.name + ' has no parent');
  return bone.parent;
}

/**
 * Rotates a bone by `angle` about an axis given in WORLD space, whatever its own axes are.
 * @param {THREE.Object3D} bone
 * @param {THREE.Vector3} axis
 * @param {number} angle
 */
function turnAboutWorldAxis(bone, axis, angle) {
  parentOf(bone).getWorldQuaternion(_qp);
  _q.setFromAxisAngle(axis, angle);
  // local' = parentWorld^-1 * turn * parentWorld * local
  bone.quaternion.premultiply(_qb.copy(_qp).invert().multiply(_q).multiply(_qp));
  bone.updateMatrixWorld(true);
}

// Bends the legs into a seated pose. The rigs' leg bones don't share a local axis layout (the
// men's shins bend about a different local axis from the women's), so the bend is made about
// the character's own left-right axis in world space. The feet are separate bones hanging off
// the rig's root, not the shins, so each is carried along with its shin.
/**
 * @param {THREE.Object3D} g
 * @param {Record<string, THREE.Object3D>} bones
 */
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
    m.multiplyMatrices(shin.matrixWorld, rel).premultiply(_m4.copy(parentOf(foot).matrixWorld).invert());
    m.decompose(foot.position, foot.quaternion, foot.scale);
    foot.updateMatrixWorld(true);
  }
}
const _m4 = new THREE.Matrix4();

/**
 * @param {THREE.AnimationClip[]} animations
 * @param {string} name
 */
function findClip(animations, name) {
  return animations.find((a) => a.name.split('|').pop() === name) || null;
}

/**
 * A character, posed and ready to place: seated at a desk unless opts.seated is false.
 * @param {GLTF} gltf
 * @param {{type: Behaviour | null, seated?: boolean, model: string}} opts
 */
export function buildCharacter(gltf, opts) {
  const seated = opts.seated !== false;
  const g = cloneSkinned(gltf.scene);
  g.scale.setScalar(CHAR.scale);
  g.rotation.y = CHAR.forwardYaw;
  g.traverse((o) => {
    if (isMesh(o)) {
      o.castShadow = true;
      o.receiveShadow = true;
      // posed skinned meshes move outside their bind-pose bounds
      o.frustumCulled = false;
    }
  });

  /** @type {Record<string, THREE.Object3D>} */
  const bones = {};
  g.traverse((o) => {
    if (/** @type {THREE.Bone} */ (o).isBone) bones[o.name] = o;
  });

  const mixer = new THREE.AnimationMixer(g);
  const idle = findClip(gltf.animations, 'Idle_Neutral');
  /** @type {CharacterParts['actions']} */
  const actions = {};
  if (idle) {
    const action = mixer.clipAction(idle);
    action.play();
    action.paused = true;
    action.time = 0;
    mixer.update(0);
    actions.idle = action;
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
  const seatOffset = new THREE.Vector3();
  if (seated) {
    const hips = bones.Hips || bones.Body || null;
    if (hips) {
      g.position.set(0, 0, 0);
      g.updateMatrixWorld(true);
      const at = hips.getWorldPosition(new THREE.Vector3());
      seatOffset.set(-at.x, CHAR.hipAboveSeat - at.y, CHAR.hipBehindSeatCentre - at.z);
    }
  }
  // with the group at the origin, the top-centre of the seat is at -seatOffset
  /** @param {readonly number[]} offset */
  const seatSpace = (offset) => new THREE.Vector3().fromArray(offset).sub(seatOffset);

  // Arm poses for this behaviour's tell, solved against this rig's own proportions.
  /** @type {THREE.Quaternion[] | null} */
  let tellPose = null;
  /** @type {THREE.Object3D | null} */
  let prop = null;
  const tell = seated && opts.type ? TELL_POSES[opts.type] : undefined;
  const [upperR, lowerR, upperL, lowerL] = armBones;
  if (tell && upperR && lowerR && upperL && lowerL && bones.WristR && bones.WristL) {
    g.updateMatrixWorld(true);
    reach(upperR, lowerR, bones.WristR, seatSpace(tell.R));
    reach(upperL, lowerL, bones.WristL, seatSpace(tell.L));
    tellPose = [upperR, lowerR, upperL, lowerL].map((b) => b.quaternion.clone());
    armBones.forEach((b, i) => { const q = armRestQ[i]; if (b && q) b.quaternion.copy(q); });
    g.updateMatrixWorld(true);
  }
  const buildProp = opts.type ? PROP_BUILDERS[opts.type] : undefined;
  if (tell && buildProp) {
    const built = buildProp();
    built.name = 'prop-' + opts.type;
    built.position.copy(seatSpace(tell.prop));
    built.traverse((o) => { if (isMesh(o)) o.castShadow = true; });
    built.updateMatrixWorld(true);
    g.updateMatrixWorld(true);
    g.attach(built); // keeps the seat-space placement, now riding along with the student
    built.visible = false;
    prop = built;
  }

  const faceMesh = attachExpressiveFace(g, head);

  // the direction the face points at rest, in the head bone's own space
  let headForwardLocal = null;
  if (head) {
    g.updateMatrixWorld(true);
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), CHAR.forwardYaw);
    headForwardLocal = forward.applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
  }

  /** @type {CharacterData} */
  const data = {
    seatOffset,
    parts: {
      head, arm, hand, prop, faceMesh, mixer, actions, armBones, armRestQ, tellPose, headForwardLocal,
      headRest: head ? head.rotation.clone() : new THREE.Euler(),
      armRest: arm ? arm.rotation.clone() : new THREE.Euler(),
    },
  };
  Object.assign(g.userData, data);
  return g;
}

/**
 * World-space direction the character's face points (for tests and diagnostics).
 * @param {THREE.Object3D} group
 * @param {THREE.Vector3} [target]
 */
export function headForward(group, target = new THREE.Vector3()) {
  const p = partsOf(group);
  if (!p.head || !p.headForwardLocal) return null;
  group.updateMatrixWorld(true);
  return target.copy(p.headForwardLocal).applyQuaternion(p.head.getWorldQuaternion(_qb)).normalize();
}

/**
 * Switches a standing character between its frozen idle pose and its walk cycle.
 * @param {THREE.Object3D} group
 * @param {boolean} walking
 */
export function setWalking(group, walking) {
  const { actions } = partsOf(group);
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
/**
 * @param {number} t
 * @param {number} seed
 */
function blinkAt(t, seed) {
  const every = 3.6 + (seed % 7) * 0.45;
  const into = (t + seed * 1.37) % every;
  return into < BLINK_S ? Math.sin((into / BLINK_S) * Math.PI) : 0;
}

/**
 * How a student is posed this frame. kind 'shake' is a wrong card, 'hand' is marked present.
 * @typedef {{kind: 'calm' | 'shake' | 'hand' | 'active' | 'detained' | 'throwing', type: Behaviour | null, argueReady: boolean}} PoseState
 */

// t is the animation clock and dt the time since the last pose, both in seconds.
const SPIN_SPEED = 4.8; // radians a second
/**
 * @param {THREE.Object3D} group
 * @param {PoseState} state
 * @param {number} t
 * @param {number} dt
 */
export function poseCharacter(group, state, t, dt) {
  const data = characterData(group);
  const p = data.parts;
  const face = p.faceMesh;
  const showTell = state.kind === 'active';
  if (p.prop) p.prop.visible = showTell;
  group.rotation.x = 0;
  if (p.head) p.head.rotation.copy(p.headRest);
  p.armBones.forEach((b, i) => { const q = p.armRestQ[i]; if (b && q) b.quaternion.copy(q); });
  const tellPose = p.tellPose;
  if (showTell && tellPose) p.armBones.forEach((b, i) => { if (b) b.quaternion.copy(tellPose[i]); });
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
      data.spinYaw = (data.spinYaw || 0) + SPIN_SPEED * dt;
      group.rotation.y = CHAR.forwardYaw + data.spinYaw;
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


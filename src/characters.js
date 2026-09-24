// Character models: loading, the grafted expressive face, and the per-frame body language.
//
// Bodies are Quaternius "Ultimate Modular Men/Women" rigs. They have no sit clip, so each one is
// frozen on the first frame of "Idle_Neutral" and the legs are bent into a seated pose by hand.
// Gameplay "tells" (nodding off, leaning back, raising a hand...) are applied each frame as
// OFFSETS from that frozen rest pose.
//
// The bodies have no facial blend shapes, so a separate expressive head (52 ARKit morph targets,
// assets/face.glb) is attached to each character's Head bone in place of the original head skin.

import { CHAIR, DESK, canvasTexture } from './scene.js';

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

// Offsets for the grafted face, in METRES in world space. The Head bone carries a large baked-in
// scale (about 95x in world space), so these must never be added in the bone's local units.
const FACE_FORWARD_M = 0.012; // pokes the face just clear of hair that droops over the forehead
const FACE_UP_M = 0.0;
const FACE_HIDE_MATERIALS = ['Skin', 'Skin_Darker', 'Eyebrows', 'Eye'];

const loader = new THREE.GLTFLoader();
if (typeof MeshoptDecoder !== 'undefined') loader.setMeshoptDecoder(MeshoptDecoder);

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
export const FACE_URL = 'assets/face.glb';

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

/* ---------------- the expressive face ---------------- */

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _idx = new THREE.Vector4();
const _w = new THREE.Vector4();

// World-space bounds of a skinned mesh AS POSED, computed from its skinned vertex positions
// (Box3.setFromObject only sees the bind-pose geometry of a skinned mesh).
function skinnedWorldBox(mesh) {
  const box = new THREE.Box3();
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (!mesh.isSkinnedMesh || !si || !sw) return box.setFromObject(mesh);
  const bones = mesh.skeleton.bones, inverses = mesh.skeleton.boneInverses;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
    _idx.fromBufferAttribute(si, i);
    _w.fromBufferAttribute(sw, i);
    // weights may be stored quantized; normalise them so they always sum to one
    const sum = _w.x + _w.y + _w.z + _w.w || 1;
    const out = new THREE.Vector3();
    for (let k = 0; k < 4; k++) {
      const weight = _w.getComponent(k) / sum;
      if (!weight) continue;
      const b = _idx.getComponent(k);
      _m.multiplyMatrices(bones[b].matrixWorld, inverses[b]);
      out.addScaledVector(_v.copy(_p).applyMatrix4(_m), weight);
    }
    out.applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
    box.expandByPoint(out);
  }
  return box;
}

function findHeadGroup(root) {
  let headGroup = null;
  root.traverse((o) => {
    if (o.type === 'Group' && /_Head$/.test(o.name)) headGroup = o;
  });
  return headGroup;
}

// Replaces the character's own head skin with an instance of the expressive face, sized and
// placed from THIS character's head (the costumes' heads differ in size and bind pose).
export function attachExpressiveFace(root, headBone, faceTemplate) {
  const headGroup = findHeadGroup(root);
  if (!headGroup || !headBone || !faceTemplate) return null;
  const skinMesh = headGroup.children.find((c) => c.isMesh && c.material && c.material.name === 'Skin');
  if (!skinMesh) return null;

  root.updateMatrixWorld(true);
  const skinBox = skinnedWorldBox(skinMesh);
  const skinCenter = skinBox.getCenter(new THREE.Vector3());
  const skinHeight = skinBox.max.y - skinBox.min.y;

  for (const c of headGroup.children) {
    if (c.isMesh && c.material && FACE_HIDE_MATERIALS.includes(c.material.name)) c.visible = false;
  }

  const faceRoot = faceTemplate.children[0].clone(true);
  faceRoot.name = 'expressiveFace';
  headBone.add(faceRoot);
  headBone.updateMatrixWorld(true);

  let faceMesh = null, faceHead = null;
  faceRoot.traverse((o) => {
    if (o.morphTargetDictionary) faceMesh = o;
    if (o.name === 'head') faceHead = o;
  });
  if (!faceMesh || !faceHead) {
    headBone.remove(faceRoot);
    return null;
  }

  // scale relative to the face file's own baked-in root scale, to match this head's height
  const rawBox = new THREE.Box3().setFromObject(faceHead);
  const rawHeight = rawBox.max.y - rawBox.min.y;
  faceRoot.scale.setScalar(faceRoot.scale.x * (skinHeight / rawHeight));
  faceRoot.updateMatrixWorld(true);

  // centre the face on the head skin it replaces: first measure where the scaled face's own
  // centre lands, then move it by the world-space difference (converted into bone space)
  const forward = root.getWorldDirection(new THREE.Vector3());
  const target = skinCenter.clone()
    .addScaledVector(forward, FACE_FORWARD_M)
    .add(new THREE.Vector3(0, FACE_UP_M, 0));
  const current = new THREE.Box3().setFromObject(faceHead).getCenter(new THREE.Vector3());
  const localTarget = headBone.worldToLocal(target.clone());
  const localCurrent = headBone.worldToLocal(current.clone());
  faceRoot.position.add(localTarget.sub(localCurrent));
  faceRoot.updateMatrixWorld(true);

  const bodySkin = skinMesh.material;
  faceMesh.material = bodySkin.clone();
  faceMesh.material.side = THREE.DoubleSide;
  faceMesh.castShadow = true;
  return faceMesh;
}

// Sets the face's blend shapes to one expression (all others back to 0).
export function applyExpression(faceMesh, weights) {
  if (!faceMesh) return;
  const infl = faceMesh.morphTargetInfluences, dict = faceMesh.morphTargetDictionary;
  for (let i = 0; i < infl.length; i++) infl[i] = 0;
  if (!weights) return;
  for (const name in weights) {
    if (dict[name] !== undefined) infl[dict[name]] = weights[name];
  }
}

/* ---------------- building a character ---------------- */

// Where each behaviour's prop sits, and where the wrists go to hold it, in metres from the
// top-centre of the chair seat: +x is the student's right, +y up, -z toward the desk (and the
// board). Everything is on or above the desk top, so the teacher can see it from the front of
// the room and from the aisles.
const DESK_Y = DESK.topY - CHAIR.seatTop;
const DESK_MID_Z = -CHAIR.z + DESK.halfDepth / 2; // halfway between the desk's centre and its near edge
const REST_L = [-0.15, DESK_Y + 0.05, DESK_MID_Z + 0.05];
export const TELL_POSES = {
  notes: { prop: [0.05, DESK_Y + 0.004, DESK_MID_Z - 0.04], R: [0.07, DESK_Y + 0.06, DESK_MID_Z + 0.02], L: REST_L },
  phone: { prop: [0, DESK_Y + 0.17, DESK_MID_Z + 0.01], R: [0.1, DESK_Y + 0.12, DESK_MID_Z + 0.07], L: [-0.1, DESK_Y + 0.12, DESK_MID_Z + 0.07] },
  plane: { prop: [0.2, DESK_Y + 0.46, DESK_MID_Z - 0.02], R: [0.2, DESK_Y + 0.39, DESK_MID_Z + 0.06], L: REST_L },
  snack: { prop: [0.16, DESK_Y + 0.09, DESK_MID_Z - 0.04], R: [0.13, DESK_Y + 0.16, DESK_MID_Z + 0.04], L: REST_L },
};

const paperMat = new THREE.MeshStandardMaterial({ color: 0xf7f3e8, roughness: 0.55, side: THREE.DoubleSide });

function notesTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#f7f3e8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(47,106,147,0.55)';
    ctx.lineWidth = 2;
    for (let y = 26; y < h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200,52,31,0.6)';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(18, h);
    ctx.stroke();
    // a scribbled message and a heart: unmistakably not class notes
    ctx.strokeStyle = '#2b2b3a';
    ctx.lineWidth = 3;
    for (let row = 0; row < 5; row++) {
      ctx.beginPath();
      for (let x = 26; x < w - 20 - row * 12; x += 6) ctx.lineTo(x, 22 + row * 16 + Math.sin(x * 0.7 + row) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#d9457a';
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.8, 9, Math.PI, 0);
    ctx.arc(w * 0.62 + 18, h * 0.8, 9, Math.PI, 0);
    ctx.lineTo(w * 0.62 + 9, h * 0.8 + 20);
    ctx.closePath();
    ctx.fill();
  }, 128, 160);
}

function paperPlaneGeometry() {
  // nose at -z; two wings folded up a little from a centre keel
  const nose = [0, 0, -0.19], tail = [0, 0, 0.13], keel = [0, -0.045, 0.11];
  const wingL = [-0.13, 0.02, 0.13], wingR = [0.13, 0.02, 0.13];
  const v = [...nose, ...wingL, ...tail, ...nose, ...tail, ...wingR, ...nose, ...keel, ...tail];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

// Each builder returns a prop in seat-space orientation (see TELL_POSES), centred on its anchor.
const PROP_BUILDERS = {
  notes: () => {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.21), new THREE.MeshStandardMaterial({ map: notesTexture(), roughness: 0.6 }));
    sheet.rotation.x = -Math.PI / 2;
    sheet.rotation.z = 0.25;
    return sheet;
  },
  phone: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.17, 0.014), new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.45 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.15), new THREE.MeshBasicMaterial({ color: 0xb8ecff }));
    screen.position.z = 0.0075;
    g.add(body, screen);
    // held up in front of the chest, screen tipped toward the student's face
    g.rotation.x = -0.5;
    g.rotation.y = Math.PI;
    return g;
  },
  plane: () => {
    const m = new THREE.Mesh(paperPlaneGeometry(), paperMat);
    m.rotation.set(0.35, 0.8, 0); // nose up and angled across the body, ready to launch
    return m;
  },
  snack: () => {
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.05), new THREE.MeshStandardMaterial({ color: 0xe0452b, roughness: 0.35, metalness: 0.2 }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.05, 0.052), new THREE.MeshStandardMaterial({ color: 0xf2b93b, roughness: 0.4 }));
    band.position.y = 0.01;
    g.add(bag, band);
    g.rotation.y = 0.4;
    return g;
  },
};

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

function findClip(animations, name) {
  return animations.find((a) => a.name.split('|').pop() === name) || null;
}

// opts: {type, seated, model}
export function buildCharacter(gltf, faceTemplate, opts) {
  const seated = opts.seated !== false;
  const g = THREE.SkeletonUtils.clone(gltf.scene);
  g.scale.setScalar(CHAR.scale);
  g.rotation.y = CHAR.forwardYaw;
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // posed skinned meshes move outside their bind-pose bounds
      o.frustumCulled = false;
    }
  });

  const bones = {};
  g.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
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

  if (seated) {
    for (const [name, sign] of [['UpperLegL', -1], ['LowerLegL', 1], ['UpperLegR', -1], ['LowerLegR', 1]]) {
      if (bones[name]) bones[name].rotation.x += sign * CHAR.sitBend;
    }
  }

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

  const faceMesh = attachExpressiveFace(g, head, faceTemplate);

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

// state: {kind, type, argueReady, windup}. kind is one of
//  'calm' | 'shake' (wrong card) | 'hand' (marked present) | 'active' | 'detained' | 'throwing'
export function poseCharacter(group, state, t) {
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
    default:
      applyExpression(face, null);
      return;
  }

  switch (state.type) {
    case 'tip':
      group.rotation.x = -0.16;
      applyExpression(face, { browDown_L: 0.3, browDown_R: 0.3, mouthLeft: 0.4 });
      break;
    case 'spin':
      group.userData.spinYaw = (group.userData.spinYaw || 0) + 0.08;
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

// For tests and diagnostics: how far the face's centre sits from the head bone, in metres.
export function faceOffsetFromHead(group) {
  const p = group.userData.parts;
  if (!p.faceMesh || !p.head) return null;
  group.updateMatrixWorld(true);
  const headPos = p.head.getWorldPosition(new THREE.Vector3());
  const faceCenter = new THREE.Box3().setFromObject(p.faceMesh).getCenter(new THREE.Vector3());
  return faceCenter.distanceTo(headPos);
}

// Character models: loading, the grafted expressive face, and the per-frame body language.
//
// Bodies are Quaternius "Ultimate Modular Men/Women" rigs. They have no sit clip, so each one is
// frozen on the first frame of "Idle_Neutral" and the legs are bent into a seated pose by hand.
// Gameplay "tells" (nodding off, leaning back, raising a hand...) are applied each frame as
// OFFSETS from that frozen rest pose.
//
// The bodies have no facial blend shapes, so a separate expressive head (52 ARKit morph targets,
// assets/face.glb) is attached to each character's Head bone in place of the original head skin.

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

const PROP_BUILDERS = {
  notes: () => new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.09), new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.4 })),
  phone: () => new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.012), new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.5 })),
  plane: () => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 3), new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.4 }));
    m.rotation.z = Math.PI / 2;
    return m;
  },
  snack: () => new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.55 })),
};

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

  let prop = null;
  if (opts.type && PROP_BUILDERS[opts.type]) {
    prop = PROP_BUILDERS[opts.type]();
    prop.visible = false;
    if (hand) {
      // bone-local units: divide the intended metres by the bone's world scale
      hand.updateMatrixWorld(true);
      const s = hand.getWorldScale(new THREE.Vector3()).x || 1;
      prop.scale.setScalar(1 / s);
      prop.position.set(0, -0.08 / s, 0.03 / s);
      hand.add(prop);
    }
  }

  const faceMesh = attachExpressiveFace(g, head, faceTemplate);

  g.userData.parts = {
    head, arm, hand, prop, faceMesh, mixer, actions,
    headRest: head ? head.rotation.clone() : new THREE.Euler(),
    armRest: arm ? arm.rotation.clone() : new THREE.Euler(),
  };
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
  return g;
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
  if (p.prop) p.prop.visible = state.kind === 'active';
  group.rotation.x = 0;
  if (p.head) p.head.rotation.copy(p.headRest);
  if (p.arm) p.arm.rotation.copy(p.armRest);
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
      if (p.head) p.head.rotation.x = p.headRest.x - 0.18;
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
      if (p.head) p.head.rotation.x = p.headRest.x - 0.3;
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
      if (p.head) p.head.rotation.x = p.headRest.x - 0.25;
      if (p.arm) p.arm.rotation.x = p.armRest.x - 0.5;
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

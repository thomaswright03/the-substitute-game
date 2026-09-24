// The expressive face: a separate head with 52 ARKit blend shapes (assets/face.glb), grafted onto
// each character's Head bone in place of the body's own head skin, and painted per character.

import * as THREE from 'three';
import './three-setup.js';

// Offsets for the grafted face, in METRES in world space. The Head bone carries a large baked-in
// scale (about 95x in world space), so these must never be added in the bone's local units.
const FACE_FORWARD_M = 0.012; // pokes the face just clear of hair that droops over the forehead
const FACE_UP_M = 0.0;
const FACE_HIDE_MATERIALS = ['Skin', 'Skin_Darker', 'Eyebrows', 'Eye'];

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

// The women's costumes have no material named for their brows and eyes; theirs are the small
// meshes in the head (a few dozen vertices each, where hair and hats have hundreds).
const SMALL_FACE_PART_VERTICES = 100;
function isSmallFacePart(mesh) {
  return mesh.geometry.attributes.position.count <= SMALL_FACE_PART_VERTICES;
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
export function attachExpressiveFace(root, headBone, faceTemplate, key = '') {
  const headGroup = findHeadGroup(root);
  if (!headGroup || !headBone || !faceTemplate) return null;
  const skinMesh = headGroup.children.find((c) => c.isMesh && c.material && c.material.name === 'Skin');
  if (!skinMesh) return null;

  root.updateMatrixWorld(true);
  const skinBox = skinnedWorldBox(skinMesh);
  const skinCenter = skinBox.getCenter(new THREE.Vector3());
  const skinHeight = skinBox.max.y - skinBox.min.y;

  for (const c of headGroup.children) {
    if (c.isMesh && c.material && (FACE_HIDE_MATERIALS.includes(c.material.name) || isSmallFacePart(c))) c.visible = false;
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

  paintFace(faceRoot, faceTemplate, root, skinMesh.material, key);
  faceMesh.castShadow = true;
  return faceMesh;
}

/* ---------------- painting the face ---------------- */

// The face file is one flat colour. Each character's copy gets brows, lips and eyes painted on
// as vertex colours, laid out once from the face's own landmarks (the eyeballs and the teeth),
// so the features move with the blend shapes: a frown pulls the painted brows down with it.

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Per-vertex weights for the template: head {brow, lip}, and for each eyeball 0 = white,
// 1 = iris, 2 = pupil. Worked out once and shared by every character.
function faceLayout(faceTemplate) {
  if (faceTemplate.userData.layout) return faceTemplate.userData.layout;
  faceTemplate.updateMatrixWorld(true);
  const meshes = [];
  faceTemplate.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const head = meshes.find((m) => m.morphTargetDictionary);
  const others = meshes.filter((m) => m !== head).map((m) => ({ m, box: new THREE.Box3().setFromObject(m) }));
  // the lowest of the other parts is the teeth; the two above it are the eyeballs
  others.sort((a, b) => a.box.getCenter(_v).y - b.box.getCenter(_p).y);
  const teeth = others[0];
  const eyes = others.slice(1, 3);
  const layout = { head: head.name, teeth: teeth ? teeth.m.name : null, eyes: {} };

  const p = new THREE.Vector3();
  for (const { m, box } of eyes) {
    const c = box.getCenter(new THREE.Vector3());
    const pos = m.geometry.attributes.position;
    const region = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(c).normalize();
      region[i] = p.z > FACE_PAINT.pupilCos ? 2 : p.z > FACE_PAINT.irisCos ? 1 : 0;
    }
    layout.eyes[m.name] = region;
  }

  const pos = head.geometry.attributes.position;
  const brow = new Float32Array(pos.count), lip = new Float32Array(pos.count);
  const eyeCentres = eyes.map(({ box }) => box.getCenter(new THREE.Vector3()));
  const r = eyes.length ? (eyes[0].box.max.x - eyes[0].box.min.x) / 2 : 0;
  const mouth = teeth ? teeth.box.getCenter(new THREE.Vector3()) : null;
  const mouthW = teeth ? (teeth.box.max.x - teeth.box.min.x) / 2 : 0;
  const mouthH = teeth ? (teeth.box.max.y - teeth.box.min.y) / 2 : 0;
  const F = FACE_PAINT;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(head.matrixWorld);
    for (const e of eyeCentres) {
      if (p.z < e.z) continue; // the back of the head
      const out = (p.x - e.x) * Math.sign(e.x) / r; // across the brow, outward from the nose
      const line = e.y + r * (F.browHeight - F.browArch * (out - F.browPeak) * (out - F.browPeak));
      const across = smooth(F.browInner - 0.25, F.browInner, out) * (1 - smooth(F.browOuter, F.browOuter + 0.25, out));
      const thick = r * F.browThickness * (1 - 0.35 * smooth(0, F.browOuter, out)); // tapers outward
      brow[i] = Math.max(brow[i], across * (1 - smooth(thick * 0.5, thick * 0.5 + r * 0.12, Math.abs(p.y - line))));
    }
    if (mouth && p.z > mouth.z) {
      const ex = (p.x - mouth.x) / (mouthW * F.lipWidth);
      const ey = (p.y - (mouth.y + mouthH * F.lipRaise)) / (mouthH * F.lipHeight);
      lip[i] = 1 - smooth(0.75, 1.05, Math.hypot(ex, ey));
    }
  }
  layout.brow = brow;
  layout.lip = lip;
  faceTemplate.userData.layout = layout;
  return layout;
}

// Shapes of the painted features, in eyeball radii (brows) and teeth half-sizes (lips).
const FACE_PAINT = {
  pupilCos: 0.95, irisCos: 0.8,
  browHeight: 1.55, browArch: 0.12, browPeak: 0.35, browInner: -0.75, browOuter: 1.15, browThickness: 0.38,
  lipWidth: 1.05, lipHeight: 1.05, lipRaise: 0.1,
};
const IRIS_COLOURS = [0x3b2414, 0x2d4f6e, 0x3f5a2c, 0x5a3a1c, 0x2a2a3a];
const BROW_MATERIALS = ['Eyebrows', 'Hair', 'Hair_Brown', 'Moustache', 'Brown', 'DarkBrown'];
const SCLERA = new THREE.Color(0xd6d0c4);
const PUPIL = new THREE.Color(0x060403);
const teethMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.5, name: 'teeth' });

function bodyMaterial(root, names) {
  const found = {};
  root.traverse((o) => { if (o.isMesh && o.material && o.material.name) found[o.material.name] = o.material; });
  for (const n of names) if (found[n]) return found[n];
  return null;
}

// A geometry of the face's own that SHARES the template's vertex data and blend shapes
// (BufferGeometry.clone() does not keep those quantised attributes intact) plus a colour.
function withColours(geometry, colours) {
  const g = new THREE.BufferGeometry();
  for (const name in geometry.attributes) g.setAttribute(name, geometry.attributes[name]);
  g.setIndex(geometry.index);
  g.morphAttributes = geometry.morphAttributes;
  g.morphTargetsRelative = geometry.morphTargetsRelative;
  g.boundingBox = geometry.boundingBox;
  g.boundingSphere = geometry.boundingSphere;
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

function paintFace(faceRoot, faceTemplate, root, bodySkin, key) {
  const layout = faceLayout(faceTemplate);
  const skin = bodySkin.color;
  const lipColour = skin.clone().multiply(new THREE.Color(0.82, 0.48, 0.46));
  const browMat = bodyMaterial(root, BROW_MATERIALS);
  const browColour = browMat ? browMat.color.clone() : new THREE.Color(0x140c06);
  // a stable iris colour per costume, so the same student always has the same eyes
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const iris = new THREE.Color(IRIS_COLOURS[hash % IRIS_COLOURS.length]);
  const c = new THREE.Color();
  faceRoot.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === layout.head) {
      const n = layout.brow.length, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        c.copy(skin).lerp(lipColour, layout.lip[i]).lerp(browColour, layout.brow[i]);
        c.toArray(col, i * 3);
      }
      o.geometry = withColours(o.geometry, col);
      o.material = bodySkin.clone();
      o.material.color.set(0xffffff);
      o.material.vertexColors = true;
      o.material.side = THREE.DoubleSide;
      o.material.flatShading = true; // faceted, like the low-poly bodies
    } else if (layout.eyes[o.name]) {
      const region = layout.eyes[o.name], col = new Float32Array(region.length * 3);
      for (let i = 0; i < region.length; i++) (region[i] === 2 ? PUPIL : region[i] === 1 ? iris : SCLERA).toArray(col, i * 3);
      o.geometry = withColours(o.geometry, col);
      o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, flatShading: true, name: 'eye' });
    } else if (o.name === layout.teeth) {
      o.material = teethMaterial;
    }
  });
}

// The blend shapes were sculpted for close-ups; at classroom distances (2 to 4 m) they need
// pushing further to read.
const EXPRESSION_GAIN = 1.35;

// Sets the face's blend shapes to one expression (all others back to 0).
export function applyExpression(faceMesh, weights) {
  if (!faceMesh) return;
  const infl = faceMesh.morphTargetInfluences, dict = faceMesh.morphTargetDictionary;
  for (let i = 0; i < infl.length; i++) infl[i] = 0;
  if (!weights) return;
  for (const name in weights) {
    if (dict[name] !== undefined) infl[dict[name]] = Math.min(1, weights[name] * EXPRESSION_GAIN);
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

// For tests and diagnostics: the distinct colours painted on each part of a character's face,
// darkest first, as {head, eyes: [[...], [...]], teeth} lists of [r, g, b] (teeth: one colour).
export function faceColours(group) {
  const out = { head: [], eyes: [], teeth: null };
  const face = group && group.getObjectByName('expressiveFace');
  if (!face) return out;
  const distinct = (attr) => {
    const seen = new Map();
    for (let i = 0; i < attr.count; i++) {
      const rgb = [attr.getX(i), attr.getY(i), attr.getZ(i)].map((v) => Math.round(v * 50) / 50);
      seen.set(rgb.join(), rgb);
    }
    return [...seen.values()].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  };
  face.traverse((o) => {
    if (!o.isMesh) return;
    const colour = o.geometry.attributes.color;
    if (o.morphTargetDictionary && colour) out.head = distinct(colour);
    else if (colour) out.eyes.push(distinct(colour));
    else if (o.material.name === 'teeth') out.teeth = o.material.color.toArray();
  });
  return out;
}

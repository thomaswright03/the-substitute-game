// The expressive face. Every costume keeps its own low-poly head: its skin, eyes, brows, hair
// and hat, so the face always sits under the hair in the body's own style and skin tone. What
// this module adds is movement: blend shapes built from that head's geometry for the eyes
// (blink, squint, wide, looking down) and the brows (frown, worried), and a flat-shaded mouth
// with its own blend shapes (smile, frown, open, pulled to one side). The shapes carry the names
// of the ARKit set (eyeBlink_L, mouthSmile_R, jawOpen...), which characters.js uses to pose the
// face for each behaviour.
//
// "Left" and "right" are the character's own. The eyes, brows and mouth are found and measured
// on the posed head when the character is built, so the shapes fit every costume.

import * as THREE from 'three';
import './three-setup.js';

const MOUTH_COLOUR = 0x1e0806;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _sum = new THREE.Matrix4();
const _n3 = new THREE.Matrix3();

function findHeadGroup(root) {
  let headGroup = null;
  root.traverse((o) => {
    if (o.type === 'Group' && /_Head$/.test(o.name)) headGroup = o;
  });
  return headGroup;
}

// The matrix that takes vertex `i` of `mesh` from its geometry's space to world space, as posed.
function vertexToWorld(mesh, i, target) {
  if (!mesh.isSkinnedMesh) return target.copy(mesh.matrixWorld);
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const { bones, boneInverses } = mesh.skeleton;
  const e = _sum.elements.fill(0);
  let total = 0;
  for (let k = 0; k < 4; k++) total += sw.getComponent(i, k);
  for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k) / (total || 1);
    if (!w) continue;
    const b = si.getComponent(i, k);
    _m.multiplyMatrices(bones[b].matrixWorld, boneInverses[b]);
    for (let j = 0; j < 16; j++) e[j] += w * _m.elements[j];
  }
  // world = matrixWorld * bindMatrixInverse * (sum of weighted bone matrices) * bindMatrix
  return target.copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(_sum).multiply(mesh.bindMatrix);
}

function posedPosition(mesh, i, target) {
  mesh.getVertexPosition(i, target);
  return mesh.localToWorld(target);
}

// The frame the face is measured in: its centre between the eyes, and the character's right,
// up and forward directions in world space.
function faceFrame(root, eyes) {
  root.updateMatrixWorld(true);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const box = new THREE.Box3();
  for (let i = 0; i < eyes.geometry.attributes.position.count; i++) box.expandByPoint(posedPosition(eyes, i, _v));
  const centre = box.getCenter(new THREE.Vector3());
  const coords = (p) => ({ s: _v.copy(p).sub(centre).dot(right), v: _v.copy(p).sub(centre).dot(up), f: _v.copy(p).sub(centre).dot(forward) });
  return { centre, right, up, forward, coords, box };
}

// Each eye's extent, from the eye mesh's own vertices: {L, R} of {minS, maxS, minV, maxV, front}.
function measureEyes(eyes, frame) {
  const out = {};
  const p = new THREE.Vector3();
  for (let i = 0; i < eyes.geometry.attributes.position.count; i++) {
    const c = frame.coords(posedPosition(eyes, i, p));
    const side = c.s < 0 ? 'L' : 'R';
    const e = out[side] || (out[side] = { minS: Infinity, maxS: -Infinity, minV: Infinity, maxV: -Infinity, front: -Infinity });
    e.minS = Math.min(e.minS, c.s);
    e.maxS = Math.max(e.maxS, c.s);
    e.minV = Math.min(e.minV, c.v);
    e.maxV = Math.max(e.maxV, c.v);
    e.front = Math.max(e.front, c.f);
  }
  return out.L && out.R ? out : null;
}

// The share of a mesh's vertices, as posed, for which `test` holds of their face coordinates.
function shareOf(mesh, frame, test) {
  const n = mesh.geometry.attributes.position.count;
  const p = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < n; i++) if (test(frame.coords(posedPosition(mesh, i, p)))) k++;
  return k / (n || 1);
}

// Adds blend shapes to a mesh of the head. `shapes` maps a shape's name to a function that,
// given a vertex's face coordinates {s, v, f}, returns how far it moves along the face's right
// and up directions, in metres (or null to stay put). The movement is converted into the
// geometry's own space (which, for a skinned mesh, is before the bones move it), so the
// shapes ride along when the head nods or turns. Returns how many vertices the shapes move.
function addShapes(mesh, frame, shapes) {
  const src = mesh.geometry;
  const geo = new THREE.BufferGeometry();
  // share the costume's vertex data (it may be quantised) and add the shapes beside it
  for (const name in src.attributes) geo.setAttribute(name, src.attributes[name]);
  geo.setIndex(src.index);
  geo.groups = src.groups;
  const count = src.attributes.position.count;
  const names = Object.keys(shapes);
  const deltas = names.map(() => new Float32Array(count * 3));
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  let moved = 0;
  for (let i = 0; i < count; i++) {
    let movesHere = false;
    const c = frame.coords(posedPosition(mesh, i, p));
    const toGeometry = _n3.setFromMatrix4(vertexToWorld(mesh, i, _m)).invert();
    names.forEach((name, k) => {
      const move = shapes[name](c);
      if (!move) return;
      d.copy(frame.right).multiplyScalar(move.s || 0).addScaledVector(frame.up, move.v || 0);
      d.applyMatrix3(toGeometry);
      deltas[k].set([d.x, d.y, d.z], i * 3);
      movesHere = true;
    });
    if (movesHere) moved++;
  }
  if (!moved) return 0;
  geo.morphAttributes.position = deltas.map((a) => new THREE.Float32BufferAttribute(a, 3));
  geo.morphTargetsRelative = true;
  geo.boundingBox = src.boundingBox;
  geo.boundingSphere = src.boundingSphere;
  mesh.geometry = geo;
  mesh.updateMorphTargets();
  // morphTargetDictionary follows the order the shapes were given in
  mesh.morphTargetDictionary = Object.fromEntries(names.map((n, k) => [n, k]));
  return moved;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Eyelids: each eye's dark shape closes to a line, narrows, opens wider or drops its top edge.
function eyeShapes(eye) {
  const shapes = {};
  for (const side of ['L', 'R']) {
    const e = eye[side];
    const mid = (e.minV + e.maxV) / 2, half = (e.maxV - e.minV) / 2;
    const mine = (c) => (c.s < 0 ? 'L' : 'R') === side;
    const toward = (centre, scale) => (c) => (mine(c) ? { v: centre + (c.v - mid) * scale - c.v } : null);
    shapes['eyeBlink_' + side] = toward(mid - half * 0.45, 0.14);
    shapes['eyeSquint_' + side] = toward(mid - half * 0.25, 0.5);
    shapes['eyeWide_' + side] = toward(mid + half * 0.2, 1.4);
    shapes['eyeLookDown_' + side] = (c) => (mine(c) ? { v: (e.minV + (c.v - e.minV) * 0.55) - c.v } : null);
  }
  return shapes;
}

// Brows: whatever dark strokes of the costume sit just above the eyes and in front of the face.
// Frowning pulls them down, the inner ends most; worrying lifts the inner ends.
function browShapes(eye) {
  const top = Math.max(eye.L.maxV, eye.R.maxV);
  const h = top - Math.min(eye.L.minV, eye.R.minV);
  const outer = Math.max(-eye.L.minS, eye.R.maxS) * 1.3;
  const front = Math.min(eye.L.front, eye.R.front) - h * 0.6;
  const isBrow = (c) => c.v > top - h * 0.5 && c.v < top + h * 2.2 && Math.abs(c.s) < outer && c.f > front;
  // 1 at the inner end of the brow (by the nose), 0 at the outer end
  const inner = (c) => {
    const e = c.s < 0 ? eye.L : eye.R;
    const near = Math.min(Math.abs(e.minS), Math.abs(e.maxS)), far = Math.max(Math.abs(e.minS), Math.abs(e.maxS));
    return 1 - clamp01((Math.abs(c.s) - near) / ((far - near) || 1));
  };
  const shapes = {};
  for (const side of ['L', 'R']) {
    const mine = (c) => isBrow(c) && (c.s < 0 ? 'L' : 'R') === side;
    shapes['browDown_' + side] = (c) => (mine(c) ? { v: -h * (0.3 + 0.5 * inner(c)) } : null);
  }
  shapes.browInnerUp = (c) => (isBrow(c) ? { v: h * (0.15 + 0.75 * inner(c)) } : null);
  return { shapes, isBrow };
}

// Where the face's surface is, straight in front of the point `s` across and `v` up from the
// centre between the eyes: {f (how far forward), normal} of the first surface a ray from in
// front meets, or null.
function surfaceAt(frame, surfaces, s, v) {
  const origin = frame.centre.clone().addScaledVector(frame.right, s).addScaledVector(frame.up, v).addScaledVector(frame.forward, 0.4);
  const hit = new THREE.Raycaster(origin, frame.forward.clone().negate(), 0, 0.8).intersectObjects(surfaces, false)[0];
  if (!hit) return null;
  const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : frame.forward.clone();
  return { f: frame.coords(hit.point).f, normal };
}

// Where the mouth goes: between the bottom of the nose and the bottom of the chin, found by
// running down the middle of the face. Returns its height (v) or null.
function findMouthHeight(frame, surfaces, eyeH) {
  const step = eyeH * 0.1;
  const profile = [];
  for (let v = 0; v > -eyeH * 12; v -= step) {
    const at = surfaceAt(frame, surfaces, 0, v);
    // past the chin the ray meets the neck, well behind the jaw (or nothing at all)
    if (!at || (profile.length && at.f < profile[profile.length - 1].f - eyeH * 1.2)) break;
    profile.push({ v, f: at.f, facing: at.normal.dot(frame.forward) });
  }
  // the chin: the lowest point that still faces forward (not the underside of the jaw)
  let chin = -1;
  for (let i = 0; i < profile.length; i++) if (profile[i].facing > 0.8) chin = i;
  if (chin < 6) return null;
  // the nose: its tip sticks out furthest, and its bottom is the sharpest step back after it
  let tip = 0;
  for (let i = 1; i < chin; i++) if (profile[i].f > profile[tip].f) tip = i;
  let bottom = -1, biggest = 0;
  for (let i = tip; i < chin; i++) {
    const back = profile[i].f - profile[i + 1].f;
    if (back > biggest) { biggest = back; bottom = i + 1; }
  }
  if (bottom < 0) return null;
  const nose = profile[bottom].v;
  return nose - (nose - profile[chin].v) * 0.4;
}

// A mouth for a head that has none: a dark shape on the face below the nose, following the
// curve of the face across, with its own blend shapes. Attached to the head bone.
function buildMouth(frame, eye, surfaces, headBone) {
  const spacing = ((eye.R.minS + eye.R.maxS) - (eye.L.minS + eye.L.maxS)) / 2; // centre to centre
  const eyeH = Math.max(eye.L.maxV - eye.L.minV, eye.R.maxV - eye.R.minV);
  const mouthV = findMouthHeight(frame, surfaces, eyeH);
  if (mouthV === null) return null;

  const halfW = spacing * 0.5, halfH = eyeH * 0.2;
  const openDrop = eyeH * 0.9;
  const COLS = 8;
  // how far forward the face is along the mouth, column by column, so the mouth follows its
  // curve instead of sticking out at the corners (and stays in front when it opens)
  const depth = [];
  for (let i = 0; i <= COLS; i++) {
    const s = (-1 + (2 * i) / COLS) * halfW * 1.15;
    const fs = [0, -openDrop].map((dv) => surfaceAt(frame, surfaces, s, mouthV + dv)).filter(Boolean).map((h) => h.f);
    depth.push(fs.length ? Math.max(...fs) : null);
  }
  if (depth[COLS / 2] === null) return null;
  for (let i = 0; i <= COLS; i++) if (depth[i] === null) depth[i] = depth[COLS / 2];
  const front = depth[COLS / 2];
  const standOff = eyeH * 0.08;

  const pos = [], index = [];
  // two rows of vertices (upper and lower edge) in the face's frame, relative to the mouth's
  // centre: x toward the character's right, y up, z forward
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i <= COLS; i++) {
      const u = -1 + (2 * i) / COLS;
      // a gentle bow: the middle of the upper lip dips a touch
      const v = row === 0 ? halfH - (1 - u * u) * halfH * 0.4 : -halfH;
      pos.push(u * halfW, v, depth[i] - front + standOff);
    }
  }
  for (let i = 0; i < COLS; i++) {
    const a = i, b = i + 1, c = COLS + 1 + i, d = COLS + 2 + i;
    index.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  const n = pos.length / 3;
  // a shape from a function of (u: -1 at the character's left corner to 1 at the right, edge)
  // to a move [across, as a fraction of the half-width; up, in metres]
  const shape = (fn) => {
    const out = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const [dx, dy] = fn(pos[k * 3] / halfW, k <= COLS ? 'upper' : 'lower');
      out[k * 3] = dx * halfW;
      out[k * 3 + 1] = dy;
    }
    return new THREE.Float32BufferAttribute(out, 3);
  };
  const corner = (u) => u * u; // 0 in the middle, 1 at the corners
  const lift = eyeH * 0.55;
  const onSide = (u, side) => ((side === 'L' ? u < 0 : u > 0) ? 1 : u === 0 ? 0.5 : 0);
  // a smile lifts the corners and drops the middle of the lower lip into a grin
  const smile = (side) => (u, edge) => [
    u * 0.12 * onSide(u, side),
    onSide(u, side) * (corner(u) * lift - (edge === 'lower' ? halfH * 1.4 * (1 - corner(u)) : 0)),
  ];
  const names = ['mouthSmile_L', 'mouthSmile_R', 'mouthFrown_L', 'mouthFrown_R', 'jawOpen', 'mouthLeft'];
  geo.morphAttributes.position = [
    shape(smile('L')),
    shape(smile('R')),
    shape((u) => [0, -corner(u) * lift * 0.8 * onSide(u, 'L')]),
    shape((u) => [0, -corner(u) * lift * 0.8 * onSide(u, 'R')]),
    shape((u, edge) => [-u * 0.08, edge === 'lower' ? -openDrop * (1 - corner(u) * 0.55) : eyeH * 0.08 * (1 - corner(u))]),
    // pulled toward the character's left, that corner lifting a little
    shape((u) => [-0.3, u < 0 ? lift * 0.25 * corner(u) : 0]),
  ];
  geo.morphTargetsRelative = true;
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += eyeH * 2;
  const mouth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: MOUTH_COLOUR, roughness: 0.9, flatShading: true, name: 'mouth', side: THREE.DoubleSide }));
  mouth.name = 'mouth';
  mouth.castShadow = false;
  mouth.updateMorphTargets();
  mouth.morphTargetDictionary = Object.fromEntries(names.map((nm, k) => [nm, k]));
  const centre = frame.centre.clone().addScaledVector(frame.up, mouthV).addScaledVector(frame.forward, front);
  mouth.applyMatrix4(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.forward).setPosition(centre));
  headBone.attach(mouth);
  return mouth;
}

// Gives the character's own head an expressive face. Returns the face (for applyExpression),
// or null when the head doesn't have what is needed.
export function attachExpressiveFace(root, headBone) {
  const headGroup = findHeadGroup(root);
  if (!headGroup || !headBone) return null;
  const meshes = headGroup.children.filter((c) => c.isMesh);
  const skin = meshes.find((c) => c.material && c.material.name === 'Skin');
  // the eyes: the costume's small dark shapes at eye level (named "Eye" on the men's heads;
  // on the women's, the smallest mesh of the head)
  const eyes = meshes.find((c) => c.material && c.material.name === 'Eye')
    || meshes.filter((c) => c !== skin).sort((a, b) => a.geometry.attributes.position.count - b.geometry.attributes.position.count)[0];
  if (!skin || !eyes) return null;
  root.updateMatrixWorld(true);
  const frame = faceFrame(root, eyes);
  const eye = measureEyes(eyes, frame);
  if (!eye) return null;

  const face = { meshes: [], mouth: null, brows: [], eyes };
  if (addShapes(eyes, frame, eyeShapes(eye))) face.meshes.push(eyes);
  const brows = browShapes(eye);
  for (const m of meshes) {
    if (m === skin || m === eyes) continue;
    // the brows: a mesh named for them (which may carry a beard too), or one that lies mostly
    // along the brow line; a hat's brim or a fringe that merely reaches it stays put
    const named = /eyebrow/i.test(m.material && m.material.name);
    if (!named && shareOf(m, frame, brows.isBrow) < 0.5) continue;
    if (addShapes(m, frame, brows.shapes)) {
      face.meshes.push(m);
      face.brows.push(m);
    }
  }
  face.mouth = buildMouth(frame, eye, meshes.filter((m) => m !== eyes && !face.brows.includes(m)), headBone);
  if (face.mouth) face.meshes.push(face.mouth);
  return face;
}

/* ---------------- expressions ---------------- */

// Sets the face to one expression: every shape named in `weights` (0..1), all others back to 0.
export function applyExpression(face, weights) {
  if (!face) return;
  for (const mesh of face.meshes) {
    const infl = mesh.morphTargetInfluences, dict = mesh.morphTargetDictionary;
    for (let i = 0; i < infl.length; i++) infl[i] = 0;
    if (!weights) continue;
    for (const name in weights) {
      const k = dict[name];
      if (k !== undefined) infl[k] = Math.min(1, Math.max(0, weights[name]));
    }
  }
}

/* ---------------- for tests and diagnostics ---------------- */

// How far the mouth sits from the middle of the eyes, in metres, as posed now. Both ride on the
// head, so this stays the same (give or take an expression) however the head moves.
export function faceOffsetFromHead(group) {
  const face = group.userData.parts.faceMesh;
  if (!face || !face.mouth) return null;
  group.updateMatrixWorld(true);
  const eyes = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < face.eyes.geometry.attributes.position.count; i++) eyes.expandByPoint(posedPosition(face.eyes, i, p));
  const mouth = new THREE.Box3().setFromObject(face.mouth, true).getCenter(new THREE.Vector3());
  return mouth.distanceTo(eyes.getCenter(p));
}

// What the face is made of: the shapes each part can make, where the mouth sits relative to
// the eyes, and how many parts of the costume's own head are hidden (none should be).
export function faceReport(group) {
  const p = group.userData.parts;
  const face = p.faceMesh;
  if (!face) return null;
  group.updateMatrixWorld(true);
  const shapes = (m) => (m && m.morphTargetDictionary ? Object.keys(m.morphTargetDictionary) : []);
  const box = (o) => new THREE.Box3().setFromObject(o, true);
  const eyes = new THREE.Box3();
  const pos = new THREE.Vector3();
  for (let i = 0; i < face.eyes.geometry.attributes.position.count; i++) eyes.expandByPoint(posedPosition(face.eyes, i, pos));
  const mouth = face.mouth ? box(face.mouth) : null;
  return {
    eyeShapes: shapes(face.eyes),
    browShapes: [...new Set(face.brows.flatMap(shapes))],
    mouthShapes: shapes(face.mouth),
    // metres: the mouth below the eyes, and its centre from the eyes' centre line
    mouthBelowEyes: mouth ? eyes.getCenter(new THREE.Vector3()).y - mouth.getCenter(new THREE.Vector3()).y : null,
    mouthOffCentre: mouth ? Math.abs(mouth.getCenter(new THREE.Vector3()).x - eyes.getCenter(new THREE.Vector3()).x) : null,
    hiddenHeadParts: findHeadGroup(group).children.filter((c) => c.isMesh && !c.visible).length,
  };
}

// The mouth's and the eyes' height in metres, as posed now (the blend shapes applied), so a test
// can see an expression change the face.
export function faceMeasure(group) {
  const face = group.userData.parts.faceMesh;
  if (!face) return null;
  group.updateMatrixWorld(true);
  const measure = (mesh) => {
    const b = new THREE.Box3();
    const p = new THREE.Vector3();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) b.expandByPoint(posedPosition(mesh, i, p));
    return { height: b.max.y - b.min.y, width: b.max.x - b.min.x, top: b.max.y, bottom: b.min.y };
  };
  return {
    mouth: face.mouth ? measure(face.mouth) : null,
    eyes: measure(face.eyes),
    brows: face.brows.length ? measure(face.brows[0]) : null,
  };
}

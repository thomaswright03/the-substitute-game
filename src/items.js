// The things students keep on their desks and may throw: small models, where they sit on a desk,
// and the ones lying on the floor after one has hit the teacher.
import * as THREE from 'three';
import './three-setup.js';

/** @param {number} color @param {number} [roughness] */
const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });

/** @type {Record<import('./data.js').ItemId, () => THREE.Object3D>} */
const BUILDERS = {
  eraser: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.03), mat(0xe0406c));
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.021, 0.031), mat(0x3b6fb3));
    sleeve.position.x = 0.015;
    g.add(body, sleeve);
    g.position.y = 0.01;
    return g;
  },
  pencil: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.17, 6), mat(0xe6a100));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.02, 6), mat(0x2b2b2b));
    tip.position.y = -0.095;
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.014, 6), mat(0xe0728a));
    rubber.position.y = 0.092;
    g.add(body, tip, rubber);
    g.rotation.z = Math.PI / 2;
    g.rotation.y = 0.3;
    g.position.y = 0.005;
    return g;
  },
  paperBall: () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), mat(0xbfb59a, 0.9));
    m.position.y = 0.028;
    m.rotation.set(0.4, 0.7, 0.2);
    return m;
  },
  apple: () => {
    const g = new THREE.Group();
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), mat(0xc9201a, 0.4));
    fruit.position.y = 0.034;
    fruit.scale.y = 0.92;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.015, 5), mat(0x5b3a1e));
    stem.position.y = 0.075;
    g.add(fruit, stem);
    return g;
  },
  marker: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 8), mat(0x2f9e6a));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.045, 8), mat(0x1f1f1f));
    cap.position.y = 0.0775;
    g.add(body, cap);
    g.rotation.z = Math.PI / 2;
    g.rotation.y = -0.25;
    g.position.y = 0.01;
    return g;
  },
  ruler: () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.032), mat(0xc98a1a, 0.5));
    m.position.y = 0.002;
    m.rotation.y = 0.15;
    return m;
  },
};

/**
 * A model of an item, standing on y = 0 and centred on the origin.
 * @param {import('./data.js').ItemId} item
 * @returns {THREE.Object3D}
 */
export function buildItem(item) {
  const model = BUILDERS[item]();
  model.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return model;
}

// Where the items sit on a desk, from the anchor the character keeps for them (characters.js):
// along the far edge, where they can be seen from the front of the room.
const SLOT_X = [-0.3, -0.13, 0.04];
const SLOT_Z = -0.13;
// a little bigger than life, so they read from across the room
const DESK_SCALE = 2;

/**
 * Lays out what is on a desk: a gap where an item used to be, so a missing one is easy to see.
 * @param {THREE.Object3D} anchor the character's desk anchor
 * @param {readonly string[]} kit what is on every desk
 * @param {readonly string[]} items what is still on this one
 */
export function showDeskItems(anchor, kit, items) {
  const key = kit.map((k) => (items.includes(k) ? k : '-')).join(',');
  if (anchor.userData.shown === key) return;
  anchor.userData.shown = key;
  for (const child of [...anchor.children]) anchor.remove(child);
  kit.forEach((item, i) => {
    if (!items.includes(item)) return;
    const model = buildItem(/** @type {import('./data.js').ItemId} */ (item));
    model.scale.setScalar(DESK_SCALE);
    model.position.y *= DESK_SCALE;
    model.position.x += SLOT_X[i] ?? 0;
    model.position.z += SLOT_Z;
    anchor.add(model);
  });
}

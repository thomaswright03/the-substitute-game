// Props for the behaviour tells (a note, a phone, a paper plane, a snack) and where each one sits.

import * as THREE from 'three';
import './three-setup.js';
import { CHAIR, DESK, canvasTexture } from './scene.js';

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
export const PROP_BUILDERS = {
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

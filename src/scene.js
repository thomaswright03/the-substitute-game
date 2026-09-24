// The classroom itself: walls, floor, windows, chalkboard, desks and the attendance cards.
import * as THREE from 'three';
import './three-setup.js';
import { onLanguageChange, t } from './strings.js';
import { ROOM } from './data.js';

export { ROOM };

// Each desk has its chair behind it (toward the back of the room). Metres, relative to the desk.
export const CHAIR = {
  z: 0.5, // centre of the chair seat behind the desk
  seatY: 0.46, // centre of the seat board, which is 0.05 thick
  seatTop: 0.485,
  backZ: 0.72,
};

// The top-centre of the chair seat for a given seat in the seating chart.
// The student desk's top surface, relative to the desk's centre on the floor.
export const DESK = {
  topY: 0.745,
  halfDepth: 0.357,
};

/** @typedef {import('./rules.js').Seat} Seat */

/** @param {Seat} seat */
export function seatPosition(seat) {
  return { x: ROOM.colsX[seat.col], y: CHAIR.seatTop, z: ROOM.rowsZ[seat.row] + CHAIR.z };
}

/** @param {Seat} seat */
export function deskPosition(seat) {
  return { x: ROOM.colsX[seat.col], z: ROOM.rowsZ[seat.row] };
}

/** @typedef {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} Draw */

/** @type {WeakMap<THREE.Texture, () => void>} */
const redraws = new WeakMap();

/**
 * A texture drawn on a canvas `w` by `h` pixels.
 * @param {Draw} draw
 * @param {number} w
 * @param {number} h
 */
export function canvasTexture(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw on a canvas');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  redraws.set(tex, () => {
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    tex.needsUpdate = true;
  });
  return tex;
}

/**
 * Draws a texture from canvasTexture() again, for text that changes with the language.
 * @param {THREE.Texture} tex
 */
function redrawTexture(tex) {
  const redraw = redraws.get(tex);
  if (redraw) redraw();
}

/**
 * @template {THREE.Object3D} T
 * @param {T} obj
 */
export function enableShadows(obj) {
  obj.traverse((o) => {
    if (/** @type {THREE.Mesh} */ (o).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

const deskTopMat = new THREE.MeshStandardMaterial({ color: 0xcda06a, roughness: 0.62 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x54585c, roughness: 0.55, metalness: 0.35 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x3f5c76, roughness: 0.75 });

/**
 * @param {number} height
 * @param {THREE.Material} mat
 * @param {number} hw
 * @param {number} hd
 */
function legSet(height, mat, hw, hd) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.045, height, 0.045);
  for (const [x, z] of [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) {
    const leg = new THREE.Mesh(geo, mat);
    leg.position.set(x, height / 2, z);
    g.add(leg);
  }
  return g;
}

export function buildDesk() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.105, 0.05, 0.715), deskTopMat);
  top.position.set(0, 0.72, 0);
  g.add(top);
  g.add(legSet(0.7, legMat, 0.468, 0.286));
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), seatMat);
  seat.position.set(0, CHAIR.seatY, CHAIR.z);
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.05), seatMat);
  back.position.set(0, 0.68, CHAIR.backZ);
  g.add(back);
  const seatLegs = legSet(CHAIR.seatY, legMat, 0.19, 0.19);
  seatLegs.position.z = CHAIR.z;
  g.add(seatLegs);
  return enableShadows(g);
}

// Light levels as designed under three.js r128, whose "legacy" lighting scaled every light by pi.
/** @param {number} intensity */
const legacy = (intensity) => intensity * Math.PI;
const POINT_LIGHT_MATCH = 0.8;

/** @param {THREE.Scene} scene */
function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xdcebff, 0x40382a, legacy(0.55)));
  for (const [x, z] of [[-2, -2], [2, 2]]) {
    // r128 faded point lights linearly to zero at their range. Physically based decay would put
    // a hot spot on the ceiling just above each light, so these keep a flat fill instead, at the
    // level r128's linear fade gave across the room.
    const light = new THREE.PointLight(0xfff2d6, legacy(0.55) * POINT_LIGHT_MATCH, 12, 0);
    light.position.set(x, 3, z);
    scene.add(light);
  }
  const sun = new THREE.DirectionalLight(0xfff3dd, legacy(0.95));
  sun.position.set(5, 7, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -ROOM.halfWidth - 0.5;
  sun.shadow.camera.right = ROOM.halfWidth + 0.5;
  sun.shadow.camera.top = ROOM.backZ - ROOM.frontZ;
  sun.shadow.camera.bottom = -1;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 20;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, (ROOM.frontZ + ROOM.backZ) / 2);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {number} count
 * @param {number} alpha
 * @param {number} sizeW
 * @param {number} sizeH
 */
function noise(ctx, w, h, count, alpha, sizeW, sizeH) {
  for (let k = 0; k < count; k++) {
    ctx.fillStyle = 'rgba(0,0,0,' + Math.random() * alpha + ')';
    ctx.fillRect(Math.random() * w, Math.random() * h, sizeW, sizeH);
  }
}

// Sets the board font at `size` px, or smaller if the text would be wider than `maxWidth`.
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} size
 * @param {number} maxWidth
 */
function fitText(ctx, text, size, maxWidth) {
  ctx.font = '600 ' + size + 'px Fredoka, sans-serif';
  const width = ctx.measureText(text).width;
  if (width > maxWidth) ctx.font = '600 ' + Math.floor(size * maxWidth / width) + 'px Fredoka, sans-serif';
}

/** @param {THREE.Scene} scene */
function buildChalkboard(scene) {
  const W = 4.6, H = 2.1, CY = 1.85;
  const boardTex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#20402d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.lineTo(Math.random() * w, Math.random() * h);
      ctx.stroke();
    }
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    // the name cards cover the middle of the board, so the heading sits above them
    ctx.fillStyle = '#f6f1e4';
    fitText(ctx, t('board.room'), 64, w * 0.6);
    ctx.fillText(t('board.room'), w / 2, h * 0.14);
    ctx.fillStyle = '#f2b93b';
    fitText(ctx, t('board.motto'), 34, w * 0.9);
    ctx.fillText(t('board.motto'), w / 2, h * 0.94);
    ctx.strokeStyle = 'rgba(246,241,228,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.18);
    ctx.lineTo(w * 0.7, h * 0.18);
    ctx.stroke();
  }, 1024, 512);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.85 }));
  board.name = 'chalkboard';
  onLanguageChange(() => redrawTexture(boardTex));
  board.position.set(0, CY, ROOM.frontZ + 0.03);
  board.receiveShadow = true;
  scene.add(board);

  // a frame made of four rails AROUND the board, so nothing sits in front of the slate
  const rail = 0.13, depth = 0.08;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.7 });
  const rails = [
    [W + rail * 2, rail, 0, CY + H / 2 + rail / 2],
    [W + rail * 2, rail, 0, CY - H / 2 - rail / 2],
    [rail, H, -W / 2 - rail / 2, CY],
    [rail, H, W / 2 + rail / 2, CY],
  ];
  for (const [w, h, x, y] of rails) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), frameMat);
    m.position.set(x, y, ROOM.frontZ + depth / 2);
    m.castShadow = true;
    scene.add(m);
  }
  const tray = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.04, 0.12), frameMat);
  tray.position.set(0, CY - H / 2 - rail - 0.01, ROOM.frontZ + 0.09);
  tray.castShadow = true;
  scene.add(tray);
}

/** @param {THREE.Scene} scene */
export function buildRoom(scene) {
  scene.background = new THREE.Color(0xece2c8);
  scene.fog = new THREE.Fog(0xece2c8, 10, 23);
  addLights(scene);

  const depth = ROOM.backZ - ROOM.frontZ;
  const midZ = (ROOM.frontZ + ROOM.backZ) / 2;

  const floorTex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#cbb98f';
    ctx.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(i * s, j * s, s, s);
        }
      }
    }
    noise(ctx, w, h, 2600, 0.05, 1, 1);
    const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(30,20,10,0.18)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }, 512, 512);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(9, 13);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfWidth * 2, depth), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceilTex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#f3ecd8';
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, h * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(60,45,25,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }, 512, 384);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfWidth * 2, depth), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.height, midZ);
  ceil.receiveShadow = true;
  scene.add(ceil);
  for (const x of [-2.4, 2.4]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), new THREE.MeshBasicMaterial({ color: 0xfffdf3 }));
    panel.rotation.x = Math.PI / 2;
    panel.position.set(x, ROOM.height - 0.02, -1.2);
    scene.add(panel);
  }

  const wallTex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#e9e1c8';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 1400, 0.035, 1, 2);
    const vg = ctx.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, 'rgba(50,38,20,0.14)');
    vg.addColorStop(0.18, 'rgba(50,38,20,0)');
    vg.addColorStop(0.85, 'rgba(50,38,20,0)');
    vg.addColorStop(1, 'rgba(30,22,12,0.2)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }, 512, 320);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.94, side: THREE.DoubleSide });
  const walls = [
    [ROOM.halfWidth * 2, 0, ROOM.frontZ, 0],
    [ROOM.halfWidth * 2, 0, ROOM.backZ, Math.PI],
    [depth, -ROOM.halfWidth, midZ, Math.PI / 2],
    [depth, ROOM.halfWidth, midZ, -Math.PI / 2],
  ];
  for (const [w, x, z, ry] of walls) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.2), wallMat);
    wall.position.set(x, 1.6, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  buildChalkboard(scene);

  const corkTex = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#b78a5a';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 500, 0.06, 2, 2);
    const notes = ['#e14b34', '#4f86ad', '#f2b93b', '#6cb56f', '#d9457a'];
    for (let j = 0; j < 7; j++) {
      ctx.fillStyle = notes[j % notes.length];
      const x = 30 + Math.random() * (w - 140), y = 30 + Math.random() * (h - 140);
      ctx.save();
      ctx.translate(x + 50, y + 50);
      ctx.rotate((Math.random() - 0.5) * 0.5);
      ctx.fillRect(-50, -50, 100, 100);
      ctx.restore();
    }
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }, 640, 480);
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshStandardMaterial({ map: corkTex, roughness: 0.95 }));
  cork.position.set(-ROOM.halfWidth + 0.02, 1.7, 1.5);
  cork.rotation.y = Math.PI / 2;
  cork.receiveShadow = true;
  scene.add(cork);

  const skyTex = canvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#a9d4ff');
    g.addColorStop(1, '#eaf6ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [cx, cy, cr] of [[70, 60, 26], [150, 90, 20], [210, 55, 22]]) {
      const sx = cx * (w / 256), sy = cy * (h / 192), sr = cr * (w / 256);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.arc(sx + sr * 0.6, sy + sr * 0.15, sr * 0.8, 0, Math.PI * 2);
      ctx.arc(sx - sr * 0.55, sy + sr * 0.2, sr * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 384, 288);
  const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  for (let wz = -4.5; wz <= 2.2; wz += 2.4) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({ map: skyTex }));
    win.position.set(ROOM.halfWidth - 0.02, 1.8, wz);
    win.rotation.y = -Math.PI / 2;
    scene.add(win);
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 1.6), windowFrameMat);
    winFrame.position.set(ROOM.halfWidth - 0.05, 1.8, wz);
    winFrame.castShadow = true;
    scene.add(winFrame);
  }

  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6 }));
  door.position.set(ROOM.doorX, 1.1, ROOM.backZ - 0.02);
  door.rotation.y = Math.PI;
  door.receiveShadow = true;
  scene.add(door);

  const teacherDesk = buildTeacherDesk();
  teacherDesk.position.set(TEACHER_DESK.x, 0, TEACHER_DESK.z);
  scene.add(teacherDesk);
}

// The teacher's desk: in the front corner by the door-side wall, clear of the chalkboard, and
// facing the class. Its footprint (half sizes, metres) is also what the teacher bumps into.
export const TEACHER_DESK = { x: -3.15, z: ROOM.frontZ + 1.45, halfWidth: 0.75, halfDepth: 0.38 };

const teacherWood = new THREE.MeshStandardMaterial({ color: 0x6e4526, roughness: 0.6 });
const teacherWoodDark = new THREE.MeshStandardMaterial({ color: 0x54331b, roughness: 0.65 });
const handleMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b0, roughness: 0.35, metalness: 0.6 });

/**
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {THREE.Material} mat
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function buildTeacherDesk() {
  const { halfWidth: hw, halfDepth: hd } = TEACHER_DESK;
  const g = new THREE.Group();
  const topY = 0.76;
  g.add(box(hw * 2, 0.05, hd * 2, teacherWood, 0, topY - 0.025, 0));
  // a solid end on the left, a pedestal of drawers on the right, and a modesty panel facing
  // the class (+z), so no chair or knees show from the room
  g.add(box(0.04, topY - 0.05, hd * 2 - 0.04, teacherWoodDark, -hw + 0.04, (topY - 0.05) / 2, 0));
  const pedW = 0.44;
  g.add(box(pedW, topY - 0.05, hd * 2 - 0.04, teacherWoodDark, hw - pedW / 2 - 0.02, (topY - 0.05) / 2, 0));
  g.add(box(hw * 2 - 0.08, 0.5, 0.03, teacherWoodDark, 0, topY - 0.3, hd - 0.04));
  // drawer fronts and handles, on the teacher's side (toward the board, -z)
  for (let i = 0; i < 3; i++) {
    const y = 0.14 + i * 0.22;
    g.add(box(pedW - 0.06, 0.18, 0.015, teacherWood, hw - pedW / 2 - 0.02, y, -hd + 0.01));
    g.add(box(0.12, 0.02, 0.02, handleMat, hw - pedW / 2 - 0.02, y + 0.04, -hd - 0.005));
  }
  // what's on it: a stack of books, a mug of pens and an apple for the teacher
  const bookColours = [0x2f6a93, 0xc8341f, 0x3f8f44];
  bookColours.forEach((c, i) => {
    const book = box(0.26 - i * 0.02, 0.045, 0.19, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }), -hw + 0.3, topY + 0.023 + i * 0.045, -0.02);
    book.rotation.y = (i - 1) * 0.12;
    g.add(book);
  });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0xf2b93b, roughness: 0.5 }));
  mug.position.set(0.3, topY + 0.05, -0.12);
  g.add(mug);
  for (const [dx, c] of [[-0.012, 0x141c16], [0.014, 0xc8341f]]) {
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), new THREE.MeshStandardMaterial({ color: c }));
    pen.position.set(0.3 + dx, topY + 0.1, -0.12);
    pen.rotation.z = dx * 8;
    g.add(pen);
  }
  const apple = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc8341f, roughness: 0.4 }));
  apple.scale.y = 0.9;
  apple.position.set(-0.05, topY + 0.042, 0.14);
  g.add(apple);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 5), new THREE.MeshStandardMaterial({ color: 0x4e2f18 }));
  stem.position.set(-0.05, topY + 0.095, 0.14);
  g.add(stem);
  g.name = 'teacherDesk';
  return enableShadows(g);
}

/** @typedef {{mesh: THREE.Mesh, position: THREE.Vector3}} Card */

/**
 * Eight name cards pinned to the board in two rows.
 * @param {THREE.Scene} scene
 * @param {import('./data.js').StudentConfig[]} students
 */
export function buildAttendanceCards(scene, students) {
  /** @type {Record<string, Card>} */
  const cards = {};
  const colX = [-1.65, -0.55, 0.55, 1.65];
  const rowY = [2.2, 1.55];
  students.forEach((cfg, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const tex = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#f6f1e4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#4e2f18';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#141c16';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Mipmaps of sRGB textures are averaged in linear light, which thins dark text on a light
      // card when it is seen from across the room; a matching outline keeps the letters bold.
      ctx.strokeStyle = '#141c16';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      /**
       * @param {string} text
       * @param {number} x
       * @param {number} y
       */
      const write = (text, x, y) => {
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      };
      const parts = cfg.name.split(' ');
      if (parts.length > 1) {
        ctx.font = '700 52px Fredoka, sans-serif';
        write(parts[0], w / 2, h * 0.33);
        write(parts.slice(1).join(' '), w / 2, h * 0.67);
      } else {
        ctx.font = '700 60px Fredoka, sans-serif';
        write(parts[0], w / 2, h / 2);
      }
    }, 256, 160);
    const position = new THREE.Vector3(colX[col], rowY[row], ROOM.frontZ + 0.05);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.37), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.copy(position);
    mesh.name = 'card-' + cfg.id;
    scene.add(mesh);
    cards[cfg.id] = { mesh, position };
  });
  return cards;
}

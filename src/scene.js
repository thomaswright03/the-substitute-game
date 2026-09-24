// The classroom itself: walls, floor, windows, chalkboard, desks and the attendance cards.
// Uses the global THREE loaded by the classic <script> tags in index.html.
import { t } from './strings.js';

export const ROOM = {
  halfWidth: 4.6,
  frontZ: -6.2,
  backZ: 6.2,
  height: 3.15,
  colsX: [-2.6, -0.87, 0.87, 2.6],
  rowsZ: [-3.0, -0.75],
  doorX: -2.6,
};

// Each desk has its chair behind it (toward the back of the room). Metres, relative to the desk.
export const CHAIR = {
  z: 0.5, // centre of the chair seat behind the desk
  seatY: 0.46, // centre of the seat board, which is 0.05 thick
  seatTop: 0.485,
  backZ: 0.72,
};

// The top-centre of the chair seat for a given seat in the seating chart.
export function seatPosition(seat) {
  return { x: ROOM.colsX[seat.col], y: CHAIR.seatTop, z: ROOM.rowsZ[seat.row] + CHAIR.z };
}

export function deskPosition(seat) {
  return { x: ROOM.colsX[seat.col], z: ROOM.rowsZ[seat.row] };
}

export function canvasTexture(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function enableShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

const deskTopMat = new THREE.MeshStandardMaterial({ color: 0xcda06a, roughness: 0.62 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x54585c, roughness: 0.55, metalness: 0.35 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x3f5c76, roughness: 0.75 });

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

export function buildDesk(scale = 1) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.85 * scale * 1.3, 0.05, 0.55 * scale * 1.3), deskTopMat);
  top.position.set(0, 0.72, 0);
  g.add(top);
  g.add(legSet(0.7, legMat, 0.36 * scale * 1.3, 0.22 * scale * 1.3));
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

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xdcebff, 0x40382a, 0.55));
  for (const [x, z] of [[-2, -2], [2, 2]]) {
    const light = new THREE.PointLight(0xfff2d6, 0.55, 12);
    light.position.set(x, 3, z);
    scene.add(light);
  }
  const sun = new THREE.DirectionalLight(0xfff3dd, 0.95);
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

function noise(ctx, w, h, count, alpha, sizeW, sizeH) {
  for (let k = 0; k < count; k++) {
    ctx.fillStyle = 'rgba(0,0,0,' + Math.random() * alpha + ')';
    ctx.fillRect(Math.random() * w, Math.random() * h, sizeW, sizeH);
  }
}

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
    ctx.font = '600 64px Fredoka, sans-serif';
    ctx.fillText(t('board.room'), w / 2, h * 0.14);
    ctx.font = '600 34px Fredoka, sans-serif';
    ctx.fillStyle = '#f2b93b';
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

  const teacherDesk = buildDesk(0.55);
  teacherDesk.position.set(0, 0, ROOM.frontZ + 1.35);
  scene.add(teacherDesk);
}

// Eight name cards pinned to the board in two rows. Returns id -> {mesh, position}.
export function buildAttendanceCards(scene, students) {
  const cards = {};
  const colX = [-1.65, -0.55, 0.55, 1.65];
  const rowY = [2.2, 1.55];
  students.forEach((cfg, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const tex = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#f6f1e4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#4e2f18';
      ctx.lineWidth = 10;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#141c16';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const parts = cfg.name.split(' ');
      if (parts.length > 1) {
        ctx.font = '700 52px Fredoka, sans-serif';
        ctx.fillText(parts[0], w / 2, h * 0.33);
        ctx.fillText(parts.slice(1).join(' '), w / 2, h * 0.67);
      } else {
        ctx.font = '700 60px Fredoka, sans-serif';
        ctx.fillText(parts[0], w / 2, h / 2);
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

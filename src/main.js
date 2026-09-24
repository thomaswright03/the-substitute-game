// The Substitute: rendering, input and HUD. The rules live in rules.js; this file turns them
// into a 3D classroom you can walk around in, and turns the player's input into rule calls.
import { ICON, PRINCIPAL_MODEL, STUDENTS, TUNING } from './data.js';
import * as R from './rules.js';
import { applyStaticStrings, listNames, lookup, plural, setStrings, t } from './strings.js';
import { ROOM, buildAttendanceCards, buildDesk, buildRoom, deskPosition, seatPosition } from './scene.js';
import {
  FACE_URL, buildCharacter, faceOffsetFromHead, headForward, loadAll, loadGLB, modelUrl, poseCharacter, setWalking,
} from './characters.js';

const boot = window.SubstituteBoot || { blocked: false, progress() {}, fail() {}, ready() {}, show() {} };
const TEST_MODE = new URLSearchParams(window.location.search).has('test');

const EYE_HEIGHT = 1.62;
const PLAYER_RADIUS = 0.35;
const DESK_RADIUS = 0.85;
const MOVE_SPEED = 3.1;
const TURN_SPEED = 2.4; // radians per second for keyboard turning
const INTERACT_RANGE = 3.3;
const INTERACT_COS = 0.82;
const LOOK_SENS = 0.0034;
const POINTER_LOCK_SENS = 0.0024;
const EDGE_ASSIST_START = 0.82;
const EDGE_ASSIST_RATE_YAW = 1.1;
const EDGE_ASSIST_RATE_PITCH = 0.85;
const MAX_FRAME_DT = 5; // longer gaps are stalls (a hidden tab pauses the game), not play time
const MOVE_STEP = 1 / 30; // movement is integrated in steps no longer than this
const MAX_MOVE_DT = 0.25;
const BEST_GRADE_KEY = 'substitute_best_grade';
const LOG_LINES = 12; // kept in the log; CSS shows the newest few and fades the rest out
const SCRIPTS_SHARE = 0.12;
const PRINCIPAL_WAIT_MS = 8000; // longest the class waits for the principal's model to arrive
const FRIEND_COLORS = ['#2f6a93', '#d0741c', '#8a4bb8', '#2f8f6a'];

const $ = (id) => document.getElementById(id);
const el = {
  cabinet: $('cabinet'), stage: $('stage'), canvas: $('gl'), studentLayer: $('studentLayer'),
  log: $('log'), chaosBadge: $('chaosBadge'), chaosValue: $('chaosValue'), chaosFill: $('chaosFill'),
  clockValue: $('clockValue'), clockFill: $('clockFill'),
  crosshair: $('crosshair'), prompt: $('prompt'), threatCue: $('threatCue'),
  speechBubble: $('speechBubble'), bubbleText: $('bubbleText'), dirArrow: $('dirArrow'), dirArrowGlyph: $('dirArrowGlyph'),
  pauseBtn: $('pauseBtn'), fullscreenBtn: $('fullscreenBtn'),
  startOverlay: $('startOverlay'), startBtn: $('startBtn'), bestStart: $('bestStart'),
  endOverlay: $('endOverlay'), restartBtn: $('restartBtn'),
  pauseOverlay: $('pauseOverlay'), resumeBtn: $('resumeBtn'), restartFromPause: $('restartFromPause'),
  discOverlay: $('disciplineOverlay'), discName: $('discName'), discCancel: $('discCancel'),
  flash: $('flash'), hitVignette: $('hitVignette'),
  attPanel: $('attendancePanel'), attQuestion: $('attQuestion'), attHint: $('attHint'), attAnswer: $('attAnswer'),
  banner: $('reassignBanner'), seatChart: $('seatChart'), seatGrid: $('seatGrid'), seatClose: $('seatClose'),
  actions: $('actions'), actPrimary: $('actPrimary'), actDiscipline: $('actDiscipline'), actRollCall: $('actRollCall'), actSeats: $('actSeats'),
  joystick: $('joystick'), knob: $('knob'),
};
const discButtons = {
  talk: $('discTalk'), detention: $('discDetention'), principal: $('discPrincipal'), zap: $('discZap'),
};
const discNotes = {
  talk: $('discTalkNote'), detention: $('discDetentionNote'), principal: $('discPrincipalNote'), zap: $('discZapNote'),
};

/* ================= device ================= */

let isTouch = false;
function setTouch(on) {
  if (isTouch === on) return;
  isTouch = on;
  document.body.classList.toggle('touch', on);
  renderControlsLists();
}

function renderControlsLists() {
  const rows = lookup(isTouch ? 'controls.touch' : 'controls.keyboard') || [];
  document.querySelectorAll('[data-controls]').forEach((dl) => {
    dl.textContent = '';
    for (const [key, what] of rows) {
      const item = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = what;
      item.append(dt, dd);
      dl.append(item);
    }
  });
}

/* ================= three.js world ================= */

let renderer, scene, camera, composer = null;
const world = { students: {}, cards: {}, principal: null, principalPromise: null, faceTemplate: null, deskColliders: [] };

function createRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
  camera.rotation.order = 'YXZ';
  // bloom is a progressive enhancement; without it the loop falls back to a plain render
  try {
    if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.86);
      bloom.renderToScreen = true;
      composer.addPass(bloom);
    }
  } catch (err) {
    console.warn('Bloom disabled:', err);
    composer = null;
  }
}

function measureHud() {
  const hud = document.getElementById('hud');
  el.stage.style.setProperty('--hud-bottom', hud.offsetTop + hud.offsetHeight + 'px');
}

function resize() {
  measureHud();
  if (!renderer) return;
  const w = Math.max(1, el.stage.clientWidth), h = Math.max(1, el.stage.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}

function waitForFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const fonts = Promise.all([
    document.fonts.load('600 64px Fredoka'),
    document.fonts.load('700 52px Fredoka'),
  ]).catch(() => {});
  return Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]);
}

async function buildWorld() {
  const variants = [...new Set(STUDENTS.map((s) => s.model))];
  const urls = [FACE_URL, ...variants.map(modelUrl)];
  // by the time this runs, three.js and the game scripts (about an eighth of the bytes) are in
  const report = (f) => {
    const overall = SCRIPTS_SHARE + f * (1 - SCRIPTS_SHARE);
    boot.progress(overall, t('boot.loadingDetail', { percent: Math.round(overall * 100) }));
  };
  report(0);
  const loading = loadAll(urls, report);
  await waitForFonts();
  buildRoom(scene);
  world.cards = buildAttendanceCards(scene, STUDENTS);
  const [face, ...models] = await loading;
  world.faceTemplate = face.scene;
  const byVariant = {};
  variants.forEach((v, i) => { byVariant[v] = models[i]; });

  // desks stay put; students move between them when seats are swapped
  for (const s of STUDENTS) {
    const d = deskPosition(s);
    const desk = buildDesk(1);
    desk.position.set(d.x, 0, d.z);
    scene.add(desk);
    world.deskColliders.push({ x: d.x, z: d.z + 0.25 });
  }
  for (const s of STUDENTS) {
    const group = buildCharacter(byVariant[s.model], world.faceTemplate, { type: s.type, model: s.model });
    group.name = 'student-' + s.id;
    placeInSeat(group, s);
    scene.add(group);
    world.students[s.id] = group;
  }
  report(1);
}

// The principal is only needed if someone gets sent to the office, so the model is fetched
// after the classroom is ready instead of holding up the first load.
function ensurePrincipal() {
  if (!world.principalPromise) {
    world.principalPromise = loadGLB(modelUrl(PRINCIPAL_MODEL)).then((gltf) => {
      const p = buildCharacter(gltf, world.faceTemplate, { type: null, seated: false, model: PRINCIPAL_MODEL });
      p.scale.multiplyScalar(1.1);
      p.visible = false;
      p.name = 'principal';
      scene.add(p);
      world.principal = p;
      return p;
    }).catch((err) => {
      world.principalPromise = null;
      throw err;
    });
  }
  return world.principalPromise;
}

/* ================= player ================= */

const player = { x: 0, z: ROOM.backZ - 1.7, yaw: 0, pitch: -0.05 };
const keys = {};
const camForward = new THREE.Vector3();
let pointerLocked = false, ownUnlock = false, pausedByUnlockAt = -Infinity;
let hoverInside = false, lastPX = 0, lastPY = 0, mouseEdgeX = 0, mouseEdgeY = 0;
let touchLookId = null;
const joy = { active: false, id: null, x: 0, y: 0 };

function clampPitch() {
  player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch));
}

function applyLookDelta(dx, dy, sens) {
  player.yaw -= dx * sens;
  player.pitch -= dy * sens;
  clampPitch();
}

function movePlayer(dt) {
  // edge assist: only while the cursor is actually inside the canvas
  if (!pointerLocked && hoverInside && !seatChartOpen) {
    const ax = Math.abs(mouseEdgeX), ay = Math.abs(mouseEdgeY);
    if (ax > EDGE_ASSIST_START) player.yaw -= Math.sign(mouseEdgeX) * ((ax - EDGE_ASSIST_START) / (1 - EDGE_ASSIST_START)) * EDGE_ASSIST_RATE_YAW * dt;
    if (ay > EDGE_ASSIST_START) player.pitch -= Math.sign(mouseEdgeY) * ((ay - EDGE_ASSIST_START) / (1 - EDGE_ASSIST_START)) * EDGE_ASSIST_RATE_PITCH * dt;
  }
  if (keys.arrowleft) player.yaw += TURN_SPEED * dt;
  if (keys.arrowright) player.yaw -= TURN_SPEED * dt;
  clampPitch();

  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  let mx = 0, mz = 0;
  if (keys.w || keys.arrowup) { mx += fx; mz += fz; }
  if (keys.s || keys.arrowdown) { mx -= fx; mz -= fz; }
  if (keys.a) { mx -= rx; mz -= rz; }
  if (keys.d) { mx += rx; mz += rz; }
  mx += fx * -joy.y + rx * joy.x;
  mz += fz * -joy.y + rz * joy.x;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  player.x += mx * MOVE_SPEED * dt;
  player.z += mz * MOVE_SPEED * dt;

  const minDist = DESK_RADIUS * 0.7 + PLAYER_RADIUS;
  for (const d of world.deskColliders) {
    const dx = player.x - d.x, dz = player.z - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist < minDist && dist > 0.0001) {
      player.x += (dx / dist) * (minDist - dist);
      player.z += (dz / dist) * (minDist - dist);
    }
  }
  const margin = PLAYER_RADIUS + 0.3;
  player.x = Math.max(-ROOM.halfWidth + margin, Math.min(ROOM.halfWidth - margin, player.x));
  player.z = Math.max(ROOM.frontZ + margin, Math.min(ROOM.backZ - margin, player.z));
}

function syncCamera() {
  camera.position.set(player.x, EYE_HEIGHT, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  camera.updateMatrixWorld(true);
  camera.getWorldDirection(camForward);
}

/* ================= session state ================= */

let game = null;
let running = false;
let paused = false;
let seatChartOpen = false;
let seatFirst = null;
let disciplineTarget = null;
let principalSeq = null;
let projectile = null;
let speech = null; // {id, until}
let lastRollLine = null;
let lastBestGrade = null;

function frozen() {
  return paused || disciplineTarget !== null || principalSeq !== null;
}

// Students are always called by their full name: two of them share a first name.
function name(id) {
  const s = STUDENTS.find((x) => x.id === id);
  return s ? s.name : id;
}

function pushLog(text) {
  const line = document.createElement('div');
  line.textContent = text;
  el.log.appendChild(line);
  while (el.log.children.length > LOG_LINES) el.log.removeChild(el.log.firstChild);
}

/* ================= dialogs and focus ================= */

const dialogStack = [];
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((n) => !n.closest('[hidden]') && n.offsetParent !== null);
}

function openDialog(node, focusTarget) {
  node.hidden = false;
  if (!dialogStack.some((d) => d.node === node)) dialogStack.push({ node, returnTo: document.activeElement });
  const target = focusTarget || focusables(node)[0];
  if (target) target.focus({ preventScroll: true });
  node.scrollTop = 0;
}

function closeDialog(node) {
  node.hidden = true;
  const i = dialogStack.findIndex((d) => d.node === node);
  if (i < 0) return;
  const [entry] = dialogStack.splice(i, 1);
  const back = entry.returnTo;
  if (back && back !== document.body && back.isConnected && back.offsetParent !== null && !back.closest('[hidden]')) {
    back.focus({ preventScroll: true });
  } else {
    el.canvas.focus({ preventScroll: true });
  }
}

function topDialog() {
  return dialogStack.length ? dialogStack[dialogStack.length - 1].node : null;
}

// keep Tab / Shift+Tab inside the open dialog
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const top = topDialog();
  if (!top) return;
  const items = focusables(top);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  const inside = top.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
});

/* ================= pointer lock / look input ================= */

function requestLook() {
  if (isTouch || pointerLocked || !running || frozen() || seatChartOpen || !el.canvas.requestPointerLock) return;
  try {
    const p = el.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { /* refused: hover-look still works */ });
  } catch { /* unsupported: hover-look still works */ }
}

function releaseLook() {
  if (!pointerLocked || !document.exitPointerLock) return;
  ownUnlock = true;
  document.exitPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === el.canvas;
  el.stage.classList.toggle('locked', pointerLocked);
  if (pointerLocked) {
    hoverInside = false;
    mouseEdgeX = mouseEdgeY = 0;
    skipNextLockedMove = true;
    return;
  }
  // the browser releases the lock itself when the player presses Esc: treat that as "pause"
  if (ownUnlock) ownUnlock = false;
  else if (running && !frozen() && !seatChartOpen) {
    pausedByUnlockAt = performance.now();
    setPaused(true);
  }
});

el.canvas.addEventListener('click', () => {
  if (!isTouch) requestLook();
});

el.canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    setTouch(true);
    if (touchLookId === null) {
      touchLookId = e.pointerId;
      lastPX = e.clientX;
      lastPY = e.clientY;
      try { el.canvas.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
    }
  }
});
el.canvas.addEventListener('pointermove', (e) => {
  if (pointerLocked) return;
  if (e.pointerType === 'touch') {
    if (e.pointerId !== touchLookId) return;
    if (running && !frozen()) applyLookDelta(e.clientX - lastPX, e.clientY - lastPY, LOOK_SENS);
    lastPX = e.clientX;
    lastPY = e.clientY;
    return;
  }
  // mouse without pointer lock: relative look while the cursor moves over the classroom
  if (running && !frozen() && hoverInside && !seatChartOpen) applyLookDelta(e.clientX - lastPX, e.clientY - lastPY, LOOK_SENS);
  lastPX = e.clientX;
  lastPY = e.clientY;
  hoverInside = true;
  const rect = el.canvas.getBoundingClientRect();
  mouseEdgeX = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)));
  mouseEdgeY = Math.max(-1, Math.min(1, (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)));
});
function stopHoverLook() {
  hoverInside = false;
  mouseEdgeX = mouseEdgeY = 0;
}
// leaving the canvas (to the pause button, a panel, or out of the window) stops edge turning at once
el.canvas.addEventListener('pointerleave', stopHoverLook);
el.canvas.addEventListener('pointerout', stopHoverLook);
window.addEventListener('blur', stopHoverLook);
function endTouchLook(e) {
  if (e.pointerId === touchLookId) touchLookId = null;
}
el.canvas.addEventListener('pointerup', endTouchLook);
el.canvas.addEventListener('pointercancel', endTouchLook);
const MAX_LOCKED_DELTA = 250; // browsers sometimes report one huge jump right after locking
let skipNextLockedMove = false;
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked || !running || frozen()) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (skipNextLockedMove || Math.abs(dx) > MAX_LOCKED_DELTA || Math.abs(dy) > MAX_LOCKED_DELTA) {
    skipNextLockedMove = false;
    return;
  }
  applyLookDelta(dx, dy, POINTER_LOCK_SENS);
});

el.joystick.addEventListener('pointerdown', (e) => {
  joy.active = true;
  joy.id = e.pointerId;
  try { el.joystick.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
  e.preventDefault();
});
el.joystick.addEventListener('pointermove', (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  const r = el.joystick.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2;
  const len = Math.min(Math.hypot(dx, dy), max);
  const ang = Math.atan2(dy, dx);
  const kx = Math.cos(ang) * len, ky = Math.sin(ang) * len;
  el.knob.style.left = 'calc(50% + ' + kx + 'px)';
  el.knob.style.top = 'calc(50% + ' + ky + 'px)';
  joy.x = kx / max;
  joy.y = ky / max;
});
function joyReset(e) {
  if (e && e.pointerId !== joy.id) return;
  joy.active = false;
  joy.x = joy.y = 0;
  el.knob.style.left = '50%';
  el.knob.style.top = '50%';
}
el.joystick.addEventListener('pointerup', joyReset);
el.joystick.addEventListener('pointercancel', joyReset);

/* ================= keyboard ================= */

const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const top = topDialog();

  if (top === el.discOverlay) {
    const option = { 1: 'talk', 2: 'detention', 3: 'principal', 4: 'zap' }[k];
    if (option) { e.preventDefault(); chooseDiscipline(option); }
    else if (k === 'escape') { e.preventDefault(); closeDiscipline(); }
    return;
  }
  if (top === el.pauseOverlay) {
    // some browsers deliver the Esc that released pointer lock (and paused) as a key press too
    const justPausedByEsc = performance.now() - pausedByUnlockAt < 400;
    if ((k === 'escape' && !justPausedByEsc) || k === 'p') { e.preventDefault(); setPaused(false); }
    return;
  }
  if (top) return; // start / end screens: their buttons handle Enter and Space

  if (!running) return;
  if (MOVEMENT_KEYS.has(k)) {
    keys[k] = true;
    if (k.startsWith('arrow')) e.preventDefault();
    return;
  }
  if (e.repeat) return;
  switch (k) {
    case 'e': primaryAction(); break;
    case 'f': disciplineAction(); break;
    case 'r': toggleSeatChart(true); break; // keyboard users land on the chart's first seat
    case 'q': askRollCall(); break;
    case 'p': setPaused(true); break;
    case 'escape':
      if (seatChartOpen) setSeatChart(false);
      else if (performance.now() - pausedByUnlockAt > 400) setPaused(true);
      break;
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ================= aiming and context ================= */

const tmpV = new THREE.Vector3();
let aim = { studentId: null, cardId: null };

function nearestCard() {
  const a = game.attendance;
  if (game.phase !== 'attendance' || a.holding) return null;
  let best = null, bestScore = INTERACT_COS;
  for (const id of a.remaining) {
    const d = tmpV.copy(world.cards[id].position).sub(camera.position);
    const dist = d.length();
    if (dist >= INTERACT_RANGE) continue;
    const dot = d.normalize().dot(camForward);
    if (dot > bestScore) { bestScore = dot; best = id; }
  }
  return best;
}

function nearestStudent() {
  let best = null, bestScore = INTERACT_COS;
  for (const s of STUDENTS) {
    const st = game.students[s.id];
    const head = world.students[s.id].userData.headWorld;
    if (st.removed || !head) continue;
    const d = tmpV.copy(head).sub(camera.position);
    const dist = d.length();
    if (dist >= INTERACT_RANGE) continue;
    const dot = d.normalize().dot(camForward);
    if (dot > bestScore) { bestScore = dot; best = s.id; }
  }
  return best;
}

function currentContext() {
  if (!game || !running || game.phase === 'over') return null;
  const id = aim.studentId;
  if (seatChartOpen && id) return { kind: 'swap', id };
  if (aim.cardId) return { kind: 'pickup', id: aim.cardId };
  if (!id) return null;
  const st = game.students[id];
  if (st.active && R.canMisbehave(game, id)) return { kind: 'help', id };
  if (game.phase === 'attendance' && game.attendance.holding) return { kind: 'give', id };
  if (R.disciplineEligibility(game, id).ok) return { kind: 'caught', id };
  return { kind: st.detained ? 'detained' : 'calm', id };
}

function primaryAction() {
  if (!running || frozen()) return;
  const ctx = currentContext();
  if (!ctx) return;
  switch (ctx.kind) {
    case 'swap': pickSeat(ctx.id); break;
    case 'pickup': R.pickupCard(game, ctx.id); break;
    case 'give': R.deliverCard(game, ctx.id); break;
    case 'help': R.help(game, ctx.id); break;
    case 'caught': openDiscipline(ctx.id); break;
    default: break;
  }
  drainEvents();
}

function disciplineAction() {
  if (!running || frozen()) return;
  const ctx = currentContext();
  if (!ctx || !['help', 'caught', 'calm', 'detained', 'give', 'swap'].includes(ctx.kind)) return;
  openDiscipline(ctx.id);
}

/* ================= rule events -> log and effects ================= */

function drainEvents() {
  if (!game) return;
  const events = game.events.splice(0);
  for (const e of events) handleEvent(e);
}

function handleEvent(e) {
  const n = e.id ? name(e.id) : '';
  switch (e.type) {
    case 'activate': pushLog(t('students.' + e.id + '.active')); break;
    case 'nearlyLost': pushLog(t('log.nearlyLost', { name: n })); break;
    case 'eggedOn': pushLog(t('log.eggedOn', { name: n, friend: name(e.friendId) })); break;
    case 'cardPicked': pushLog(t('log.cardPicked', { name: name(e.id) })); world.cards[e.id].mesh.visible = false; break;
    case 'cardDelivered':
      pushLog(t('log.cardDelivered', { name: n }));
      flashPose(e.id, 'hand', 1.2);
      break;
    case 'wrongStudent':
      pushLog(t('log.wrongStudent', { name: n, held: name(e.heldId) }));
      flashPose(e.id, 'shake', 0.8);
      break;
    case 'cardResolvedByOffice':
      pushLog(t('log.cardResolvedByOffice', { name: n }));
      world.cards[e.id].mesh.visible = false;
      break;
    case 'attendanceComplete': pushLog(t('log.attendanceComplete')); break;
    case 'rollCall': showRollCallAnswer(e.id); break;
    case 'help':
      if (e.result === 'warned') pushLog(t('students.' + e.id + '.warn'));
      else if (e.result === 'missed') pushLog(t('log.helpMissed', { name: n }));
      else if (e.result === 'calmed') pushLog(t('students.' + e.id + '.calm'));
      break;
    case 'talk': pushLog(t(e.stillActive ? 'log.talkPartial' : 'log.talk', { name: n })); break;
    case 'detention': pushLog(t('log.detention', { name: n })); renderSeatChart(); break;
    case 'principal': startPrincipal(e.id); renderSeatChart(); break;
    case 'zap':
      pushLog(t('log.zap', { name: n }));
      zapVisual(e.id);
      if (e.setOffId) pushLog(t('log.zapSetOff', { name: name(e.setOffId) }));
      break;
    case 'swap': onSwap(e); break;
    case 'throwWindup': pushLog(t('log.throwWindup', { name: n })); break;
    case 'throwLaunched': launchProjectile(e.id); break;
    case 'throwCancelled': clearProjectile(); pushLog(t('log.throwCancelled', { name: n })); break;
    case 'hit':
      clearProjectile();
      hitFlash();
      pushLog(t('log.hit', { name: n }));
      if (e.first) pushLog(t('log.hitFirst'));
      break;
    case 'caught':
      clearProjectile();
      pushLog(t('log.caught', { name: n }));
      openDiscipline(e.id);
      break;
    case 'over': endRound(e.outcome); break;
    default: break;
  }
}

/* ================= students: poses, seats, tags ================= */

// Where a seated student's group goes so that their hips rest on the chair of `seat`.
function seatTarget(group, seat) {
  const p = seatPosition(seat);
  const o = group.userData.seatOffset;
  return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
}

function placeInSeat(group, seat) {
  const p = seatTarget(group, seat);
  group.position.set(p.x, p.y, p.z);
}

const flashPoses = {}; // id -> {kind, until}
function flashPose(id, kind, seconds) {
  flashPoses[id] = { kind, until: performance.now() / 1000 + seconds };
}

function onSwap(e) {
  const now = performance.now() / 1000;
  for (const id of [e.a, e.b]) {
    const g = world.students[id];
    const to = seatTarget(g, game.seats[id]);
    g.userData.seatAnim = { fromX: g.position.x, fromZ: g.position.z, toX: to.x, toZ: to.z, t0: now, dur: 0.6 };
  }
  if (game.students[e.b].removed) pushLog(t('log.moveToEmpty', { a: name(e.a) }));
  else if (game.students[e.a].removed) pushLog(t('log.moveToEmpty', { a: name(e.b) }));
  else pushLog(t('log.swap', { a: name(e.a), b: name(e.b) }));
  for (const [a, b] of e.separated) pushLog(t('log.swapSeparated', { a: name(a), b: name(b) }));
  for (const [a, b] of e.together) pushLog(t('log.swapTogether', { a: name(a), b: name(b) }));
  renderSeatChart();
}

function poseStateFor(s, st, now) {
  const f = flashPoses[s.id];
  if (f && now < f.until) return { kind: f.kind };
  if (game.throw && game.throw.id === s.id && game.throw.phase === 'windup') return { kind: 'throwing' };
  if (st.detained) return { kind: 'detained' };
  if (st.active) return { kind: 'active', type: s.type, argueReady: s.type === 'argue' && R.argueReady(game, s.id) };
  return { kind: 'calm' };
}

function updateStudents(now) {
  for (const s of STUDENTS) {
    const g = world.students[s.id];
    const st = game.students[s.id];
    const beingMarchedOut = principalSeq && principalSeq.id === s.id;
    if (st.removed && !beingMarchedOut) {
      g.visible = false;
      g.userData.headWorld = null;
      continue;
    }
    g.visible = true;
    if (!beingMarchedOut) {
      const an = g.userData.seatAnim;
      if (an) {
        const k = Math.min(1, (now - an.t0) / an.dur);
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        g.position.x = an.fromX + (an.toX - an.fromX) * ease;
        g.position.z = an.fromZ + (an.toZ - an.fromZ) * ease;
        if (k >= 1) delete g.userData.seatAnim;
      } else {
        placeInSeat(g, game.seats[s.id]);
        if (st.active && st.escalation >= 75) g.position.x += Math.sin(now * 20) * 0.02;
      }
      poseCharacter(g, poseStateFor(s, st, now), now);
    }
    g.updateMatrixWorld(true);
    const head = g.userData.parts.head;
    g.userData.headWorld = head ? head.getWorldPosition(g.userData.headWorld || new THREE.Vector3()) : null;
  }
}

const tagEls = {};
const RING_R = 18, RING_C = 2 * Math.PI * RING_R;
function buildTags() {
  el.studentLayer.textContent = '';
  for (const s of STUDENTS) {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML =
      '<div class="ring-wrap"><svg class="ring" width="44" height="44" viewBox="0 0 44 44">' +
      '<circle class="track" cx="22" cy="22" r="' + RING_R + '" fill="none" stroke-width="4"></circle>' +
      '<circle class="fill" cx="22" cy="22" r="' + RING_R + '" fill="none" stroke-width="4" stroke-dasharray="' + RING_C + '" stroke-dashoffset="' + RING_C + '"></circle>' +
      '</svg><div class="icon"></div></div><div class="name"></div><div class="note"></div>';
    tag.querySelector('.icon').textContent = ICON[s.type];
    tag.querySelector('.name').textContent = s.name;
    el.studentLayer.appendChild(tag);
    tagEls[s.id] = { tag, fill: tag.querySelector('.ring .fill'), note: tag.querySelector('.note') };
  }
}

function project(worldPos) {
  const p = tmpV.copy(worldPos).project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * el.stage.clientWidth,
    y: (-p.y * 0.5 + 0.5) * el.stage.clientHeight,
    onScreen: p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05,
  };
}

function updateTags() {
  for (const s of STUDENTS) {
    const { tag, fill, note } = tagEls[s.id];
    const st = game.students[s.id];
    const head = world.students[s.id].userData.headWorld;
    const targeted = aim.studentId === s.id;
    const show = running && head && !st.removed && (targeted || (st.active && R.canMisbehave(game, s.id)));
    const pos = show ? project(head) : null;
    if (!show || !pos.onScreen) { tag.classList.remove('show'); continue; }
    tag.classList.add('show');
    tag.classList.toggle('target', targeted);
    tag.classList.toggle('calm', !st.active);
    tag.style.left = pos.x - 22 + 'px';
    tag.style.top = pos.y - 100 + 'px';
    const pct = st.active ? Math.min(100, st.escalation) : 0;
    fill.setAttribute('stroke-dashoffset', String(RING_C - (pct / 100) * RING_C));
    fill.style.stroke = pct >= 75 ? 'var(--marker-red-bright)' : pct >= 40 ? 'var(--pencil-yellow)' : 'var(--calm-green-bright)';
    tag.classList.toggle('critical', pct >= 75);
    tag.classList.toggle('ready', st.active && s.type === 'argue' && R.argueReady(game, s.id));
    const friend = st.active ? R.adjacentFriend(game, s.id) : null;
    note.textContent = friend ? t('prompt.friendNear', { name: name(friend) }) : '';
    note.classList.toggle('on', !!friend);
  }
}

/* ================= prompt and action buttons ================= */

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function keyedLabel(node, key, text) {
  node.textContent = '';
  if (key && !isTouch) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    node.append(kbd);
  }
  node.append(document.createTextNode(text));
}

let lastPromptKey = '';
function renderPrompt(parts) {
  const sig = JSON.stringify(parts) + isTouch;
  if (sig === lastPromptKey) return;
  lastPromptKey = sig;
  el.prompt.textContent = '';
  // one line per action, so a long hint never wraps into the middle of the next action
  for (const part of parts) {
    const line = document.createElement('span');
    line.className = 'promptLine';
    keyedLabel(line, part.key, part.text);
    el.prompt.append(line);
  }
  el.prompt.classList.toggle('show', parts.length > 0);
}

function helpPromptText(id) {
  const cfg = R.studentConfig(game, id);
  const n = name(id);
  if (cfg.type === 'phone') return t(R.phoneWarned(game, id) ? 'prompt.helpPhoneSecond' : 'prompt.helpPhoneFirst', { name: n });
  if (cfg.type === 'argue') return t(R.argueReady(game, id) ? 'prompt.helpArgueReady' : 'prompt.helpArgueWait', { name: n });
  return t('prompt.help', { name: n });
}

function updatePromptAndActions() {
  const ctx = running && !frozen() ? currentContext() : null;
  const parts = [];
  let primary = null;
  let showDiscipline = false;
  if (ctx) {
    const n = name(ctx.id);
    switch (ctx.kind) {
      case 'pickup':
        parts.push({ key: 'E', text: t('prompt.pickUp', { name: name(ctx.id) }) });
        primary = t('actions.pickUp');
        break;
      case 'give':
        parts.push({ key: 'E', text: t('prompt.give', { held: name(game.attendance.holding), name: n }) });
        primary = t('actions.give');
        break;
      case 'help':
        parts.push({ key: 'E', text: helpPromptText(ctx.id) });
        parts.push({ key: 'F', text: t('prompt.discipline', { name: n }) });
        primary = t('actions.help') + ' ' + n;
        showDiscipline = true;
        break;
      case 'caught':
        parts.push({ key: 'F', text: t('prompt.discipline', { name: n }) });
        showDiscipline = true;
        break;
      case 'swap':
        parts.push({ key: 'E', text: seatFirst ? t('prompt.swapWith', { first: name(seatFirst), name: n }) : t('prompt.swapPick', { name: n }) });
        primary = t('actions.swap') + ' ' + n;
        break;
      case 'detained':
        parts.push({ key: null, text: t('prompt.detainedStudent', { name: n }) });
        break;
      default:
        parts.push({ key: null, text: t('prompt.calmStudent', { name: n }) });
    }
  }
  renderPrompt(parts);
  el.crosshair.classList.toggle('target', !!ctx && ctx.kind !== 'calm' && ctx.kind !== 'detained');

  el.actPrimary.hidden = !primary;
  if (primary && el.actPrimary.dataset.label !== primary) {
    el.actPrimary.dataset.label = primary;
    keyedLabel(el.actPrimary, 'E', primary);
  }
  el.actDiscipline.hidden = !showDiscipline;
  if (showDiscipline) {
    const label = t('actions.discipline');
    if (el.actDiscipline.dataset.label !== label + isTouch) {
      el.actDiscipline.dataset.label = label + isTouch;
      keyedLabel(el.actDiscipline, 'F', label);
    }
  }
  const canAsk = running && !frozen() && R.canRollCall(game);
  el.actRollCall.hidden = !canAsk;
  if (canAsk) {
    const label = t('rollCall.button', { name: name(game.attendance.holding) });
    if (el.actRollCall.dataset.label !== label + isTouch) {
      el.actRollCall.dataset.label = label + isTouch;
      keyedLabel(el.actRollCall, 'Q', label);
    }
  }
  el.actSeats.hidden = !running;
  const seatsLabel = t('actions.seats');
  if (el.actSeats.dataset.label !== seatsLabel + isTouch) {
    el.actSeats.dataset.label = seatsLabel + isTouch;
    keyedLabel(el.actSeats, 'R', seatsLabel);
  }
  el.actSeats.setAttribute('aria-pressed', String(seatChartOpen));
}

for (const [btn, fn] of [
  [el.actPrimary, primaryAction],
  [el.actDiscipline, disciplineAction],
  [el.actRollCall, askRollCall],
  [el.actSeats, () => toggleSeatChart(false)],
]) {
  btn.addEventListener('click', fn);
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
}

/* ================= attendance panel and roll call ================= */

let attSig = '';
function updateAttendancePanel() {
  const a = game && running && game.phase === 'attendance' && !seatChartOpen ? game.attendance : null;
  el.attPanel.hidden = !a;
  if (!a) return;
  const sig = [a.holding, a.remaining.length, speech && speech.answer].join('|');
  if (sig === attSig) return;
  attSig = sig;
  if (!a.holding) {
    const n = a.remaining.length;
    setText(el.attQuestion, t('attendance.cardsLeft', { count: n, cards: plural(n, 'attendance.card', 'attendance.cards') }));
    setText(el.attHint, t('attendance.goToBoard'));
  } else {
    setText(el.attQuestion, t('attendance.carrying', { name: name(a.holding) }));
    setText(el.attHint, t('attendance.findStudent', { name: name(a.holding) }));
  }
  const answer = speech && speech.answer && a.holding === speech.id ? speech.answer : '';
  el.attAnswer.hidden = !answer;
  setText(el.attAnswer, answer);
}

function relativeDirection(worldPos) {
  const dx = worldPos.x - player.x, dz = worldPos.z - player.z;
  const f = dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw);
  const r = dx * Math.cos(player.yaw) + dz * -Math.sin(player.yaw);
  return Math.atan2(r, f); // 0 = straight ahead, +PI/2 = right, +-PI = behind
}

function directionWords(angle) {
  const a = Math.abs(angle) * 180 / Math.PI;
  const side = angle >= 0 ? 'Right' : 'Left';
  if (a < 25) return t('where.ahead');
  if (a < 70) return t('where.ahead' + side);
  if (a < 110) return t('where.' + side.toLowerCase());
  if (a < 155) return t('where.behind' + side);
  return t('where.behind');
}

function askRollCall() {
  if (!running || frozen()) return;
  R.rollCall(game);
  drainEvents();
}

function showRollCallAnswer(id) {
  const lines = lookup('rollCall.lines') || [];
  let line = lines[Math.floor(Math.random() * lines.length)] || '';
  if (lines.length > 1 && line === lastRollLine) line = lines[(lines.indexOf(line) + 1) % lines.length];
  lastRollLine = line;
  const g = world.students[id];
  const where = directionWords(relativeDirection(g.userData.headWorld || g.position));
  speech = { id, until: performance.now() / 1000 + 9, answer: t('attendance.answered', { name: name(id), where, line }) };
  pushLog(speech.answer);
  el.bubbleText.textContent = line;
}

function updateSpeech(now) {
  if (!speech || now > speech.until || !running) {
    speech = null;
    el.speechBubble.hidden = true;
    el.dirArrow.hidden = true;
    return;
  }
  const head = world.students[speech.id].userData.headWorld;
  if (!head) return;
  const pos = project(tmpV.copy(head).add(new THREE.Vector3(0, 0.3, 0)));
  const safe = freeArea();
  if (seatChartOpen) {
    // the chart covers the middle of the screen; the answer stays readable in the log
    el.speechBubble.hidden = true;
    el.dirArrow.hidden = true;
  } else if (pos.onScreen) {
    el.dirArrow.hidden = true;
    el.speechBubble.hidden = false;
    // keep the whole bubble on screen and below the HUD; the tail still points at the speaker
    const bw = el.speechBubble.offsetWidth, bh = el.speechBubble.offsetHeight;
    const x = Math.max(safe.left + bw / 2, Math.min(safe.right - bw / 2, pos.x));
    const y = Math.max(safe.top + bh, pos.y);
    el.speechBubble.style.left = x + 'px';
    el.speechBubble.style.top = y + 'px';
    const tail = Math.max(-(bw / 2 - 16), Math.min(bw / 2 - 16, pos.x - x));
    el.speechBubble.style.setProperty('--tail', tail + 'px');
  } else {
    el.speechBubble.hidden = true;
    // an arrow at the edge of the free play area, pointing toward the student
    const ang = relativeDirection(head);
    const dx = Math.sin(ang), dy = -Math.cos(ang);
    const cx = (safe.left + safe.right) / 2, cy = (safe.top + safe.bottom) / 2;
    const hx = Math.max(0, (safe.right - safe.left) / 2 - 26), hy = Math.max(0, (safe.bottom - safe.top) / 2 - 26);
    const k = Math.min(dx ? hx / Math.abs(dx) : Infinity, dy ? hy / Math.abs(dy) : Infinity);
    el.dirArrow.hidden = false;
    el.dirArrow.style.left = cx + dx * k + 'px';
    el.dirArrow.style.top = cy + dy * k + 'px';
    el.dirArrowGlyph.style.display = 'inline-block';
    el.dirArrowGlyph.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
  }
}

// The part of the stage not covered by HUD panels (top band, attendance panel, seating chart,
// log and buttons), in stage pixels. Floating hints are kept inside it.
function freeArea() {
  const stage = el.stage.getBoundingClientRect();
  const margin = 8;
  let top = 0, bottom = stage.height;
  for (const node of [document.getElementById('hud'), el.attPanel, el.banner, el.seatChart]) {
    if (node.hidden || !node.offsetParent) continue;
    const r = node.getBoundingClientRect();
    if (r.height) top = Math.max(top, r.bottom - stage.top);
  }
  for (const node of [el.log, el.actions]) {
    if (!node.offsetParent) continue;
    const r = node.getBoundingClientRect();
    if (r.height) bottom = Math.min(bottom, r.top - stage.top);
  }
  if (bottom - top < 80) bottom = Math.min(stage.height, top + 80);
  return { left: margin, right: stage.width - margin, top: top + margin, bottom: bottom - margin };
}

/* ================= seating chart ================= */

const friendColor = {};
STUDENTS.forEach((s) => {
  if (!s.friend || friendColor[s.id]) return;
  const color = FRIEND_COLORS[Object.keys(friendColor).length / 2 % FRIEND_COLORS.length];
  friendColor[s.id] = color;
  friendColor[s.friend] = color;
});

function renderSeatChart() {
  if (!game || !seatChartOpen) return;
  const hadFocus = el.seatGrid.contains(document.activeElement) ? document.activeElement.dataset.seat : null;
  el.seatGrid.textContent = '';
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const id = STUDENTS.map((s) => s.id).find((sid) => game.seats[sid].row === row && game.seats[sid].col === col);
      const st = game.students[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seat';
      btn.dataset.seat = row + '-' + col;
      btn.dataset.id = id;
      if (st.removed) {
        btn.classList.add('empty');
        btn.textContent = t('seating.empty');
        btn.disabled = !seatFirst;
      } else {
        btn.textContent = name(id);
        if (friendColor[id]) btn.style.setProperty('--friend', friendColor[id]);
        const note = R.adjacentFriend(game, id) ? t('seating.together') : '';
        if (note) {
          const small = document.createElement('span');
          small.className = 'seatNote';
          small.textContent = note;
          btn.append(small);
        }
      }
      btn.classList.toggle('selected', seatFirst === id);
      btn.setAttribute('aria-pressed', String(seatFirst === id));
      btn.addEventListener('click', () => pickSeat(id));
      el.seatGrid.append(btn);
    }
  }
  if (hadFocus) {
    const again = el.seatGrid.querySelector('[data-seat="' + hadFocus + '"]');
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
  el.banner.hidden = !seatFirst;
  if (seatFirst) el.banner.textContent = t('seating.picked', { name: name(seatFirst) });
}

function setSeatChart(open, focusFirst = false) {
  if (open && (!running || frozen())) return;
  seatChartOpen = open;
  seatFirst = null;
  el.seatChart.hidden = !open;
  el.banner.hidden = true;
  attSig = '';
  if (open) {
    releaseLook();
    stopHoverLook();
    renderSeatChart();
    if (focusFirst) {
      const first = el.seatGrid.querySelector('button:not([disabled])');
      if (first) first.focus({ preventScroll: true });
    }
  } else if (el.seatChart.contains(document.activeElement)) {
    el.canvas.focus({ preventScroll: true });
  }
}

function toggleSeatChart(focusFirst = false) {
  setSeatChart(!seatChartOpen, focusFirst);
}

function pickSeat(id) {
  if (!running || frozen()) return;
  if (!seatFirst) {
    if (game.students[id].removed) return;
    seatFirst = id;
  } else if (seatFirst === id) {
    seatFirst = null;
  } else {
    R.swapSeats(game, seatFirst, id);
    seatFirst = null;
    drainEvents();
  }
  renderSeatChart();
}
el.seatClose.addEventListener('click', () => setSeatChart(false));

/* ================= discipline ================= */

function openDiscipline(id) {
  if (!running || principalSeq) return;
  const ok = R.disciplineEligibility(game, id);
  if (!ok.ok) {
    if (ok.reason === 'calm') pushLog(t('log.notEligible', { name: name(id) }));
    else if (ok.reason === 'detained') pushLog(t('log.detainedAlready', { name: name(id) }));
    return;
  }
  disciplineTarget = id;
  const menu = R.disciplineMenu(game, id);
  const tu = game.tuning;
  el.discName.textContent = name(id);
  discNotes.talk.textContent = t('discipline.talkNote', { calm: tu.talkCalm });
  discNotes.detention.textContent = menu.detention.left > 0
    ? t('discipline.detentionNote', { bump: tu.detentionClassBump, left: menu.detention.left, max: tu.detentionsPerPeriod })
    : t('discipline.detentionNoneLeft');
  discNotes.principal.textContent = menu.principal.left > 0
    ? t('discipline.principalNote', { calm: tu.principalClassCalm, left: menu.principal.left, max: tu.principalCallsPerPeriod, points: tu.report.principal })
    : t('discipline.principalNoneLeft');
  discNotes.zap.textContent = menu.zap.cooldown > 0
    ? t('discipline.zapCooling', { seconds: Math.ceil(menu.zap.cooldown) })
    : t('discipline.zapNote', { cooldown: tu.zapCooldown });
  for (const option of R.DISCIPLINE_OPTIONS) discButtons[option].disabled = !menu[option].available;
  releaseLook();
  stopHoverLook();
  openDialog(el.discOverlay);
}

function closeDiscipline() {
  if (disciplineTarget === null) return;
  disciplineTarget = null;
  closeDialog(el.discOverlay);
  if (running) requestLook();
}

function chooseDiscipline(option) {
  if (disciplineTarget === null || discButtons[option].disabled) return;
  const id = disciplineTarget;
  if (!R.discipline(game, id, option)) return;
  closeDiscipline();
  drainEvents();
}
for (const option of R.DISCIPLINE_OPTIONS) discButtons[option].addEventListener('click', () => chooseDiscipline(option));
el.discCancel.addEventListener('click', closeDiscipline);

/* ================= effects ================= */

function restartAnimation(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function hitFlash() {
  restartAnimation(el.hitVignette, 'show');
  restartAnimation(el.stage, 'hit');
}

function zapVisual(id) {
  restartAnimation(el.flash, 'zap');
  const g = world.students[id];
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 2.7, 5), new THREE.MeshBasicMaterial({ color: 0xfff27a }));
  bolt.rotation.z = 0.16;
  bolt.position.set(g.position.x, 2.55, g.position.z);
  scene.add(bolt);
  setTimeout(() => {
    scene.remove(bolt);
    bolt.geometry.dispose();
    bolt.material.dispose();
  }, 350);
}

const projectileGeo = new THREE.SphereGeometry(0.045, 8, 6);
const projectileMat = new THREE.MeshStandardMaterial({ color: 0xf3ecd8 });
function launchProjectile(id) {
  clearProjectile();
  const g = world.students[id];
  const from = new THREE.Vector3();
  (g.userData.parts.hand || g.userData.parts.head).getWorldPosition(from);
  const mesh = new THREE.Mesh(projectileGeo, projectileMat);
  mesh.position.copy(from);
  scene.add(mesh);
  projectile = { mesh, from };
  el.threatCue.hidden = false;
}

function clearProjectile() {
  el.threatCue.hidden = true;
  if (!projectile) return;
  scene.remove(projectile.mesh);
  projectile = null;
}

function updateProjectile() {
  if (!projectile || !game.throw || game.throw.phase !== 'flight') return;
  const k = Math.min(1, game.throw.t / game.tuning.throwFlight);
  const to = new THREE.Vector3(player.x, EYE_HEIGHT - 0.08, player.z);
  projectile.mesh.position.lerpVectors(projectile.from, to, k);
  projectile.mesh.position.y += Math.sin(k * Math.PI) * 0.3;
}

/* ================= the principal ================= */

function startPrincipal(id) {
  pushLog(t('log.principal', { name: name(id) }));
  const g = world.students[id];
  principalSeq = { id, phase: 'waiting', t: 0, startX: g.position.x, startZ: g.position.z };
  if (world.principal) {
    beginPrincipalWalk();
    return;
  }
  pushLog(t('log.principalDelayed'));
  const seq = principalSeq;
  // A download that stalls must never freeze the class: after PRINCIPAL_WAIT_MS the student
  // goes to the office on their own, exactly as when the download fails outright.
  let settled = false;
  const giveUp = (err) => {
    if (settled || principalSeq !== seq) return;
    settled = true;
    console.warn('Principal model unavailable:', err);
    finishPrincipal('log.principalNoShow');
  };
  const timer = setTimeout(() => giveUp(new Error('timed out after ' + PRINCIPAL_WAIT_MS + ' ms')), PRINCIPAL_WAIT_MS);
  ensurePrincipal().then(() => {
    clearTimeout(timer);
    if (settled || principalSeq !== seq) return;
    settled = true;
    beginPrincipalWalk();
  }, (err) => {
    clearTimeout(timer);
    giveUp(err);
  });
}

function beginPrincipalWalk() {
  if (!principalSeq) return;
  const p = world.principal;
  p.visible = true;
  p.position.set(ROOM.doorX, 0, ROOM.backZ - 0.3);
  p.rotation.set(0, 0, 0);
  setWalking(p, true);
  principalSeq.phase = 'walkIn';
  principalSeq.t = 0;
}

function finishPrincipal(logKey = 'log.principalDone') {
  if (!principalSeq) return;
  const g = world.students[principalSeq.id];
  g.visible = false;
  g.rotation.z = 0;
  if (world.principal) {
    world.principal.visible = false;
    setWalking(world.principal, false);
  }
  pushLog(t(logKey, { name: name(principalSeq.id) }));
  principalSeq = null;
  if (running) requestLook();
}

function updatePrincipal(dt) {
  if (!principalSeq || principalSeq.phase === 'waiting' || paused) return;
  const seq = principalSeq;
  const p = world.principal;
  const g = world.students[seq.id];
  seq.t += dt;
  if (p.userData.parts.mixer) p.userData.parts.mixer.update(dt);
  const doorX = ROOM.doorX, doorZ = ROOM.backZ - 0.1;
  const standX = seq.startX, standZ = seq.startZ - 0.9;
  if (seq.phase === 'walkIn') {
    const k = Math.min(1, seq.t / 1.6);
    p.position.x = doorX + (standX - doorX) * k;
    p.position.z = ROOM.backZ - 0.3 + (standZ - (ROOM.backZ - 0.3)) * k;
    p.lookAt(g.position.x, p.position.y, g.position.z);
    if (k >= 1) { seq.phase = 'grab'; seq.t = 0; setWalking(p, false); }
  } else if (seq.phase === 'grab') {
    p.lookAt(g.position.x, p.position.y, g.position.z);
    if (seq.t > 0.5) { seq.phase = 'dragOut'; seq.t = 0; setWalking(p, true); }
  } else if (seq.phase === 'dragOut') {
    const k = Math.min(1, seq.t / 1.3);
    p.position.x = standX + (doorX - standX) * k;
    p.position.z = standZ + (doorZ - standZ) * k;
    p.lookAt(doorX, p.position.y, doorZ + 1);
    g.position.x = p.position.x;
    g.position.z = p.position.z + 0.15;
    g.rotation.z = Math.sin(k * Math.PI * 6) * 0.15;
    if (k >= 1) finishPrincipal();
  }
}

/* ================= HUD ================= */

function clockText(frac) {
  const startMin = 9 * 60 + 5, endMin = 9 * 60 + 50;
  const total = startMin + frac * (endMin - startMin);
  let h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  if (h > 12) h -= 12;
  return h + ':' + String(m).padStart(2, '0');
}

function updateHud() {
  const frac = game ? game.elapsed / game.tuning.period : 0;
  setText(el.clockValue, clockText(frac));
  el.clockFill.style.width = frac * 100 + '%';
  const c = game && running ? R.chaos(game) : 0;
  const pct = Math.round(c);
  setText(el.chaosValue, pct + '%');
  el.chaosFill.style.width = Math.min(100, c) + '%';
  el.chaosBadge.classList.toggle('mid', c >= 40 && c < 75);
  el.chaosBadge.classList.toggle('hot', c >= 75);
  if (el.chaosBadge.getAttribute('aria-valuenow') !== String(pct)) el.chaosBadge.setAttribute('aria-valuenow', String(pct));
  const left = game ? game.tuning.period - game.elapsed : Infinity;
  el.cabinet.classList.toggle('final-bell', running && left <= 15 && left > 0);
}

/* ================= pause, fullscreen, visibility ================= */

function setPaused(p) {
  if (!running || paused === p) return;
  paused = p;
  el.pauseBtn.firstElementChild.textContent = p ? '▶' : '⏸';
  const label = t(p ? 'hud.resume' : 'hud.pause');
  el.pauseBtn.setAttribute('aria-label', label);
  el.pauseBtn.title = label;
  for (const k in keys) keys[k] = false;
  if (p) {
    releaseLook();
    stopHoverLook();
    openDialog(el.pauseOverlay, el.resumeBtn);
  } else {
    closeDialog(el.pauseOverlay);
    requestLook();
  }
}
el.pauseBtn.addEventListener('click', () => setPaused(!paused));
el.resumeBtn.addEventListener('click', () => setPaused(false));
el.restartFromPause.addEventListener('click', () => {
  closeDialog(el.pauseOverlay);
  paused = false;
  startRound();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

el.fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    const req = el.cabinet.requestFullscreen ? el.cabinet.requestFullscreen() : el.cabinet.webkitRequestFullscreen ? el.cabinet.webkitRequestFullscreen() : null;
    if (req && req.catch) req.catch(() => { /* fullscreen unavailable: still playable windowed */ });
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
});
document.addEventListener('fullscreenchange', () => {
  const full = !!document.fullscreenElement;
  el.fullscreenBtn.firstElementChild.textContent = full ? '⤡' : '⛶';
  const label = t(full ? 'hud.exitFullscreen' : 'hud.fullscreen');
  el.fullscreenBtn.setAttribute('aria-label', label);
  el.fullscreenBtn.title = label;
});

/* ================= rounds ================= */

const GRADE_ORDER = ['A', 'B', 'C', 'D'];
function bestGrade() {
  try { return localStorage.getItem(BEST_GRADE_KEY); } catch { return null; }
}
function saveBestGrade(grade) {
  const prev = bestGrade();
  if (prev && GRADE_ORDER.indexOf(prev) <= GRADE_ORDER.indexOf(grade)) return;
  try { localStorage.setItem(BEST_GRADE_KEY, grade); } catch { /* storage unavailable */ }
}
function showBest() {
  el.bestStart.textContent = bestGrade() || t('start.bestNone');
}

function resetVisuals() {
  for (const s of STUDENTS) {
    const g = world.students[s.id];
    g.visible = true;
    g.rotation.set(0, Math.PI, 0);
    placeInSeat(g, s);
    delete g.userData.seatAnim;
    delete g.userData.spinYaw;
    world.cards[s.id].mesh.visible = true;
    delete flashPoses[s.id];
  }
  if (world.principal) world.principal.visible = false;
  clearProjectile();
  speech = null;
  el.speechBubble.hidden = true;
  el.dirArrow.hidden = true;
  el.log.textContent = '';
  seatChartOpen = false;
  seatFirst = null;
  el.seatChart.hidden = true;
  el.banner.hidden = true;
  principalSeq = null;
  attSig = '';
}

function startRound() {
  game = R.createGame();
  resetVisuals();
  player.x = 0;
  player.z = ROOM.backZ - 1.7;
  player.yaw = 0;
  player.pitch = -0.05;
  paused = false;
  disciplineTarget = null;
  running = true;
  for (const node of [el.startOverlay, el.endOverlay, el.pauseOverlay, el.discOverlay]) {
    if (!node.hidden) closeDialog(node);
  }
  el.canvas.focus({ preventScroll: true });
  pushLog(t('log.bell'));
  requestLook();
}

function endRound(outcome) {
  running = false;
  if (disciplineTarget !== null) { disciplineTarget = null; closeDialog(el.discOverlay); }
  if (!el.pauseOverlay.hidden) { paused = false; closeDialog(el.pauseOverlay); }
  seatChartOpen = false;
  el.seatChart.hidden = true;
  el.banner.hidden = true;
  el.attPanel.hidden = true;
  clearProjectile();
  releaseLook();
  el.cabinet.classList.remove('final-bell');

  const emoji = $('endEmoji'), kicker = $('endKicker'), title = $('endTitle'), text = $('endText');
  const c = game.counters;
  $('statInterventions').textContent = R.interventions(game);
  $('statChaos').textContent = Math.round(game.maxChaos) + '%';
  $('statHits').textContent = c.hits;
  $('statDetentions').textContent = c.detentions;
  $('statPrincipal').textContent = c.principalCalls;
  $('statZaps').textContent = c.zaps;
  const reportCard = $('reportCard');

  if (outcome.won) {
    const r = R.report(game);
    emoji.textContent = '🔔';
    kicker.textContent = t('end.wonKicker');
    title.textContent = t('end.wonTitle');
    const removed = R.removedStudents(game).map(name);
    const detained = R.detainedStudents(game).map(name);
    const sentences = [removed.length ? t('end.wonRemoved', { names: listNames(removed) }) : t('end.wonAllStayed')];
    if (detained.length === 1) {
      const who = STUDENTS.find((x) => x.id === R.detainedStudents(game)[0]);
      sentences.push(t('end.wonDetainedOne', { name: detained[0], possessive: t('pronoun.' + who.pronoun + '.possessive') }));
    } else if (detained.length) {
      sentences.push(t('end.wonDetainedMany', { names: listNames(detained) }));
    }
    if (c.hits) sentences.push(t('end.wonHits', { count: c.hits, hits: plural(c.hits, 'end.hit', 'end.hits') }));
    sentences.push(t('end.wonCoffee'));
    text.textContent = sentences.join(' ');
    reportCard.hidden = false;
    $('gradeValue').textContent = r.grade;
    const notes = $('gradeNotes');
    notes.textContent = '';
    const lines = r.deductions.length ? r.deductions.map((d) => t('end.deduction.' + d.kind, d)) : [t('end.gradeClean')];
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      notes.append(li);
    }
    saveBestGrade(r.grade);
    lastBestGrade = r.grade;
  } else if (outcome.reason === 'attendance') {
    emoji.textContent = '📋';
    kicker.textContent = t('end.lostAttendanceKicker');
    title.textContent = t('end.lostAttendanceTitle');
    text.textContent = t('end.lostAttendanceText', { count: outcome.unmarked, students: plural(outcome.unmarked, 'end.student', 'end.students') });
    reportCard.hidden = true;
  } else {
    const culprit = STUDENTS.find((s) => s.id === outcome.culpritId);
    const hurt = culprit.fail === 'HURT';
    emoji.textContent = hurt ? '🚑' : '🚪';
    kicker.textContent = t(hurt ? 'end.lostHurtKicker' : 'end.lostLeftKicker');
    title.textContent = t(hurt ? 'end.lostHurtTitle' : 'end.lostLeftTitle');
    text.textContent = t('students.' + culprit.id + '.fail');
    reportCard.hidden = true;
  }
  showBest();
  openDialog(el.endOverlay, el.restartBtn);
}

el.startBtn.addEventListener('click', startRound);
el.restartBtn.addEventListener('click', startRound);

/* ================= main loop ================= */

let lastT = null;
let cameraOverride = null; // test hook: look at the scene from anywhere
function frame(now) {
  requestAnimationFrame(frame);
  const nowS = now / 1000;
  const realDt = lastT === null ? 0 : Math.min(MAX_FRAME_DT, nowS - lastT);
  lastT = nowS;

  if (running && !frozen()) {
    // movement is integrated in short steps so it stays stable at any frame rate
    let left = Math.min(realDt, MAX_MOVE_DT);
    while (left > 1e-6) {
      const step = Math.min(MOVE_STEP, left);
      movePlayer(step);
      left -= step;
    }
  }
  syncCamera();
  if (cameraOverride) {
    camera.position.copy(cameraOverride.position);
    camera.lookAt(cameraOverride.target);
    camera.updateMatrixWorld(true);
  }
  const facingBoard = player.z < ROOM.frontZ + 3.2 && camForward.z < -0.8;

  if (game) {
    if (running && !frozen()) {
      // the rules advance by real elapsed time, so the period lasts the same on any machine
      R.tick(game, realDt, { facingBoard });
    }
    drainEvents();
    updatePrincipal(Math.min(realDt, MAX_MOVE_DT)); // a cut-scene: never skip ahead, even on a stalled frame
    updateStudents(nowS);
    aim = running ? { studentId: nearestStudent(), cardId: nearestCard() } : { studentId: null, cardId: null };
    updateProjectile();
    updateTags();
    updatePromptAndActions();
    updateAttendancePanel();
    updateSpeech(nowS);
  }
  updateHud();
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

/* ================= start-up ================= */

async function init() {
  applyStaticStrings(document);
  setTouch(window.matchMedia('(pointer: coarse)').matches);
  renderControlsLists();
  if (boot.blocked) return;
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader || !THREE.SkeletonUtils) {
    boot.fail(new Error('three.js did not load'));
    return;
  }
  try {
    createRenderer();
  } catch (err) {
    console.error('WebGL renderer could not be created:', err);
    boot.blocked = true;
    boot.show('noWebgl');
    return;
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(el.stage);
  observer.observe(document.getElementById('hud'));
  try {
    await buildWorld();
  } catch (err) {
    boot.fail(err);
    return;
  }
  buildTags();
  game = R.createGame();
  syncCamera();
  boot.ready();
  showBest();
  openDialog(el.startOverlay, el.startBtn);
  requestAnimationFrame(frame);
  // fetch the principal in the background once the classroom is up
  setTimeout(() => ensurePrincipal().catch(() => { /* retried when first needed */ }), 1500);
  if (TEST_MODE) exposeTestHooks();
}

/* ================= test hooks (only with ?test in the URL) ================= */

function exposeTestHooks() {
  window.__substitute = {
    THREE,
    rules: R,
    tuning: TUNING,
    get game() { return game; },
    get running() { return running; },
    get paused() { return paused; },
    get seatChartOpen() { return seatChartOpen; },
    get disciplineTarget() { return disciplineTarget; },
    player,
    world,
    camera,
    get scene() { return scene; },
    context: currentContext,
    // run the rules forward as if `seconds` of unpaused play had passed
    fastForward(seconds, view = {}) {
      const step = 1 / 20;
      for (let s = 0; s < seconds && game.phase !== 'over'; s += step) R.tick(game, step, view);
      drainEvents();
    },
    // stand the teacher somewhere, looking at a world point
    lookAt(x, y, z, fromX, fromZ) {
      player.x = fromX;
      player.z = fromZ;
      const dx = x - fromX, dz = z - fromZ, dy = y - EYE_HEIGHT;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    faceOffsets() {
      const out = {};
      for (const s of STUDENTS) out[s.id] = faceOffsetFromHead(world.students[s.id]);
      if (world.principal) out.principal = faceOffsetFromHead(world.principal);
      return out;
    },
    headForward: (id) => headForward(world.students[id]).toArray(),
    ensurePrincipal,
    // pass null to hand the camera back to the player
    setCameraOverride(pos, target) {
      cameraOverride = pos ? { position: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) } : null;
    },
    setStrings(table) {
      setStrings(table);
      applyStaticStrings(document);
      renderControlsLists();
    },
    bestGrade: () => lastBestGrade,
  };
}

init().catch((err) => boot.fail(err));

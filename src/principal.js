// The principal's visit: he walks in, collects the student and marches them out.
import { t } from './strings.js';
import { S, name } from './session.js';
import { ROOM } from './scene.js';
import { partsOf, setWalking } from './characters.js';
import { ensurePrincipal, world } from './world.js';
import { pushLog } from './log.js';
import { requestLook } from './pointer.js';

const PRINCIPAL_WAIT_MS = 8000; // longest the class waits for the principal's model to arrive

/** @param {string} id the student he collects */
export function startPrincipal(id) {
  pushLog(t('log.principal', { name: name(id) }));
  const g = world.students[id];
  S.principalSeq = { id, phase: 'waiting', t: 0, startX: g.position.x, startZ: g.position.z };
  if (world.principal) {
    beginPrincipalWalk();
    return;
  }
  pushLog(t('log.principalDelayed'));
  const seq = S.principalSeq;
  // A download that stalls must never freeze the class: after PRINCIPAL_WAIT_MS the student
  // goes to the office on their own, exactly as when the download fails outright.
  let settled = false;
  /** @param {unknown} err */
  const giveUp = (err) => {
    if (settled || S.principalSeq !== seq) return;
    settled = true;
    console.warn('Principal model unavailable:', err);
    finishPrincipal('log.principalNoShow');
  };
  const timer = setTimeout(() => giveUp(new Error('timed out after ' + PRINCIPAL_WAIT_MS + ' ms')), PRINCIPAL_WAIT_MS);
  ensurePrincipal().then(() => {
    clearTimeout(timer);
    if (settled || S.principalSeq !== seq) return;
    settled = true;
    beginPrincipalWalk();
  }, (err) => {
    clearTimeout(timer);
    giveUp(err);
  });
}

function beginPrincipalWalk() {
  if (!S.principalSeq) return;
  const p = world.principal;
  if (!p) {
    finishPrincipal('log.principalNoShow');
    return;
  }
  p.visible = true;
  p.position.set(ROOM.doorX, 0, ROOM.backZ - 0.3);
  p.rotation.set(0, 0, 0);
  setWalking(p, true);
  S.principalSeq.phase = 'walkIn';
  S.principalSeq.t = 0;
}

function finishPrincipal(logKey = 'log.principalDone') {
  const seq = S.principalSeq;
  if (!seq) return;
  const g = world.students[seq.id];
  g.visible = false;
  g.rotation.z = 0;
  if (world.principal) {
    world.principal.visible = false;
    setWalking(world.principal, false);
  }
  pushLog(t(logKey, { name: name(seq.id) }));
  S.principalSeq = null;
  if (S.running) requestLook();
}

/** @param {number} dt */
export function updatePrincipal(dt) {
  const seq = S.principalSeq;
  const p = world.principal;
  // he only walks once his model is here (the visit waits for it, or goes on without him)
  if (!seq || !p || seq.phase === 'waiting' || S.paused) return;
  const g = world.students[seq.id];
  seq.t += dt;
  partsOf(p).mixer.update(dt);
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

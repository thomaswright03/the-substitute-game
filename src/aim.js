// What the teacher is looking at, and what the main action (E) and discipline (F) do with it.
import * as THREE from 'three';
import { STUDENTS } from './data.js';
import * as R from './rules.js';
import { S, frozen } from './session.js';
import { camera, world } from './world.js';
import { camForward } from './player.js';
import { drainEvents } from './events.js';
import { pickSeat } from './seating.js';
import { openDiscipline } from './discipline.js';

const INTERACT_RANGE = 3.3;
const INTERACT_COS = 0.82;
const tmpV = new THREE.Vector3();

function nearestCard() {
  const a = S.game.attendance;
  if (S.game.phase !== 'attendance' || a.holding) return null;
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
    const st = S.game.students[s.id];
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

export function updateAim() {
  S.aim.studentId = S.running ? nearestStudent() : null;
  S.aim.cardId = S.running ? nearestCard() : null;
}

// What E / F would act on right now, or null. The same object is reused on every call (this
// runs every frame), so read it straight away.
const context = { kind: '', id: '' };
function ctx(kind, id) {
  context.kind = kind;
  context.id = id;
  return context;
}

export function currentContext() {
  const game = S.game;
  if (!game || !S.running || game.phase === 'over') return null;
  const id = S.aim.studentId;
  if (S.seatChartOpen && id) return ctx('swap', id);
  if (S.aim.cardId) return ctx('pickup', S.aim.cardId);
  if (!id) return null;
  const st = game.students[id];
  if (st.active && R.canMisbehave(game, id)) return ctx('help', id);
  if (game.phase === 'attendance' && game.attendance.holding) return ctx('give', id);
  if (R.disciplineEligibility(game, id).ok) return ctx('caught', id);
  return ctx(st.detained ? 'detained' : 'calm', id);
}

export function primaryAction() {
  if (!S.running || frozen()) return;
  const ctx = currentContext();
  if (!ctx) return;
  switch (ctx.kind) {
    case 'swap': pickSeat(ctx.id); break;
    case 'pickup': R.pickupCard(S.game, ctx.id); break;
    case 'give': R.deliverCard(S.game, ctx.id); break;
    case 'help': R.help(S.game, ctx.id); break;
    case 'caught': openDiscipline(ctx.id); break;
    default: break;
  }
  drainEvents();
}

export function disciplineAction() {
  if (!S.running || frozen()) return;
  const ctx = currentContext();
  if (!ctx || !['help', 'caught', 'calm', 'detained', 'give', 'swap'].includes(ctx.kind)) return;
  openDiscipline(ctx.id);
}

// Turns the rules' events into log lines, poses and effects.
import { t } from './strings.js';
import { S, name } from './session.js';
import { flashPose, stereoPan, world } from './world.js';
import { pushLog } from './log.js';
import { showRollCallAnswer } from './rollcall.js';
import { onSwap, renderSeatChart } from './seating.js';
import { openDiscipline } from './discipline.js';
import { clearProjectile, hitFlash, launchProjectile, zapVisual } from './effects.js';
import { startPrincipal } from './principal.js';
import { endRound } from './round.js';
import { play } from './audio.js';
import { on } from './bus.js';
import { studentReacts } from './shout.js';
import { STUDENTS } from './data.js';

/** @type {Record<string, string>} how each student acts up, for what they say when they start */
const BEHAVIOUR = Object.fromEntries(STUDENTS.map((s) => [s.id, s.type]));

// Player actions ask for their events to be handled at once (see bus.js).
export function setupEvents() {
  on('rulesChanged', drainEvents);
}

export function drainEvents() {
  const events = S.game.events.splice(0);
  for (const e of events) handleEvent(e);
}

/** @param {import('./rules.js').GameEvent} e */
function handleEvent(e) {
  const n = 'id' in e ? name(e.id) : '';
  switch (e.type) {
    case 'activate':
      pushLog(t('students.' + e.id + '.active'));
      studentReacts(e.id, 'active', BEHAVIOUR[e.id]);
      break;
    case 'nearlyLost': pushLog(t('log.nearlyLost', { name: n })); studentReacts(e.id, 'nearlyLost'); break;
    case 'eggedOn': pushLog(t('log.eggedOn', { name: n, friend: name(e.friendId) })); break;
    case 'cardPicked':
      pushLog(t('log.cardPicked', { name: n }));
      world.cards[e.id].mesh.visible = false;
      break;
    case 'cardDelivered':
      pushLog(t('log.cardDelivered', { name: n }));
      flashPose(e.id, 'hand', 1.2);
      studentReacts(e.id, 'delivered');
      break;
    case 'wrongStudent':
      pushLog(t('log.wrongStudent', { name: n, held: name(e.heldId) }));
      flashPose(e.id, 'shake', 0.8);
      studentReacts(e.id, 'wrongStudent');
      break;
    case 'cardResolvedByOffice':
      pushLog(t('log.cardResolvedByOffice', { name: n }));
      world.cards[e.id].mesh.visible = false;
      break;
    case 'attendanceComplete': pushLog(t('log.attendanceComplete')); break;
    case 'rollCall': showRollCallAnswer(e.id); break;
    case 'help':
      if (e.result === 'warned') {
        pushLog(t('students.' + e.id + '.warn'));
        studentReacts(e.id, 'warn');
      } else if (e.result === 'missed') pushLog(t('log.helpMissed', { name: n }));
      else if (e.result === 'calmed') {
        pushLog(t('students.' + e.id + '.calm'));
        studentReacts(e.id, 'calm');
      }
      break;
    // a stern talking-to gets a grunt and a sigh
    case 'talk': pushLog(t(e.stillActive ? 'log.talkPartial' : 'log.talk', { name: n })); studentReacts(e.id, 'talk'); break;
    case 'detention': pushLog(t('log.detention', { name: n })); renderSeatChart(); studentReacts(e.id, 'detention'); break;
    case 'principal': play('knock'); startPrincipal(e.id); renderSeatChart(); studentReacts(e.id, 'principal'); break;
    case 'zap':
      pushLog(t('log.zap', { name: n }));
      play('zap');
      studentReacts(e.id, 'zap');
      zapVisual(e.id);
      if (e.setOffId) pushLog(t('log.zapSetOff', { name: name(e.setOffId) }));
      break;
    case 'swap': onSwap(e); break;
    case 'throwWindup':
      play('windup', { pan: stereoPan(world.students[e.id].position) });
      pushLog(t('log.throwWindup', { name: n }));
      break;
    case 'throwLaunched': launchProjectile(e.id); break;
    case 'throwCancelled': clearProjectile(); pushLog(t('log.throwCancelled', { name: n })); break;
    case 'hit':
      clearProjectile();
      play('hit');
      hitFlash();
      pushLog(t('log.hit', { name: n }));
      studentReacts(e.id, 'hit');
      if (e.first) pushLog(t('log.hitFirst'));
      break;
    case 'caught':
      clearProjectile();
      play('caught');
      pushLog(t('log.caught', { name: n }));
      studentReacts(e.id, 'caught');
      openDiscipline(e.id);
      break;
    case 'over':
      // the bell only rings when time runs out; a student storming off ends the period early
      if (e.outcome.reason !== 'student') play('bell', { long: true });
      endRound(e.outcome);
      break;
    default: break;
  }
}

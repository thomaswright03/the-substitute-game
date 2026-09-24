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

// Player actions ask for their events to be handled at once (see bus.js).
export function setupEvents() {
  on('rulesChanged', drainEvents);
}

export function drainEvents() {
  if (!S.game) return;
  const events = S.game.events.splice(0);
  for (const e of events) handleEvent(e);
}

/** @param {import('./rules.js').GameEvent} e */
function handleEvent(e) {
  const n = 'id' in e ? name(e.id) : '';
  switch (e.type) {
    case 'activate': pushLog(t('students.' + e.id + '.active')); break;
    case 'nearlyLost': pushLog(t('log.nearlyLost', { name: n })); break;
    case 'eggedOn': pushLog(t('log.eggedOn', { name: n, friend: name(e.friendId) })); break;
    case 'cardPicked':
      pushLog(t('log.cardPicked', { name: n }));
      world.cards[e.id].mesh.visible = false;
      break;
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
    case 'principal': play('knock'); startPrincipal(e.id); renderSeatChart(); break;
    case 'zap':
      pushLog(t('log.zap', { name: n }));
      play('zap');
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
      if (e.first) pushLog(t('log.hitFirst'));
      break;
    case 'caught':
      clearProjectile();
      play('caught');
      pushLog(t('log.caught', { name: n }));
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

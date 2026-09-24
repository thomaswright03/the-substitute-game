// The discipline menu (F): four options, each with its cost shown before you choose.
import * as R from './rules.js';
import { t } from './strings.js';
import { $, el } from './dom.js';
import { S, name } from './session.js';
import { openDialog, closeDialog } from './dialogs.js';
import { pushLog } from './log.js';
import { releaseLook, requestLook, stopHoverLook } from './pointer.js';
import { emit } from './bus.js';

const buttons = {
  talk: $('discTalk'), detention: $('discDetention'), principal: $('discPrincipal'), zap: $('discZap'),
};
const notes = {
  talk: $('discTalkNote'), detention: $('discDetentionNote'), principal: $('discPrincipalNote'), zap: $('discZapNote'),
};

export function openDiscipline(id) {
  const game = S.game;
  if (!S.running || S.principalSeq) return;
  const ok = R.disciplineEligibility(game, id);
  if (ok.ok === false) {
    if (ok.reason === 'calm') pushLog(t('log.notEligible', { name: name(id) }));
    else if (ok.reason === 'detained') pushLog(t('log.detainedAlready', { name: name(id) }));
    return;
  }
  S.disciplineTarget = id;
  const menu = R.disciplineMenu(game, id);
  const tu = game.tuning;
  el.discName.textContent = name(id);
  notes.talk.textContent = t('discipline.talkNote', { calm: tu.talkCalm });
  notes.detention.textContent = menu.detention.left > 0
    ? t('discipline.detentionNote', { bump: tu.detentionClassBump, left: menu.detention.left, max: tu.detentionsPerPeriod })
    : t('discipline.detentionNoneLeft');
  notes.principal.textContent = menu.principal.left > 0
    ? t('discipline.principalNote', { calm: tu.principalClassCalm, left: menu.principal.left, max: tu.principalCallsPerPeriod, points: tu.report.principal })
    : t('discipline.principalNoneLeft');
  notes.zap.textContent = menu.zap.cooldown > 0
    ? t('discipline.zapCooling', { seconds: Math.ceil(menu.zap.cooldown) })
    : t('discipline.zapNote', { cooldown: tu.zapCooldown });
  for (const option of R.DISCIPLINE_OPTIONS) buttons[option].disabled = !menu[option].available;
  releaseLook();
  stopHoverLook();
  openDialog(el.discOverlay);
}

export function closeDiscipline() {
  if (S.disciplineTarget === null) return;
  S.disciplineTarget = null;
  closeDialog(el.discOverlay);
  if (S.running) requestLook();
}

export function chooseDiscipline(option) {
  if (S.disciplineTarget === null || buttons[option].disabled) return;
  const id = S.disciplineTarget;
  if (!R.discipline(S.game, id, option)) return;
  closeDiscipline();
  emit('rulesChanged');
}

export function setupDiscipline() {
  for (const option of R.DISCIPLINE_OPTIONS) buttons[option].addEventListener('click', () => chooseDiscipline(option));
  el.discCancel.addEventListener('click', closeDiscipline);
}

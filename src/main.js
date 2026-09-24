// The Substitute: start-up and the frame loop. The rules live in rules.js; the modules
// imported here turn them into a 3D classroom you can walk around in.
import './three-setup.js';
import * as R from './rules.js';
import { applyStaticStrings, t } from './strings.js';
import { el } from './dom.js';
import { S, TEST_MODE, frozen } from './session.js';
import { buildWorld, camera, createRenderer, ensurePrincipal, render, resizeRenderer, updateStudents } from './world.js';
import { facingBoard, stepPlayer, syncCamera } from './player.js';
import { setupDialogs, openDialog } from './dialogs.js';
import { renderControlsLists, setTouch, setupInput } from './input.js';
import { updateAim } from './aim.js';
import { drainEvents } from './events.js';
import {
  buildTags, setupActionButtons, updateAttendancePanel, updateHud, updatePromptAndActions, updateTags,
} from './hud.js';
import { updateSpeech } from './rollcall.js';
import { setupSeating } from './seating.js';
import { setupDiscipline } from './discipline.js';
import { updateProjectile } from './effects.js';
import { updatePrincipal } from './principal.js';
import { setupRound, showBest } from './round.js';
import { applyCameraOverride, exposeTestHooks } from './testhooks.js';

const boot = window.SubstituteBoot || { blocked: false, progress() {}, fail() {}, ready() {}, show() {} };
const MAX_FRAME_DT = 5; // longer gaps are stalls (a hidden tab pauses the game), not play time
const CUTSCENE_MAX_DT = 0.25; // the principal's walk never skips ahead, even on a stalled frame
const SCRIPTS_SHARE = 0.12; // share of the first download taken by the page and its scripts

function measureHud() {
  el.stage.style.setProperty('--hud-bottom', el.hud.offsetTop + el.hud.offsetHeight + 'px');
}

function resize() {
  measureHud();
  resizeRenderer(Math.max(1, el.stage.clientWidth), Math.max(1, el.stage.clientHeight));
}

let lastT = null;
function frame(now) {
  requestAnimationFrame(frame);
  const nowS = now / 1000;
  const realDt = lastT === null ? 0 : Math.min(MAX_FRAME_DT, nowS - lastT);
  lastT = nowS;

  if (S.running && !frozen()) stepPlayer(realDt);
  syncCamera(camera);
  applyCameraOverride();

  const game = S.game;
  if (game) {
    if (S.running && !frozen()) {
      // the rules advance by real elapsed time, so the period lasts the same on any machine
      R.tick(game, realDt, { facingBoard: facingBoard() });
    }
    drainEvents();
    updatePrincipal(Math.min(realDt, CUTSCENE_MAX_DT));
    updateStudents(nowS);
    updateAim();
    updateProjectile();
    updateTags();
    updatePromptAndActions();
    updateAttendancePanel();
    updateSpeech(nowS);
  }
  updateHud();
  render();
}

async function init() {
  applyStaticStrings(document);
  setTouch(window.matchMedia('(pointer: coarse)').matches);
  renderControlsLists();
  if (boot.blocked) return;
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
  observer.observe(el.hud);
  try {
    // by the time this runs, three.js and the game scripts (about an eighth of the bytes) are in
    await buildWorld((f) => {
      const overall = SCRIPTS_SHARE + f * (1 - SCRIPTS_SHARE);
      boot.progress(overall, t('boot.loadingDetail', { percent: Math.round(overall * 100) }));
    });
  } catch (err) {
    boot.fail(err);
    return;
  }
  setupDialogs();
  setupInput();
  setupActionButtons();
  setupSeating();
  setupDiscipline();
  setupRound();
  buildTags();
  S.game = R.createGame();
  syncCamera(camera);
  boot.ready();
  showBest();
  openDialog(el.startOverlay, el.startBtn);
  requestAnimationFrame(frame);
  // fetch the principal in the background once the classroom is up
  setTimeout(() => ensurePrincipal().catch(() => { /* retried when first needed */ }), 1500);
  if (TEST_MODE) exposeTestHooks();
}

init().catch((err) => boot.fail(err));

// Graphics quality: the player's setting (Automatic, or one fixed level), and the automatic
// step-down for a device that can't keep up. The rules run on real time, so a device drawing a
// few frames a second still ends the period on time while the player can barely move; trading
// the look for speed keeps the game playable there.
import { QUALITY_LEVELS, setQualityLevel } from './world.js';

const QUALITY_KEY = 'substitute.quality';
export const QUALITY_SETTINGS = ['auto', ...QUALITY_LEVELS.map((q) => q.name)];

// Automatic steps down one level when frames have taken longer than SLOW_FRAME_MS (under 20 fps)
// for SLOW_FOR_S seconds, and waits SETTLE_S after each step before judging again (a change
// recompiles shaders, and the first frames after it are slow for that reason alone).
const SLOW_FRAME_MS = 50;
const SLOW_FOR_S = 3;
const SETTLE_S = 2;

let setting = 'auto';
let autoLevel = 0;
let slowFor = 0;
let settle = SETTLE_S;
let frameMs = 0; // frame time, smoothed over about half a second
const listeners = [];

function load() {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (QUALITY_SETTINGS.includes(saved)) return saved;
  } catch { /* storage blocked: Automatic */ }
  return 'auto';
}

export function qualitySetting() {
  return setting;
}

// The level drawn now: the fixed one, or where Automatic has got to.
export function qualityLevel() {
  return setting === 'auto' ? autoLevel : QUALITY_SETTINGS.indexOf(setting) - 1;
}

export function onQualityChange(fn) {
  listeners.push(fn);
}

function restartJudging() {
  slowFor = 0;
  frameMs = 0;
  settle = SETTLE_S;
}

function apply() {
  setQualityLevel(qualityLevel());
  restartJudging();
  for (const fn of listeners) fn();
}

export function setQualitySetting(value) {
  if (!QUALITY_SETTINGS.includes(value)) return;
  setting = value;
  // choosing Automatic again starts from the full look and finds its level afresh
  if (value === 'auto') autoLevel = 0;
  try { localStorage.setItem(QUALITY_KEY, value); } catch { /* lasts for this visit */ }
  apply();
}

export function setupQuality() {
  setting = load();
  autoLevel = 0;
  apply();
  // the first frame back from a hidden tab carries the whole time away: don't judge by it
  document.addEventListener('visibilitychange', restartJudging);
}

// Called every frame with the time it took, in seconds.
export function noteFrame(dt) {
  if (setting !== 'auto' || autoLevel >= QUALITY_LEVELS.length - 1 || document.hidden) return;
  if (settle > 0) {
    settle -= dt;
    return;
  }
  frameMs += (dt * 1000 - frameMs) * (1 - Math.exp(-dt / 0.5));
  slowFor = frameMs > SLOW_FRAME_MS ? slowFor + dt : 0;
  if (slowFor >= SLOW_FOR_S) {
    autoLevel++;
    apply();
  }
}

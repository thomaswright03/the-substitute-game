// Sound: short cues synthesised with the Web Audio API, so there are no audio files to download.
// Nothing is created until the player's first tap, click or key press (browsers keep audio
// suspended until then anyway). The mute switch and the volume are remembered between visits.

const PREFS_KEY = 'substitute.audio';
const DEFAULT_PREFS = { muted: false, volume: 0.7 };

let ctx = null;
let master = null;
let noiseBuffer = null;
const prefs = loadPrefs();
const listeners = [];

// The names of the cues played so far this session, newest last (for tests and diagnostics).
export const playedCues = [];

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return {
        muted: saved.muted === true,
        volume: Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : DEFAULT_PREFS.volume,
      };
    }
  } catch { /* storage blocked or corrupt: use the defaults */ }
  return { ...DEFAULT_PREFS };
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* storage blocked: the setting lasts for this visit only */ }
}

export function audioPrefs() {
  return { ...prefs };
}

export function onAudioPrefsChange(fn) {
  listeners.push(fn);
}

function applyPrefs() {
  if (master) master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, ctx.currentTime, 0.02);
  savePrefs();
  for (const fn of listeners) fn(audioPrefs());
}

export function setMuted(muted) {
  prefs.muted = !!muted;
  applyPrefs();
}

export function setVolume(volume) {
  prefs.volume = Math.min(1, Math.max(0, volume));
  if (prefs.volume > 0) prefs.muted = false;
  applyPrefs();
}

export function audioStarted() {
  return !!ctx;
}

// Creates (or wakes) the audio graph. Only ever called from a user gesture.
function unlock() {
  const Ctor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext; // older Safari
  if (!Ctor) return;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = prefs.muted ? 0 : prefs.volume;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* retried on the next gesture */ });
}

export function setupAudio() {
  const opts = { capture: true };
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
}

/* ---------------- building blocks ---------------- */

// A gain envelope: a fast rise to `peak`, held until `hold`, then an exponential fall.
function envelope(at, peak, attack, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}

function output(pan) {
  if (!pan || !ctx.createStereoPanner) return master;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  return p;
}

/**
 * @param {AudioNode} dest
 * @param {number} at
 * @param {{type?: OscillatorType, freq: number, to?: number, dur: number, peak?: number, attack?: number, hold?: number}} options
 */
function tone(dest, at, { type = 'sine', freq, to, dur, peak = 0.3, attack = 0.005, hold = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = envelope(at, peak, attack, hold, Math.max(0.01, dur - attack - hold));
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + dur + 0.05);
  return o;
}

/**
 * @param {AudioNode} dest
 * @param {number} at
 * @param {{dur: number, peak?: number, filter?: BiquadFilterType, freq?: number, to?: number, q?: number, attack?: number, hold?: number}} options
 */
function noise(dest, at, { dur, peak = 0.3, filter = 'bandpass', freq = 1000, to, q = 1, attack = 0.003, hold = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, at);
  if (to) f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = envelope(at, peak, attack, hold, Math.max(0.01, dur - attack - hold));
  src.connect(f).connect(g).connect(dest);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
}

/* ---------------- the cues ---------------- */

const CUES = {
  // an electric school bell: a metallic chord hammered about 22 times a second
  bell(dest, at, { long = false } = {}) {
    const dur = long ? 2.2 : 1.4;
    const hammer = ctx.createGain();
    hammer.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(hammer.gain);
    hammer.connect(dest);
    for (const [ratio, peak] of [[1, 0.22], [2.76, 0.1], [5.4, 0.05], [8.93, 0.025]]) {
      tone(hammer, at, { type: 'triangle', freq: 820 * ratio, dur, peak, attack: 0.01, hold: dur - 0.45 });
    }
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
  },
  // a student winding up to throw: a rising whoosh and a creak of the chair
  windup(dest, at) {
    noise(dest, at, { dur: 0.75, peak: 0.35, freq: 300, to: 1800, q: 2.5, attack: 0.35, hold: 0.15 });
    tone(dest, at + 0.05, { type: 'sawtooth', freq: 140, to: 95, dur: 0.25, peak: 0.05 });
  },
  // hit by a wad of paper: a soft thump and a crumple
  hit(dest, at) {
    tone(dest, at, { freq: 150, to: 55, dur: 0.22, peak: 0.55 });
    noise(dest, at, { dur: 0.18, peak: 0.35, filter: 'lowpass', freq: 2500, to: 600 });
  },
  // caught it: a quick slap into the palm
  caught(dest, at) {
    noise(dest, at, { dur: 0.06, peak: 0.5, filter: 'highpass', freq: 1800, q: 0.7 });
    tone(dest, at, { type: 'triangle', freq: 520, to: 380, dur: 0.08, peak: 0.2 });
  },
  // the lightning zap: a falling buzz with crackle
  zap(dest, at) {
    tone(dest, at, { type: 'sawtooth', freq: 1400, to: 70, dur: 0.55, peak: 0.18 });
    tone(dest, at, { type: 'square', freq: 90, to: 60, dur: 0.45, peak: 0.06 });
    noise(dest, at, { dur: 0.5, peak: 0.25, filter: 'highpass', freq: 3000, q: 0.5 });
  },
  // the principal at the door: two knocks on wood
  knock(dest, at) {
    for (const dt of [0, 0.2]) {
      tone(dest, at + dt, { freq: 190, to: 120, dur: 0.12, peak: 0.6 });
      noise(dest, at + dt, { dur: 0.07, peak: 0.3, freq: 700, q: 3 });
    }
  },
  // the last seconds before the bell
  tick(dest, at) {
    tone(dest, at, { type: 'square', freq: 1250, dur: 0.05, peak: 0.08 });
  },
};

// Plays a cue. pan runs from -1 (hard left) to 1 (hard right). Before the first gesture, or
// when muted, this does nothing audible, but the cue is still recorded.
/**
 * Plays a cue: `pan` places it from -1 (left) to 1 (right); `long` is the end-of-period bell.
 * @param {string} name
 * @param {{pan?: number, long?: boolean}} [options]
 */
export function play(name, { pan = 0, ...opts } = {}) {
  playedCues.push(name);
  if (playedCues.length > 50) playedCues.shift();
  if (!ctx || ctx.state !== 'running' || prefs.muted || !CUES[name]) return;
  CUES[name](output(pan), ctx.currentTime + 0.01, opts);
}

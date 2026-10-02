// Sound: short cues synthesised with the Web Audio API, so there are no audio files to download.
// Nothing is created until the player's first tap, click or key press (browsers keep audio
// suspended until then anyway). The mute switch and the volume are remembered between visits.

const PREFS_KEY = 'substitute.audio';
const DEFAULT_PREFS = { muted: false, volume: 0.7 };

/** @typedef {{muted: boolean, volume: number}} AudioPrefs */

/**
 * The audio graph, once the first gesture has created it: the context, the master volume every
 * cue goes through, and a second of white noise the noisy cues filter.
 * @typedef {{ctx: AudioContext, master: GainNode, noise: AudioBuffer}} Engine
 */
/** @type {Engine | null} */
let engine = null;
const prefs = loadPrefs();
/** @type {((prefs: AudioPrefs) => void)[]} */
const listeners = [];

/** @type {string[]} The names of the cues played so far this session, newest last (for tests and diagnostics). */
export const playedCues = [];

/** @returns {AudioPrefs} */
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

/** @param {(prefs: AudioPrefs) => void} fn */
export function onAudioPrefsChange(fn) {
  listeners.push(fn);
}

function applyPrefs() {
  if (engine) engine.master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, engine.ctx.currentTime, 0.02);
  savePrefs();
  for (const fn of listeners) fn(audioPrefs());
}

/** @param {boolean} muted */
export function setMuted(muted) {
  prefs.muted = !!muted;
  applyPrefs();
}

/** @param {number} volume 0 to 1 */
export function setVolume(volume) {
  prefs.volume = Math.min(1, Math.max(0, volume));
  if (prefs.volume > 0) prefs.muted = false;
  applyPrefs();
}

export function audioStarted() {
  return !!engine;
}

// Creates (or wakes) the audio graph. Only ever called from a user gesture.
function unlock() {
  // older Safari has only the prefixed constructor
  /** @type {typeof AudioContext | undefined} */
  const Ctor = window.AudioContext || /** @type {{webkitAudioContext?: typeof AudioContext}} */ (window).webkitAudioContext;
  if (!Ctor) return;
  if (!engine) {
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = prefs.muted ? 0 : prefs.volume;
    master.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    engine = { ctx, master, noise };
  }
  if (engine.ctx.state === 'suspended') engine.ctx.resume().catch(() => { /* retried on the next gesture */ });
}

export function setupAudio() {
  const opts = { capture: true };
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
}

/* ---------------- building blocks ---------------- */

/**
 * A gain envelope: a fast rise to `peak`, held until `hold`, then an exponential fall.
 * @param {Engine} a
 * @param {number} at
 * @param {number} peak
 * @param {number} attack
 * @param {number} hold
 * @param {number} release
 */
function envelope(a, at, peak, attack, hold, release) {
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}

/**
 * @param {Engine} a
 * @param {number} pan
 * @returns {AudioNode}
 */
function output(a, pan) {
  if (!pan || !a.ctx.createStereoPanner) return a.master;
  const p = a.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(a.master);
  return p;
}

/**
 * @param {Engine} a
 * @param {AudioNode} dest
 * @param {number} at
 * @param {{type?: OscillatorType, freq: number, to?: number, dur: number, peak?: number, attack?: number, hold?: number}} options
 */
function tone(a, dest, at, { type = 'sine', freq, to, dur, peak = 0.3, attack = 0.005, hold = 0 }) {
  const o = a.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = envelope(a, at, peak, attack, hold, Math.max(0.01, dur - attack - hold));
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + dur + 0.05);
  return o;
}

/**
 * @param {Engine} a
 * @param {AudioNode} dest
 * @param {number} at
 * @param {{dur: number, peak?: number, filter?: BiquadFilterType, freq?: number, to?: number, q?: number, attack?: number, hold?: number}} options
 */
function noise(a, dest, at, { dur, peak = 0.3, filter = 'bandpass', freq = 1000, to, q = 1, attack = 0.003, hold = 0 }) {
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  src.loop = true;
  const f = a.ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, at);
  if (to) f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = envelope(a, at, peak, attack, hold, Math.max(0.01, dur - attack - hold));
  src.connect(f).connect(g).connect(dest);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
}

/* ---------------- the cues ---------------- */

/** @typedef {(a: Engine, dest: AudioNode, at: number, options: {long?: boolean}) => void} Cue */
/** @type {Record<string, Cue>} */
const CUES = {
  // an electric school bell: a metallic chord hammered about 22 times a second
  bell(a, dest, at, { long = false }) {
    const dur = long ? 2.2 : 1.4;
    const hammer = a.ctx.createGain();
    hammer.gain.value = 0.5;
    const lfo = a.ctx.createOscillator();
    lfo.frequency.value = 22;
    const depth = a.ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(hammer.gain);
    hammer.connect(dest);
    for (const [ratio, peak] of [[1, 0.22], [2.76, 0.1], [5.4, 0.05], [8.93, 0.025]]) {
      tone(a, hammer, at, { type: 'triangle', freq: 820 * ratio, dur, peak, attack: 0.01, hold: dur - 0.45 });
    }
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
  },
  // a student winding up to throw: a rising whoosh and a creak of the chair
  windup(a, dest, at) {
    noise(a, dest, at, { dur: 0.75, peak: 0.35, freq: 300, to: 1800, q: 2.5, attack: 0.35, hold: 0.15 });
    tone(a, dest, at + 0.05, { type: 'sawtooth', freq: 140, to: 95, dur: 0.25, peak: 0.05 });
  },
  // hit by a wad of paper: a soft thump and a crumple
  hit(a, dest, at) {
    tone(a, dest, at, { freq: 150, to: 55, dur: 0.22, peak: 0.55 });
    noise(a, dest, at, { dur: 0.18, peak: 0.35, filter: 'lowpass', freq: 2500, to: 600 });
  },
  // caught it: a quick slap into the palm
  caught(a, dest, at) {
    noise(a, dest, at, { dur: 0.06, peak: 0.5, filter: 'highpass', freq: 1800, q: 0.7 });
    tone(a, dest, at, { type: 'triangle', freq: 520, to: 380, dur: 0.08, peak: 0.2 });
  },
  // the lightning zap: a falling buzz with crackle
  zap(a, dest, at) {
    tone(a, dest, at, { type: 'sawtooth', freq: 1400, to: 70, dur: 0.55, peak: 0.18 });
    tone(a, dest, at, { type: 'square', freq: 90, to: 60, dur: 0.45, peak: 0.06 });
    noise(a, dest, at, { dur: 0.5, peak: 0.25, filter: 'highpass', freq: 3000, q: 0.5 });
  },
  // the principal at the door: two knocks on wood
  knock(a, dest, at) {
    for (const dt of [0, 0.2]) {
      tone(a, dest, at + dt, { freq: 190, to: 120, dur: 0.12, peak: 0.6 });
      noise(a, dest, at + dt, { dur: 0.07, peak: 0.3, freq: 700, q: 3 });
    }
  },
  // the last seconds before the bell
  tick(a, dest, at) {
    tone(a, dest, at, { type: 'square', freq: 1250, dur: 0.05, peak: 0.08 });
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
  const a = engine;
  if (!a || a.ctx.state !== 'running' || prefs.muted || !CUES[name]) return;
  CUES[name](a, output(a, pan), a.ctx.currentTime + 0.01, opts);
}

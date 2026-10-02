// The students' voices. A line a student says is played from a recording when it has one
// (clips.js: uploaded in the Voice studio, or shipped in assets/voices). Until it does, the
// browser's own speech voice reads it as a placeholder, and each student sounds different
// (their own voice where the device has several, and always their own pitch and speed). The mute
// switch silences all of it, and the "Student voices" setting turns off just the speaking.
import { STUDENTS } from './data.js';
import { audioPrefs, audioStarted, decodeAudio, onAudioPrefsChange, playBuffer } from './audio.js';
import { clipData, findClip, onClipsChange } from './clips.js';
import { currentLanguage } from './strings.js';

/**
 * How a student sounds: the speech voice's pitch (0 to 2, 1 normal) and speed (1 normal), and
 * the pitch in Hz of their grunts and sighs (see the vocal cues in audio.js).
 * @typedef {{pitch: number, rate: number, hz: number}} VoiceProfile
 */
/** @type {Record<string, VoiceProfile>} */
const VOICES = {
  dixieNormous: { pitch: 1.25, rate: 1.05, hz: 225 },
  benDover: { pitch: 0.95, rate: 1.12, hz: 128 },
  moeLester: { pitch: 0.7, rate: 0.98, hz: 104 },
  steve: { pitch: 1.05, rate: 0.9, hz: 138 },
  hughJass: { pitch: 0.82, rate: 1.18, hz: 116 },
  mikeHunt: { pitch: 1.05, rate: 0.82, hz: 200 },
  gabeIches: { pitch: 1.4, rate: 1.1, hz: 245 },
  mikeOxlong: { pitch: 1.6, rate: 1.2, hz: 262 },
};

const LOCALES = /** @type {Record<string, string>} */ ({ en: 'en-US', es: 'es-ES', fr: 'fr-FR' });
// names the common system and browser voices go by, to give girls and boys a fitting voice
const FEMALE = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|hazel|allison|ava|serena|kate|paulina|monica|m[oó]nica|amelie|am[eé]lie|audrey|marie|helena|laura|elvira|denise|jenny|aria|sonia|libby|google (us|uk) english female|espa[nñ]ol.*female/i;
const MALE = /\bmale\b|\bman\b|daniel|david|alex|fred|george|james|mark|thomas|jorge|diego|juan|carlos|pablo|alvaro|henri|paul|guy|ryan|google uk english male/i;

/**
 * Where a line's sound came from: a recording the player uploaded, a file in the game's
 * assets/voices folder, or the browser's speech voice.
 * @typedef {'upload' | 'file' | 'speech'} LineSource
 */
/** @type {{id: string, text: string, source: LineSource}[]} every line asked for, newest last (for tests and diagnostics) */
export const spokenLines = [];

/**
 * The line being said: how much it matters, whether it is still sounding, and how to cut it off.
 * @typedef {{priority: number, playing: () => boolean, stop: () => void}} Utterance
 */
/** @type {Utterance | null} */
let current = null;
/** @type {Map<string, Promise<AudioBuffer | null>>} decoded recordings, by recording and version */
const decoded = new Map();
/** @type {Map<string, SpeechSynthesisVoice | null> | null} each student's voice for the current language */
let cast = null;
let castLanguage = '';

function synth() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

// Gives each student a voice from those the device has for the language: girls get the voices
// that sound like women and boys the ones that sound like men, dealt out in turn so that friends
// don't share one. With fewer voices than students, pitch and speed still tell them apart.
function castVoices() {
  const s = synth();
  const lang = currentLanguage();
  if (cast && castLanguage === lang) return cast;
  cast = new Map();
  castLanguage = lang;
  const all = s ? s.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang)) : [];
  const local = all.filter((v) => v.localService);
  const voices = local.length ? local : all;
  const female = voices.filter((v) => FEMALE.test(v.name));
  const male = voices.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name));
  const counts = { he: 0, she: 0 };
  for (const st of STUDENTS) {
    const pool = st.pronoun === 'she' ? female : male;
    const list = pool.length ? pool : voices;
    const i = counts[st.pronoun]++;
    cast.set(st.id, list.length ? list[i % list.length] : null);
  }
  return cast;
}

/**
 * The recording decoded and ready to play (null when it can't be read).
 * @param {import('./clips.js').Clip} clip
 */
function bufferFor(clip) {
  const id = clip.source + ':' + clip.key + '@' + clip.version;
  let ready = decoded.get(id);
  if (!ready) {
    ready = clipData(clip).then((data) => (data ? decodeAudio(data) : null)).catch(() => null);
    decoded.set(id, ready);
  }
  return ready;
}

/** Cuts off the line being said, however it is being said. */
function stopCurrent() {
  const s = synth();
  if (current) current.stop();
  current = null;
  if (s && (s.speaking || s.pending)) s.cancel();
}

/**
 * Says a line with the browser's speech voice.
 * @param {string} id
 * @param {string} text
 * @param {number} priority
 * @param {boolean} yell
 */
function speakAloud(id, text, priority, yell) {
  const s = synth();
  if (!s) return false;
  const prefs = audioPrefs();
  const profile = VOICES[id] || { pitch: 1, rate: 1, hz: 130 };
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = LOCALES[currentLanguage()] || currentLanguage();
  const voice = castVoices().get(id);
  if (voice) utter.voice = voice;
  utter.pitch = Math.min(2, profile.pitch * (yell ? 1.12 : 1));
  utter.rate = profile.rate * (yell ? 1.12 : 1);
  utter.volume = prefs.volume;
  /** @type {Utterance} */
  const line = { priority, playing: () => s.speaking, stop() { /* speech is cancelled by stopCurrent */ } };
  utter.onend = utter.onerror = () => { if (current === line) current = null; };
  stopCurrent();
  s.cancel();
  current = line;
  s.speak(utter);
  return true;
}

/**
 * Plays a recording. While it is being decoded it counts as the line being said, so a newer line
 * can still replace it; if the file turns out to be unreadable the placeholder voice says it.
 * @param {string} id
 * @param {string} text
 * @param {import('./clips.js').Clip} clip
 * @param {{priority: number, yell: boolean, pan: number}} how
 */
function playRecording(id, text, clip, { priority, yell, pan }) {
  let ended = false;
  /** @type {AudioBufferSourceNode | null} */
  let source = null;
  /** @type {Utterance} */
  const line = {
    priority,
    playing: () => !ended,
    stop() {
      ended = true;
      if (source) {
        source.onended = null;
        try { source.stop(); } catch { /* it had already finished */ }
      }
    },
  };
  stopCurrent();
  current = line;
  bufferFor(clip).then((buffer) => {
    if (current !== line || ended) return;
    if (!buffer) {
      current = null;
      speakAloud(id, text, priority, yell);
      return;
    }
    source = playBuffer(buffer, { pan, onEnd: () => { ended = true; if (current === line) current = null; } });
    if (!source) { ended = true; current = null; }
  });
  return true;
}

/**
 * Says a student's line aloud. A line never cuts off a more important one that is still being
 * said (roll-call answers matter most); otherwise the newest line replaces the one in progress,
 * so the voices keep up with the class. With a `slot` (see clips.js) the student's recording of
 * that line plays if there is one; otherwise, or with `placeholder`, the speech voice reads it.
 * @param {string} id the student
 * @param {string} text
 * @param {{priority?: number, yell?: boolean, slot?: string | null, pan?: number, placeholder?: boolean}} [options]
 */
export function speak(id, text, { priority = 1, yell = false, slot = null, pan = 0, placeholder = false } = {}) {
  if (!text) return false;
  const clip = slot && !placeholder && audioStarted() ? findClip(currentLanguage(), id, slot) : null;
  spokenLines.push({ id, text, source: clip ? clip.source : 'speech' });
  if (spokenLines.length > 50) spokenLines.shift();
  const prefs = audioPrefs();
  if (prefs.muted || !prefs.voices || prefs.volume <= 0) return false;
  if (current && current.priority > priority && current.playing()) return false;
  if (clip) return playRecording(id, text, clip, { priority, yell, pan });
  return speakAloud(id, text, priority, yell);
}

/** Stops whatever is being said (pause, the end of a period, muting). */
export function silenceVoices() {
  stopCurrent();
}

/** @param {string} id */
export function voicePitch(id) {
  return (VOICES[id] || { hz: 130 }).hz;
}

export function setupVoices() {
  const s = synth();
  // the list of voices arrives after the page loads in some browsers
  if (s) s.addEventListener?.('voiceschanged', () => { cast = null; });
  onAudioPrefsChange((prefs) => { if (prefs.muted || !prefs.voices) silenceVoices(); });
  onClipsChange(() => decoded.clear());
}

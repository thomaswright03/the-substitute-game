// The students' voices: each line a student says is read aloud by the browser's own speech
// voices, and each student sounds different (their own voice where the device has several, and
// always their own pitch and speed). Nothing is downloaded. The mute switch silences them with
// every other sound, and the "Student voices" setting turns off just the speaking.
import { STUDENTS } from './data.js';
import { audioPrefs, onAudioPrefsChange } from './audio.js';
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

/** @type {{id: string, text: string}[]} every line asked for, newest last (for tests and diagnostics) */
export const spokenLines = [];

/** @type {{priority: number} | null} the line being spoken, while it is */
let current = null;
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
 * Says a student's line aloud. A line never cuts off a more important one that is still being
 * said (roll-call answers matter most); otherwise the newest line replaces the one in progress,
 * so the voices keep up with the class.
 * @param {string} id the student
 * @param {string} text
 * @param {{priority?: number, yell?: boolean}} [options]
 */
export function speak(id, text, { priority = 1, yell = false } = {}) {
  if (!text) return false;
  spokenLines.push({ id, text });
  if (spokenLines.length > 50) spokenLines.shift();
  const s = synth();
  const prefs = audioPrefs();
  if (!s || prefs.muted || !prefs.voices || prefs.volume <= 0) return false;
  if (current && current.priority > priority && s.speaking) return false;
  const profile = VOICES[id] || { pitch: 1, rate: 1, hz: 130 };
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = LOCALES[currentLanguage()] || currentLanguage();
  const voice = castVoices().get(id);
  if (voice) utter.voice = voice;
  utter.pitch = Math.min(2, profile.pitch * (yell ? 1.12 : 1));
  utter.rate = profile.rate * (yell ? 1.12 : 1);
  utter.volume = prefs.volume;
  const line = { priority };
  utter.onend = utter.onerror = () => { if (current === line) current = null; };
  s.cancel();
  current = line;
  s.speak(utter);
  return true;
}

/** Stops whatever is being said (pause, the end of a period, muting). */
export function silenceVoices() {
  current = null;
  const s = synth();
  if (s && (s.speaking || s.pending)) s.cancel();
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
}

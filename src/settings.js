// The player's settings on the start and pause screens, and the mute button in the HUD. Every
// copy of a control shows the same value.
import { audioPrefs, onAudioPrefsChange, setMuted, setVoices, setVolume } from './audio.js';
import { $, allInputs, allSelects } from './dom.js';
import { LANGUAGES, currentLanguage, onLanguageChange, setLanguage, t } from './strings.js';
import { DEFAULT_DIFFICULTY, isDifficulty } from './data.js';
import { QUALITY_SETTINGS, onQualityChange, qualityLevel, qualitySetting, setQualitySetting } from './quality.js';
import { QUALITY_LEVELS } from './world.js';

const DIFFICULTY_KEY = 'substitute.difficulty';
/** @typedef {import('./data.js').Difficulty} Difficulty */
/** @type {((value: Difficulty) => void)[]} */
const difficultyListeners = [];
/** @type {Difficulty | null} */
let current = null;

// The difficulty the next period is played at: the player's last choice, or Relaxed for a
// first visit.
/** @returns {Difficulty} */
export function difficulty() {
  if (current) return current;
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    if (isDifficulty(saved)) return saved;
  } catch { /* storage blocked: use the default */ }
  return DEFAULT_DIFFICULTY;
}

/** @param {(value: Difficulty) => void} fn */
export function onDifficultyChange(fn) {
  difficultyListeners.push(fn);
}

/** @param {string} value */
function setDifficulty(value) {
  if (!isDifficulty(value)) return;
  try {
    localStorage.setItem(DIFFICULTY_KEY, value);
  } catch { /* storage blocked: the choice lasts until the page is closed */ }
  current = value;
  for (const fn of difficultyListeners) fn(value);
}

/** @param {import('./audio.js').AudioPrefs} prefs */
function renderSound(prefs) {
  allInputs('[data-sound]').forEach((box) => { box.checked = !prefs.muted; });
  allInputs('[data-voices]').forEach((box) => {
    box.checked = prefs.voices;
    box.disabled = prefs.muted;
  });
  allInputs('[data-volume]').forEach((range) => {
    range.value = String(Math.round(prefs.volume * 100));
    range.disabled = prefs.muted;
  });
  const mute = $('muteBtn');
  mute.setAttribute('aria-pressed', String(prefs.muted));
  const icon = mute.querySelector('[data-sound-icon]');
  if (icon) icon.textContent = prefs.muted ? '🔇' : '🔊';
}

const LANGUAGE_KEY = 'substitute.language';

// The player's saved language, else the first of the browser's languages the game has.
function initialLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && Object.hasOwn(LANGUAGES, saved)) return saved;
  } catch { /* storage blocked: fall back to the browser's languages */ }
  for (const tag of navigator.languages || [navigator.language || 'en']) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (Object.hasOwn(LANGUAGES, code)) return code;
  }
  return 'en';
}

/** @param {string} code */
function chooseLanguage(code) {
  try {
    localStorage.setItem(LANGUAGE_KEY, code);
  } catch { /* storage blocked: the choice lasts until the page is closed */ }
  setLanguage(code);
}

/** @param {string} code */
function renderLanguage(code) {
  allSelects('[data-language]').forEach((select) => { select.value = code; });
}

// Called before anything draws text, so the page starts in the player's language.
export function setupLanguage() {
  allSelects('[data-language]').forEach((select) => {
    for (const [code, { name }] of Object.entries(LANGUAGES)) {
      const option = document.createElement('option');
      option.value = code;
      option.lang = code;
      option.textContent = name;
      select.append(option);
    }
    select.addEventListener('change', () => chooseLanguage(select.value));
  });
  onLanguageChange(renderLanguage);
  setLanguage(initialLanguage());
  renderLanguage(currentLanguage());
}

// The graphics choice on the start and pause screens. Automatic also says where it has got to.
function renderQuality() {
  const level = QUALITY_LEVELS[qualityLevel()].name;
  allSelects('[data-quality]').forEach((select) => {
    if (select.options.length !== QUALITY_SETTINGS.length) {
      select.textContent = '';
      for (const value of QUALITY_SETTINGS) {
        const option = document.createElement('option');
        option.value = value;
        select.append(option);
      }
    }
    for (const option of select.options) {
      option.textContent = option.value !== 'auto' ? t('settings.quality.' + option.value)
        : t('settings.quality.autoNow', { level: t('settings.quality.' + level) });
    }
    select.value = qualitySetting();
  });
}

export function setupSettings() {
  allInputs('[data-sound]').forEach((box) => {
    box.addEventListener('change', () => setMuted(!box.checked));
  });
  allInputs('[data-voices]').forEach((box) => {
    box.addEventListener('change', () => setVoices(box.checked));
  });
  allInputs('[data-volume]').forEach((range) => {
    range.addEventListener('input', () => setVolume(Number(range.value) / 100));
  });
  $('muteBtn').addEventListener('click', () => setMuted(!audioPrefs().muted));
  current = difficulty();
  allInputs('input[name="difficulty"]').forEach((radio) => {
    radio.checked = radio.value === current;
    radio.addEventListener('change', () => { if (radio.checked) setDifficulty(radio.value); });
  });
  onAudioPrefsChange(renderSound);
  renderSound(audioPrefs());
}

// After the renderer exists: applies the saved graphics choice and wires up its controls.
export function setupGraphicsSettings() {
  allSelects('[data-quality]').forEach((select) => {
    select.addEventListener('change', () => setQualitySetting(select.value));
  });
  onQualityChange(renderQuality);
  onLanguageChange(renderQuality);
  renderQuality();
}

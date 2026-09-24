// The player's settings on the start and pause screens, and the mute button in the HUD. Every
// copy of a control shows the same value.
import { audioPrefs, onAudioPrefsChange, setMuted, setVolume } from './audio.js';
import { $ } from './dom.js';
import { DEFAULT_DIFFICULTY, DIFFICULTY } from './data.js';

const DIFFICULTY_KEY = 'substitute.difficulty';
const difficultyListeners = [];
let current = null;

// The difficulty the next period is played at: the player's last choice, or Relaxed for a
// first visit.
export function difficulty() {
  if (current) return current;
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    if (DIFFICULTY[saved]) return saved;
  } catch { /* storage blocked: use the default */ }
  return DEFAULT_DIFFICULTY;
}

export function onDifficultyChange(fn) {
  difficultyListeners.push(fn);
}

function setDifficulty(value) {
  if (!DIFFICULTY[value]) return;
  try {
    localStorage.setItem(DIFFICULTY_KEY, value);
  } catch { /* storage blocked: the choice lasts until the page is closed */ }
  current = value;
  for (const fn of difficultyListeners) fn(value);
}

function renderSound(prefs) {
  document.querySelectorAll('[data-sound]').forEach((box) => { box.checked = !prefs.muted; });
  document.querySelectorAll('[data-volume]').forEach((range) => {
    range.value = String(Math.round(prefs.volume * 100));
    range.disabled = prefs.muted;
  });
  const mute = $('muteBtn');
  mute.setAttribute('aria-pressed', String(prefs.muted));
  mute.querySelector('[data-sound-icon]').textContent = prefs.muted ? '🔇' : '🔊';
}

export function setupSettings() {
  document.querySelectorAll('[data-sound]').forEach((box) => {
    box.addEventListener('change', () => setMuted(!box.checked));
  });
  document.querySelectorAll('[data-volume]').forEach((range) => {
    range.addEventListener('input', () => setVolume(Number(range.value) / 100));
  });
  $('muteBtn').addEventListener('click', () => setMuted(!audioPrefs().muted));
  current = difficulty();
  document.querySelectorAll('input[name="difficulty"]').forEach((radio) => {
    radio.checked = radio.value === current;
    radio.addEventListener('change', () => { if (radio.checked) setDifficulty(radio.value); });
  });
  onAudioPrefsChange(renderSound);
  renderSound(audioPrefs());
}

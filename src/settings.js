// The player's settings on the start and pause screens, and the mute button in the HUD. Every
// copy of a control shows the same value.
import { audioPrefs, onAudioPrefsChange, setMuted, setVolume } from './audio.js';
import { $ } from './dom.js';

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
  onAudioPrefsChange(renderSound);
  renderSound(audioPrefs());
}

// The Voice studio: every line a student says, with a button to play it, upload a recording of
// it, or take the recording away. Until a line has a recording the placeholder speech voice says it.
// Recordings are kept per language, and either for one student or for the whole class.
import { STUDENTS } from './data.js';
import {
  MAX_CLIP_BYTES, WHOLE_CLASS, findClip, lineCatalogue, onClipsChange, ownClip, recordedCount, removeAllClips, removeClip, saveClip, uploadsPersist,
} from './clips.js';
import { audioPrefs, decodeAudio, setMuted, setVoices } from './audio.js';
import { speak, silenceVoices } from './voice.js';
import { $ } from './dom.js';
import { name, studentNumber } from './session.js';
import { LANGUAGES, currentLanguage, onLanguageChange, t } from './strings.js';
import { onSheetOpen } from './sheets.js';

/** @type {string} whose lines are showing: a student's id, or WHOLE_CLASS */
let who = STUDENTS[0].id;
/** @type {string | null} the line whose upload button was pressed */
let uploadSlot = null;
/** @type {number | undefined} */
let clearTimer;
let clearArmed = false;
/** @type {Map<string, string>} the last problem with each line's upload, by slot */
const problems = new Map();

const tabs = () => $('studioTabs');
const lines = () => $('studioLines');
const picker = () => /** @type {HTMLInputElement} */ ($('studioFile', HTMLInputElement));

/** @param {string} id */
function whoName(id) {
  return id === WHOLE_CLASS ? t('studio.wholeClass') : name(id);
}

/** @param {string} text @param {string} [cls] @param {keyof HTMLElementTagNameMap} [tag] */
function node(text, cls, tag = 'span') {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * An icon button from the sprite, with a word next to it (hidden on narrow screens).
 * @param {string} icon
 * @param {string} label
 * @param {string} cls
 * @param {string} tool
 * @param {string} slot
 */
function toolButton(icon, label, cls, tool, slot) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toolBtn ' + cls;
  b.dataset.tool = tool;
  b.dataset.slot = slot;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-' + icon + '"></use></svg>';
  b.append(node(label));
  return b;
}

/** @param {number} seconds */
function duration(seconds) {
  const s = Math.max(1, Math.round(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ---------------- drawing ---------------- */

function focusTab() {
  const tab = tabs().querySelector('[aria-selected="true"]');
  if (tab instanceof HTMLElement) tab.focus();
}

function renderTabs() {
  const language = currentLanguage();
  tabs().textContent = '';
  for (const id of [WHOLE_CLASS, ...STUDENTS.map((s) => s.id)]) {
    const { own, total } = recordedCount(language, id);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'studioTab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(id === who));
    tab.tabIndex = id === who ? 0 : -1;
    tab.dataset.who = id === WHOLE_CLASS ? '' : String(studentNumber(id));
    tab.dataset.id = id;
    const dot = node('', 'dot');
    dot.setAttribute('aria-hidden', 'true');
    tab.append(dot, node(whoName(id)), node(own + '/' + total, '', 'small'));
    tab.addEventListener('click', () => { who = id; renderAll(); focusTab(); });
    tab.addEventListener('keydown', (e) => {
      const ids = [WHOLE_CLASS, ...STUDENTS.map((s) => s.id)];
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      who = ids[(ids.indexOf(id) + step + ids.length) % ids.length];
      renderAll();
      focusTab();
    });
    tabs().append(tab);
  }
}

function renderSummary() {
  const { own, total } = recordedCount(currentLanguage(), who);
  $('studioCount').textContent = t('studio.count', { own, total });
  $('studioMeter').style.width = (total ? (own / total) * 100 : 0) + '%';
  const clear = /** @type {HTMLButtonElement} */ ($('studioClear', HTMLButtonElement));
  const uploaded = lineCatalogue(who).some((g) => g.lines.some((l) => ownClip(currentLanguage(), who, l.slot)?.source === 'upload'));
  clear.disabled = !uploaded;
  if (!uploaded) disarmClear();
}

function renderNotice() {
  const box = $('studioNotice');
  box.textContent = '';
  const prefs = audioPrefs();
  if (prefs.muted || !prefs.voices) {
    box.append(node(t(prefs.muted ? 'studio.soundOff' : 'studio.voicesOff')));
    const on = document.createElement('button');
    on.type = 'button';
    on.className = 'btn secondary small';
    on.textContent = t('studio.turnOn');
    on.addEventListener('click', () => { if (prefs.muted) setMuted(false); setVoices(true); renderNotice(); });
    box.append(document.createElement('br'), on);
  } else if (!uploadsPersist()) {
    box.append(node(t('studio.noStorage')));
  }
  box.hidden = box.childNodes.length === 0;
}

function renderLines() {
  const language = currentLanguage();
  const root = lines();
  root.textContent = '';
  for (const group of lineCatalogue(who)) {
    const section = node('', 'lineGroup', 'section');
    const heading = node('', '', 'h3');
    const wholeClass = who === WHOLE_CLASS;
    const title = group.situation === 'active' && wholeClass
      ? t('studio.activeFor', { behaviour: t('studio.behaviour.' + group.behaviour) })
      : t('studio.situation.' + group.situation);
    const done = group.lines.filter((l) => ownClip(language, who, l.slot)).length;
    heading.append(node(title), node(done + '/' + group.lines.length));
    const list = node('', 'lineList', 'ul');
    for (const line of group.lines) list.append(lineRow(line));
    section.append(heading, list);
    root.append(section);
  }
}

/** @param {import('./clips.js').LineInfo} line */
function lineRow(line) {
  const language = currentLanguage();
  const own = ownClip(language, who, line.slot);
  const inherited = !own && who !== WHOLE_CLASS ? findClip(language, who, line.slot) : null;
  const row = /** @type {HTMLLIElement} */ (node('', 'lineRow', 'li'));
  row.dataset.slot = line.slot;
  row.classList.toggle('recorded', !!own);
  row.classList.toggle('inherited', !!inherited);
  row.append(node(line.text, 'lineText'));

  const status = node('', 'lineStatus');
  if (own) {
    status.append(node(t(own.source === 'upload' ? 'studio.yours' : 'studio.fromFiles'), own.source === 'upload' ? 'chip green' : 'chip blue'));
    status.append(node(own.name, 'fileName'));
    if (own.duration) status.append(node(duration(own.duration)));
  } else if (inherited) {
    status.append(node(t('studio.classVoice'), 'chip blue'));
  } else {
    status.append(node(t('studio.placeholder'), 'chip'));
  }
  row.append(status);

  const tools = node('', 'lineTools');
  tools.append(toolButton('play', t('studio.play'), 'play', 'play', line.slot));
  tools.append(toolButton('upload', t(own ? 'studio.replace' : 'studio.upload'), 'upload', 'upload', line.slot));
  if (own && own.source === 'upload') tools.append(toolButton('trash', t('studio.remove'), 'remove', 'remove', line.slot));
  row.append(tools);

  const problem = problems.get(line.slot);
  if (problem) {
    const err = node(problem, 'lineError');
    err.setAttribute('role', 'alert');
    row.append(err);
  }

  row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('dropping'); });
  row.addEventListener('dragleave', () => row.classList.remove('dropping'));
  row.addEventListener('drop', (/** @type {DragEvent} */ e) => {
    e.preventDefault();
    row.classList.remove('dropping');
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) void upload(line.slot, file);
  });
  return row;
}

function renderAll() {
  const keep = document.activeElement instanceof HTMLElement ? { slot: document.activeElement.dataset.slot, tool: document.activeElement.dataset.tool } : null;
  $('studioIntro').textContent = t('studio.intro', { language: LANGUAGES[currentLanguage()].name })
    + (who === WHOLE_CLASS ? ' ' + t('studio.wholeClassNote') : '');
  $('studioFolder').textContent = t('studio.folder');
  renderTabs();
  renderSummary();
  renderNotice();
  renderLines();
  if (keep && keep.slot) {
    /** @type {HTMLElement | null} */ (lines().querySelector('[data-slot="' + keep.slot + '"][data-tool="' + keep.tool + '"]'))?.focus({ preventScroll: true });
  }
}

/* ---------------- actions ---------------- */

/** @param {string} slot @returns {import('./clips.js').LineInfo | undefined} */
function lineOf(slot) {
  return lineCatalogue(who).flatMap((g) => g.lines).find((l) => l.slot === slot);
}

/** @param {string} slot */
function play(slot) {
  const line = lineOf(slot);
  if (!line) return;
  silenceVoices();
  speak(who, line.text, { priority: 3, slot });
}

/**
 * @param {string} slot
 * @param {File} file
 */
async function upload(slot, file) {
  problems.delete(slot);
  try {
    await saveClip(currentLanguage(), who, slot, file, async (data) => (await decodeAudio(data)).duration);
  } catch (err) {
    const reason = err instanceof Error ? err.message : '';
    problems.set(slot, t(reason === 'tooBig' ? 'studio.errTooBig' : reason === 'empty' ? 'studio.errEmpty' : 'studio.errUnreadable', { file: file.name, max: Math.round(MAX_CLIP_BYTES / 1048576) + ' MB' }));
    renderLines();
    return;
  }
  renderAll();
  /** @type {HTMLElement | null} */ (lines().querySelector('[data-slot="' + slot + '"][data-tool="play"]'))?.focus({ preventScroll: true });
}

function disarmClear() {
  clearArmed = false;
  clearTimeout(clearTimer);
  const label = $('studioClear').querySelector('span');
  if (label) label.textContent = t('studio.clear');
}

function clearAll() {
  const label = $('studioClear').querySelector('span');
  if (!clearArmed) {
    clearArmed = true;
    if (label) label.textContent = t('studio.clearSure');
    clearTimer = window.setTimeout(disarmClear, 4000);
    return;
  }
  disarmClear();
  void removeAllClips(currentLanguage(), who);
}

export function setupStudio() {
  onSheetOpen('studioOverlay', () => {
    problems.clear();
    renderAll();
  });
  const sheet = $('studioOverlay');
  sheet.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('button[data-tool]') : null;
    if (!(target instanceof HTMLButtonElement)) return;
    const slot = target.dataset.slot || '';
    if (target.dataset.tool === 'play') play(slot);
    else if (target.dataset.tool === 'upload') { uploadSlot = slot; picker().value = ''; picker().click(); }
    else if (target.dataset.tool === 'remove') void removeClip(currentLanguage(), who, slot);
  });
  picker().addEventListener('change', () => {
    const chosen = picker().files;
    const file = chosen ? chosen[0] : null;
    if (file && uploadSlot) void upload(uploadSlot, file);
  });
  $('studioClear').addEventListener('click', clearAll);
  const refresh = () => { if (!sheet.hidden) renderAll(); };
  onClipsChange(refresh);
  onLanguageChange(refresh);
  const observer = new MutationObserver(() => { if (sheet.hidden) silenceVoices(); });
  observer.observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
}

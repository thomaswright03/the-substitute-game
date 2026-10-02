// Recorded voice lines. Every line a student says can be given a recording of its own: until
// there is one, the browser's speech voice reads the line as a placeholder (voice.js).
//
// A recording belongs to a language, to a student (or to the whole class) and to one line. It
// comes from one of two places:
//   * an upload, made in the game's Voice studio and kept in this browser (IndexedDB), or
//   * a file in assets/voices/, listed in assets/voices/manifest.json (see scripts/voices.mjs).
// Among the recordings that fit a line, the student's own beats the whole class's, and an upload
// beats a file from the game's folder.
import { STUDENTS } from './data.js';
import { lookup } from './strings.js';

/** The pseudo-student that stands for every student who has no recording of their own. */
export const WHOLE_CLASS = 'all';
/** The biggest recording accepted, in bytes. */
export const MAX_CLIP_BYTES = 6 * 1024 * 1024;
/** The extensions scripts/voices.mjs picks up from the assets/voices folder. */
export const CLIP_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm', 'flac'];

const DB_NAME = 'substitute-voices';
const STORE = 'clips';
const MANIFEST_URL = 'assets/voices/manifest.json';

/**
 * The situations a student speaks in, in the order the Voice studio lists them. `active` is the
 * line a student blurts out when they start acting up (it depends on how they act up).
 */
export const SITUATIONS = [
  'active', 'warn', 'calm', 'talk', 'detention', 'principal', 'zap', 'caught', 'hit',
  'wrongStudent', 'delivered', 'nearlyLost', 'rollcall',
];

/**
 * One line a student can say.
 * @typedef {object} LineInfo
 * @property {string} slot the line's name in recordings: 'talk.1', 'active.phone.0', 'rollcall.3'
 * @property {string} situation one of SITUATIONS
 * @property {string | null} behaviour how the student acts up, for the 'active' lines
 * @property {number} index which line of its list
 * @property {string} text the line, in the current language
 */

/**
 * A recording that is available for use.
 * @typedef {object} Clip
 * @property {string} key language / student / slot
 * @property {'upload' | 'file'} source
 * @property {string} name the file's name
 * @property {number} size bytes (0 when not known)
 * @property {number} [duration] seconds, when known
 * @property {string} [url] where a 'file' clip is fetched from
 * @property {number} version changes whenever the recording is replaced, so cached copies go stale
 */

/** @type {Map<string, Clip>} */
const uploads = new Map();
/** @type {Map<string, Clip>} */
const files = new Map();
/** @type {Map<string, Blob>} uploads kept for this visit only, when the browser won't store them */
const kept = new Map();
/** @type {(() => void)[]} */
const listeners = [];
let storageWorks = true;
let version = 0;

/** @param {() => void} fn called whenever a recording is added, replaced or removed */
export function onClipsChange(fn) {
  listeners.push(fn);
}

function changed() {
  version++;
  for (const fn of listeners) fn();
}

/** Whether uploads last between visits (false in a private window or when storage is blocked). */
export function uploadsPersist() {
  return storageWorks;
}

/**
 * @param {string} language
 * @param {string} who a student's id, or WHOLE_CLASS
 * @param {string} slot
 */
export function clipKey(language, who, slot) {
  return language + '/' + who + '/' + slot;
}

/**
 * The slot name of a line from where it was drawn: 'shout.talk' line 1 is 'talk.1', and
 * 'shout.active.phone' line 0 is 'active.phone.0'. Roll-call answers are 'rollcall.N'.
 * @param {string} key the string-table key of the list ('shout.talk', 'rollcall')
 * @param {number} line
 */
export function slotOf(key, line) {
  return key.replace(/^shout\./, '') + '.' + line;
}

/** @param {string} situation @param {string | null} behaviour @returns {string} the string-table key of the list */
function listKey(situation, behaviour) {
  if (situation === 'rollcall') return 'rollCall.lines';
  return situation === 'active' ? 'shout.active.' + behaviour : 'shout.' + situation;
}

/**
 * @param {string} situation
 * @param {string | null} behaviour
 * @returns {LineInfo[]}
 */
function linesOf(situation, behaviour) {
  const list = lookup(listKey(situation, behaviour));
  if (!Array.isArray(list)) return [];
  const base = situation === 'active' ? 'active.' + behaviour : situation;
  return list.flatMap((text, index) => (typeof text === 'string'
    ? [{ slot: base + '.' + index, situation, behaviour, index, text }] : []));
}

/**
 * Every line one student can say (or, for WHOLE_CLASS, every line any student can), grouped by
 * situation, in the current language.
 * @param {string} who a student's id, or WHOLE_CLASS
 * @returns {{situation: string, behaviour: string | null, lines: LineInfo[]}[]}
 */
export function lineCatalogue(who) {
  const own = STUDENTS.find((s) => s.id === who);
  /** @type {{situation: string, behaviour: string | null, lines: LineInfo[]}[]} */
  const groups = [];
  for (const situation of SITUATIONS) {
    if (situation !== 'active') {
      groups.push({ situation, behaviour: null, lines: linesOf(situation, null) });
      continue;
    }
    const behaviours = own ? [own.type] : [...new Set(STUDENTS.map((s) => s.type))];
    for (const behaviour of behaviours) groups.push({ situation, behaviour, lines: linesOf(situation, behaviour) });
  }
  return groups.filter((g) => g.lines.length);
}

/**
 * How many of a student's lines have a recording of their own (not counting the whole class's).
 * @param {string} language
 * @param {string} who
 */
export function recordedCount(language, who) {
  let own = 0, total = 0;
  for (const group of lineCatalogue(who)) {
    for (const line of group.lines) {
      total++;
      const key = clipKey(language, who, line.slot);
      if (uploads.has(key) || files.has(key)) own++;
    }
  }
  return { own, total };
}

/**
 * The recording a student says a line with, if any.
 * @param {string} language
 * @param {string} who a student's id
 * @param {string} slot
 * @returns {Clip | null}
 */
export function findClip(language, who, slot) {
  for (const owner of [who, WHOLE_CLASS]) {
    const key = clipKey(language, owner, slot);
    const found = uploads.get(key) || files.get(key);
    if (found) return found;
  }
  return null;
}

/**
 * The recording stored for exactly this student (or the whole class) and line, if any, ignoring
 * the fallbacks findClip() applies. The Voice studio shows these.
 * @param {string} language
 * @param {string} who
 * @param {string} slot
 */
export function ownClip(language, who, slot) {
  const key = clipKey(language, who, slot);
  return uploads.get(key) || files.get(key) || null;
}

/* ---------------- storage ---------------- */

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Makes the files listed in assets/voices/manifest.json available (see scripts/voices.mjs).
 * @param {unknown} manifest
 */
export function loadManifest(manifest) {
  const list = manifest && typeof manifest === 'object' ? /** @type {{clips?: unknown}} */ (manifest).clips : null;
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
  for (const [key, path] of Object.entries(list && typeof list === 'object' ? list : {})) {
    if (typeof path !== 'string') continue;
    const url = new URL('assets/voices/' + path, base).href;
    files.set(key, { key, source: 'file', name: path.split('/').pop() || path, size: 0, url, version: 0 });
  }
}

/**
 * Loads what is already there: the player's uploads, and the files listed in the game's manifest.
 * Failures are fine, they just mean there is nothing to use.
 */
export async function setupClips() {
  try {
    const db = await openDb();
    const rows = await done(db.transaction(STORE).objectStore(STORE).getAll());
    db.close();
    for (const row of rows) {
      uploads.set(row.key, { key: row.key, source: 'upload', name: row.name, size: row.size, duration: row.duration, version: 0 });
    }
  } catch {
    storageWorks = false;
  }
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (response.ok) loadManifest(await response.json());
  } catch { /* no manifest: no files */ }
  changed();
}

/**
 * Keeps a recording the player chose. It is checked first: `decode` resolves to the clip's length
 * in seconds, or rejects when the browser can't play the file, so a bad file is turned away here
 * and not found out in the middle of a lesson.
 * @param {string} language
 * @param {string} who a student's id, or WHOLE_CLASS
 * @param {string} slot
 * @param {File} file
 * @param {(data: ArrayBuffer) => Promise<number>} decode
 * @returns {Promise<Clip>}
 */
export async function saveClip(language, who, slot, file, decode) {
  if (file.size === 0) throw new Error('empty');
  if (file.size > MAX_CLIP_BYTES) throw new Error('tooBig');
  const data = await file.arrayBuffer();
  const duration = await decode(data.slice(0));
  const key = clipKey(language, who, slot);
  const blob = new Blob([data], { type: file.type || 'audio/mpeg' });
  try {
    const db = await openDb();
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).put({ key, name: file.name, size: file.size, duration, blob }));
    db.close();
    kept.delete(key);
  } catch {
    storageWorks = false;
    kept.set(key, blob);
  }
  const clip = { key, source: /** @type {const} */ ('upload'), name: file.name, size: file.size, duration, version: version + 1 };
  uploads.set(key, clip);
  changed();
  return clip;
}

/**
 * Deletes the player's upload for this line (the game's own files can't be removed here).
 * @param {string} language
 * @param {string} who
 * @param {string} slot
 */
export async function removeClip(language, who, slot) {
  const key = clipKey(language, who, slot);
  if (!uploads.delete(key)) return;
  kept.delete(key);
  try {
    const db = await openDb();
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key));
    db.close();
  } catch { /* nothing stored to remove */ }
  changed();
}

/**
 * Deletes every upload for one student (or the whole class) in one language.
 * @param {string} language
 * @param {string} who
 */
export async function removeAllClips(language, who) {
  const prefix = language + '/' + who + '/';
  for (const key of [...uploads.keys()].filter((k) => k.startsWith(prefix))) {
    await removeClip(language, who, key.slice(prefix.length));
  }
}

/**
 * The recording's bytes, ready to decode.
 * @param {Clip} clip
 * @returns {Promise<ArrayBuffer | null>}
 */
export async function clipData(clip) {
  try {
    if (clip.source === 'file' && clip.url) {
      const response = await fetch(clip.url);
      return response.ok ? await response.arrayBuffer() : null;
    }
    const memory = kept.get(clip.key);
    if (memory) return await memory.arrayBuffer();
    const db = await openDb();
    const row = await done(db.transaction(STORE).objectStore(STORE).get(clip.key));
    db.close();
    return row && row.blob ? await row.blob.arrayBuffer() : null;
  } catch {
    return null;
  }
}

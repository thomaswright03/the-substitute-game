// What students blurt out while acting up or being told off: the line shows in a bubble over
// their head (with their name, so you can tell who said it) and is said aloud in their own
// voice (voice.js), often with a grunt, a sigh or a yelp before it (audio.js).
import * as THREE from 'three';
import { lookup } from './strings.js';
import { el } from './dom.js';
import { S, name } from './session.js';
import { project, stereoPan, world } from './world.js';
import { characterData } from './characters.js';
import { freeArea, placeBubble } from './rollcall.js';
import { play } from './audio.js';
import { speak, voicePitch } from './voice.js';

const SHOUT_SECONDS = 3.5; // of play
// a newer, less important line doesn't replace one this young
const PROTECT_SECONDS = 1.6;

/**
 * What a student can react to: the sound they make first, how long after it they speak, how
 * important the line is (a more important line isn't cut off), and whether it is yelled.
 * @typedef {{sounds?: string[], gap?: number, priority: number, yell?: boolean}} Reaction
 */
/** @type {Record<string, Reaction>} */
const REACTIONS = {
  active: { priority: 1, yell: true },
  talk: { sounds: ['grunt', 'sigh'], gap: 1.1, priority: 2 },
  detention: { sounds: ['groan'], gap: 0.8, priority: 2, yell: true },
  principal: { sounds: ['sigh'], gap: 0.9, priority: 2 },
  zap: { sounds: ['yelp'], gap: 0.4, priority: 2, yell: true },
  caught: { sounds: ['gasp'], gap: 0.3, priority: 2 },
  hit: { sounds: ['laugh'], gap: 0.6, priority: 2, yell: true },
  warn: { sounds: ['grunt'], gap: 0.35, priority: 2 },
  calm: { sounds: ['sigh'], gap: 0.9, priority: 1 },
  wrongStudent: { sounds: ['grunt'], gap: 0.35, priority: 1 },
  delivered: { priority: 1 },
  nearlyLost: { sounds: ['groan'], gap: 0.7, priority: 2, yell: true },
};

/**
 * The line on show.
 * @typedef {object} Shout
 * @property {string} id who said it
 * @property {string} key the key of the list of lines it came from
 * @property {number} line which line of that list
 * @property {number} at game time it was said
 * @property {number} priority
 * @property {number} [bw] the bubble's size, measured the first frame it shows
 * @property {number} [bh]
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [tail]
 */
/** @type {Shout | null} */
let shout = null;
/** @type {Record<string, number>} the line each list used last, so a student doesn't repeat it */
const lastLine = {};

/** @param {string} key */
function lines(key) {
  const list = lookup(key);
  return Array.isArray(list) ? list.filter((line) => typeof line === 'string') : [];
}

/** @param {Shout} s */
function writeShout(s) {
  el.shoutName.textContent = name(s.id);
  el.shoutText.textContent = lines(s.key)[s.line] || '';
  delete s.bw;
  delete s.bh;
}

/**
 * A student reacts out loud. `kind` is one of the REACTIONS; for 'active' the line depends on
 * how the student acts up.
 * @param {string} id
 * @param {string} kind
 * @param {string} [behaviour]
 */
export function studentReacts(id, kind, behaviour) {
  const reaction = REACTIONS[kind];
  if (!reaction || !world.students[id]) return;
  const now = S.game.elapsed;
  if (shout && shout.priority > reaction.priority && now - shout.at < PROTECT_SECONDS) return;
  const key = kind === 'active' ? 'shout.active.' + behaviour : 'shout.' + kind;
  const count = lines(key).length;
  if (!count) return;
  let line = Math.floor(Math.random() * count);
  if (count > 1 && line === lastLine[key]) line = (line + 1) % count;
  lastLine[key] = line;
  const mine = { id, key, line, at: now, priority: reaction.priority };
  shout = mine;
  writeShout(mine);

  const pan = stereoPan(world.students[id].position);
  const pitch = voicePitch(id);
  let delay = 0;
  for (const sound of reaction.sounds || []) {
    play(sound, { pan, pitch, delay });
    delay += 0.55;
  }
  const text = lines(key)[line];
  const say = () => speak(id, text, { priority: reaction.priority, yell: reaction.yell });
  const wait = reaction.sounds ? (reaction.gap || 0) + delay - 0.55 : 0;
  // the line follows the sound, unless something newer was said or the game stopped meanwhile
  if (wait > 0) setTimeout(() => { if (shout === mine && S.running && !S.paused) say(); }, wait * 1000);
  else say();
}

export function clearShout() {
  shout = null;
  el.shoutBubble.hidden = true;
}

// After a change of language: the line on show is written again in the new language.
export function refreshShout() {
  if (shout) writeShout(shout);
}

export function currentShout() {
  return shout && { id: shout.id, text: el.shoutText.textContent || '' };
}

// The bubble follows the speaker's head for SHOUT_SECONDS of play. Off screen it isn't drawn:
// the voice, and the log, say who it was.
const anchor = new THREE.Vector3();
export function updateShout() {
  if (!shout) return;
  if (!S.running || S.game.elapsed - shout.at > SHOUT_SECONDS) {
    clearShout();
    return;
  }
  const head = characterData(world.students[shout.id]).headWorld;
  if (!head) return;
  const pos = project(anchor.copy(head).setY(head.y + 0.3));
  // the roll-call answer, when the same student gives one, keeps its place above them
  const sameAsAnswer = S.speech && S.speech.id === shout.id && !el.speechBubble.hidden;
  if (S.seatChartOpen || !pos.onScreen || sameAsAnswer) {
    el.shoutBubble.hidden = true;
    return;
  }
  placeBubble(el.shoutBubble, shout, pos, freeArea());
}

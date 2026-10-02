// Recorded voice lines: which lines exist, which recording a student's line uses, and the
// manifest scripts/voices.mjs writes for the files that ship with the game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  CLIP_EXTENSIONS, MAX_CLIP_BYTES, SITUATIONS, WHOLE_CLASS, clipKey, findClip, lineCatalogue, loadManifest, ownClip,
  recordedCount, removeAllClips, removeClip, saveClip, slotOf,
} from '../../src/clips.js';
import { STUDENTS } from '../../src/data.js';
import { ENGLISH } from '../../src/strings.js';
import { scanVoices } from '../../scripts/voices.mjs';

const decodeOk = async () => 1.5;
const file = (name, size = 100, type = 'audio/mpeg') => new File([new Uint8Array(size)], name, { type });

describe('line slots', () => {
  test('a line is named by its situation and number', () => {
    assert.equal(slotOf('shout.talk', 1), 'talk.1');
    assert.equal(slotOf('shout.active.phone', 0), 'active.phone.0');
    assert.equal(slotOf('rollcall', 3), 'rollcall.3');
  });

  test('every situation a student reacts with is listed', () => {
    const kinds = Object.keys(ENGLISH.shout);
    for (const kind of kinds) assert.ok(SITUATIONS.includes(kind), `${kind} is in SITUATIONS`);
    assert.ok(SITUATIONS.includes('rollcall'));
  });

  test('a student has the lines of their own way of acting up, and every shared one', () => {
    for (const s of STUDENTS) {
      const slots = lineCatalogue(s.id).flatMap((g) => g.lines.map((l) => l.slot));
      assert.ok(slots.includes('active.' + s.type + '.0'), s.id);
      assert.ok(!slots.some((slot) => slot.startsWith('active.') && !slot.startsWith('active.' + s.type + '.')), s.id);
      assert.ok(slots.includes('talk.2') && slots.includes('rollcall.7'));
      assert.equal(new Set(slots).size, slots.length, 'no slot twice');
    }
  });

  test('the whole class has the lines of every way of acting up', () => {
    const slots = lineCatalogue(WHOLE_CLASS).flatMap((g) => g.lines.map((l) => l.slot));
    for (const type of new Set(STUDENTS.map((s) => s.type))) assert.ok(slots.includes('active.' + type + '.1'), type);
  });

  test('the lines are the ones the game shows, in the same order', () => {
    const talk = lineCatalogue('steve').find((g) => g.situation === 'talk');
    assert.deepEqual(talk?.lines.map((l) => l.text), ENGLISH.shout.talk);
    const roll = lineCatalogue('steve').find((g) => g.situation === 'rollcall');
    assert.deepEqual(roll?.lines.map((l) => l.text), ENGLISH.rollCall.lines);
  });
});

describe('which recording a line uses', () => {
  test('nothing is recorded to begin with', () => {
    assert.equal(findClip('en', 'steve', 'talk.0'), null);
    assert.equal(ownClip('en', 'steve', 'talk.0'), null);
  });

  test('a student’s own recording beats the whole class’s, which beats nothing', async () => {
    await saveClip('en', WHOLE_CLASS, 'talk.0', file('class.mp3'), decodeOk);
    assert.equal(findClip('en', 'steve', 'talk.0')?.name, 'class.mp3');
    await saveClip('en', 'steve', 'talk.0', file('steve.mp3'), decodeOk);
    assert.equal(findClip('en', 'steve', 'talk.0')?.name, 'steve.mp3');
    assert.equal(findClip('en', 'benDover', 'talk.0')?.name, 'class.mp3');
    assert.equal(ownClip('en', 'benDover', 'talk.0'), null, 'the studio shows only a student’s own');
  });

  test('recordings are kept per language', async () => {
    await saveClip('en', 'steve', 'zap.1', file('ow.mp3'), decodeOk);
    assert.equal(findClip('es', 'steve', 'zap.1'), null);
  });

  test('replacing a recording makes cached copies stale', async () => {
    const a = await saveClip('en', 'moeLester', 'calm.0', file('a.mp3'), decodeOk);
    const b = await saveClip('en', 'moeLester', 'calm.0', file('b.mp3'), decodeOk);
    assert.notEqual(a.version, b.version);
    assert.equal(findClip('en', 'moeLester', 'calm.0')?.name, 'b.mp3');
  });

  test('a file from the game’s folder is used, but an upload beats it', () => {
    loadManifest({ version: 1, clips: { 'en/hughJass/hit.0': 'en/hughJass/hit.0.mp3', 'en/all/hit.1': 'en/all/hit.1.ogg', bad: 7 } });
    const own = findClip('en', 'hughJass', 'hit.0');
    assert.equal(own?.source, 'file');
    assert.match(own?.url || '', /assets\/voices\/en\/hughJass\/hit\.0\.mp3$/);
    assert.equal(findClip('en', 'steve', 'hit.1')?.name, 'hit.1.ogg');
    assert.equal(findClip('en', 'steve', 'hit.0'), null);
  });

  test('a manifest that isn’t one is ignored', () => {
    assert.doesNotThrow(() => { loadManifest(null); loadManifest('x'); loadManifest({ clips: 3 }); });
  });

  test('removing an upload brings back whatever was behind it', async () => {
    await saveClip('en', 'hughJass', 'hit.0', file('mine.mp3'), decodeOk);
    assert.equal(findClip('en', 'hughJass', 'hit.0')?.source, 'upload');
    await removeClip('en', 'hughJass', 'hit.0');
    assert.equal(findClip('en', 'hughJass', 'hit.0')?.source, 'file');
  });

  test('removing all of one student’s uploads leaves the others’', async () => {
    await saveClip('en', 'mikeHunt', 'delivered.0', file('1.mp3'), decodeOk);
    await saveClip('en', 'mikeHunt', 'delivered.1', file('2.mp3'), decodeOk);
    await saveClip('en', 'steve', 'delivered.0', file('s.mp3'), decodeOk);
    assert.equal(recordedCount('en', 'mikeHunt').own, 2);
    await removeAllClips('en', 'mikeHunt');
    assert.equal(recordedCount('en', 'mikeHunt').own, 0);
    assert.equal(findClip('en', 'steve', 'delivered.0')?.name, 's.mp3');
  });

  test('a recording the browser can’t read, an empty file and a huge one are turned away', async () => {
    const before = recordedCount('en', 'gabeIches').own;
    await assert.rejects(saveClip('en', 'gabeIches', 'calm.0', file('x.mp3'), async () => { throw new Error('bad'); }));
    await assert.rejects(saveClip('en', 'gabeIches', 'calm.0', file('empty.mp3', 0), decodeOk), /empty/);
    await assert.rejects(saveClip('en', 'gabeIches', 'calm.0', file('big.wav', MAX_CLIP_BYTES + 1), decodeOk), /tooBig/);
    assert.equal(recordedCount('en', 'gabeIches').own, before);
  });

  test('the count says how many of a student’s own lines are recorded', () => {
    const { own, total } = recordedCount('en', 'steve');
    assert.equal(total, 44);
    assert.ok(own >= 1);
    assert.equal(clipKey('en', 'steve', 'talk.0'), 'en/steve/talk.0');
  });
});

describe('the recordings folder', () => {
  /** @param {Record<string, string>} tree */
  async function folder(tree) {
    const dir = await mkdtemp(join(tmpdir(), 'voices-'));
    for (const path of Object.keys(tree)) {
      await mkdir(join(dir, path, '..'), { recursive: true });
      await writeFile(join(dir, path), tree[path]);
    }
    return dir;
  }

  test('files are listed under the key the game looks them up by', async () => {
    const dir = await folder({
      'en/benDover/talk.1.mp3': 'x', 'en/all/delivered.0.WAV': 'x', 'es/mikeHunt/active.sleep.2.ogg': 'x',
    });
    const { clips, problems } = await scanVoices(dir);
    assert.deepEqual(clips, {
      'en/all/delivered.0': 'en/all/delivered.0.WAV',
      'en/benDover/talk.1': 'en/benDover/talk.1.mp3',
      'es/mikeHunt/active.sleep.2': 'es/mikeHunt/active.sleep.2.ogg',
    });
    assert.deepEqual(problems, []);
    await rm(dir, { recursive: true });
  });

  test('files the game would never use are reported, not listed', async () => {
    const dir = await folder({
      'xx/benDover/talk.1.mp3': 'x', 'en/nobody/talk.1.mp3': 'x', 'en/benDover/talk.9.mp3': 'x',
      'en/benDover/notes.txt': 'x', 'en/benDover/active.sleep.0.mp3': 'x', 'en/benDover/talk.0.mp3': 'x',
    });
    const { clips, problems } = await scanVoices(dir);
    assert.deepEqual(Object.keys(clips), ['en/benDover/talk.0']);
    assert.equal(problems.length, 5);
    await rm(dir, { recursive: true });
  });

  test('a missing folder is an empty one', async () => {
    assert.deepEqual(await scanVoices(join(tmpdir(), 'no-such-voices-folder')), { clips: {}, problems: [] });
  });

  test('the shipped manifest lists nothing that isn’t there', async () => {
    const manifest = JSON.parse(readFileSync(new URL('../../assets/voices/manifest.json', import.meta.url), 'utf8'));
    const { clips } = await scanVoices(new URL('../../assets/voices/', import.meta.url).pathname);
    assert.deepEqual(manifest, { version: 1, clips }, 'run npm run voices');
  });

  test('the script and the game accept the same kinds of file', () => {
    const source = readFileSync(new URL('../../src/clips.js', import.meta.url), 'utf8');
    assert.ok(source.includes(JSON.stringify(CLIP_EXTENSIONS).replace(/"/g, "'").replace(/,/g, ', ')));
  });
});

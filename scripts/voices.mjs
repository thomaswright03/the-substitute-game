// Lists the recordings in assets/voices/ in assets/voices/manifest.json, which is how the game
// finds the voice lines that ship with it (a recording uploaded in the Voice studio is kept in
// the player's own browser instead).
//
//   npm run voices            (after adding, renaming or removing files)
//
// Layout: assets/voices/<language>/<student id or "all">/<line>.<extension>
//   assets/voices/en/benDover/talk.1.mp3        Ben Dover's second stern-talking-to reply, in English
//   assets/voices/en/all/delivered.0.wav        "Present!" for any student without their own
//   assets/voices/es/mikeHunt/active.sleep.2.ogg
// The Voice studio lists every line with its exact name, and a line's name is its situation and
// number, so "talk.1" is the second line the game has for being told off.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIP_EXTENSIONS, WHOLE_CLASS, lineCatalogue } from '../src/clips.js';
import { LANGUAGES } from '../src/strings.js';
import { STUDENTS } from '../src/data.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const VOICES_DIR = join(ROOT, 'assets', 'voices');

/** @param {string} dir */
async function subdirs(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

/**
 * Reads the recordings folder. `clips` maps each recording's key (language/student/line) to its
 * path under the folder; `problems` lists files the game would never use, with the reason.
 * @param {string} dir
 * @returns {Promise<{clips: Record<string, string>, problems: string[]}>}
 */
export async function scanVoices(dir) {
  /** @type {Record<string, string>} */
  const clips = {};
  /** @type {string[]} */
  const problems = [];
  const students = new Set([WHOLE_CLASS, ...STUDENTS.map((s) => s.id)]);
  for (const language of await subdirs(dir)) {
    if (!Object.hasOwn(LANGUAGES, language)) {
      problems.push(`${language}/: not a language the game has (${Object.keys(LANGUAGES).join(', ')})`);
      continue;
    }
    for (const who of await subdirs(join(dir, language))) {
      if (!students.has(who)) {
        problems.push(`${language}/${who}/: not a student id (or "${WHOLE_CLASS}")`);
        continue;
      }
      // the lines this student can say (the whole class: every line of every kind of student)
      const slots = new Set(lineCatalogue(who).flatMap((g) => g.lines.map((l) => l.slot)));
      const names = (await readdir(join(dir, language, who), { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort();
      for (const file of names) {
        const ext = extname(file).slice(1).toLowerCase();
        const slot = basename(file, extname(file));
        const where = `${language}/${who}/${file}`;
        if (!CLIP_EXTENSIONS.includes(ext)) problems.push(`${where}: not a sound file (${CLIP_EXTENSIONS.join(', ')})`);
        else if (!slots.has(slot)) problems.push(`${where}: "${slot}" is not one of ${who === WHOLE_CLASS ? 'the lines' : 'this student’s lines'}`);
        else clips[`${language}/${who}/${slot}`] = `${language}/${who}/${file}`;
      }
    }
  }
  return { clips, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] || VOICES_DIR);
  const { clips, problems } = await scanVoices(dir);
  const manifest = JSON.stringify({ version: 1, clips }, null, 2) + '\n';
  const target = join(dir, 'manifest.json');
  const before = await readFile(target, 'utf8').catch(() => '');
  if (before !== manifest) await writeFile(target, manifest);
  const count = Object.keys(clips).length;
  console.log(`${count} recording${count === 1 ? '' : 's'} listed in ${target}${before === manifest ? ' (unchanged)' : ''}`);
  for (const p of problems) console.warn('  skipped ' + p);
  if (problems.length) process.exitCode = 1;
}

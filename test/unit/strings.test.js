import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STUDENTS } from '../../src/data.js';
import { ENGLISH, listNames, lookup, setStrings, t } from '../../src/strings.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const PRONOUNS = {
  he: /\b(he|him|his|himself)\b/i,
  she: /\b(she|her|hers|herself)\b/i,
};

describe('students', () => {
  test('each student’s pronoun matches the character model they use', () => {
    for (const s of STUDENTS) {
      const expected = /-woman$/.test(s.model) ? 'she' : 'he';
      assert.equal(s.pronoun, expected, `${s.name} (${s.model})`);
    }
  });

  test('no student’s lines use the other set of pronouns', () => {
    for (const s of STUDENTS) {
      const lines = Object.values(ENGLISH.students[s.id] || {});
      assert.ok(lines.length >= 3, `${s.name} has lines`);
      const other = s.pronoun === 'he' ? PRONOUNS.she : PRONOUNS.he;
      for (const line of lines) assert.doesNotMatch(line, other, `${s.name}: "${line}"`);
    }
  });

  test('every student has the lines their behaviour needs, and names them', () => {
    for (const s of STUDENTS) {
      const lines = ENGLISH.students[s.id];
      for (const key of ['active', 'calm', 'fail']) {
        assert.equal(typeof lines[key], 'string', `${s.id}.${key}`);
        assert.ok(lines[key].includes(s.name), `${s.id}.${key} names ${s.name}`);
      }
      if (s.type === 'phone') assert.equal(typeof lines.warn, 'string');
    }
  });

  test('ids are unique and every friend is a real classmate', () => {
    const ids = STUDENTS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of STUDENTS) if (s.friend) assert.ok(ids.includes(s.friend), `${s.id} -> ${s.friend}`);
  });
});

describe('the string table', () => {
  test('every key the game asks for exists', () => {
    const missing = [];
    for (const file of readdirSync(new URL('src/', root))) {
      if (!file.endsWith('.js')) continue;
      const src = read('src/' + file);
      for (const m of src.matchAll(/\bt\('([\w.]+)'/g)) {
        if (m[1].endsWith('.')) continue; // a prefix completed at run time (e.g. 'students.' + id)
        if (typeof lookup(m[1]) !== 'string') missing.push(`${file}: ${m[1]}`);
      }
    }
    const html = read('index.html');
    for (const m of html.matchAll(/data-i18n="([\w.]+)"/g)) {
      if (typeof lookup(m[1]) !== 'string') missing.push(`index.html: ${m[1]}`);
    }
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of m[1].split(';')) {
        const key = pair.split(':')[1];
        if (typeof lookup(key) !== 'string') missing.push(`index.html: ${key}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  test('the keys built at run time exist too', () => {
    for (const kind of ['hits', 'detentions', 'principal', 'zaps', 'closeCall']) {
      assert.equal(typeof lookup('end.deduction.' + kind), 'string', kind);
    }
    for (const dir of ['ahead', 'aheadLeft', 'aheadRight', 'left', 'right', 'behind', 'behindLeft', 'behindRight']) {
      assert.equal(typeof lookup('where.' + dir), 'string', dir);
    }
    for (const s of STUDENTS) assert.equal(typeof lookup('pronoun.' + s.pronoun + '.possessive'), 'string');
  });

  test('parameters are filled in, and a missing key shows the key', () => {
    assert.equal(t('attendance.carrying', { name: 'Steve' }), 'Carrying Steve’s card');
    assert.equal(t('no.such.key'), 'no.such.key');
  });

  test('lists read naturally', () => {
    assert.equal(listNames(['Steve']), 'Steve');
    assert.equal(listNames(['Steve', 'Hugh Jass']), 'Steve and Hugh Jass');
    assert.equal(listNames(['A', 'B', 'C']), 'A, B and C');
  });

  test('swapping the table changes the text', () => {
    const copy = structuredClone(ENGLISH);
    copy.hud.chaos = 'Chaos';
    setStrings(copy);
    try {
      assert.equal(t('hud.chaos'), 'Chaos');
    } finally {
      setStrings(null);
    }
    assert.equal(t('hud.chaos'), 'Chaos Level');
  });
});

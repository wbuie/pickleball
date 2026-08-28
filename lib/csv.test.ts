import { describe, it, expect } from 'vitest';
import { parseCsv, csvToPlayers, normalizeName } from './csv';

// A registration-export header, trimmed to the columns that matter but keeping
// the shapes that trip parsers up: a contact block for whoever submitted the
// form, question-style headers, and multi-value cells.
const EXPORT_HEADER = [
  'Registration ID',
  'First Name',
  'Last Name',
  'Home Email Address',
  'Work Email Address',
  'Registration Contact First Name',
  'Registration Contact Last Name',
  'Registration Contact Home Email Address',
  'Status',
  '"If you have a 2 person team assembled, check this box."',
  '"If you have a 2 person teams assembled, type the first and last name of your teammate here."',
  '"If you don\'t have a 2 person team assembled, check this box and a randomizer will pair you with a teammate."',
  'Pickleball Skill Level',
].join(',');

const exportRow = (cells: (string | number)[]) =>
  cells.map(c => `"${String(c)}"`).join(',');

describe('parseCsv', () => {
  it('handles quoted fields, embedded commas, and escaped quotes', () => {
    const rows = parseCsv('a,b\n"1, one","he said ""hi"""\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1, one', 'he said "hi"'],
    ]);
  });

  it('strips a BOM and drops blank lines', () => {
    expect(parseCsv('﻿name\nJane\n\n')).toEqual([['name'], ['Jane']]);
  });
});

describe('csvToPlayers', () => {
  it('still reads a plain name/skill/email sheet', () => {
    const { players, errors } = csvToPlayers('name,skill,email\nJane Smith,3.5,JANE@x.com\n');
    expect(errors).toEqual([]);
    expect(players[0]).toMatchObject({
      display_name: 'Jane Smith',
      skill_level: 3.5,
      email: 'jane@x.com',
      partner_hint: null,
      wants_random_partner: false,
    });
  });

  it('builds the name from first + last name columns', () => {
    const { players } = csvToPlayers('First Name,Last Name\nJane,Smith\n');
    expect(players.map(p => p.display_name)).toEqual(['Jane Smith']);
  });

  it('explains itself when there is no name column at all', () => {
    const { players, errors } = csvToPlayers('email,skill\na@b.com,3\n');
    expect(players).toEqual([]);
    expect(errors[0]).toContain('name');
  });

  it('reads the attendee, not the person who submitted the form', () => {
    const csv = [
      EXPORT_HEADER,
      exportRow([
        '8412', 'Christian', 'Dapprich', '', '',
        'Carley', 'Dapprich', 'carley@x.com',
        'Active', '', '', '', '',
      ]),
    ].join('\n');

    const { players } = csvToPlayers(csv);
    expect(players).toHaveLength(1);
    expect(players[0].display_name).toBe('Christian Dapprich');
    // The registration contact's email belongs to Carley, not to Christian.
    expect(players[0].email).toBeNull();
  });

  it('reads the teammate question, the randomizer box, and the registration id', () => {
    const csv = [
      EXPORT_HEADER,
      exportRow([
        '8418', 'Karis', 'Kynes', 'Vkynes@gmail.com', '',
        'Vanessa', 'Kynes', 'vkynes@gmail.com',
        'Active', 'Checked', 'Iris Gibson if not her than random.', 'Checked', '4 (Above Average)',
      ]),
    ].join('\n');

    expect(csvToPlayers(csv).players[0]).toMatchObject({
      display_name: 'Karis Kynes',
      email: 'vkynes@gmail.com',
      group_id: '8418',
      partner_hint: 'Iris Gibson if not her than random.',
      wants_random_partner: true,
      skill_level: 4.0,
    });
  });

  it('maps a 1–5 self-assessment onto the stored 2.0–5.0 scale', () => {
    const skills = ['1 (Just Looking to Have Fun)', '2 (Below Average)', '3 (Average)', '4 (Above Average)', '5 (Excellent)', '', '4.5', '9'];
    const csv = ['name,Pickleball Skill Level', ...skills.map((s, i) => `P${i},"${s}"`)].join('\n');
    expect(csvToPlayers(csv).players.map(p => p.skill_level)).toEqual([
      2.0, 2.5, 3.0, 4.0, 5.0, 3.0, 4.5, 5.0,
    ]);
  });

  it('takes the first usable address from a multi-value email cell', () => {
    const csv = 'name,Home Email Address,Work Email Address\nJon Elam,jon@icloud.com;jonathan@icloud.com,work@x.org\n';
    expect(csvToPlayers(csv).players[0].email).toBe('jon@icloud.com');
  });

  it('falls back to the next email column when the first is blank', () => {
    const csv = 'name,Home Email Address,Work Email Address\nJon Elam,,work@x.org\n';
    expect(csvToPlayers(csv).players[0].email).toBe('work@x.org');
  });

  it('skips cancelled registrations, blank names, and repeat rows', () => {
    const csv = [
      'name,Status',
      'Jane Smith,Active',
      'Bob Jones,Cancelled',
      ',Active',
      'jane smith,Active',
    ].join('\n');

    const { players, errors } = csvToPlayers(csv);
    expect(players.map(p => p.display_name)).toEqual(['Jane Smith']);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('Cancelled');
    expect(errors[1]).toContain('missing name');
    expect(errors[2]).toContain('duplicate');
  });
});

describe('normalizeName', () => {
  it('ignores case, punctuation, and spacing', () => {
    expect(normalizeName("  Muhammad  Al-Kahlout ")).toBe('muhammad al kahlout');
    expect(normalizeName("O'Neil, Pat.")).toBe('oneil pat');
  });
});

// Tiny dependency-free CSV parser, good enough for spreadsheet exports
// (handles quoted fields, embedded commas/newlines, and "" escaped quotes).
// Excel users can "Save As → CSV" and upload the result.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  // Strip a UTF-8 BOM if present (Excel loves adding one).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Swallow \r\n as a single break.
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else {
      field += char;
    }
  }

  // Flush the trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (e.g. a blank trailing line).
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

export interface ParsedPlayer {
  display_name: string;
  skill_level: number;
  basketball_skill_level: number | null;
  email: string | null;
  // Extras that only registration-form exports carry. A plain
  // name/skill/email sheet leaves these blank and behaves exactly as before.
  //
  // group_id: the registration/confirmation number. Everyone who was signed up
  //   in one submission shares it, which is a strong hint they're a team.
  group_id: string | null;
  // partner_hint: free text the player typed for "who is your teammate?".
  partner_hint: string | null;
  // wants_random_partner: they ticked "pair me with someone".
  wants_random_partner: boolean;
  // 1-based row in the source file, so messages can point at it.
  row: number;
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  'display name': 'name',
  'full name': 'name',
  player: 'name',
  'first name': 'first',
  first: 'first',
  'given name': 'first',
  'last name': 'last',
  last: 'last',
  surname: 'last',
  'family name': 'last',
  skill: 'skill',
  'skill level': 'skill',
  rating: 'skill',
  dupr: 'skill',
  email: 'email',
  'e-mail': 'email',
  'email address': 'email',
  basketball: 'basketball',
  'basketball skill': 'basketball',
  'basketball rating': 'basketball',
  bball: 'basketball',
  'registration id': 'group',
  'confirmation number': 'group',
  status: 'status',
};

// Map one header cell to a canonical field, or null to ignore the column.
// Registration exports (Planning Center, Ministry Platform, Eventbrite, …) use
// long question-shaped headers, so fall back to keyword matching.
function classifyHeader(raw: string): string | null {
  const h = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!h) return null;

  // These exports repeat the whole contact block for whoever submitted the
  // form ("Registration Contact First Name", "Emergency Contact", …). That
  // person is often not the attendee on the row, so never read those columns.
  if (h.includes('registration contact') || h.includes('emergency contact')) return null;

  const alias = HEADER_ALIASES[h];
  if (alias) return alias;

  if (h.includes('basketball')) return 'basketball';
  // "…check this box and a randomizer will pair you with a teammate."
  if (h.includes('randomizer')) return 'random';
  // "…type the first and last name of your teammate here." We only want the
  // free-text one; the matching "check this box" question adds nothing.
  if (h.includes('teammate') || h.includes('partner')) {
    return h.includes('check this box') ? null : 'partner';
  }
  if (h.includes('skill')) return 'skill';
  if (h.includes('email')) return 'email';
  return null;
}

// A 1–5 self-assessment tier ("4 (Above Average)") mapped onto the 2.0–5.0
// DUPR-style range the schema stores. Clamping the raw tier instead would
// collapse tiers 1 and 2 onto the 2.0 floor and lose the ordering seeding needs.
const TIER_TO_SKILL: Record<string, number> = {
  '1': 2.0,
  '2': 2.5,
  '3': 3.0,
  '4': 4.0,
  '5': 5.0,
};

function normalizeSkill(raw: string | undefined): number {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return 3.0;

  // Registration forms usually export the label with the number.
  const tier = trimmed.match(/^([1-5])\s*[(-]/);
  if (tier) return TIER_TO_SKILL[tier[1]];

  const n = parseFloat(trimmed);
  if (Number.isNaN(n)) return 3.0;
  // Clamp to the 2.0–5.0 range the schema allows, rounded to nearest 0.5.
  const clamped = Math.min(5.0, Math.max(2.0, n));
  return Math.round(clamped * 2) / 2;
}

// Basketball uses a 1–5 tier scale; blank/invalid stays null ("Unrated").
function normalizeBasketball(raw: string | undefined): number | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  const n = parseFloat(trimmed);
  if (Number.isNaN(n)) return null;
  return Math.round(Math.min(5, Math.max(1, n)));
}

// People often have several addresses on file, exported as one
// semicolon-separated cell. Keep the first that looks like an address.
function normalizeEmail(raw: string | undefined): string | null {
  const parts = (raw ?? '').split(/[;,]/).map(p => p.trim()).filter(Boolean);
  const email = parts.find(p => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p));
  return email ? email.toLowerCase() : null;
}

function isChecked(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'checked' || v === 'yes' || v === 'true' || v === 'x' || v === '1';
}

// Lowercase, drop punctuation/accents-ish noise, collapse whitespace. Used both
// for de-duplicating a roster and for matching typed teammate names.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export interface ImportResult {
  players: ParsedPlayer[];
  errors: string[];
}

// Turn raw CSV text into player records. Expects a header row containing at
// least a name column (either "name" or "first name" + "last name"); every
// other column is optional.
export function csvToPlayers(text: string): ImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];

  if (rows.length === 0) {
    return { players: [], errors: ['The file is empty.'] };
  }

  const idx: Record<string, number> = {};
  const emailCols: number[] = [];
  rows[0].forEach((cell, i) => {
    const key = classifyHeader(cell);
    if (!key) return;
    if (key === 'email') {
      emailCols.push(i);
      return;
    }
    // First matching column wins, so "Home Email" beats "Work Email" etc.
    if (idx[key] === undefined) idx[key] = i;
  });

  const at = (cells: string[], key: string): string | undefined =>
    idx[key] === undefined ? undefined : cells[idx[key]];

  const hasName = idx.name !== undefined || idx.first !== undefined || idx.last !== undefined;
  if (!hasName) {
    return {
      players: [],
      errors: [
        'Could not find a name column. The first row must be a header with either a "name" column or "first name" and "last name" columns.',
      ],
    };
  }

  const players: ParsedPlayer[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowNo = i + 1;

    const name = (
      at(cells, 'name')?.trim() ||
      [at(cells, 'first')?.trim(), at(cells, 'last')?.trim()].filter(Boolean).join(' ')
    ).trim();

    if (!name) {
      errors.push(`Row ${rowNo}: skipped (missing name).`);
      continue;
    }

    // Registration exports include cancelled/waitlisted entries too.
    const status = (at(cells, 'status') ?? '').trim().toLowerCase();
    if (status && status !== 'active' && status !== 'attending' && status !== 'registered') {
      errors.push(`Row ${rowNo}: skipped ${name} (status "${(at(cells, 'status') ?? '').trim()}").`);
      continue;
    }

    // The same person can appear twice — e.g. once per session they signed up
    // for. Keep the first row so the roster gets one profile each.
    const key = normalizeName(name);
    const firstSeen = seen.get(key);
    if (firstSeen !== undefined) {
      errors.push(`Row ${rowNo}: skipped ${name} (duplicate of row ${firstSeen}).`);
      continue;
    }
    seen.set(key, rowNo);

    const email = emailCols
      .map(c => normalizeEmail(cells[c]))
      .find((e): e is string => e !== null) ?? null;

    players.push({
      display_name: name,
      skill_level: normalizeSkill(at(cells, 'skill')),
      basketball_skill_level: normalizeBasketball(at(cells, 'basketball')),
      email,
      group_id: (at(cells, 'group') ?? '').trim() || null,
      partner_hint: (at(cells, 'partner') ?? '').trim() || null,
      wants_random_partner: isChecked(at(cells, 'random')),
      row: rowNo,
    });
  }

  return { players, errors };
}

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
  email: string | null;
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  'display name': 'name',
  'full name': 'name',
  player: 'name',
  skill: 'skill',
  'skill level': 'skill',
  rating: 'skill',
  dupr: 'skill',
  email: 'email',
  'email address': 'email',
};

function normalizeSkill(raw: string | undefined): number {
  const n = parseFloat((raw ?? '').trim());
  if (Number.isNaN(n)) return 3.0;
  // Clamp to the 2.0–5.0 range the schema allows, rounded to nearest 0.5.
  const clamped = Math.min(5.0, Math.max(2.0, n));
  return Math.round(clamped * 2) / 2;
}

export interface ImportResult {
  players: ParsedPlayer[];
  errors: string[];
}

// Turn raw CSV text into player records. Expects a header row containing at
// least a name column; skill and email columns are optional.
export function csvToPlayers(text: string): ImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];

  if (rows.length === 0) {
    return { players: [], errors: ['The file is empty.'] };
  }

  const header = rows[0].map(h => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const skillIdx = header.indexOf('skill');
  const emailIdx = header.indexOf('email');

  if (nameIdx === -1) {
    return {
      players: [],
      errors: ['Could not find a "name" column. The first row must be a header (e.g. name, skill, email).'],
    };
  }

  const players: ParsedPlayer[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const name = (cells[nameIdx] ?? '').trim();
    if (!name) {
      errors.push(`Row ${i + 1}: skipped (missing name).`);
      continue;
    }
    const email = emailIdx === -1 ? null : (cells[emailIdx] ?? '').trim() || null;
    players.push({
      display_name: name,
      skill_level: normalizeSkill(skillIdx === -1 ? undefined : cells[skillIdx]),
      email,
    });
  }

  return { players, errors };
}

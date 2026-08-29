// Tournament rules are stored as plain text an organizer types into the edit
// form, so they arrive as lines rather than markup. These helpers turn that
// text into the handful of blocks the rules card renders — headings, bullet
// lists, numbered steps, and paragraphs — without pulling in a markdown parser.

export type RuleBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'steps'; items: string[] };

const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const HASH_HEADING = /^#{1,6}\s+(.*)$/;

// A short line with no sentence-ending punctuation reads as a section title —
// either because it ends in a colon, or because a list hangs off it.
const HEADING_MAX_LENGTH = 60;

function isHeading(line: string, next: string | undefined): boolean {
  if (line.length > HEADING_MAX_LENGTH) return false;
  if (line.endsWith(':')) return true;
  if (/[.!?,;]$/.test(line)) return false;
  return next !== undefined && (BULLET.test(next) || NUMBERED.test(next));
}

/**
 * Parse an organizer's plain-text rules into renderable blocks. Blank lines
 * separate blocks; consecutive plain lines are one wrapped paragraph.
 */
export function parseRules(rules: string | null | undefined): RuleBlock[] {
  if (!rules) return [];

  const lines = rules.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim());
  const blocks: RuleBlock[] = [];

  let paragraph: string[] = [];
  let items: string[] = [];
  let listKind: 'bullets' | 'steps' | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listKind && items.length > 0) blocks.push({ kind: listKind, items });
    items = [];
    listKind = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  lines.forEach((line, i) => {
    if (!line) {
      flush();
      return;
    }

    const hash = line.match(HASH_HEADING);
    if (hash) {
      flush();
      blocks.push({ kind: 'heading', text: hash[1].trim() });
      return;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      flushParagraph();
      if (listKind !== 'bullets') flushList();
      listKind = 'bullets';
      items.push(bullet[1].trim());
      return;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      flushParagraph();
      if (listKind !== 'steps') flushList();
      listKind = 'steps';
      items.push(numbered[1].trim());
      return;
    }

    if (isHeading(line, lines[i + 1])) {
      flush();
      blocks.push({ kind: 'heading', text: line.replace(/:$/, '') });
      return;
    }

    flushList();
    paragraph.push(line);
  });

  flush();
  return blocks.filter(b => (b.kind === 'bullets' || b.kind === 'steps' ? b.items.length > 0 : b.text.length > 0));
}

// True when there's something worth showing — an empty or whitespace-only
// column counts as "no rules posted".
export function hasRules(rules: string | null | undefined): boolean {
  return Boolean(rules && rules.trim().length > 0);
}

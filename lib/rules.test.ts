import { describe, it, expect } from 'vitest';
import { parseRules, hasRules } from './rules';
import { RULES_TEMPLATES } from './types/app';

describe('parseRules', () => {
  it('returns nothing for empty or whitespace-only rules', () => {
    expect(parseRules(null)).toEqual([]);
    expect(parseRules('')).toEqual([]);
    expect(parseRules('   \n\n  ')).toEqual([]);
  });

  it('joins wrapped lines into one paragraph and splits on blank lines', () => {
    expect(parseRules('Games are to 11,\nwin by 2.\n\nBring your own paddle.')).toEqual([
      { kind: 'paragraph', text: 'Games are to 11, win by 2.' },
      { kind: 'paragraph', text: 'Bring your own paddle.' },
    ]);
  });

  it('reads a short line above a list as a heading, colon and all', () => {
    expect(parseRules('Scoring:\n- Games to 11\n- Win by 2')).toEqual([
      { kind: 'heading', text: 'Scoring' },
      { kind: 'bullets', items: ['Games to 11', 'Win by 2'] },
    ]);
    expect(parseRules('Serving\n* Underhand only')).toEqual([
      { kind: 'heading', text: 'Serving' },
      { kind: 'bullets', items: ['Underhand only'] },
    ]);
  });

  it('treats markdown hashes as headings', () => {
    expect(parseRules('## The kitchen\nNo volleying inside the line.')).toEqual([
      { kind: 'heading', text: 'The kitchen' },
      { kind: 'paragraph', text: 'No volleying inside the line.' },
    ]);
  });

  it('keeps a plain sentence a paragraph even when a list follows', () => {
    expect(parseRules('Players call their own lines, and ties go to the opponent.\n- Replay disputed rallies')).toEqual([
      { kind: 'paragraph', text: 'Players call their own lines, and ties go to the opponent.' },
      { kind: 'bullets', items: ['Replay disputed rallies'] },
    ]);
  });

  it('separates numbered steps from bullets', () => {
    expect(parseRules('1. Check in\n2) Warm up\n- Then play')).toEqual([
      { kind: 'steps', items: ['Check in', 'Warm up'] },
      { kind: 'bullets', items: ['Then play'] },
    ]);
  });

  it('parses the built-in templates into headed, bulleted sections', () => {
    (['pickleball', 'basketball'] as const).forEach(sport => {
      const blocks = parseRules(RULES_TEMPLATES[sport]);
      expect(blocks.filter(b => b.kind === 'heading').length).toBeGreaterThan(2);
      expect(blocks.filter(b => b.kind === 'bullets').length).toBeGreaterThan(2);
      // Every template line lands in a block — nothing is silently dropped.
      const lines = RULES_TEMPLATES[sport].split('\n').filter(l => l.trim()).length;
      const rendered = blocks.reduce(
        (n, b) => n + (b.kind === 'bullets' || b.kind === 'steps' ? b.items.length : 1),
        0
      );
      expect(rendered).toBe(lines);
    });
  });
});

describe('hasRules', () => {
  it('is false for empty, whitespace, and null', () => {
    expect(hasRules(null)).toBe(false);
    expect(hasRules('')).toBe(false);
    expect(hasRules('  \n ')).toBe(false);
  });

  it('is true once an organizer has written something', () => {
    expect(hasRules('Games to 11.')).toBe(true);
  });
});

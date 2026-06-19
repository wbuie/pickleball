import { describe, it, expect } from 'vitest';
import { entryName, entrySkill } from './app';
import type { Profile } from './app';

const mk = (display_name: string, skill_level: number | null): Profile => ({
  id: display_name,
  display_name,
  skill_level,
  is_admin: false,
  created_at: '',
});

describe('entryName', () => {
  it('shows the captain alone for a singles/solo entry', () => {
    expect(entryName({ profiles: mk('Jane', 3.5), partner: null })).toBe('Jane');
  });

  it('joins both partners for a doubles team', () => {
    expect(entryName({ profiles: mk('Jane', 3.5), partner: mk('Bob', 3.0) })).toBe('Jane / Bob');
  });

  it('falls back to Unknown when the captain profile is missing', () => {
    expect(entryName({ profiles: undefined, partner: null })).toBe('Unknown');
  });
});

describe('entrySkill', () => {
  it('uses the individual rating for a solo entry', () => {
    expect(entrySkill({ profiles: mk('Jane', 4.0), partner: null })).toBe(4.0);
  });

  it('averages both partners for a team', () => {
    expect(entrySkill({ profiles: mk('Jane', 3.5), partner: mk('Bob', 3.0) })).toBe(3.25);
  });

  it('defaults missing ratings to 3.0', () => {
    expect(entrySkill({ profiles: mk('Jane', null), partner: null })).toBe(3.0);
    expect(entrySkill({ profiles: mk('Jane', 4.0), partner: mk('Bob', null) })).toBe(3.5);
  });
});

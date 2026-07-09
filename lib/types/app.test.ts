import { describe, it, expect } from 'vitest';
import {
  entryName,
  entrySkill,
  entryPlayers,
  entryNoun,
  isRosterEvent,
  isTeamEvent,
  isSport,
  TEAM_SIZE,
  SPORT_EVENT_TYPES,
} from './app';
import type { Profile } from './app';

const mk = (display_name: string, skill_level: number | null): Profile => ({
  id: display_name,
  display_name,
  skill_level,
  is_admin: false,
  is_managed: false,
  email: null,
  created_at: '',
});

const member = (display_name: string, skill_level: number | null) => ({
  profiles: mk(display_name, skill_level),
});

describe('entryName', () => {
  it('shows the captain alone for a singles/solo entry', () => {
    expect(entryName({ profiles: mk('Jane', 3.5), partner: null })).toBe('Jane');
  });

  it('joins both partners for a doubles team', () => {
    expect(entryName({ profiles: mk('Jane', 3.5), partner: mk('Bob', 3.0) })).toBe('Jane / Bob');
  });

  it('prefers the team name when one is set (basketball)', () => {
    expect(
      entryName({ profiles: mk('Jane', 3.5), team_name: 'Dunk Dynasty', members: [member('Bob', 3.0)] })
    ).toBe('Dunk Dynasty');
  });

  it('trims whitespace and ignores an empty team name', () => {
    expect(entryName({ profiles: mk('Jane', 3.5), team_name: '   ' })).toBe('Jane');
    expect(entryName({ profiles: mk('Jane', 3.5), team_name: '  Ballers ' })).toBe('Ballers');
  });

  it('falls back to Unknown when the captain profile is missing', () => {
    expect(entryName({ profiles: undefined, partner: null })).toBe('Unknown');
  });
});

describe('entryPlayers', () => {
  it('returns just the captain for a solo entry', () => {
    expect(entryPlayers({ profiles: mk('Jane', 4.0) }).map(p => p.display_name)).toEqual(['Jane']);
  });

  it('returns captain + partner for doubles', () => {
    expect(
      entryPlayers({ profiles: mk('Jane', 4.0), partner: mk('Bob', 3.0) }).map(p => p.display_name)
    ).toEqual(['Jane', 'Bob']);
  });

  it('returns captain + all roster members for a team', () => {
    expect(
      entryPlayers({
        profiles: mk('Jane', 4.0),
        team_name: 'Team',
        members: [member('Bob', 3.0), member('Cid', 2.5)],
      }).map(p => p.display_name)
    ).toEqual(['Jane', 'Bob', 'Cid']);
  });
});

describe('entrySkill', () => {
  it('uses the individual rating for a solo entry', () => {
    expect(entrySkill({ profiles: mk('Jane', 4.0), partner: null })).toBe(4.0);
  });

  it('averages both partners for a doubles team', () => {
    expect(entrySkill({ profiles: mk('Jane', 3.5), partner: mk('Bob', 3.0) })).toBe(3.25);
  });

  it('averages the whole roster for a basketball team', () => {
    expect(
      entrySkill({
        profiles: mk('Jane', 4.0),
        team_name: 'Team',
        members: [member('Bob', 3.0), member('Cid', 2.0)],
      })
    ).toBe(3.0);
  });

  it('defaults missing ratings to 3.0', () => {
    expect(entrySkill({ profiles: mk('Jane', null), partner: null })).toBe(3.0);
    expect(entrySkill({ profiles: mk('Jane', 4.0), partner: mk('Bob', null) })).toBe(3.5);
    expect(entrySkill({ profiles: mk('Jane', 4.0), members: [member('Bob', null)] })).toBe(3.5);
  });
});

describe('event helpers', () => {
  it('maps each event to its team size', () => {
    expect(TEAM_SIZE.singles).toBe(1);
    expect(TEAM_SIZE.doubles).toBe(2);
    expect(TEAM_SIZE['3v3']).toBe(3);
    expect(TEAM_SIZE['4v4']).toBe(4);
    expect(TEAM_SIZE['5v5']).toBe(5);
  });

  it('identifies roster (basketball) events', () => {
    expect(isRosterEvent('3v3')).toBe(true);
    expect(isRosterEvent('5v5')).toBe(true);
    expect(isRosterEvent('doubles')).toBe(false);
    expect(isRosterEvent('singles')).toBe(false);
  });

  it('treats every non-singles event as a team event', () => {
    expect(isTeamEvent('singles')).toBe(false);
    expect(isTeamEvent('doubles')).toBe(true);
    expect(isTeamEvent('4v4')).toBe(true);
  });

  it('labels the entry noun by event', () => {
    expect(entryNoun('singles')).toBe('Players');
    expect(entryNoun('singles', false)).toBe('Player');
    expect(entryNoun('doubles')).toBe('Teams');
    expect(entryNoun('5v5')).toBe('Teams');
  });

  it('lists the events available for each sport', () => {
    expect(SPORT_EVENT_TYPES.pickleball).toEqual(['singles', 'doubles']);
    expect(SPORT_EVENT_TYPES.basketball).toEqual(['3v3', '4v4', '5v5']);
  });

  it('validates sport values', () => {
    expect(isSport('pickleball')).toBe(true);
    expect(isSport('basketball')).toBe(true);
    expect(isSport('tennis')).toBe(false);
    expect(isSport(null)).toBe(false);
  });
});

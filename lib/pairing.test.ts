import { describe, it, expect } from 'vitest';
import { pairBySkill, pairPlayers, resolvePartner } from './pairing';
import type { ParsedPlayer } from './csv';

let row = 1;
const mk = (
  display_name: string,
  extra: Partial<ParsedPlayer> = {}
): ParsedPlayer => ({
  display_name,
  skill_level: 3.0,
  basketball_skill_level: null,
  email: null,
  group_id: null,
  partner_hint: null,
  wants_random_partner: false,
  row: row++,
  ...extra,
});

const names = (result: ReturnType<typeof pairPlayers>) =>
  result.teams.map(t => `${t.reason}: ${t.players[0].display_name} + ${t.players[1].display_name}`);

describe('resolvePartner', () => {
  const jesse = mk('Jesse Mann');
  const michael = mk('Michael Casement');
  const iris = mk('Iris Gibson');
  const duncan = mk('Duncan Rein');
  const roster = [jesse, michael, iris, duncan, mk('Jake Kelley'), mk('Macie Haynes')];
  const asker = mk('Will Buie');

  it('matches a shortened given name', () => {
    expect(resolvePartner('Jess Mann', asker, roster).player).toBe(jesse);
  });

  it('matches a nickname', () => {
    expect(resolvePartner('Mike Casement', asker, roster).player).toBe(michael);
  });

  it('ignores the note someone tacked on the end', () => {
    expect(resolvePartner('Iris Gibson if not her than random.', asker, roster).player).toBe(iris);
  });

  it('picks the other half when both names of the pair are typed', () => {
    const lucie = mk('Lucie Rein');
    expect(resolvePartner('Lucie & Duncan Rein', lucie, [...roster, lucie]).player).toBe(duncan);
  });

  it('reports a name that is not in the file', () => {
    const match = resolvePartner('Rodney Miller', asker, roster);
    expect(match.player).toBeNull();
    expect(match.note).toContain('no one in the file');
  });

  it('refuses to guess between two people who fit equally well', () => {
    const roster2 = [mk('Chris Adams'), mk('Chris Baker')];
    const match = resolvePartner('Chris', asker, roster2);
    expect(match.player).toBeNull();
    expect(match.note).toContain('Chris Adams or Chris Baker');
  });

  it('accepts a surname on its own when only one person has it', () => {
    expect(resolvePartner('Haynes', asker, roster).player?.display_name).toBe('Macie Haynes');
  });

  it('says nothing when someone answers with their own name', () => {
    const dennis = mk('Dennis Schauer');
    const match = resolvePartner('Dennis Schauer', dennis, [...roster, dennis]);
    expect(match.player).toBeNull();
    expect(match.note).toBeUndefined();
  });
});

describe('pairBySkill', () => {
  const pool = [
    { name: 'Ann', skill: 2.5 },
    { name: 'Bob', skill: 5.0 },
    { name: 'Cal', skill: 3.0 },
    { name: 'Dot', skill: 4.5 },
    { name: 'Eve', skill: 2.0 },
  ];

  it('puts the closest ratings together and hands back the odd one out', () => {
    const { pairs, leftover } = pairBySkill(pool, p => p.skill, p => p.name);
    expect(pairs.map(([a, b]) => `${a.name}+${b.name}`)).toEqual(['Bob+Dot', 'Cal+Ann']);
    expect(leftover?.name).toBe('Eve');
  });

  it('leaves nothing over for an even pool, and does not touch the input', () => {
    const even = pool.slice(0, 4);
    const { pairs, leftover } = pairBySkill(even, p => p.skill, p => p.name);
    expect(pairs).toHaveLength(2);
    expect(leftover).toBeNull();
    expect(even.map(p => p.name)).toEqual(['Ann', 'Bob', 'Cal', 'Dot']);
  });

  it('breaks ties on the same rating by name, so the result is repeatable', () => {
    const tied = [{ name: 'Zoe', skill: 3 }, { name: 'Amy', skill: 3 }];
    expect(pairBySkill(tied, p => p.skill, p => p.name).pairs[0].map(p => p.name)).toEqual([
      'Amy',
      'Zoe',
    ]);
  });
});

describe('pairPlayers', () => {
  it('pairs people who named each other first', () => {
    const chase = mk('Chase Mobbs', { partner_hint: 'Cooper Mobbs' });
    const cooper = mk('Cooper Mobbs', { partner_hint: 'Chase Mobbs' });
    const result = pairPlayers([chase, cooper]);
    expect(names(result)).toEqual(['mutual: Chase Mobbs + Cooper Mobbs']);
    expect(result.warnings).toEqual([]);
  });

  it('honours a one-sided request', () => {
    const jon = mk('Jon Elam', { partner_hint: 'Dennis Schauer' });
    const dennis = mk('Dennis Schauer');
    expect(names(pairPlayers([jon, dennis]))).toEqual(['requested: Jon Elam + Dennis Schauer']);
  });

  it('pairs two people who signed up in the same registration', () => {
    const a = mk('Jenni Baxter', { group_id: '99' });
    const b = mk('Ben Baxter', { group_id: '99' });
    expect(names(pairPlayers([a, b]))).toEqual(['registration: Jenni Baxter + Ben Baxter']);
  });

  it('leaves a registration of three for the organizer', () => {
    const group = ['A One', 'B Two', 'C Three'].map(n => mk(n, { group_id: '7' }));
    const result = pairPlayers(group);
    expect(result.warnings.some(w => w.includes('3 people'))).toBe(true);
    expect(result.teams.every(t => t.reason === 'random')).toBe(true);
  });

  it('pairs the leftovers with the closest rating to them', () => {
    const players = [
      mk('Top Player', { skill_level: 5.0, wants_random_partner: true }),
      mk('High Player', { skill_level: 4.5, wants_random_partner: true }),
      mk('Mid Player', { skill_level: 3.0, wants_random_partner: true }),
      mk('Low Player', { skill_level: 2.0, wants_random_partner: true }),
    ];
    expect(names(pairPlayers(players))).toEqual([
      'random: Top Player + High Player',
      'random: Mid Player + Low Player',
    ]);
  });

  it('flags the odd person out and says who each unmatched request landed with', () => {
    const ryan = mk('Ryan McAnulty', { skill_level: 4.0, partner_hint: 'Rodney Miller' });
    const mandy = mk('Mandy Hewitt', { skill_level: 3.0, wants_random_partner: true });
    const isaac = mk('Isaac Elam', { skill_level: 2.0 });
    const result = pairPlayers([ryan, mandy, isaac]);

    expect(result.unpaired.map(p => p.display_name)).toEqual(['Isaac Elam']);
    expect(result.warnings).toContain(
      'Ryan McAnulty listed “Rodney Miller” as a teammate — no one in the file matches that name; paired with Mandy Hewitt instead.'
    );
    expect(result.warnings).toContain('Isaac Elam has no partner — the head count is odd.');
  });

  it('explains a request for someone who is already taken', () => {
    const a = mk('Ann Ant', { partner_hint: 'Bea Bee' });
    const b = mk('Bea Bee', { partner_hint: 'Cy Cat' });
    const c = mk('Cy Cat', { partner_hint: 'Bea Bee' });
    const d = mk('Dee Dog');
    const result = pairPlayers([a, b, c, d]);

    expect(names(result)).toEqual(['mutual: Bea Bee + Cy Cat', 'random: Ann Ant + Dee Dog']);

    expect(result.warnings).toContain(
      'Ann Ant asked for Bea Bee, who is teamed with Cy Cat; paired with Dee Dog instead.'
    );
  });

  it('in mutual mode, only pairs the people who named each other', () => {
    const players = [
      mk('Chase Mobbs', { partner_hint: 'Cooper Mobbs' }),
      mk('Cooper Mobbs', { partner_hint: 'Chase Mobbs' }),
      mk('Jon Elam', { partner_hint: 'Dennis Schauer' }),
      mk('Dennis Schauer'),
      mk('Jenni Baxter', { group_id: '99' }),
      mk('Ben Baxter', { group_id: '99' }),
    ];
    const result = pairPlayers(players, 'mutual');

    expect(names(result)).toEqual(['mutual: Chase Mobbs + Cooper Mobbs']);
    expect(result.unpaired.map(p => p.display_name)).toEqual([
      'Jon Elam',
      'Dennis Schauer',
      'Jenni Baxter',
      'Ben Baxter',
    ]);
    // Being left to pair by hand is the point of this mode, so the only thing
    // worth saying is that Jon's request went unanswered.
    expect(result.warnings).toEqual([
      'Jon Elam named Dennis Schauer as a teammate, but Dennis Schauer didn\'t name them back — both left to pair by hand.',
    ]);
  });

  it('in named mode, honours one-sided requests but not a shared registration', () => {
    const players = [
      mk('Jon Elam', { partner_hint: 'Dennis Schauer' }),
      mk('Dennis Schauer'),
      mk('Jenni Baxter', { group_id: '99' }),
      mk('Ben Baxter', { group_id: '99' }),
    ];
    const result = pairPlayers(players, 'named');

    expect(names(result)).toEqual(['requested: Jon Elam + Dennis Schauer']);
    expect(result.unpaired.map(p => p.display_name)).toEqual(['Jenni Baxter', 'Ben Baxter']);
  });

  it('still reports a teammate who never registered, in every mode', () => {
    const players = [
      mk('Ryan McAnulty', { partner_hint: 'Rodney Miller' }),
      mk('Someone Else'),
    ];
    for (const mode of ['mutual', 'named', 'all'] as const) {
      expect(pairPlayers(players, mode).warnings[0]).toContain('no one in the file matches');
    }
  });

  it('never puts one player on two teams', () => {
    const players = [
      mk('A One', { partner_hint: 'B Two' }),
      mk('B Two', { partner_hint: 'A One' }),
      mk('C Three', { partner_hint: 'B Two' }),
      mk('D Four', { group_id: '1' }),
      mk('E Five', { group_id: '1' }),
      mk('F Six'),
      mk('G Seven'),
    ];
    const result = pairPlayers(players);
    const seen = result.teams.flatMap(t => t.players.map(p => p.display_name));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length + result.unpaired.length).toBe(players.length);
  });
});

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeSupabase } from './fakeSupabase';
import { assignCourts, isPlayable, syncCourtAssignments } from './courts';
import type { CourtMatch } from './courts';
import { generateSingleEliminationBracket } from './singleElimination';
import { generateDoubleEliminationBracket } from './doubleElimination';
import { recordMatchResult } from './scoring';

let counter = 0;

function match(overrides: Partial<CourtMatch> = {}): CourtMatch {
  counter++;
  return {
    id: `m${counter}`,
    bracket_type: 'winners',
    round: 1,
    position: counter,
    player1_id: 'a',
    player2_id: 'b',
    status: 'pending',
    court: null,
    ...overrides,
  };
}

// Apply the changes assignCourts returns so assertions can read final state.
function applied(matches: CourtMatch[], courtCount: number): (number | null)[] {
  const changes = assignCourts(matches, courtCount);
  return matches.map(m => (changes.has(m.id) ? changes.get(m.id)! : m.court));
}

describe('isPlayable', () => {
  it('needs both sides known', () => {
    expect(isPlayable(match({ player2_id: null }))).toBe(false);
    expect(isPlayable(match())).toBe(true);
  });

  it('excludes byes and finished matches', () => {
    expect(isPlayable(match({ status: 'bye' }))).toBe(false);
    expect(isPlayable(match({ status: 'completed' }))).toBe(false);
    expect(isPlayable(match({ status: 'in_progress' }))).toBe(true);
  });
});

describe('assignCourts', () => {
  it('spreads ready matches across the available courts', () => {
    const matches = [match({ position: 0 }), match({ position: 1 }), match({ position: 2 })];
    expect(applied(matches, 3)).toEqual([1, 2, 3]);
  });

  it('queues the matches that do not fit', () => {
    const matches = [match({ position: 0 }), match({ position: 1 }), match({ position: 2 })];
    expect(applied(matches, 2)).toEqual([1, 2, null]);
  });

  it('leaves matches already on a court where they are', () => {
    const matches = [
      match({ position: 0, court: 2 }),
      match({ position: 1, court: 1 }),
      match({ position: 2 }),
    ];
    expect(applied(matches, 3)).toEqual([2, 1, 3]);
  });

  it('skips matches that are not ready to play', () => {
    const matches = [
      match({ position: 0, status: 'bye', player2_id: null }),
      match({ position: 1, player2_id: null }),
      match({ position: 2 }),
    ];
    expect(applied(matches, 2)).toEqual([null, null, 1]);
  });

  it('reuses the court of a finished match without moving it', () => {
    const done = match({ position: 0, status: 'completed', court: 1 });
    const next = match({ position: 1 });
    const [doneCourt, nextCourt] = applied([done, next], 1);
    // The finished match keeps court 1 as a record of where it was played…
    expect(doneCourt).toBe(1);
    // …but no longer occupies it, so the next match takes it.
    expect(nextCourt).toBe(1);
  });

  it('gives the next free court to whoever plays soonest', () => {
    const later = match({ bracket_type: 'grand_finals', round: 1, position: 0 });
    const earlier = match({ bracket_type: 'winners', round: 1, position: 0 });
    const middle = match({ bracket_type: 'losers', round: 1, position: 0 });
    const courts = applied([later, earlier, middle], 2);
    expect(courts).toEqual([null, 1, 2]);
  });

  it('re-queues matches when the organizer removes a court', () => {
    const matches = [
      match({ position: 0, court: 1 }),
      match({ position: 1, court: 3 }),
      match({ position: 2, court: 2 }),
    ];
    // Down to two courts: the match on court 3 has to move to the free court.
    expect(applied(matches, 2)).toEqual([1, null, 2]);
  });

  it('fills the new courts when the organizer adds one', () => {
    const matches = [match({ position: 0, court: 1 }), match({ position: 1 })];
    expect(applied(matches, 2)).toEqual([1, 2]);
  });

  it('treats a missing or nonsense court count as a single court', () => {
    const matches = [match({ position: 0 }), match({ position: 1 })];
    expect(applied(matches, 0)).toEqual([1, null]);
  });

  it('returns only the matches that actually change', () => {
    const matches = [match({ position: 0, court: 1 }), match({ position: 1 })];
    const changes = assignCourts(matches, 2);
    expect([...changes.keys()]).toEqual([matches[1].id]);
  });
});

describe('syncCourtAssignments', () => {
  it('writes the assignments to the matches table', async () => {
    const db = new FakeSupabase({
      tournaments: [{ id: 'T', court_count: 2 }],
      matches: [
        { id: 'm1', tournament_id: 'T', bracket_type: 'winners', round: 1, position: 0, player1_id: 'a', player2_id: 'b', status: 'pending', court: null },
        { id: 'm2', tournament_id: 'T', bracket_type: 'winners', round: 1, position: 1, player1_id: 'c', player2_id: 'd', status: 'pending', court: null },
        { id: 'm3', tournament_id: 'T', bracket_type: 'winners', round: 1, position: 2, player1_id: 'e', player2_id: 'f', status: 'pending', court: null },
      ],
    });

    await syncCourtAssignments(db as unknown as SupabaseClient, 'T');

    expect(db.tables.matches.map(m => m.court)).toEqual([1, 2, null]);
  });

  it('does nothing for a tournament with no bracket yet', async () => {
    const db = new FakeSupabase({ tournaments: [{ id: 'T', court_count: 2 }], matches: [] });
    await syncCourtAssignments(db as unknown as SupabaseClient, 'T');
    expect(db.tables.matches).toHaveLength(0);
  });
});

// Play a whole bracket out on a fixed number of courts, checking after every
// score that the courts stay sane: never double-booked, never more than we
// have, and never idle while a match waits.
async function playOnCourts(
  generate: (sb: SupabaseClient, players: { id: string; seed: number }[]) => Promise<void>,
  playerCount: number,
  courtCount: number
) {
  const db = new FakeSupabase({
    tournaments: [{ id: 'T', status: 'registration', court_count: courtCount }],
    matches: [],
  });
  const sb = db as unknown as SupabaseClient;
  const players = Array.from({ length: playerCount }, (_, i) => ({ id: `P${i + 1}`, seed: i + 1 }));

  await generate(sb, players);
  await syncCourtAssignments(sb, 'T');

  const check = () => {
    const live = db.tables.matches.filter(m => isPlayable(m as CourtMatch));
    const onCourt = live.filter(m => (m.court ?? null) !== null);
    const queued = live.filter(m => (m.court ?? null) === null);
    const numbers = onCourt.map(m => m.court as number);

    expect(new Set(numbers).size).toBe(numbers.length); // no double-booking
    numbers.forEach(c => expect(c).toBeGreaterThanOrEqual(1));
    numbers.forEach(c => expect(c).toBeLessThanOrEqual(courtCount));
    // No court sits empty while a match is waiting for one.
    if (queued.length > 0) expect(onCourt).toHaveLength(courtCount);
  };

  check();

  for (let guard = 0; guard < 500; guard++) {
    const next = db.tables.matches.find(m => isPlayable(m as CourtMatch) && (m.court ?? null) !== null);
    if (!next) break;
    await recordMatchResult(sb, next.id, 11, 5);
    check();
  }

  const unplayed = db.tables.matches.filter(m => isPlayable(m as CourtMatch));
  return { unplayed, status: db.tables.tournaments[0].status as string };
}

describe('courts across a full tournament', () => {
  for (const courts of [1, 2, 3]) {
    it(`single elimination of 8 finishes on ${courts} court(s)`, async () => {
      const { unplayed, status } = await playOnCourts(
        (sb, p) => generateSingleEliminationBracket(sb, 'T', p),
        8,
        courts
      );
      expect(unplayed).toHaveLength(0);
      expect(status).toBe('completed');
    });

    it(`double elimination of 6 finishes on ${courts} court(s)`, async () => {
      const { unplayed, status } = await playOnCourts(
        (sb, p) => generateDoubleEliminationBracket(sb, 'T', p),
        6,
        courts
      );
      expect(unplayed).toHaveLength(0);
      expect(status).toBe('completed');
    });
  }
});

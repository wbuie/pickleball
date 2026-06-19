import { describe, it, expect } from 'vitest';
import { FakeSupabase } from './fakeSupabase';
import { generateDoubleEliminationBracket } from './doubleElimination';
import { generateSingleEliminationBracket } from './singleElimination';
import { recordMatchResult } from './scoring';
import type { SupabaseClient } from '@supabase/supabase-js';

type Gen = (sb: SupabaseClient, players: { id: string; seed: number }[]) => Promise<void>;

// Generate a bracket and score every match until none are playable, mimicking an
// admin clicking through the whole event. `forceReset` makes the loser-bracket
// champion win Grand Final 1 so the double-elimination reset match gets played.
async function playThrough(gen: Gen, count: number, forceReset = false) {
  const db = new FakeSupabase({ tournaments: [{ id: 'T', status: 'registration' }], matches: [] });
  const sb = db as unknown as SupabaseClient;
  const players = Array.from({ length: count }, (_, i) => ({ id: `P${i + 1}`, seed: i + 1 }));
  await gen(sb, players);

  let guard = 0;
  for (;;) {
    if (guard++ > 500) throw new Error('playthrough did not terminate — a match is stuck');
    const matches = db.tables.matches;
    const m = matches.find(
      (r) => r.player1_id && r.player2_id && r.status !== 'completed' && r.status !== 'bye'
    );
    if (!m) break;

    const gf1 = matches.find((r) => r.bracket_type === 'grand_finals' && r.round === 1);
    if (forceReset && gf1 && m.id === gf1.id) {
      await recordMatchResult(sb, m.id, 5, 11); // LB champ (slot 2) wins → forces reset
    } else {
      const p1Wins = m.player1_id < m.player2_id;
      await recordMatchResult(sb, m.id, p1Wins ? 11 : 5, p1Wins ? 5 : 11);
    }
  }

  const incomplete = db.tables.matches.filter(
    (r) => r.status !== 'completed' && r.status !== 'bye'
  );
  return { status: db.tables.tournaments[0].status as string, incomplete };
}

describe('full bracket playthrough marks the tournament completed', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    it(`single elimination with ${n} players`, async () => {
      const { status, incomplete } = await playThrough(
        (sb, p) => generateSingleEliminationBracket(sb, 'T', p),
        n
      );
      expect(incomplete).toHaveLength(0);
      expect(status).toBe('completed');
    });
  }

  for (const n of [4, 5, 6, 7, 8, 9, 16]) {
    it(`double elimination with ${n} players`, async () => {
      const { status, incomplete } = await playThrough(
        (sb, p) => generateDoubleEliminationBracket(sb, 'T', p),
        n
      );
      expect(incomplete).toHaveLength(0);
      expect(status).toBe('completed');
    });
  }

  it('double elimination completes after a grand-final reset', async () => {
    const { status, incomplete } = await playThrough(
      (sb, p) => generateDoubleEliminationBracket(sb, 'T', p),
      4,
      true
    );
    expect(incomplete).toHaveLength(0);
    expect(status).toBe('completed');
  });
});

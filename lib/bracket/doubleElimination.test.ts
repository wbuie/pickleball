import { describe, it, expect } from 'vitest';
import { FakeSupabase } from './fakeSupabase';
import { generateDoubleEliminationBracket } from './doubleElimination';
import { recordMatchResult } from './scoring';
import type { SupabaseClient } from '@supabase/supabase-js';

function newDb() {
  return new FakeSupabase({ tournaments: [{ id: 'T', status: 'registration' }], matches: [] });
}

type M = {
  id: string;
  status: string;
  bracket_type: string;
  round: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
};

// Play every match that has two assigned players until the bracket is drained,
// always letting the lower-positioned player win (deterministic). Returns the
// number of matches actually played so tests can sanity-check progress.
async function playOut(db: FakeSupabase): Promise<number> {
  const sb = db as unknown as SupabaseClient;
  let played = 0;
  // Generous cap to avoid an infinite loop if wiring is broken.
  for (let guard = 0; guard < 1000; guard++) {
    const matches = db.tables.matches as M[];
    const ready = matches.find(
      m => m.status !== 'completed' && m.status !== 'bye' && m.player1_id && m.player2_id
    );
    if (!ready) break;
    await recordMatchResult(sb, ready.id, 11, 5); // player1 wins
    played++;
  }
  return played;
}

describe('double elimination generation', () => {
  for (const n of [4, 5, 6, 7, 8, 9, 16]) {
    it(`generates a playable bracket for ${n} teams and crowns a champion`, async () => {
      const db = newDb();
      const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));

      await generateDoubleEliminationBracket(db as unknown as SupabaseClient, 'T', players);

      await playOut(db);

      const matches = db.tables.matches as M[];
      // No match should be left stranded with exactly one player assigned.
      const stuck = matches.filter(
        m => m.status !== 'completed' && m.status !== 'bye' &&
          Boolean(m.player1_id) !== Boolean(m.player2_id)
      );
      expect(stuck).toEqual([]);

      // The tournament must finish.
      expect(db.tables.tournaments[0].status).toBe('completed');
    });
  }

  it('gives the top seed a bye in the winners bracket for an odd field', async () => {
    const db = newDb();
    const players = [1, 2, 3, 4, 5].map(s => ({ id: `p${s}`, seed: s }));
    await generateDoubleEliminationBracket(db as unknown as SupabaseClient, 'T', players);

    const matches = db.tables.matches as M[];
    // Seed 1 (p1) should not have to play a real first-round match.
    const wbR1 = matches.filter(m => m.bracket_type === 'winners' && m.round === 1);
    const seed1Match = wbR1.find(m => m.player1_id === 'p1' || m.player2_id === 'p1');
    // A bye auto-completes with the lone player as the winner (no opponent).
    expect(seed1Match?.status).toBe('completed');
    expect(seed1Match?.winner_id).toBe('p1');
    expect(seed1Match?.player1_id === null || seed1Match?.player2_id === null).toBe(true);
  });
});

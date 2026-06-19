import { describe, it, expect } from 'vitest';
import { FakeSupabase } from './fakeSupabase';
import { generateDoubleEliminationBracket } from './doubleElimination';
import { generateSingleEliminationBracket } from './singleElimination';
import { recordMatchResult } from './scoring';
import type { SupabaseClient } from '@supabase/supabase-js';

type Gen = (sb: SupabaseClient, players: { id: string; seed: number }[]) => Promise<void>;

// Generate a bracket and score every playable match until none remain, the way
// an admin clicks through an event. Returns the final tournament status, any
// matches left unresolved, and the total games actually played.
async function playThrough(gen: Gen, count: number) {
  const db = new FakeSupabase({ tournaments: [{ id: 'T', status: 'registration' }], matches: [] });
  const sb = db as unknown as SupabaseClient;
  const teams = Array.from({ length: count }, (_, i) => ({ id: `Team${i + 1}`, seed: i + 1 }));
  await gen(sb, teams);

  let played = 0;
  let guard = 0;
  for (;;) {
    if (guard++ > 500) throw new Error('playthrough did not terminate — a match is stuck');
    const matches = db.tables.matches;
    const m = matches.find(
      (r) => r.player1_id && r.player2_id && r.status !== 'completed' && r.status !== 'bye'
    );
    if (!m) break;
    const p1Wins = m.player1_id < m.player2_id;
    await recordMatchResult(sb, m.id, p1Wins ? 11 : 5, p1Wins ? 5 : 11);
    played++;
  }

  const all = db.tables.matches;
  const incomplete = all.filter((r) => r.status !== 'completed' && r.status !== 'bye');

  // Mirror how the tournament page resolves the champion: for double
  // elimination it's the winner of the highest-round *completed* grand-finals
  // match (the reset is skipped to a bye when the WB champ wins GF1); for single
  // elimination it's the winner of the final winners-bracket match.
  const grandFinal = all
    .filter((r) => r.bracket_type === 'grand_finals' && r.status === 'completed')
    .sort((a, b) => b.round - a.round)[0];
  const finalWb = all
    .filter((r) => r.bracket_type === 'winners')
    .sort((a, b) => b.round - a.round)[0];
  const champion = grandFinal?.winner_id ?? finalWb?.winner_id;
  return { status: db.tables.tournaments[0].status as string, incomplete, played, champion };
}

// Odd fields are the tricky case: they can never be a power of two, so the
// bracket always carries byes that have to advance and collapse cleanly.
const ODD_FIELDS = [3, 5, 7, 9, 11, 13, 15];

describe('odd number of teams runs through the whole system', () => {
  for (const n of ODD_FIELDS) {
    it(`single elimination, ${n} teams`, async () => {
      const { status, incomplete, played, champion } = await playThrough(
        (sb, p) => generateSingleEliminationBracket(sb, 'T', p),
        n
      );
      console.log(`single/${n}: status=${status} played=${played} champion=${champion} stuck=${incomplete.length}`);
      expect(incomplete).toHaveLength(0);
      expect(status).toBe('completed');
      expect(champion).toBeTruthy();
    });
  }

  // Double elimination needs at least 4 entries.
  for (const n of ODD_FIELDS.filter((n) => n >= 5)) {
    it(`double elimination, ${n} teams`, async () => {
      const { status, incomplete, played, champion } = await playThrough(
        (sb, p) => generateDoubleEliminationBracket(sb, 'T', p),
        n
      );
      console.log(`double/${n}: status=${status} played=${played} champion=${champion} stuck=${incomplete.length}`);
      expect(incomplete).toHaveLength(0);
      expect(status).toBe('completed');
      expect(champion).toBeTruthy();
    });
  }
});

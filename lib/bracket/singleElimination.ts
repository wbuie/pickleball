import type { SupabaseClient } from '@supabase/supabase-js';
import { nextPowerOf2, getSeedOrder } from './utils';

interface Player {
  id: string;
  seed: number;
}

type MatchInsert = {
  tournament_id: string;
  bracket_type: string;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  status: string;
};

export async function generateSingleEliminationBracket(
  supabase: SupabaseClient,
  tournamentId: string,
  players: Player[]
): Promise<void> {
  const n = players.length;
  if (n < 2) throw new Error('Need at least 2 players');

  const bracketSize = nextPowerOf2(n);
  const numRounds = Math.log2(bracketSize);
  const seedOrder = getSeedOrder(bracketSize);

  // Map seed → player id (null = bye)
  const slotPlayer = (slotIndex: number): string | null => {
    const seed = seedOrder[slotIndex];
    if (seed > n) return null;
    const p = players.find(pl => pl.seed === seed);
    return p?.id ?? null;
  };

  // Step 1: Create all match stubs without next_match links
  const matchStubs: MatchInsert[] = [];

  for (let round = 1; round <= numRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let pos = 0; pos < matchesInRound; pos++) {
      let p1: string | null = null;
      let p2: string | null = null;
      let status = 'pending';

      if (round === 1) {
        p1 = slotPlayer(pos * 2);
        p2 = slotPlayer(pos * 2 + 1);
        if (p1 === null || p2 === null) status = 'bye';
      }

      matchStubs.push({
        tournament_id: tournamentId,
        bracket_type: 'winners',
        round,
        position: pos,
        player1_id: p1,
        player2_id: p2,
        status,
      });
    }
  }

  // Step 2: Insert all matches
  const { data: inserted, error } = await supabase
    .from('matches')
    .insert(matchStubs)
    .select('id, round, position, player1_id, player2_id, status');

  if (error) throw new Error(`Failed to insert matches: ${error.message}`);
  if (!inserted) throw new Error('No matches returned after insert');

  // Build lookup: "round_pos" → match
  const lookup = new Map<string, (typeof inserted)[0]>();
  for (const m of inserted) {
    lookup.set(`${m.round}_${m.position}`, m);
  }

  // Step 3: Wire up next_match_id links
  const updates: { id: string; winner_next_match_id: string; winner_next_slot: number }[] = [];

  for (let round = 1; round < numRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let pos = 0; pos < matchesInRound; pos++) {
      const current = lookup.get(`${round}_${pos}`)!;
      const nextPos = Math.floor(pos / 2);
      const nextSlot = (pos % 2) + 1;
      const next = lookup.get(`${round + 1}_${nextPos}`)!;

      updates.push({
        id: current.id,
        winner_next_match_id: next.id,
        winner_next_slot: nextSlot,
      });
    }
  }

  for (const update of updates) {
    await supabase
      .from('matches')
      .update({
        winner_next_match_id: update.winner_next_match_id,
        winner_next_slot: update.winner_next_slot,
      })
      .eq('id', update.id);
  }

  // Step 4: Auto-advance players with byes
  const byeMatches = inserted.filter(m => m.status === 'bye');

  for (const byeMatch of byeMatches) {
    const winnerId = byeMatch.player1_id || byeMatch.player2_id;
    if (!winnerId) continue;

    // Mark match as completed
    await supabase
      .from('matches')
      .update({ winner_id: winnerId, status: 'completed' })
      .eq('id', byeMatch.id);

    // Advance winner to next match
    const nextMatchInfo = updates.find(u => u.id === byeMatch.id);
    if (nextMatchInfo) {
      const field = nextMatchInfo.winner_next_slot === 1 ? 'player1_id' : 'player2_id';
      await supabase
        .from('matches')
        .update({ [field]: winnerId })
        .eq('id', nextMatchInfo.winner_next_match_id);
    }
  }

  // Step 5: Update tournament status
  await supabase
    .from('tournaments')
    .update({ status: 'active' })
    .eq('id', tournamentId);
}

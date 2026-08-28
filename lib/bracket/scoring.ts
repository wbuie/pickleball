import type { SupabaseClient } from '@supabase/supabase-js';
import { syncCourtAssignments } from './courts';

type MatchRow = {
  id: string;
  tournament_id: string;
  bracket_type: string;
  round: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  loser_id: string | null;
  status: string;
  winner_next_match_id: string | null;
  loser_next_match_id: string | null;
  winner_next_slot: number | null;
  loser_next_slot: number | null;
};

// Remove a player id from a downstream match slot if it currently holds them.
// Used when re-scoring changes who advanced.
async function clearSlotIfHolds(
  supabase: SupabaseClient,
  matchId: string | null,
  slot: number | null,
  playerId: string | null
): Promise<void> {
  if (!matchId || !slot || !playerId) return;
  const field = slot === 1 ? 'player1_id' : 'player2_id';
  const { data } = await supabase.from('matches').select(`id, ${field}`).eq('id', matchId).single();
  const current = (data as Record<string, string | null> | null)?.[field];
  if (current === playerId) {
    await supabase.from('matches').update({ [field]: null }).eq('id', matchId);
  }
}

export async function recordMatchResult(
  supabase: SupabaseClient,
  matchId: string,
  player1Score: number,
  player2Score: number
): Promise<void> {
  if (!Number.isInteger(player1Score) || !Number.isInteger(player2Score)) {
    throw new Error('Scores must be whole numbers');
  }
  if (player1Score < 0 || player2Score < 0) {
    throw new Error('Scores cannot be negative');
  }
  if (player1Score === player2Score) {
    throw new Error('Scores cannot be tied — one player must win');
  }

  // Fetch full match details
  const { data: match, error: fetchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single<MatchRow>();

  if (fetchError || !match) throw new Error('Match not found');
  if (!match.player1_id || !match.player2_id) {
    throw new Error('Both players must be assigned before scoring');
  }

  const winnerId = player1Score > player2Score ? match.player1_id : match.player2_id;
  const loserId = player1Score > player2Score ? match.player2_id : match.player1_id;

  const isEdit = match.status === 'completed';
  const winnerChanged = isEdit && match.winner_id !== null && match.winner_id !== winnerId;

  // When an edit flips the winner, anything already decided downstream is now
  // invalid. We only allow it if the next matches haven't been played yet —
  // otherwise the safe move is to ask the admin to regenerate the bracket.
  if (winnerChanged) {
    for (const nextId of [match.winner_next_match_id, match.loser_next_match_id]) {
      if (!nextId) continue;
      const { data: nextMatch } = await supabase
        .from('matches')
        .select('status')
        .eq('id', nextId)
        .single<{ status: string }>();
      if (nextMatch?.status === 'completed') {
        throw new Error(
          'Cannot change the winner: a later match has already been played. Regenerate the bracket to redo results from here.'
        );
      }
    }

    // Pull the previous winner/loser out of the slots they were advanced into.
    await clearSlotIfHolds(supabase, match.winner_next_match_id, match.winner_next_slot, match.winner_id);
    await clearSlotIfHolds(supabase, match.loser_next_match_id, match.loser_next_slot, match.loser_id);
  }

  // Update match result
  const { error: updateError } = await supabase
    .from('matches')
    .update({
      player1_score: player1Score,
      player2_score: player2Score,
      winner_id: winnerId,
      loser_id: loserId,
      status: 'completed',
    })
    .eq('id', matchId);

  if (updateError) throw new Error(`Failed to update match: ${updateError.message}`);

  // Advance winner to next match
  if (match.winner_next_match_id) {
    const winnerField = match.winner_next_slot === 1 ? 'player1_id' : 'player2_id';
    await supabase
      .from('matches')
      .update({ [winnerField]: winnerId })
      .eq('id', match.winner_next_match_id);
  }

  // Route loser (double elimination)
  if (match.loser_next_match_id) {
    // Special case: Grand Finals round 1
    if (match.bracket_type === 'grand_finals' && match.round === 1) {
      // Only play reset if LB champion won (player2 = LB side)
      if (winnerId === match.player2_id) {
        // LB champion won — set up reset match with both players
        await supabase
          .from('matches')
          .update({
            player1_id: winnerId, // LB champion (now has 0 losses)
            player2_id: loserId, // WB champion (just got first loss)
            status: 'pending',
          })
          .eq('id', match.loser_next_match_id);
      } else {
        // WB champion won — reset isn't needed; clear it back out and skip it.
        await supabase
          .from('matches')
          .update({ player1_id: null, player2_id: null, status: 'bye' })
          .eq('id', match.loser_next_match_id);
      }
    } else {
      const loserField = match.loser_next_slot === 1 ? 'player1_id' : 'player2_id';
      await supabase
        .from('matches')
        .update({ [loserField]: loserId })
        .eq('id', match.loser_next_match_id);
    }
  }

  // Check if this completes (or re-opens) the tournament
  if (match.bracket_type === 'grand_finals') {
    const isReset = match.round === 2;
    const isGF1WithWBWinner = match.round === 1 && winnerId === match.player1_id; // player1 = WB side

    await supabase
      .from('tournaments')
      .update({ status: isReset || isGF1WithWBWinner ? 'completed' : 'active' })
      .eq('id', match.tournament_id);
  } else if (!match.winner_next_match_id) {
    // Single elimination has no grand finals — the one match with nowhere to
    // advance the winner is the championship. Completing it ends the tournament.
    await supabase
      .from('tournaments')
      .update({ status: 'completed' })
      .eq('id', match.tournament_id);
  }

  // Roll the court queue forward: this match has freed its court, and whatever
  // it just made playable downstream is ready to be given one.
  await syncCourtAssignments(supabase, match.tournament_id);
}

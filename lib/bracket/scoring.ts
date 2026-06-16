import type { SupabaseClient } from '@supabase/supabase-js';

export async function recordMatchResult(
  supabase: SupabaseClient,
  matchId: string,
  player1Score: number,
  player2Score: number
): Promise<void> {
  if (player1Score === player2Score) {
    throw new Error('Scores cannot be tied — one player must win');
  }

  // Fetch full match details
  const { data: match, error: fetchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (fetchError || !match) throw new Error('Match not found');
  if (!match.player1_id || !match.player2_id) {
    throw new Error('Both players must be assigned before scoring');
  }

  const winnerId = player1Score > player2Score ? match.player1_id : match.player2_id;
  const loserId = player1Score > player2Score ? match.player2_id : match.player1_id;

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
            player1_id: winnerId,  // LB champion (now has 0 losses)
            player2_id: loserId,   // WB champion (just got first loss)
            status: 'pending',
          })
          .eq('id', match.loser_next_match_id);
      } else {
        // WB champion won — mark reset as skipped
        await supabase
          .from('matches')
          .update({ status: 'bye' })
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

  // Check if this completes the tournament
  if (match.bracket_type === 'grand_finals') {
    const isReset = match.round === 2;
    const isGF1WithWBWinner =
      match.round === 1 && winnerId === match.player1_id; // player1 = WB side

    if (isReset || isGF1WithWBWinner) {
      await supabase
        .from('tournaments')
        .update({ status: 'completed' })
        .eq('id', match.tournament_id);
    }
  }
}

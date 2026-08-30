import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { recordMatchResult } from '@/lib/bracket/scoring';
import { canScoreMatch, scoreAccessFor } from '@/lib/scoreAccess';
import type { MatchStatus } from '@/lib/types/app';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;

    const userSupabase = await createClient();
    const { data: { user } } = await userSupabase.auth.getUser();

    let isAdmin = false;
    if (user) {
      const { data: profile } = await userSupabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      isAdmin = Boolean(profile?.is_admin);
    }

    const supabase = await createAdminClient();

    // Who may score depends on the tournament this match belongs to: organizers
    // always can; anyone else only on an event whose organizers have opened
    // scoring up, and only for a match that hasn't been played yet.
    const { data: match } = await supabase
      .from('matches')
      .select('id, tournament_id, status, player1_id, player2_id')
      .eq('id', matchId)
      .single<{
        id: string;
        tournament_id: string;
        status: MatchStatus;
        player1_id: string | null;
        player2_id: string | null;
      }>();
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('open_scoring')
      .eq('id', match.tournament_id)
      .single<{ open_scoring: boolean | null }>();

    const access = scoreAccessFor(isAdmin, tournament?.open_scoring);

    if (access === 'none') {
      // Signed in but not an organizer is a permissions problem, not a missing
      // session — say so, so the client doesn't send them to the login page.
      return user
        ? NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canScoreMatch(access, match)) {
      const error =
        match.status === 'completed'
          ? 'This score is already final — ask an organizer to change it'
          : 'This match is not ready to be scored';
      return NextResponse.json({ error }, { status: 403 });
    }

    const body = await request.json();
    const { player1Score, player2Score } = body;

    if (typeof player1Score !== 'number' || typeof player2Score !== 'number') {
      return NextResponse.json({ error: 'Scores must be numbers' }, { status: 400 });
    }

    await recordMatchResult(supabase, matchId, player1Score, player2Score);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

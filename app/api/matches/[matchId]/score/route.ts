import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { recordMatchResult } from '@/lib/bracket/scoring';
import { canScoreMatch } from '@/lib/types/app';
import type { MatchStatus } from '@/lib/types/app';

// Highest score the form accepts, and the ceiling enforced here — with open
// scoring on, this input comes from whoever is standing on the court.
const MAX_SCORE = 99;

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
      isAdmin = profile?.is_admin ?? false;
    }

    const supabase = await createAdminClient();

    // Who may score this depends on the tournament it belongs to: admins always,
    // and anyone at all when the organizer has turned on open scoring.
    const { data: match } = await supabase
      .from('matches')
      .select('tournament_id, status')
      .eq('id', matchId)
      .single();
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('open_scoring')
      .eq('id', match.tournament_id)
      .single();
    const openScoring = tournament?.open_scoring ?? false;

    if (!canScoreMatch({ isAdmin, openScoring, status: match.status as MatchStatus })) {
      if (!openScoring) {
        return user
          ? NextResponse.json({ error: 'Admin access required' }, { status: 403 })
          : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // Open scoring is on, but this match already has a result — only an admin
      // can change one, so a mistake can't be quietly rewritten.
      return NextResponse.json(
        { error: 'This match has already been scored — ask an organizer to change it' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { player1Score, player2Score } = body;

    if (typeof player1Score !== 'number' || typeof player2Score !== 'number') {
      return NextResponse.json({ error: 'Scores must be numbers' }, { status: 400 });
    }
    for (const score of [player1Score, player2Score]) {
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        return NextResponse.json(
          { error: `Scores must be whole numbers between 0 and ${MAX_SCORE}` },
          { status: 400 }
        );
      }
    }
    if (player1Score === player2Score) {
      return NextResponse.json({ error: 'Scores cannot be tied' }, { status: 400 });
    }

    await recordMatchResult(supabase, matchId, player1Score, player2Score);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

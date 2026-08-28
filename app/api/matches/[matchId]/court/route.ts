import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncCourtAssignments } from '@/lib/bracket/courts';
import { MIN_COURTS } from '@/lib/types/app';

// Move a match to a specific court (or send it back to the queue with
// `court: null`). Courts are handed out automatically as matches become ready;
// this is the organizer's override for when reality disagrees — a court is wet,
// a game is running long, two groups swapped.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;

    const userSupabase = await createClient();
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await userSupabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const court: number | null = body.court === null || body.court === undefined ? null : body.court;
    if (court !== null && !Number.isInteger(court)) {
      return NextResponse.json({ error: 'Court must be a whole number' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const { data: match } = await supabase
      .from('matches')
      .select('id, tournament_id, status')
      .eq('id', matchId)
      .single<{ id: string; tournament_id: string; status: string }>();
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('court_count')
      .eq('id', match.tournament_id)
      .single<{ court_count: number }>();
    const courtCount = tournament?.court_count ?? 1;

    if (court !== null && (court < MIN_COURTS || court > courtCount)) {
      return NextResponse.json(
        { error: `This tournament only has ${courtCount} court${courtCount === 1 ? '' : 's'}` },
        { status: 400 }
      );
    }

    // A court holds one match at a time: bump whoever is standing on it first.
    if (court !== null) {
      const { data: occupants } = await supabase
        .from('matches')
        .select('id, status')
        .eq('tournament_id', match.tournament_id)
        .eq('court', court);
      for (const other of occupants ?? []) {
        if (other.id === matchId || other.status === 'completed' || other.status === 'bye') continue;
        await supabase.from('matches').update({ court: null }).eq('id', other.id);
      }
    }

    const { error } = await supabase.from('matches').update({ court }).eq('id', matchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Whatever this freed up goes to the next match waiting in line.
    await syncCourtAssignments(supabase, match.tournament_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

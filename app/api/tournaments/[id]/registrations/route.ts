import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { resequenceSeeds } from '@/lib/bracket/utils';
import { entryName } from '@/lib/types/app';
import type { EntryLike } from '@/lib/types/app';

// Remove an entry from a tournament: a whole team (doubles pair or basketball
// roster) or a single player, whichever the entry happens to be. People drop out
// the morning of an event, and an organizer needs to take them off the list
// without going near the database.
//
// Only allowed before the bracket exists — afterwards the matches point at this
// entry, so dropping it would leave holes in the bracket. To remove just one
// player from a doubles pair, unpair the team first (which hands each player
// their own solo entry) and then delete the one who is out.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const body = await request.json().catch(() => ({}));
    const registrationId = (body?.registrationId ?? '').trim();
    if (!registrationId) {
      return NextResponse.json({ error: 'Missing registration' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', id)
      .single();
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    if (tournament.status === 'active' || tournament.status === 'completed') {
      return NextResponse.json(
        { error: 'The bracket has been generated — entries can no longer be removed' },
        { status: 400 }
      );
    }

    // Read the entry first so the response can name who was removed (the panel
    // echoes it back to the organizer as confirmation).
    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('id, tournament_id, team_name, profiles:player_id(display_name), partner:partner_id(display_name)')
      .eq('id', registrationId)
      .single();
    if (!reg || reg.tournament_id !== id) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }
    const removedName = entryName(reg as unknown as EntryLike);

    // registration_members rows go with it (ON DELETE CASCADE), so the roster
    // of a basketball team is cleaned up here too.
    const { error: deleteError } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('id', registrationId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    // Close the gap the entry left in the seeds, so the remaining field is still
    // numbered 1..n when the bracket is generated.
    const { data: remaining } = await supabase
      .from('tournament_registrations')
      .select('id, seed')
      .eq('tournament_id', id);

    for (const { id: regId, seed } of resequenceSeeds(remaining ?? [])) {
      await supabase.from('tournament_registrations').update({ seed }).eq('id', regId);
    }

    return NextResponse.json({ success: true, removed: removedName });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

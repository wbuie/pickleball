import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isRosterEvent, TEAM_SIZE } from '@/lib/types/app';
import type { EventType } from '@/lib/types/app';

// Admin roster management for basketball teams: add or remove a roster member,
// or rename a team. The bracket engine works on the entry (registration) id, so
// none of this touches matches — it just shapes who is on each team pre-bracket.

async function guard(id: string) {
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };

  const { data: profile } = await userSupabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return { error: 'Admin access required', status: 403 as const };

  const supabase = await createAdminClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('status, event_type')
    .eq('id', id)
    .single();
  if (!tournament) return { error: 'Tournament not found', status: 404 as const };
  if (!isRosterEvent(tournament.event_type as EventType)) {
    return { error: 'Rosters only apply to team events', status: 400 as const };
  }
  if (tournament.status === 'active' || tournament.status === 'completed') {
    return { error: 'Rosters are locked — the bracket has already been generated', status: 400 as const };
  }
  return { supabase, eventType: tournament.event_type as EventType };
}

// Everyone already on a team in this tournament (captains, partners, members).
async function takenPlayers(supabase: Awaited<ReturnType<typeof createAdminClient>>, tournamentId: string) {
  const { data } = await supabase
    .from('tournament_registrations')
    .select('id, player_id, partner_id, members:registration_members(player_id)')
    .eq('tournament_id', tournamentId);
  const taken = new Set<string>();
  (data || []).forEach(r => {
    taken.add(r.player_id);
    if (r.partner_id) taken.add(r.partner_id);
    (r.members as { player_id: string }[] | null)?.forEach(m => taken.add(m.player_id));
  });
  return taken;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const g = await guard(id);
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const { supabase, eventType } = g;

    const { registrationId, playerId } = await request.json();
    if (!registrationId || !playerId) {
      return NextResponse.json({ error: 'Missing team or player' }, { status: 400 });
    }

    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('id, player_id, tournament_id, members:registration_members(id)')
      .eq('id', registrationId)
      .single();
    if (!reg || reg.tournament_id !== id) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Roster is full when captain + members already fills the team size.
    const currentMembers = (reg.members as { id: string }[] | null)?.length ?? 0;
    if (currentMembers + 1 >= TEAM_SIZE[eventType]) {
      return NextResponse.json({ error: `This team is already full for ${eventType}` }, { status: 400 });
    }

    if (playerId === reg.player_id) {
      return NextResponse.json({ error: 'That player is already the team captain' }, { status: 400 });
    }
    if ((await takenPlayers(supabase, id)).has(playerId)) {
      return NextResponse.json({ error: 'That player is already on a team in this tournament' }, { status: 409 });
    }

    const { error } = await supabase
      .from('registration_members')
      .insert({ registration_id: registrationId, player_id: playerId });
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That player is already on this team' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const g = await guard(id);
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const { supabase } = g;

    const { registrationId, playerId } = await request.json();
    if (!registrationId || !playerId) {
      return NextResponse.json({ error: 'Missing team or player' }, { status: 400 });
    }

    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('id, tournament_id')
      .eq('id', registrationId)
      .single();
    if (!reg || reg.tournament_id !== id) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('registration_members')
      .delete()
      .eq('registration_id', registrationId)
      .eq('player_id', playerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const g = await guard(id);
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });
    const { supabase } = g;

    const { registrationId, teamName } = await request.json();
    const trimmed = (teamName ?? '').trim();
    if (!registrationId) return NextResponse.json({ error: 'Missing team' }, { status: 400 });
    if (!trimmed) return NextResponse.json({ error: 'A team needs a name' }, { status: 400 });

    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('id, tournament_id')
      .eq('id', registrationId)
      .single();
    if (!reg || reg.tournament_id !== id) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('tournament_registrations')
      .update({ team_name: trimmed })
      .eq('id', registrationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

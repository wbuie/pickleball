import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isRosterEvent, TEAM_SIZE } from '@/lib/types/app';
import type { EventType } from '@/lib/types/app';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check tournament status
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('status, max_players, event_type')
      .eq('id', id)
      .single();

    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Registration is closed' }, { status: 400 });
    }

    const eventType = tournament.event_type as EventType;
    const body = await request.json().catch(() => ({}));

    // Everyone already claimed by a team in this event (captains, partners, and
    // roster members) — a player can only appear on one entry.
    const takenPlayers = async (): Promise<Set<string>> => {
      const { data: existing } = await supabase
        .from('tournament_registrations')
        .select('id, player_id, partner_id, members:registration_members(player_id)')
        .eq('tournament_id', id);
      const taken = new Set<string>();
      (existing || []).forEach(r => {
        taken.add(r.player_id);
        if (r.partner_id) taken.add(r.partner_id);
        (r.members as { player_id: string }[] | null)?.forEach(m => taken.add(m.player_id));
      });
      return taken;
    };

    let partnerId: string | null = null;
    let teamName: string | null = null;
    let memberIds: string[] = [];

    if (eventType === 'doubles') {
      partnerId = body?.partner_id ?? null;
      if (!partnerId) {
        return NextResponse.json({ error: 'Doubles entries need a partner' }, { status: 400 });
      }
      if (partnerId === user.id) {
        return NextResponse.json({ error: 'You cannot partner with yourself' }, { status: 400 });
      }
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', partnerId)
        .single();
      if (!partnerProfile) {
        return NextResponse.json({ error: 'Partner not found' }, { status: 400 });
      }
      if ((await takenPlayers()).has(partnerId)) {
        return NextResponse.json({ error: 'That player is already on a team in this tournament' }, { status: 409 });
      }
    } else if (isRosterEvent(eventType)) {
      teamName = (body?.team_name ?? '').trim();
      if (!teamName) {
        return NextResponse.json({ error: 'Your team needs a name' }, { status: 400 });
      }
      // Dedup, drop the captain, keep only real ids.
      memberIds = Array.from(
        new Set(((body?.member_ids ?? []) as unknown[]).map(String).filter(Boolean))
      ).filter(pid => pid !== user.id);

      const maxMembers = TEAM_SIZE[eventType] - 1; // captain fills one slot
      if (memberIds.length > maxMembers) {
        return NextResponse.json(
          { error: `A ${eventType} team can have at most ${maxMembers} additional players` },
          { status: 400 }
        );
      }

      if (memberIds.length > 0) {
        const { data: memberProfiles } = await supabase
          .from('profiles')
          .select('id')
          .in('id', memberIds);
        if ((memberProfiles?.length ?? 0) !== memberIds.length) {
          return NextResponse.json({ error: 'One or more players were not found' }, { status: 400 });
        }
        const taken = await takenPlayers();
        const conflict = memberIds.find(pid => taken.has(pid));
        if (conflict) {
          return NextResponse.json(
            { error: 'One of your players is already on a team in this tournament' },
            { status: 409 }
          );
        }
      }
    }

    // Check capacity (entries = players for singles, teams otherwise)
    const { count } = await supabase
      .from('tournament_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', id);

    if (count !== null && count >= tournament.max_players) {
      return NextResponse.json({ error: 'Tournament is full' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tournament_registrations')
      .insert({ tournament_id: id, player_id: user.id, partner_id: partnerId, team_name: teamName })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already registered' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Attach any roster members to the new team.
    if (memberIds.length > 0) {
      const rows = memberIds.map(pid => ({ registration_id: data.id, player_id: pid }));
      const { error: memberError } = await supabase.from('registration_members').insert(rows);
      if (memberError) {
        // Roll the team back so a partial roster can't linger.
        await supabase.from('tournament_registrations').delete().eq('id', data.id);
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ registration: data }, { status: 201 });
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
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // The captain (or a doubles partner) can withdraw the whole entry. A roster
    // member who is not the captain only leaves their own team, handled below.
    const { data: captainEntries } = await supabase
      .from('tournament_registrations')
      .select('id')
      .eq('tournament_id', id)
      .or(`player_id.eq.${user.id},partner_id.eq.${user.id}`);

    if ((captainEntries?.length ?? 0) > 0) {
      const { error } = await supabase
        .from('tournament_registrations')
        .delete()
        .eq('tournament_id', id)
        .or(`player_id.eq.${user.id},partner_id.eq.${user.id}`);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // Otherwise the user is a roster member leaving their team.
    const { data: regs } = await supabase
      .from('tournament_registrations')
      .select('id')
      .eq('tournament_id', id);
    const regIds = (regs || []).map(r => r.id);
    if (regIds.length > 0) {
      const { error } = await supabase
        .from('registration_members')
        .delete()
        .eq('player_id', user.id)
        .in('registration_id', regIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

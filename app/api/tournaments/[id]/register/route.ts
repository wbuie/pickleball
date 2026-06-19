import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    let partnerId: string | null = null;
    if (tournament.event_type === 'doubles') {
      const body = await request.json().catch(() => ({}));
      partnerId = body?.partner_id ?? null;
      if (!partnerId) {
        return NextResponse.json({ error: 'Doubles entries need a partner' }, { status: 400 });
      }
      if (partnerId === user.id) {
        return NextResponse.json({ error: 'You cannot partner with yourself' }, { status: 400 });
      }
      // Partner must be a real member and not already on a team in this event.
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', partnerId)
        .single();
      if (!partnerProfile) {
        return NextResponse.json({ error: 'Partner not found' }, { status: 400 });
      }

      const { data: existing } = await supabase
        .from('tournament_registrations')
        .select('player_id, partner_id')
        .eq('tournament_id', id);
      const taken = new Set<string>();
      (existing || []).forEach(r => {
        taken.add(r.player_id);
        if (r.partner_id) taken.add(r.partner_id);
      });
      if (taken.has(partnerId)) {
        return NextResponse.json({ error: 'That player is already on a team in this tournament' }, { status: 409 });
      }
    }

    // Check capacity (entries = players for singles, teams for doubles)
    const { count } = await supabase
      .from('tournament_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', id);

    if (count !== null && count >= tournament.max_players) {
      return NextResponse.json({ error: 'Tournament is full' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tournament_registrations')
      .insert({ tournament_id: id, player_id: user.id, partner_id: partnerId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already registered' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    // Either teammate can withdraw the team (captain or doubles partner).
    const { error } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('tournament_id', id)
      .or(`player_id.eq.${user.id},partner_id.eq.${user.id}`);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

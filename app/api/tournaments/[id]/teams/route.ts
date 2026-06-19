import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

// Admin team management for doubles: pair two registered players into one team,
// or split a team back into individual entries. Used for the "admin builds the
// teams" flow (players sign up solo, the organizer pairs them).
export async function PUT(
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
    if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const supabase = await createAdminClient();

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('status, event_type')
      .eq('id', id)
      .single();
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    if (tournament.event_type !== 'doubles') {
      return NextResponse.json({ error: 'Teams only apply to doubles events' }, { status: 400 });
    }
    if (tournament.status === 'active' || tournament.status === 'completed') {
      return NextResponse.json({ error: 'Teams are locked — the bracket has already been generated' }, { status: 400 });
    }

    const body = await request.json();
    const { action, registrationId } = body as { action: 'pair' | 'unpair'; registrationId: string };

    if (!registrationId) {
      return NextResponse.json({ error: 'Missing registration' }, { status: 400 });
    }

    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('id, player_id, partner_id, tournament_id')
      .eq('id', registrationId)
      .single();
    if (!reg || reg.tournament_id !== id) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    if (action === 'unpair') {
      const oldPartner = reg.partner_id;
      await supabase.from('tournament_registrations').update({ partner_id: null }).eq('id', registrationId);

      // Give the freed-up partner their own solo entry back, if they don't
      // already have one in this tournament.
      if (oldPartner) {
        const { data: already } = await supabase
          .from('tournament_registrations')
          .select('id')
          .eq('tournament_id', id)
          .eq('player_id', oldPartner)
          .maybeSingle();
        if (!already) {
          await supabase
            .from('tournament_registrations')
            .insert({ tournament_id: id, player_id: oldPartner });
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'pair') {
      const { partnerPlayerId } = body as { partnerPlayerId: string };
      if (!partnerPlayerId) return NextResponse.json({ error: 'Missing partner' }, { status: 400 });
      if (partnerPlayerId === reg.player_id) {
        return NextResponse.json({ error: 'A player cannot partner with themselves' }, { status: 400 });
      }
      if (reg.partner_id) {
        return NextResponse.json({ error: 'This entry already has a partner' }, { status: 400 });
      }

      // Partner must not already be on another team in this event.
      const { data: existing } = await supabase
        .from('tournament_registrations')
        .select('id, player_id, partner_id')
        .eq('tournament_id', id);
      const onAnotherTeam = (existing || []).some(
        r => r.id !== registrationId && (r.player_id === partnerPlayerId || r.partner_id === partnerPlayerId)
      );
      const partnerSoloEntry = (existing || []).find(
        r => r.id !== registrationId && r.player_id === partnerPlayerId && !r.partner_id
      );
      if (onAnotherTeam && !partnerSoloEntry) {
        return NextResponse.json({ error: 'That player is already on a team' }, { status: 409 });
      }

      await supabase
        .from('tournament_registrations')
        .update({ partner_id: partnerPlayerId })
        .eq('id', registrationId);

      // If the partner had their own solo entry, fold it into this team.
      if (partnerSoloEntry) {
        await supabase.from('tournament_registrations').delete().eq('id', partnerSoloEntry.id);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

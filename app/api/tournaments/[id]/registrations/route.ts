import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { planRemoval } from '@/lib/registrations';

// Admin removal, the other half of register-player: take an entry (or one
// player inside an entry) back out of a tournament before the bracket locks
// everything down. Matches point at entry ids, so this stays pre-bracket only.
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
    if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const supabase = await createAdminClient();

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', id)
      .single();
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    if (tournament.status === 'active' || tournament.status === 'completed') {
      return NextResponse.json(
        { error: 'Entries are locked — the bracket has already been generated' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const registrationId = (body?.registrationId ?? '').trim();
    const playerId: string | null = body?.playerId ?? null;
    if (!registrationId) {
      return NextResponse.json({ error: 'Missing registration' }, { status: 400 });
    }

    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('id, player_id, partner_id, tournament_id, members:registration_members(player_id)')
      .eq('id', registrationId)
      .single();
    if (!reg || reg.tournament_id !== id) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const plan = planRemoval(
      {
        player_id: reg.player_id,
        partner_id: reg.partner_id,
        members: reg.members as { player_id: string }[] | null,
      },
      playerId
    );

    if (plan.kind === 'not-found') {
      return NextResponse.json({ error: 'That player is not on this entry' }, { status: 404 });
    }

    if (plan.kind === 'remove-member') {
      const { error } = await supabase
        .from('registration_members')
        .delete()
        .eq('registration_id', registrationId)
        .eq('player_id', plan.playerId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, removed: plan.kind });
    }

    if (plan.kind === 'clear-partner') {
      const { error } = await supabase
        .from('tournament_registrations')
        .update({ partner_id: null })
        .eq('id', registrationId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, removed: plan.kind });
    }

    if (plan.kind === 'promote-partner') {
      // The partner keeps the entry (and its seed) as a solo player — unless
      // they somehow already hold an entry of their own, in which case this row
      // is just a duplicate and goes.
      const { data: ownEntry } = await supabase
        .from('tournament_registrations')
        .select('id')
        .eq('tournament_id', id)
        .eq('player_id', plan.playerId)
        .maybeSingle();

      if (!ownEntry) {
        const { error } = await supabase
          .from('tournament_registrations')
          .update({ player_id: plan.playerId, partner_id: null })
          .eq('id', registrationId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, removed: plan.kind });
      }
    }

    // Whole entry: roster members go with it (they cascade on the foreign key).
    const { error } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('id', registrationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, removed: 'delete-entry' });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

// Tag an entry as Youth, or take the tag back off. The tag rides on the entry
// rather than the player, so the same person can be a youth entry here and play
// the open event next week.
//
// It stays editable after the bracket is generated: by then it can no longer
// change the draw (seeding is done), but an organizer who tagged the wrong team
// should still be able to fix what the entry lists show.
export async function PATCH(
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
    const registrationId = typeof body?.registrationId === 'string' ? body.registrationId.trim() : '';
    const isYouth = body?.isYouth;
    if (!registrationId) {
      return NextResponse.json({ error: 'Missing registration' }, { status: 400 });
    }
    if (typeof isYouth !== 'boolean') {
      return NextResponse.json({ error: 'Youth must be true or false' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('id, tournament_id')
      .eq('id', registrationId)
      .single<{ id: string; tournament_id: string }>();
    if (!reg || reg.tournament_id !== id) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('tournament_registrations')
      .update({ is_youth: isYouth })
      .eq('id', registrationId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, is_youth: isYouth });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

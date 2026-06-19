import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Update a player's admin status. Admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!me?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    if (typeof body.is_admin !== 'boolean') {
      return NextResponse.json({ error: 'is_admin must be a boolean' }, { status: 400 });
    }

    // Guard against self-lockout: an admin can't demote themselves.
    if (id === user.id && body.is_admin === false) {
      return NextResponse.json(
        { error: "You can't remove your own admin access." },
        { status: 400 }
      );
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('is_managed')
      .eq('id', id)
      .single();

    if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    // Roster-only players have no login, so admin rights are meaningless.
    if (target.is_managed && body.is_admin === true) {
      return NextResponse.json(
        { error: 'Roster-only players have no login and cannot be made admins.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ is_admin: body.is_admin })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ player: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Remove a managed (roster-only) player. Admin only.
// Auth-backed profiles are left alone — deleting those means deleting the
// underlying auth account, which is out of scope here.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!me?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('is_managed')
      .eq('id', id)
      .single();

    if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    if (!target.is_managed) {
      return NextResponse.json(
        { error: 'Only manually-added players can be removed here.' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

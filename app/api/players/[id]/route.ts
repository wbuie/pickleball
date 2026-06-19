import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

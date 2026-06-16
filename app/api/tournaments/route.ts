import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, format, max_players, start_date, location } = body;

    if (!name || !format) {
      return NextResponse.json({ error: 'Name and format are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        name,
        description: description || null,
        format,
        max_players: max_players || 16,
        start_date: start_date || null,
        location: location || null,
        created_by: user.id,
        status: 'registration',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ tournament: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

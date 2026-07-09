import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvToPlayers } from '@/lib/csv';

// Bulk-create managed (roster-only) players from CSV text. Admin only.
// The client reads the uploaded .csv file as text and posts { csv: "..." }.
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
    if (typeof body.csv !== 'string' || !body.csv.trim()) {
      return NextResponse.json({ error: 'No CSV content provided' }, { status: 400 });
    }

    const { players, errors } = csvToPlayers(body.csv);

    if (players.length === 0) {
      return NextResponse.json(
        { error: errors[0] || 'No valid players found in the file.', errors },
        { status: 400 }
      );
    }

    const rows = players.map(p => ({
      display_name: p.display_name,
      skill_level: p.skill_level,
      basketball_skill_level: p.basketball_skill_level,
      email: p.email,
      is_managed: true,
    }));

    const { data, error } = await supabase.from('profiles').insert(rows).select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ imported: data?.length ?? 0, errors }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

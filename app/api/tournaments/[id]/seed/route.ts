import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    // Can't reseed once the bracket exists.
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', id)
      .single();
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    if (tournament.status === 'active' || tournament.status === 'completed') {
      return NextResponse.json({ error: 'Seeds are locked — the bracket has already been generated' }, { status: 400 });
    }

    const body = await request.json();
    const { seeds } = body as { seeds: { player_id: string; seed: number }[] };

    if (!Array.isArray(seeds) || seeds.length === 0) {
      return NextResponse.json({ error: 'No seeds provided' }, { status: 400 });
    }
    if (seeds.some(s => !s.player_id || !Number.isInteger(s.seed) || s.seed < 1)) {
      return NextResponse.json({ error: 'Each seed must be a whole number of at least 1' }, { status: 400 });
    }
    const seedValues = seeds.map(s => s.seed);
    if (new Set(seedValues).size !== seedValues.length) {
      return NextResponse.json({ error: 'Seeds must be unique — two players have the same seed' }, { status: 400 });
    }

    for (const { player_id, seed } of seeds) {
      await supabase
        .from('tournament_registrations')
        .update({ seed })
        .eq('tournament_id', id)
        .eq('player_id', player_id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

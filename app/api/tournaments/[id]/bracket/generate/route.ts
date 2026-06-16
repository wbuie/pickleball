import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { generateSingleEliminationBracket } from '@/lib/bracket/singleElimination';
import { generateDoubleEliminationBracket } from '@/lib/bracket/doubleElimination';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify admin via user client
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

    // Use admin client for writes (bypasses RLS for batch inserts)
    const supabase = await createAdminClient();

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single();

    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    if (tournament.status === 'active' || tournament.status === 'completed') {
      return NextResponse.json({ error: 'Bracket already generated' }, { status: 400 });
    }

    // Get registered players with seeds
    const { data: registrations } = await supabase
      .from('tournament_registrations')
      .select('player_id, seed, profiles(skill_level, display_name)')
      .eq('tournament_id', id)
      .order('seed', { ascending: true, nullsFirst: false });

    if (!registrations || registrations.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 registered players' }, { status: 400 });
    }

    if (tournament.format === 'double_elimination' && registrations.length < 4) {
      return NextResponse.json({ error: 'Double elimination requires at least 4 players' }, { status: 400 });
    }

    // Assign seeds if not already set (by skill level, descending)
    const unseeded = registrations.filter(r => r.seed === null);
    if (unseeded.length > 0) {
      // Sort by skill level descending for seeding
      const sorted = [...registrations].sort((a, b) => {
        const aProf = a.profiles as unknown as { skill_level: number | null } | null;
        const bProf = b.profiles as unknown as { skill_level: number | null } | null;
        const aSkill = aProf?.skill_level ?? 3.0;
        const bSkill = bProf?.skill_level ?? 3.0;
        return bSkill - aSkill;
      });

      for (let i = 0; i < sorted.length; i++) {
        await supabase
          .from('tournament_registrations')
          .update({ seed: i + 1 })
          .eq('tournament_id', id)
          .eq('player_id', sorted[i].player_id);
      }

      // Re-fetch with updated seeds
      const { data: reseeded } = await supabase
        .from('tournament_registrations')
        .select('player_id, seed')
        .eq('tournament_id', id)
        .order('seed', { ascending: true });

      const players = (reseeded || []).map(r => ({ id: r.player_id, seed: r.seed! }));

      if (tournament.format === 'single_elimination') {
        await generateSingleEliminationBracket(supabase, id, players);
      } else {
        await generateDoubleEliminationBracket(supabase, id, players);
      }
    } else {
      const players = registrations.map(r => ({ id: r.player_id, seed: r.seed! }));

      if (tournament.format === 'single_elimination') {
        await generateSingleEliminationBracket(supabase, id, players);
      } else {
        await generateDoubleEliminationBracket(supabase, id, players);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

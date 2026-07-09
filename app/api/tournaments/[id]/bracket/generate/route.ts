import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { generateSingleEliminationBracket } from '@/lib/bracket/singleElimination';
import { generateDoubleEliminationBracket } from '@/lib/bracket/doubleElimination';
import { isRosterEvent } from '@/lib/types/app';

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

    // Clear any stale matches before building. A generation attempt that was
    // interrupted partway (timeout, dropped connection) can leave orphan match
    // rows behind while the tournament is still in registration/seeding — which
    // both looks broken ("Registration Open" with a bracket showing) and makes a
    // retry collide with the (tournament, bracket_type, round, position) unique
    // constraint. The bracket isn't live yet here, so wiping it is always safe
    // and makes regenerating reliably recover the tournament.
    await supabase.from('matches').delete().eq('tournament_id', id);

    // Get registered entries (an entry is one player in singles, a team
    // otherwise) with each roster member's skill for seeding.
    const { data: registrations } = await supabase
      .from('tournament_registrations')
      .select('id, player_id, partner_id, team_name, seed, profiles:player_id(skill_level), partner:partner_id(skill_level), members:registration_members(profiles:player_id(skill_level))')
      .eq('tournament_id', id)
      .order('seed', { ascending: true, nullsFirst: false });

    if (!registrations || registrations.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 entries' }, { status: 400 });
    }

    if (tournament.format === 'double_elimination' && registrations.length < 4) {
      return NextResponse.json({ error: 'Double elimination requires at least 4 entries' }, { status: 400 });
    }

    // Doubles: every entry must be a complete two-player team before play.
    if (tournament.event_type === 'doubles') {
      const incomplete = registrations.filter(r => !r.partner_id).length;
      if (incomplete > 0) {
        return NextResponse.json(
          { error: `${incomplete} ${incomplete === 1 ? 'entry has' : 'entries have'} no partner — pair or remove them before generating the bracket` },
          { status: 400 }
        );
      }
    }

    // Roster events (basketball): every entry must be a named team.
    if (isRosterEvent(tournament.event_type)) {
      const unnamed = registrations.filter(r => !r.team_name || !r.team_name.trim()).length;
      if (unnamed > 0) {
        return NextResponse.json(
          { error: `${unnamed} ${unnamed === 1 ? 'team needs' : 'teams need'} a name before generating the bracket` },
          { status: 400 }
        );
      }
    }

    // Seed skill = average rating across everyone on the entry's roster
    // (captain, any partner, and any roster members). Missing ratings → 3.0.
    const skillOf = (r: (typeof registrations)[number]): number => {
      const ratings: number[] = [
        (r.profiles as unknown as { skill_level: number | null } | null)?.skill_level ?? 3.0,
      ];
      const par = (r.partner as unknown as { skill_level: number | null } | null)?.skill_level;
      if (r.partner_id) ratings.push(par ?? 3.0);
      (r.members as unknown as { profiles: { skill_level: number | null } | null }[] | null)?.forEach(m => {
        ratings.push(m.profiles?.skill_level ?? 3.0);
      });
      return ratings.reduce((sum, v) => sum + v, 0) / ratings.length;
    };

    // Assign seeds if not already set (by skill, descending).
    const unseeded = registrations.filter(r => r.seed === null);
    let players: { id: string; seed: number }[];

    if (unseeded.length > 0) {
      const sorted = [...registrations].sort((a, b) => skillOf(b) - skillOf(a));

      for (let i = 0; i < sorted.length; i++) {
        await supabase
          .from('tournament_registrations')
          .update({ seed: i + 1 })
          .eq('id', sorted[i].id);
      }

      // Re-fetch with updated seeds
      const { data: reseeded } = await supabase
        .from('tournament_registrations')
        .select('id, seed')
        .eq('tournament_id', id)
        .order('seed', { ascending: true });

      players = (reseeded || []).map(r => ({ id: r.id, seed: r.seed! }));
    } else {
      players = registrations.map(r => ({ id: r.id, seed: r.seed! }));
    }

    // Generation isn't a single transaction, so if it fails partway we tear the
    // partial bracket back out rather than leaving the tournament half-wired.
    try {
      if (tournament.format === 'single_elimination') {
        await generateSingleEliminationBracket(supabase, id, players);
      } else {
        await generateDoubleEliminationBracket(supabase, id, players);
      }
    } catch (genErr) {
      await supabase.from('matches').delete().eq('tournament_id', id);
      await supabase.from('tournaments').update({ status: 'registration' }).eq('id', id);
      throw genErr;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

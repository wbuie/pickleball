import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvToPlayers, normalizeName, type ParsedPlayer } from '@/lib/csv';
import { pairPlayers, type PairingMode, type PairReason } from '@/lib/pairing';

// Bulk-create managed (roster-only) players from CSV text, and optionally drop
// them straight into a tournament as doubles teams. Admin only.
//
// The client reads the uploaded .csv file as text and posts
// { csv, preview?, tournament_id?, pairing_mode? }. With preview: true nothing
// is written — the response describes exactly what a real import would do, so
// the organizer can check the teammate matching before committing.
//
// pairing_mode decides how much of the pairing to do here rather than by hand
// on the tournament page; anyone left unpaired is registered as a solo entry.

interface PreviewPlayer {
  display_name: string;
  skill_level: number;
  email: string | null;
  partner_hint: string | null;
  // Whether this person is already on the league roster.
  existing: boolean;
}

interface PreviewTeam {
  players: [string, string];
  reason: PairReason;
}

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
    const preview: boolean = body.preview === true;
    const tournamentId: string | null = (body.tournament_id ?? '').trim() || null;

    const PAIRING_MODES: PairingMode[] = ['mutual', 'named', 'all'];
    const pairingMode: PairingMode = PAIRING_MODES.includes(body.pairing_mode)
      ? body.pairing_mode
      : 'mutual';

    const { players, errors } = csvToPlayers(body.csv);

    if (players.length === 0) {
      return NextResponse.json(
        { error: errors[0] || 'No valid players found in the file.', errors },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------------
    // Match the file against the roster we already have, so re-importing an
    // updated export tops it up instead of creating everyone twice.
    // ------------------------------------------------------------------
    const { data: roster } = await supabase
      .from('profiles')
      .select('id, display_name, email');

    const byEmail = new Map<string, string>();
    const byName = new Map<string, string>();
    (roster ?? []).forEach(p => {
      if (p.email) byEmail.set(p.email.toLowerCase(), p.id);
      byName.set(normalizeName(p.display_name), p.id);
    });

    const existingId = (p: ParsedPlayer): string | undefined =>
      (p.email ? byEmail.get(p.email) : undefined) ?? byName.get(normalizeName(p.display_name));

    const toCreate = players.filter(p => !existingId(p));

    // ------------------------------------------------------------------
    // Work out the teams the file describes.
    // ------------------------------------------------------------------
    const pairing = pairPlayers(players, pairingMode);
    const warnings = [...pairing.warnings];

    let tournament: {
      id: string;
      name: string;
      event_type: string;
      status: string;
      max_players: number;
    } | null = null;

    if (tournamentId) {
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, event_type, status, max_players')
        .eq('id', tournamentId)
        .single();

      if (!data) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      if (data.status !== 'registration') {
        return NextResponse.json(
          { error: `Registration is closed for ${data.name}.` },
          { status: 400 }
        );
      }
      tournament = data;
    }

    const isDoubles = tournament?.event_type === 'doubles';

    // Entries this import would add: one per team for doubles, one per player
    // otherwise. Anyone already registered is left alone.
    const { data: alreadyRegistered } = tournament
      ? await supabase
          .from('tournament_registrations')
          .select('player_id, partner_id')
          .eq('tournament_id', tournament.id)
      : { data: null };

    const registeredIds = new Set<string>();
    (alreadyRegistered ?? []).forEach(r => {
      registeredIds.add(r.player_id);
      if (r.partner_id) registeredIds.add(r.partner_id);
    });

    const seatsLeft = tournament
      ? tournament.max_players - (alreadyRegistered?.length ?? 0)
      : 0;

    if (preview) {
      const previewPlayers: PreviewPlayer[] = players.map(p => ({
        display_name: p.display_name,
        skill_level: p.skill_level,
        email: p.email,
        partner_hint: p.partner_hint,
        existing: existingId(p) !== undefined,
      }));

      const previewTeams: PreviewTeam[] = pairing.teams.map(t => ({
        players: [t.players[0].display_name, t.players[1].display_name],
        reason: t.reason,
      }));

      return NextResponse.json({
        preview: true,
        pairing_mode: pairingMode,
        players: previewPlayers,
        new_players: toCreate.length,
        teams: previewTeams,
        unpaired: pairing.unpaired.map(p => p.display_name),
        warnings,
        errors,
        tournament: tournament
          ? {
              id: tournament.id,
              name: tournament.name,
              event_type: tournament.event_type,
              entries: isDoubles ? pairing.teams.length : players.length,
              seats_left: seatsLeft,
            }
          : null,
      });
    }

    // ------------------------------------------------------------------
    // Commit: create the missing profiles first, then register entries.
    // ------------------------------------------------------------------
    let created: { id: string; display_name: string; email: string | null }[] = [];

    if (toCreate.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .insert(
          toCreate.map(p => ({
            display_name: p.display_name,
            skill_level: p.skill_level,
            basketball_skill_level: p.basketball_skill_level,
            email: p.email,
            is_managed: true,
          }))
        )
        .select('id, display_name, email');

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      created = data ?? [];
      created.forEach(p => {
        if (p.email) byEmail.set(p.email.toLowerCase(), p.id);
        byName.set(normalizeName(p.display_name), p.id);
      });
    }

    const idFor = (p: ParsedPlayer): string | undefined => existingId(p);

    let registered = 0;
    let teamsCreated = 0;

    if (tournament) {
      type Entry = { tournament_id: string; player_id: string; partner_id?: string | null };
      const entries: Entry[] = [];
      const skipped: string[] = [];
      let seats = seatsLeft;

      const claim = (names: string[]): boolean => {
        if (seats > 0) {
          seats--;
          return true;
        }
        skipped.push(names.join(' & '));
        return false;
      };

      if (isDoubles) {
        for (const team of pairing.teams) {
          const [a, b] = team.players;
          const aId = idFor(a);
          const bId = idFor(b);
          if (!aId || !bId) continue;
          if (registeredIds.has(aId) || registeredIds.has(bId)) continue;
          if (!claim([a.display_name, b.display_name])) continue;
          entries.push({ tournament_id: tournament.id, player_id: aId, partner_id: bId });
          registeredIds.add(aId);
          registeredIds.add(bId);
        }
        // Whoever is left over still gets an entry so the organizer can pair
        // them by hand on the tournament page.
        for (const p of pairing.unpaired) {
          const id = idFor(p);
          if (!id || registeredIds.has(id)) continue;
          if (!claim([p.display_name])) continue;
          entries.push({ tournament_id: tournament.id, player_id: id, partner_id: null });
          registeredIds.add(id);
        }
      } else {
        for (const p of players) {
          const id = idFor(p);
          if (!id || registeredIds.has(id)) continue;
          if (!claim([p.display_name])) continue;
          entries.push({ tournament_id: tournament.id, player_id: id, partner_id: null });
          registeredIds.add(id);
        }
      }

      if (skipped.length > 0) {
        warnings.push(
          `${tournament.name} is full (${tournament.max_players} entries) — not registered: ${skipped.join(', ')}.`
        );
      }

      if (entries.length > 0) {
        const { data, error } = await supabase
          .from('tournament_registrations')
          .insert(entries)
          .select('id, partner_id');

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        registered = data?.length ?? 0;
        teamsCreated = (data ?? []).filter(r => r.partner_id).length;
      }
    }

    return NextResponse.json(
      {
        imported: created.length,
        already_on_roster: players.length - created.length,
        registered,
        teams: teamsCreated,
        unpaired: pairing.unpaired.map(p => p.display_name),
        tournament: tournament ? { id: tournament.id, name: tournament.name } : null,
        warnings,
        errors,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SPORT_EVENT_TYPES, isSport, isRosterEvent } from '@/lib/types/app';

// Edit an existing tournament. Name/description/date/location are always
// editable; the event type, format, and size can only change before the bracket
// is generated (afterwards they'd invalidate the matches).
export async function PATCH(
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
    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: current } = await supabase
      .from('tournaments')
      .select('status, sport, format, event_type, max_players')
      .eq('id', id)
      .single();
    if (!current) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    const body = await request.json();
    const { name, description, sport, format, event_type, max_players, start_date, location } = body;

    if (name !== undefined && (!name || !`${name}`.trim())) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (sport !== undefined && !isSport(sport)) {
      return NextResponse.json({ error: 'Invalid sport' }, { status: 400 });
    }
    // The event must be valid for whichever sport the tournament will have after
    // this edit (the incoming sport if changing, else the current one).
    const effectiveSport = sport !== undefined ? sport : current.sport;
    if (event_type !== undefined && !SPORT_EVENT_TYPES[effectiveSport as keyof typeof SPORT_EVENT_TYPES].includes(event_type)) {
      return NextResponse.json({ error: `Invalid event type for ${effectiveSport}` }, { status: 400 });
    }
    if (format !== undefined && format !== 'single_elimination' && format !== 'double_elimination') {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = `${name}`.trim();
    if (description !== undefined) updates.description = description || null;
    if (start_date !== undefined) updates.start_date = start_date || null;
    if (location !== undefined) updates.location = location || null;

    // Structural changes (sport/event/format/size) are only allowed pre-bracket.
    const bracketLive = current.status === 'active' || current.status === 'completed';
    const changingSport = sport !== undefined && sport !== current.sport;
    const changingFormat = format !== undefined && format !== current.format;
    const changingEvent = event_type !== undefined && event_type !== current.event_type;
    const changingMax = max_players !== undefined && max_players !== current.max_players;

    // Changing sport without naming a new event would leave an event that
    // doesn't belong to the new sport — snap it to that sport's default.
    let resolvedEvent: string | undefined = changingEvent ? event_type : undefined;
    if (changingSport && !SPORT_EVENT_TYPES[sport as keyof typeof SPORT_EVENT_TYPES].includes(current.event_type)) {
      if (resolvedEvent === undefined) {
        resolvedEvent = SPORT_EVENT_TYPES[sport as keyof typeof SPORT_EVENT_TYPES][0];
      }
    }

    if (bracketLive && (changingSport || changingFormat || resolvedEvent !== undefined || changingMax)) {
      return NextResponse.json(
        { error: 'The bracket has been generated — sport, event, format, and size can no longer change' },
        { status: 400 }
      );
    }

    if (!bracketLive) {
      if (changingSport) updates.sport = sport;
      if (changingFormat) updates.format = format;
      if (resolvedEvent !== undefined) updates.event_type = resolvedEvent;
      if (changingMax) {
        if (!Number.isInteger(max_players) || max_players < 4 || max_players > 256) {
          return NextResponse.json({ error: 'Max entries must be between 4 and 256' }, { status: 400 });
        }
        const { count } = await supabase
          .from('tournament_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', id);
        if (count !== null && max_players < count) {
          return NextResponse.json(
            { error: `Max entries can't be below the ${count} already signed up` },
            { status: 400 }
          );
        }
        updates.max_players = max_players;
      }
    }

    const { data, error } = await supabase
      .from('tournaments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If the event shape changed, drop data that no longer applies so entries
    // aren't left with stale partners or rosters from the previous shape.
    const finalEvent = (resolvedEvent ?? current.event_type) as
      | 'singles' | 'doubles' | '3v3' | '4v4' | '5v5';
    if (resolvedEvent !== undefined) {
      // Only doubles uses partner_id.
      if (finalEvent !== 'doubles') {
        await supabase
          .from('tournament_registrations')
          .update({ partner_id: null })
          .eq('tournament_id', id);
      }
      // Only roster events (basketball) use team_name + registration_members.
      if (!isRosterEvent(finalEvent)) {
        const { data: regs } = await supabase
          .from('tournament_registrations')
          .select('id')
          .eq('tournament_id', id);
        const regIds = (regs || []).map(r => r.id);
        if (regIds.length > 0) {
          await supabase.from('registration_members').delete().in('registration_id', regIds);
        }
        await supabase
          .from('tournament_registrations')
          .update({ team_name: null })
          .eq('tournament_id', id);
      }
    }

    return NextResponse.json({ tournament: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

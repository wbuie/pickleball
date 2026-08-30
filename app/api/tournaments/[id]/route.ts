import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncCourtAssignments } from '@/lib/bracket/courts';
import { SPORT_EVENT_TYPES, isSport, isRosterEvent, MIN_COURTS, MAX_COURTS } from '@/lib/types/app';

// Edit an existing tournament. Name/description/rules/date/location are always
// editable, as are the number of courts and who may report scores (both can
// change on the day); the event
// type, format, and size can only change before the bracket is generated
// (afterwards they'd invalidate the matches).
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
      .select('status, sport, format, event_type, max_players, court_count')
      .eq('id', id)
      .single();
    if (!current) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    const body = await request.json();
    const { name, description, rules, court_count, start_date, location, open_scoring } = body;
    // A structural field the client couldn't edit comes through as null (or is
    // absent) — either way it means "leave this alone", not "set it to null".
    // description/rules/start_date/location are different: null clears them.
    const omitNull = <T,>(value: T | null | undefined): T | undefined =>
      value === null ? undefined : value;
    const sport = omitNull(body.sport);
    const format = omitNull(body.format);
    const event_type = omitNull(body.event_type);
    const max_players = omitNull(body.max_players);

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

    // Courts aren't structural — an organizer can gain or lose one mid-event,
    // and the assignments below just re-flow onto what's left.
    const changingCourts = court_count !== undefined && court_count !== current.court_count;
    if (changingCourts) {
      if (!Number.isInteger(court_count) || court_count < MIN_COURTS || court_count > MAX_COURTS) {
        return NextResponse.json(
          { error: `Courts must be between ${MIN_COURTS} and ${MAX_COURTS}` },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (changingCourts) updates.court_count = court_count;
    if (name !== undefined) updates.name = `${name}`.trim();
    if (description !== undefined) updates.description = description || null;
    if (rules !== undefined) updates.rules = typeof rules === 'string' && rules.trim() ? rules.trim() : null;
    if (start_date !== undefined) updates.start_date = start_date || null;
    if (location !== undefined) updates.location = location || null;
    // Who may report scores can be flipped at any point in the event — an
    // organizer who ends up short-handed opens it up mid-tournament.
    if (open_scoring !== undefined) {
      if (typeof open_scoring !== 'boolean') {
        return NextResponse.json({ error: 'Open scoring must be true or false' }, { status: 400 });
      }
      updates.open_scoring = open_scoring;
    }

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

    // Re-flow court assignments onto the new number of courts.
    if (changingCourts) {
      await syncCourtAssignments(await createAdminClient(), id);
    }

    return NextResponse.json({ tournament: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

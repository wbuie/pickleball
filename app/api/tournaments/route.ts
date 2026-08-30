import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SPORT_EVENT_TYPES, isSport, MIN_COURTS, MAX_COURTS } from '@/lib/types/app';
import type { Sport, EventType } from '@/lib/types/app';

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
    const { name, description, rules, sport, format, event_type, max_players, court_count, start_date, location, open_scoring } = body;

    if (!name || !format) {
      return NextResponse.json({ error: 'Name and format are required' }, { status: 400 });
    }

    // Default to pickleball for backwards compatibility with older clients.
    const chosenSport: Sport = isSport(sport) ? sport : 'pickleball';
    const allowedEvents = SPORT_EVENT_TYPES[chosenSport];
    const chosenEvent: EventType = allowedEvents.includes(event_type)
      ? (event_type as EventType)
      : allowedEvents[0];

    if (event_type && !allowedEvents.includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event type for ${chosenSport}` },
        { status: 400 }
      );
    }

    // Courts are optional (older clients don't send them) but must be sane.
    const courts = court_count === undefined || court_count === null ? 1 : court_count;
    if (!Number.isInteger(courts) || courts < MIN_COURTS || courts > MAX_COURTS) {
      return NextResponse.json(
        { error: `Courts must be between ${MIN_COURTS} and ${MAX_COURTS}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        name,
        description: description || null,
        rules: typeof rules === 'string' && rules.trim() ? rules.trim() : null,
        sport: chosenSport,
        format,
        event_type: chosenEvent,
        max_players: max_players || 16,
        court_count: courts,
        // Off unless the organizer asks for it: scoring stays with them by
        // default, and older clients don't send the field at all.
        open_scoring: open_scoring === true,
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

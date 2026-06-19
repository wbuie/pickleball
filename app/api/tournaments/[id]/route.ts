import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
      .select('status, format, event_type, max_players')
      .eq('id', id)
      .single();
    if (!current) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    const body = await request.json();
    const { name, description, format, event_type, max_players, start_date, location } = body;

    if (name !== undefined && (!name || !`${name}`.trim())) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (event_type !== undefined && event_type !== 'singles' && event_type !== 'doubles') {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }
    if (format !== undefined && format !== 'single_elimination' && format !== 'double_elimination') {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = `${name}`.trim();
    if (description !== undefined) updates.description = description || null;
    if (start_date !== undefined) updates.start_date = start_date || null;
    if (location !== undefined) updates.location = location || null;

    // Structural changes (event/format/size) are only allowed pre-bracket.
    const bracketLive = current.status === 'active' || current.status === 'completed';
    const changingFormat = format !== undefined && format !== current.format;
    const changingEvent = event_type !== undefined && event_type !== current.event_type;
    const changingMax = max_players !== undefined && max_players !== current.max_players;

    if (bracketLive && (changingFormat || changingEvent || changingMax)) {
      return NextResponse.json(
        { error: 'The bracket has been generated — event, format, and size can no longer change' },
        { status: 400 }
      );
    }

    if (!bracketLive) {
      if (changingFormat) updates.format = format;
      if (changingEvent) updates.event_type = event_type;
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

    // Switching a doubles event to singles drops any partners so entries become
    // individuals again.
    if (changingEvent && event_type === 'singles') {
      await supabase
        .from('tournament_registrations')
        .update({ partner_id: null })
        .eq('tournament_id', id);
    }

    return NextResponse.json({ tournament: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

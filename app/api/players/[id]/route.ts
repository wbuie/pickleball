import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Update a player's admin status and/or skill (DUPR) rating. Admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!me?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const hasAdmin = 'is_admin' in body;
    const hasSkill = 'skill_level' in body;
    const hasBball = 'basketball_skill_level' in body;

    if (!hasAdmin && !hasSkill && !hasBball) {
      return NextResponse.json(
        { error: 'Nothing to update — provide is_admin, skill_level, and/or basketball_skill_level' },
        { status: 400 }
      );
    }
    if (hasAdmin && typeof body.is_admin !== 'boolean') {
      return NextResponse.json({ error: 'is_admin must be a boolean' }, { status: 400 });
    }

    const update: { is_admin?: boolean; skill_level?: number; basketball_skill_level?: number | null } = {};

    if (hasAdmin) {
      // Guard against self-lockout: an admin can't demote themselves.
      if (id === user.id && body.is_admin === false) {
        return NextResponse.json(
          { error: "You can't remove your own admin access." },
          { status: 400 }
        );
      }
      update.is_admin = body.is_admin;
    }

    if (hasSkill) {
      const skill = parseFloat(body.skill_level);
      if (Number.isNaN(skill)) {
        return NextResponse.json({ error: 'Skill must be a number between 2.0 and 5.0' }, { status: 400 });
      }
      // Clamp to the supported range and snap to the 0.5 steps used elsewhere.
      update.skill_level = Math.round(Math.min(5.0, Math.max(2.0, skill)) * 2) / 2;
    }

    if (hasBball) {
      // Null/empty clears the rating back to "Unrated".
      if (body.basketball_skill_level === null || body.basketball_skill_level === '') {
        update.basketball_skill_level = null;
      } else {
        const bball = parseFloat(body.basketball_skill_level);
        if (Number.isNaN(bball)) {
          return NextResponse.json({ error: 'Basketball rating must be a number between 1 and 5' }, { status: 400 });
        }
        // Clamp to the 1–5 tier scale and snap to whole tiers.
        update.basketball_skill_level = Math.round(Math.min(5, Math.max(1, bball)));
      }
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('is_managed')
      .eq('id', id)
      .single();

    if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    // Roster-only players have no login, so admin rights are meaningless.
    if (target.is_managed && update.is_admin === true) {
      return NextResponse.json(
        { error: 'Roster-only players have no login and cannot be made admins.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ player: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Remove a managed (roster-only) player. Admin only.
// Auth-backed profiles are left alone — deleting those means deleting the
// underlying auth account, which is out of scope here.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!me?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('is_managed')
      .eq('id', id)
      .single();

    if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    if (!target.is_managed) {
      return NextResponse.json(
        { error: 'Only manually-added players can be removed here.' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

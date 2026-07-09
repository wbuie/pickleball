import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Create a single managed (roster-only) player. Admin only.
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
    const name = (body.display_name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: 'A name is required' }, { status: 400 });
    }

    let skill = parseFloat(body.skill_level);
    if (Number.isNaN(skill)) skill = 3.0;
    skill = Math.round(Math.min(5.0, Math.max(2.0, skill)) * 2) / 2;

    // Optional basketball rating (1–5 tiers); left Unrated if absent/invalid.
    let basketball: number | null = parseFloat(body.basketball_skill_level);
    basketball = Number.isNaN(basketball) ? null : Math.round(Math.min(5, Math.max(1, basketball)));

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        display_name: name,
        skill_level: skill,
        basketball_skill_level: basketball,
        email: (body.email ?? '').trim() || null,
        is_managed: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ player: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

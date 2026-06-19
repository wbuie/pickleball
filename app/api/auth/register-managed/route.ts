import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

// Public registration WITHOUT an email. Only permitted while the admin has
// turned the email requirement off. Creates a managed (roster-only) profile
// the visitor cannot log into — an admin adds them to tournaments.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Enforce the global toggle server-side so this can't be abused while
    // email is still required.
    const { data: settings } = await supabase
      .from('app_settings')
      .select('require_email')
      .eq('id', 1)
      .single();

    if (settings?.require_email !== false) {
      return NextResponse.json(
        { error: 'Email is required to register.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = (body.display_name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: 'A name is required' }, { status: 400 });
    }

    let skill = parseFloat(body.skill_level);
    if (Number.isNaN(skill)) skill = 3.0;
    skill = Math.round(Math.min(5.0, Math.max(2.0, skill)) * 2) / 2;

    // Service role: the visitor is anonymous and can't insert under RLS.
    const admin = await createAdminClient();
    const { error } = await admin.from('profiles').insert({
      display_name: name,
      skill_level: skill,
      is_managed: true,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

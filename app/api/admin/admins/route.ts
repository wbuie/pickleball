import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return { error: 'Admin access required', status: 403 as const };
  return { supabase, user };
}

// Grant admin to an email — promotes a matching profile now, and (via the
// signup trigger) auto-grants admin if/when that email registers later.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;

    const body = await request.json().catch(() => ({}));
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const { error } = await supabase
      .from('admin_emails')
      .insert({ email, added_by: user.id });
    if (error && error.code !== '23505') {
      // 23505 = already on the list; treat as success (idempotent).
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Promote a matching profile immediately if one exists.
    await supabase
      .from('profiles')
      .update({ is_admin: true })
      .ilike('email', email);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Revoke an email from the allowlist and demote any matching profile.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;

    const body = await request.json().catch(() => ({}));
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    // Guard against self-lockout — you can't remove your own admin email.
    if (user.email && user.email.toLowerCase() === email) {
      return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
    }

    const { error } = await supabase.from('admin_emails').delete().eq('email', email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Demote a matching profile if it isn't the current user.
    await supabase
      .from('profiles')
      .update({ is_admin: false })
      .ilike('email', email)
      .neq('id', user.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

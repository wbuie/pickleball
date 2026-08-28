import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminDashboard, { type ImportTarget } from '@/components/admin/AdminDashboard';
import type { AdminEmail, AppSettings, Profile } from '@/lib/types/app';

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/tournaments');

  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .single();

  const { data: players } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  const { data: adminEmails } = await supabase
    .from('admin_emails')
    .select('*')
    .order('created_at', { ascending: true });

  // Tournaments an import can register people into.
  const { data: openTournaments } = await supabase
    .from('tournaments')
    .select('id, name, event_type')
    .eq('status', 'registration')
    .order('created_at', { ascending: false });

  return (
    <AdminDashboard
      settings={(settings as AppSettings) ?? { id: 1, require_email: true, updated_at: '' }}
      players={(players as Profile[]) ?? []}
      adminEmails={(adminEmails as AdminEmail[]) ?? []}
      openTournaments={(openTournaments as ImportTarget[]) ?? []}
      currentUserEmail={user.email ?? null}
      currentUserId={user.id}
    />
  );
}

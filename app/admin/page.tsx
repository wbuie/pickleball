import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminDashboard from '@/components/admin/AdminDashboard';
import type { AppSettings, Profile } from '@/lib/types/app';

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

  return (
    <AdminDashboard
      settings={(settings as AppSettings) ?? { id: 1, require_email: true, updated_at: '' }}
      players={(players as Profile[]) ?? []}
    />
  );
}

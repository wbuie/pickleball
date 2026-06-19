import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminPanel from '@/components/admin/AdminPanel';
import type { Tournament, TournamentRegistration } from '@/lib/types/app';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect(`/tournaments/${id}`);

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single<Tournament>();

  if (!tournament) notFound();

  const { data: registrations } = await supabase
    .from('tournament_registrations')
    .select('*, profiles:player_id(*), partner:partner_id(*)')
    .eq('tournament_id', id)
    .order('seed', { ascending: true, nullsFirst: false });

  // For doubles team-building, the admin can pair from the full member list.
  let members: { id: string; display_name: string }[] = [];
  if (tournament.event_type === 'doubles') {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .order('display_name', { ascending: true });
    members = data || [];
  }

  return (
    <AdminPanel
      tournament={tournament}
      registrations={(registrations || []) as TournamentRegistration[]}
      members={members}
    />
  );
}

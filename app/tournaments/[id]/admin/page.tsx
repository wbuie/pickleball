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
    .select('*, profiles:player_id(*), partner:partner_id(*), members:registration_members(*, profiles:player_id(*))')
    .eq('tournament_id', id)
    .order('seed', { ascending: true, nullsFirst: false });

  // Full member roster — used both for adding an existing player to the
  // tournament and (in doubles) for pairing teams.
  const { data: members } = await supabase
    .from('profiles')
    .select('id, display_name, skill_level, is_admin, is_managed')
    .order('display_name', { ascending: true });

  return (
    <AdminPanel
      tournament={tournament}
      registrations={(registrations || []) as TournamentRegistration[]}
      members={members || []}
    />
  );
}

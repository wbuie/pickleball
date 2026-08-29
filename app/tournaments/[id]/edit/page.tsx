import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TournamentForm from '@/components/tournaments/TournamentForm';
import { absoluteUrl } from '@/lib/url.server';
import type { Tournament } from '@/lib/types/app';

export default async function EditTournamentPage({
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

  // Once the bracket exists, structural fields are locked.
  const structuralLocked = tournament.status === 'active' || tournament.status === 'completed';

  const { count } = await supabase
    .from('tournament_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', id);

  // Built server-side from the request so the QR code scans to the right host
  // on localhost, a preview deploy, and production alike.
  const shareUrl = await absoluteUrl(`/tournaments/${id}`);

  return (
    <TournamentForm
      mode="edit"
      tournamentId={id}
      structuralLocked={structuralLocked}
      minMaxPlayers={count ?? 0}
      shareUrl={shareUrl}
      initial={{
        name: tournament.name,
        description: tournament.description,
        rules: tournament.rules,
        sport: tournament.sport,
        format: tournament.format,
        event_type: tournament.event_type,
        max_players: tournament.max_players,
        court_count: tournament.court_count,
        start_date: tournament.start_date,
        location: tournament.location,
      }}
    />
  );
}

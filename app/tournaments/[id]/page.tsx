import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BracketViewer from '@/components/bracket/BracketViewer';
import RegisterButton from '@/components/tournaments/RegisterButton';
import { StatusBadge, SkillBadge } from '@/components/ui/Badge';
import { FORMAT_LABELS, STATUS_LABELS } from '@/lib/types/app';
import type { Match, Profile } from '@/lib/types/app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, description, format, status')
    .eq('id', id)
    .single();

  if (!tournament) return { title: 'Tournament Not Found – CFC Pickleball League' };

  const title = `${tournament.name} – CFC Pickleball League`;
  const description =
    tournament.description ||
    `${FORMAT_LABELS[tournament.format as 'single_elimination' | 'double_elimination']} · ${STATUS_LABELS[tournament.status as keyof typeof STATUS_LABELS]}. Hosted by Christ Fellowship Church, Birmingham.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
  };
}

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    profile = data;
  }

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();

  if (!tournament) notFound();

  const { data: registrations } = await supabase
    .from('tournament_registrations')
    .select('*, profiles(*)')
    .eq('tournament_id', id)
    .order('seed', { ascending: true, nullsFirst: false });

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', id)
    .order('round', { ascending: true })
    .order('position', { ascending: true });

  const isRegistered = user
    ? (registrations || []).some(r => r.player_id === user.id)
    : false;

  const isFull = (registrations || []).length >= tournament.max_players;

  // Build player list for bracket
  const players: Profile[] = (registrations || [])
    .map(r => r.profiles as Profile)
    .filter(Boolean);

  // Find champion
  const grandFinal = (matches || [])
    .filter(m => m.bracket_type === 'grand_finals' && m.status === 'completed')
    .sort((a, b) => b.round - a.round)[0];
  const finalRound = (matches || [])
    .filter(m => m.bracket_type === 'winners')
    .sort((a, b) => b.round - a.round)[0];
  const championId = grandFinal?.winner_id || (tournament.format === 'single_elimination' ? finalRound?.winner_id : null);
  const champion = championId ? players.find(p => p.id === championId) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={tournament.status} />
              <span className="text-gray-400 text-sm">·</span>
              <span className="text-gray-500 text-sm">{FORMAT_LABELS[tournament.format as 'single_elimination' | 'double_elimination']}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900">{tournament.name}</h1>
            {tournament.description && (
              <p className="text-gray-500 mt-1.5">{tournament.description}</p>
            )}

            <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
              {tournament.start_date && (
                <span>
                  📅{' '}
                  {new Date(tournament.start_date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </span>
              )}
              {tournament.location && <span>📍 {tournament.location}</span>}
              <span>
                👥 {(registrations || []).length} / {tournament.max_players} players
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end">
            {champion && (
              <div className="bg-accent-50 border border-accent-200 rounded-xl px-4 py-2 text-center">
                <p className="text-accent-700 text-xs font-medium uppercase tracking-wide">Champion</p>
                <p className="text-accent-900 font-bold text-lg">{champion.display_name} 🏆</p>
              </div>
            )}

            {tournament.status === 'registration' && user && !profile?.is_admin && (
              <RegisterButton
                tournamentId={id}
                isRegistered={isRegistered}
                isFull={isFull}
              />
            )}

            {profile?.is_admin && (
              <Link
                href={`/tournaments/${id}/admin`}
                className="bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Admin Panel
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Bracket */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
          <h2 className="font-bold text-gray-900 text-xl mb-5">Bracket</h2>
          <BracketViewer
            tournamentId={id}
            matches={(matches || []) as Match[]}
            players={players}
            format={tournament.format as 'single_elimination' | 'double_elimination'}
            isAdmin={profile?.is_admin ?? false}
          />
        </div>

        {/* Player list */}
        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
          <h2 className="font-bold text-gray-900 text-lg mb-4">
            Players ({(registrations || []).length})
          </h2>
          <div className="space-y-2">
            {(registrations || []).length === 0 && (
              <p className="text-gray-400 text-sm italic">No players registered yet</p>
            )}
            {(registrations || []).map((reg, i) => {
              const p = reg.profiles as Profile;
              return (
                <div key={reg.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-400 text-xs w-5 text-right flex-shrink-0">
                    {reg.seed ?? i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                    {p?.display_name ?? 'Unknown'}
                    {p?.id === user?.id && (
                      <span className="ml-1 text-brand-600 text-xs">(you)</span>
                    )}
                  </span>
                  <SkillBadge level={p?.skill_level ?? null} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

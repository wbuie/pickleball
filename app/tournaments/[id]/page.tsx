import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BracketViewer from '@/components/bracket/BracketViewer';
import RegisterButton from '@/components/tournaments/RegisterButton';
import { StatusBadge, SkillBadge } from '@/components/ui/Badge';
import { FORMAT_LABELS, STATUS_LABELS, EVENT_LABELS, SPORT_LABELS, entryName, entrySkill, entryPlayers, entryNoun as entryNounFor, isRosterEvent, isTeamEvent } from '@/lib/types/app';
import type { Match, Profile, BracketEntry, TournamentRegistration, EventType } from '@/lib/types/app';

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

  if (!tournament) return { title: 'Tournament Not Found – CFC Sports Tournaments' };

  const title = `${tournament.name} – CFC Sports Tournaments`;
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

  const { data: registrationsData } = await supabase
    .from('tournament_registrations')
    .select('*, profiles:player_id(*), partner:partner_id(*), members:registration_members(*, profiles:player_id(*))')
    .eq('tournament_id', id)
    .order('seed', { ascending: true, nullsFirst: false });
  const registrations = (registrationsData || []) as TournamentRegistration[];

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', id)
    .order('round', { ascending: true })
    .order('position', { ascending: true });

  const isDoubles = tournament.event_type === 'doubles';
  const isRoster = isRosterEvent(tournament.event_type as EventType);
  const isTeam = isTeamEvent(tournament.event_type as EventType);
  const entryNoun = entryNounFor(tournament.event_type as EventType);

  const isRegistered = user
    ? registrations.some(
        r =>
          r.player_id === user.id ||
          r.partner_id === user.id ||
          (r.members ?? []).some(m => m.player_id === user.id)
      )
    : false;

  const isFull = registrations.length >= tournament.max_players;

  // Build the bracket entries (keyed by registration id — an entry is one
  // player in singles, a two-person team in doubles).
  const entries: BracketEntry[] = registrations.map(r => ({
    id: r.id,
    display_name: entryName(r),
  }));

  // Eligible teammates: members not already on a team here (and not you). Used
  // to pick a doubles partner or fill out a basketball roster.
  let eligiblePartners: { id: string; display_name: string }[] = [];
  if (isTeam && user && !isRegistered && tournament.status === 'registration') {
    const taken = new Set<string>([user.id]);
    registrations.forEach(r => {
      taken.add(r.player_id);
      if (r.partner_id) taken.add(r.partner_id);
      (r.members ?? []).forEach(m => taken.add(m.player_id));
    });
    const { data: members } = await supabase
      .from('profiles')
      .select('id, display_name')
      .order('display_name', { ascending: true });
    eligiblePartners = (members || []).filter(m => !taken.has(m.id));
  }

  // Find champion (winner_id now references the winning entry/team)
  const grandFinal = (matches || [])
    .filter(m => m.bracket_type === 'grand_finals' && m.status === 'completed')
    .sort((a, b) => b.round - a.round)[0];
  const finalRound = (matches || [])
    .filter(m => m.bracket_type === 'winners')
    .sort((a, b) => b.round - a.round)[0];
  const championId = grandFinal?.winner_id || (tournament.format === 'single_elimination' ? finalRound?.winner_id : null);
  const champion = championId ? entries.find(e => e.id === championId) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={tournament.status} />
              <span className="text-gray-400 text-sm">·</span>
              <span className="text-gray-500 text-sm">{SPORT_LABELS[tournament.sport as keyof typeof SPORT_LABELS]}</span>
              <span className="text-gray-400 text-sm">·</span>
              <span className="text-gray-500 text-sm">{EVENT_LABELS[tournament.event_type as EventType]}</span>
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
                👥 {registrations.length} / {tournament.max_players} {entryNoun.toLowerCase()}
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
                eventType={tournament.event_type}
                eligiblePartners={eligiblePartners}
              />
            )}

            {profile?.is_admin && (
              <div className="flex gap-2">
                <Link
                  href={`/tournaments/${id}/edit`}
                  className="border border-brand-300 text-brand-700 hover:bg-brand-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Edit
                </Link>
                <Link
                  href={`/tournaments/${id}/admin`}
                  className="bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Admin Panel
                </Link>
              </div>
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
            players={entries}
            format={tournament.format as 'single_elimination' | 'double_elimination'}
            isAdmin={profile?.is_admin ?? false}
          />
        </div>

        {/* Entry list */}
        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
          <h2 className="font-bold text-gray-900 text-lg mb-4">
            {entryNoun} ({registrations.length})
          </h2>
          <div className="space-y-2">
            {registrations.length === 0 && (
              <p className="text-gray-400 text-sm italic">
                No {isTeam ? 'teams' : 'players'} registered yet
              </p>
            )}
            {registrations.map((reg, i) => {
              const youAreHere =
                reg.player_id === user?.id ||
                reg.partner_id === user?.id ||
                (reg.members ?? []).some(m => m.player_id === user?.id);
              const unpaired = isDoubles && !reg.partner_id;
              // For a named roster team, list everyone underneath the team name.
              const roster = isRoster ? entryPlayers(reg) : [];
              return (
                <div key={reg.id} className="py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-5 text-right flex-shrink-0">
                      {reg.seed ?? i + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                      {entryName(reg)}
                      {youAreHere && <span className="ml-1 text-brand-600 text-xs">(you)</span>}
                      {unpaired && <span className="ml-1 text-amber-600 text-xs">· needs partner</span>}
                    </span>
                    <SkillBadge level={entrySkill(reg)} />
                  </div>
                  {roster.length > 0 && (
                    <p className="ml-7 mt-0.5 text-xs text-gray-500 truncate">
                      {roster.map(p => p.display_name).join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

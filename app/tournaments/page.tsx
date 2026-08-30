import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import TournamentCard from '@/components/tournaments/TournamentCard';
import BrandMark from '@/components/BrandMark';
import type { TournamentWithCounts } from '@/lib/types/app';

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*, registered_count:tournament_registrations(count)')
    .order('created_at', { ascending: false });

  const enriched: TournamentWithCounts[] = (tournaments || []).map(t => ({
    ...t,
    registered_count: (t.registered_count as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  const open = enriched.filter(t => t.status === 'registration');
  const active = enriched.filter(t => t.status === 'active' || t.status === 'seeding');
  const completed = enriched.filter(t => t.status === 'completed');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tournaments</h1>
          <p className="text-gray-500 mt-1">Find and join a tournament near you</p>
        </div>
        {isAdmin && (
          <Link
            href="/tournaments/new"
            className="bg-brand-700 hover:bg-brand-600 text-white font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            + New Tournament
          </Link>
        )}
      </div>

      {registered === '1' && (
        <div className="bg-brand-50 border border-brand-200 text-brand-800 rounded-xl px-4 py-3 mb-6 text-sm">
          ✓ You&apos;re on the roster! An admin will add you to tournaments — no login needed.
        </div>
      )}

      {enriched.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <BrandMark className="w-14 h-14 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600">No tournaments yet</p>
          {isAdmin && (
            <Link href="/tournaments/new" className="mt-3 inline-block text-brand-700 font-medium hover:underline">
              Create the first one →
            </Link>
          )}
        </div>
      )}

      {open.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-brand-500 rounded-full inline-block" />
            Registration Open
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {open.map(t => <TournamentCard key={t.id} tournament={t} />)}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full inline-block animate-pulse" />
            In Progress
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map(t => <TournamentCard key={t.id} tournament={t} />)}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-gray-400 rounded-full inline-block" />
            Completed
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {completed.map(t => <TournamentCard key={t.id} tournament={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}

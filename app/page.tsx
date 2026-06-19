import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import TournamentCard from '@/components/tournaments/TournamentCard';
import PickleballMark from '@/components/PickleballMark';
import type { TournamentWithCounts } from '@/lib/types/app';

export default async function HomePage() {
  const supabase = await createClient();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select(`
      *,
      registered_count:tournament_registrations(count)
    `)
    .order('created_at', { ascending: false })
    .limit(6);

  const enriched: TournamentWithCounts[] = (tournaments || []).map(t => ({
    ...t,
    registered_count: (t.registered_count as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-800 to-brand-900 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <PickleballMark className="w-20 h-20 mx-auto mb-4 text-accent-400" />
          <p className="text-accent-400 font-semibold tracking-wide uppercase text-sm mb-2">
            Christ Fellowship Church · Birmingham
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 tracking-tight">
            CFC Pickleball League
          </h1>
          <p className="text-brand-200 text-xl mb-8 max-w-xl mx-auto">
            Come play, compete, and connect. Tournaments for every skill level —
            whether you&apos;re brand new or a seasoned competitor, there&apos;s a spot for you.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/tournaments"
              className="bg-accent-500 hover:bg-accent-400 text-accent-900 font-bold px-7 py-3 rounded-xl text-lg transition-colors shadow-lg"
            >
              Browse Tournaments
            </Link>
            <Link
              href="/auth/register"
              className="bg-white/10 hover:bg-white/20 text-white font-semibold px-7 py-3 rounded-xl text-lg transition-colors border border-white/20"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
            Everything you need to run a great tournament
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: '🏆', title: 'Smart Brackets', desc: 'Single & double elimination with automatic seeding by skill level' },
              { icon: '📊', title: 'Live Scoring', desc: 'Admins enter scores in real time and winners advance automatically' },
              { icon: '🤝', title: 'All Skill Levels', desc: 'Not sure of your rating? Just pick the description that fits — everyone is welcome' },
            ].map(f => (
              <div key={f.title} className="text-center p-6 rounded-2xl bg-brand-50 border border-brand-100">
                <div className="text-4xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent tournaments */}
      {enriched.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Recent Tournaments</h2>
            <Link href="/tournaments" className="text-brand-700 text-sm font-medium hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enriched.map(t => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import TournamentQrCode, { CopyLinkButton, PrintButton } from '@/components/tournaments/TournamentQrCode';
import { absoluteUrl } from '@/lib/url.server';
import { displayUrl } from '@/lib/url';
import { EVENT_LABELS, FORMAT_LABELS, SPORT_LABELS } from '@/lib/types/app';
import type { EventType, Sport, Tournament, TournamentFormat } from '@/lib/types/app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', id)
    .single();

  return {
    title: tournament ? `${tournament.name} — QR Sign` : 'QR Sign',
    // A printable sign has nothing to offer a search engine.
    robots: { index: false, follow: false },
  };
}

/**
 * A printable sign for a tournament: the QR code players scan, with the
 * tournament's details around it. Everything outside the sign itself is marked
 * `print:hidden`, so "Print" produces the sheet and nothing else.
 */
export default async function TournamentQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single<Tournament>();

  if (!tournament) notFound();

  const url = await absoluteUrl(`/tournaments/${id}`);
  const isOpen = tournament.status === 'registration';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 print:max-w-none print:p-0">
      {/* Controls — deliberately kept off the printed sheet */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
        <Link href={`/tournaments/${id}/edit`} className="text-brand-600 text-sm hover:underline">
          ← Back to tournament settings
        </Link>
        <div className="flex gap-2">
          <CopyLinkButton
            url={url}
            className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          />
          <PrintButton className="bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors" />
        </div>
      </div>

      {/* The sign itself */}
      {/* On paper this fills the sheet and centers, so the code reads from across a room */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 px-8 py-10 text-center print:border-0 print:shadow-none print:rounded-none print:px-0 print:py-0 print:min-h-[9.5in] print:flex print:flex-col print:justify-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600">
          Christ Fellowship Church
        </p>

        <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold text-gray-900 text-balance">
          {tournament.name}
        </h1>

        <p className="mt-2 text-gray-500">
          {SPORT_LABELS[tournament.sport as Sport]} · {EVENT_LABELS[tournament.event_type as EventType]} ·{' '}
          {FORMAT_LABELS[tournament.format as TournamentFormat]}
        </p>

        {(tournament.start_date || tournament.location) && (
          <p className="mt-3 text-lg font-medium text-gray-700">
            {tournament.start_date &&
              new Date(tournament.start_date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            {tournament.start_date && tournament.location && ' · '}
            {tournament.location}
          </p>
        )}

        <div className="mx-auto mt-8 w-full max-w-[22rem] print:max-w-[5.25in]">
          <TournamentQrCode
            url={url}
            title={`QR code linking to ${tournament.name}`}
            className="w-full h-auto"
          />
        </div>

        <p className="mt-6 text-2xl font-bold text-brand-800">
          {isOpen ? 'Scan to sign up' : 'Scan to follow the bracket'}
        </p>
        <p className="mt-1 text-gray-500">
          {isOpen
            ? 'Register, pick a partner, and see who else is playing.'
            : 'Live scores, your next match, and the court you play on.'}
        </p>

        <p className="mt-5 font-mono text-sm text-gray-500 break-all">{displayUrl(url)}</p>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400 print:hidden">
        Tip: print this on a full sheet and tape it up at the check-in table. The link keeps working
        for the whole tournament — the same code covers sign-ups, brackets, and live scores.
      </p>
    </div>
  );
}

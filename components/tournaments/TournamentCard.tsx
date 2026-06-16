import Link from 'next/link';
import type { TournamentWithCounts } from '@/lib/types/app';
import { StatusBadge } from '@/components/ui/Badge';
import { FORMAT_LABELS } from '@/lib/types/app';

interface TournamentCardProps {
  tournament: TournamentWithCounts;
}

export default function TournamentCard({ tournament }: TournamentCardProps) {
  const fillPercent = Math.round((tournament.registered_count / tournament.max_players) * 100);

  return (
    <Link href={`/tournaments/${tournament.id}`}>
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 hover:shadow-md hover:border-green-300 transition-all p-5 h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">
            {tournament.name}
          </h3>
          <StatusBadge status={tournament.status} />
        </div>

        {tournament.description && (
          <p className="text-gray-500 text-sm line-clamp-2 mb-3">{tournament.description}</p>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <span>⚡</span>
            <span>{FORMAT_LABELS[tournament.format]}</span>
          </div>
          {tournament.start_date && (
            <div className="flex items-center gap-2 text-gray-600">
              <span>📅</span>
              <span>{new Date(tournament.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
          {tournament.location && (
            <div className="flex items-center gap-2 text-gray-600">
              <span>📍</span>
              <span className="truncate">{tournament.location}</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-600">Players</span>
            <span className="font-medium text-gray-900">
              {tournament.registered_count} / {tournament.max_players}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                fillPercent >= 100
                  ? 'bg-red-400'
                  : fillPercent >= 75
                  ? 'bg-yellow-400'
                  : 'bg-green-400'
              }`}
              style={{ width: `${Math.min(fillPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

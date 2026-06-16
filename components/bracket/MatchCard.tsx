'use client';

import type { Match, Profile } from '@/lib/types/app';

interface MatchCardProps {
  match: Match & { player1?: Profile; player2?: Profile };
  isAdmin?: boolean;
  onScoreClick?: (matchId: string) => void;
  compact?: boolean;
}

export default function MatchCard({ match, isAdmin, onScoreClick, compact = false }: MatchCardProps) {
  const isCompleted = match.status === 'completed';
  const isBye = match.status === 'bye';
  const isClickable = isAdmin && !isCompleted && !isBye && match.player1_id && match.player2_id;

  const PlayerRow = ({
    player,
    score,
    isWinner,
    isLoser,
    label,
  }: {
    player?: Profile | null;
    score: number | null;
    isWinner: boolean;
    isLoser: boolean;
    label: string;
  }) => (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 min-w-0 ${
        isWinner
          ? 'bg-green-50 border-l-4 border-l-green-500'
          : isLoser
          ? 'opacity-50'
          : ''
      }`}
    >
      <span
        className={`text-xs font-medium truncate flex-1 min-w-0 ${
          isWinner ? 'text-green-800 font-bold' : 'text-gray-700'
        }`}
      >
        {player ? player.display_name : (
          <span className="text-gray-400 italic">{label}</span>
        )}
      </span>
      {isCompleted && (
        <span
          className={`ml-2 text-xs font-bold tabular-nums flex-shrink-0 ${
            isWinner ? 'text-green-700' : 'text-gray-400'
          }`}
        >
          {score ?? '–'}
        </span>
      )}
    </div>
  );

  const p1IsWinner = isCompleted && match.winner_id === match.player1_id;
  const p2IsWinner = isCompleted && match.winner_id === match.player2_id;

  if (isBye) {
    const byePlayer = match.player1 || match.player2;
    return (
      <div className={`bg-white border border-dashed border-gray-200 rounded-lg overflow-hidden shadow-sm ${compact ? 'w-40' : 'w-48'}`}>
        <div className="px-2.5 py-1.5 bg-gray-50">
          <span className="text-xs text-gray-400 italic">
            {byePlayer ? `${byePlayer.display_name} (bye)` : 'Bye'}
          </span>
        </div>
        <div className="px-2.5 py-1.5 bg-gray-50 border-t border-gray-100">
          <span className="text-xs text-gray-300 italic">–</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden shadow-sm transition-all ${
        compact ? 'w-40' : 'w-48'
      } ${
        isCompleted
          ? 'border-green-200'
          : isClickable
          ? 'border-yellow-400 cursor-pointer hover:shadow-md hover:border-yellow-500'
          : 'border-gray-200'
      }`}
      onClick={() => isClickable && onScoreClick?.(match.id)}
    >
      <PlayerRow
        player={match.player1}
        score={match.player1_score}
        isWinner={p1IsWinner}
        isLoser={isCompleted && !p1IsWinner}
        label="TBD"
      />
      <div className="border-t border-gray-100" />
      <PlayerRow
        player={match.player2}
        score={match.player2_score}
        isWinner={p2IsWinner}
        isLoser={isCompleted && !p2IsWinner}
        label="TBD"
      />
      {isClickable && (
        <div className="bg-yellow-50 border-t border-yellow-200 px-2.5 py-1 text-center">
          <span className="text-yellow-700 text-xs font-medium">Enter Score</span>
        </div>
      )}
    </div>
  );
}

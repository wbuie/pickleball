'use client';

import { canScoreMatch } from '@/lib/types/app';
import type { Match, BracketEntry } from '@/lib/types/app';

interface MatchCardProps {
  match: Match & { player1?: BracketEntry; player2?: BracketEntry };
  isAdmin?: boolean;
  // The tournament lets anyone enter a score, not just an admin.
  openScoring?: boolean;
  onScoreClick?: (matchId: string) => void;
  compact?: boolean;
}

// Hoisted out of the parent so it isn't recreated on every render
// (React 19 `react-hooks/static-components`).
function PlayerRow({
  player,
  score,
  isWinner,
  isLoser,
  isCompleted,
  label,
}: {
  player?: BracketEntry | null;
  score: number | null;
  isWinner: boolean;
  isLoser: boolean;
  isCompleted: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 min-w-0 ${
        isWinner
          ? 'bg-brand-50 border-l-4 border-l-brand-500'
          : isLoser
          ? 'opacity-50'
          : ''
      }`}
    >
      <span
        className={`text-xs font-medium truncate flex-1 min-w-0 ${
          isWinner ? 'text-brand-800 font-bold' : 'text-gray-700'
        }`}
      >
        {player ? player.display_name : <span className="text-gray-400 italic">{label}</span>}
      </span>
      {isCompleted && (
        <span
          className={`ml-2 text-xs font-bold tabular-nums flex-shrink-0 ${
            isWinner ? 'text-brand-700' : 'text-gray-400'
          }`}
        >
          {score ?? '–'}
        </span>
      )}
    </div>
  );
}

export default function MatchCard({ match, isAdmin, openScoring, onScoreClick, compact = false }: MatchCardProps) {
  const isCompleted = match.status === 'completed';
  const isBye = match.status === 'bye';
  const bothPlayers = Boolean(match.player1_id && match.player2_id);
  // Admins can score a ready match, or edit one that's already completed. With
  // open scoring on, anyone can enter a result that isn't in yet.
  const isClickable =
    !isBye &&
    bothPlayers &&
    canScoreMatch({
      isAdmin: Boolean(isAdmin),
      openScoring: Boolean(openScoring),
      status: match.status,
    });

  const p1IsWinner = isCompleted && match.winner_id === match.player1_id;
  const p2IsWinner = isCompleted && match.winner_id === match.player2_id;
  const court = match.court ?? null;

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

  const Wrapper = isClickable ? 'button' : 'div';

  return (
    <Wrapper
      type={isClickable ? 'button' : undefined}
      aria-label={
        isClickable
          ? `${isCompleted ? 'Edit score' : 'Enter score'} for ${match.player1?.display_name ?? 'TBD'} versus ${match.player2?.display_name ?? 'TBD'}`
          : undefined
      }
      className={`block w-full text-left bg-white border rounded-lg overflow-hidden shadow-sm transition-all ${
        compact ? 'w-40' : 'w-48'
      } ${
        isClickable
          ? 'cursor-pointer hover:shadow-md ' + (isCompleted ? 'border-brand-200 hover:border-brand-400' : 'border-accent-400 hover:border-accent-500')
          : isCompleted
          ? 'border-brand-200'
          : 'border-gray-200'
      }`}
      onClick={() => isClickable && onScoreClick?.(match.id)}
    >
      {court !== null && (
        <div className="bg-brand-50 border-b border-brand-100 px-2.5 py-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
            Court {court}
          </span>
        </div>
      )}
      <PlayerRow
        player={match.player1}
        score={match.player1_score}
        isWinner={p1IsWinner}
        isLoser={isCompleted && !p1IsWinner}
        isCompleted={isCompleted}
        label="TBD"
      />
      <div className="border-t border-gray-100" />
      <PlayerRow
        player={match.player2}
        score={match.player2_score}
        isWinner={p2IsWinner}
        isLoser={isCompleted && !p2IsWinner}
        isCompleted={isCompleted}
        label="TBD"
      />
      {isClickable && (
        <div
          className={`border-t px-2.5 py-1 text-center ${
            isCompleted ? 'bg-brand-50 border-brand-100' : 'bg-accent-50 border-accent-200'
          }`}
        >
          <span className={`text-xs font-medium ${isCompleted ? 'text-brand-700' : 'text-accent-700'}`}>
            {isCompleted ? 'Edit Score' : 'Enter Score'}
          </span>
        </div>
      )}
    </Wrapper>
  );
}

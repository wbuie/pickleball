'use client';

import MatchCard from './MatchCard';
import type { Match, Profile, BracketGrid } from '@/lib/types/app';
import { getWinnersRoundCount, getLosersRoundCount } from '@/lib/bracket/utils';

interface DoubleEliminationBracketProps {
  grid: BracketGrid;
  playerMap: Map<string, Profile>;
  isAdmin?: boolean;
  onScoreClick?: (matchId: string) => void;
}

function enrichMatch(match: Match, playerMap: Map<string, Profile>) {
  return {
    ...match,
    player1: match.player1_id ? playerMap.get(match.player1_id) : undefined,
    player2: match.player2_id ? playerMap.get(match.player2_id) : undefined,
    winner: match.winner_id ? playerMap.get(match.winner_id) : undefined,
  };
}

const BASE_HEIGHT = 76;

function BracketSection({
  title,
  rounds,
  roundData,
  playerMap,
  isAdmin,
  onScoreClick,
  getRoundLabel,
  bgColor = 'bg-brand-50',
}: {
  title: string;
  rounds: number;
  roundData: Record<number, Match[]>;
  playerMap: Map<string, Profile>;
  isAdmin?: boolean;
  onScoreClick?: (matchId: string) => void;
  getRoundLabel: (r: number) => string;
  bgColor?: string;
}) {
  const maxMatches = Math.max(
    ...Object.values(roundData).map(r => r.length),
    1
  );
  const totalHeight = maxMatches * BASE_HEIGHT + 40;

  return (
    <div className={`rounded-xl p-4 ${bgColor}`}>
      <h3 className="text-sm font-bold text-brand-800 uppercase tracking-wider mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-0 min-w-max" style={{ height: totalHeight }}>
          {Array.from({ length: rounds }, (_, i) => i + 1).map(round => {
            const matches = (roundData[round] || []).map(m => enrichMatch(m, playerMap));
            const count = matches.length;

            return (
              <div key={round} className="flex flex-col" style={{ width: 200 }}>
                <div className="h-8 flex items-center justify-center mb-2">
                  <span className="text-xs font-semibold text-brand-700 uppercase tracking-wider">
                    {getRoundLabel(round)}
                  </span>
                </div>
                <div
                  className="relative flex-1 flex flex-col gap-2"
                  style={{ height: maxMatches * BASE_HEIGHT }}
                >
                  {matches.map((match, idx) => {
                    const slotHeight = (maxMatches * BASE_HEIGHT) / count;
                    const topOffset = idx * slotHeight + slotHeight / 2 - BASE_HEIGHT / 2 + 2;
                    return (
                      <div
                        key={match.id}
                        className="absolute"
                        style={{ top: topOffset, left: 8, right: 8 }}
                      >
                        <MatchCard
                          match={match}
                          isAdmin={isAdmin}
                          onScoreClick={onScoreClick}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DoubleEliminationBracket({
  grid,
  playerMap,
  isAdmin,
  onScoreClick,
}: DoubleEliminationBracketProps) {
  const wbRounds = getWinnersRoundCount(grid);
  const lbRounds = getLosersRoundCount(grid);
  const gfMatches = grid.grandFinals.map(m => enrichMatch(m, playerMap));

  const getWBLabel = (r: number) => {
    if (r === wbRounds) return 'WB Finals';
    if (r === wbRounds - 1) return 'WB Semis';
    return `WB Round ${r}`;
  };

  const getLBLabel = (r: number) => {
    if (r === lbRounds) return 'LB Finals';
    return r % 2 === 1 ? `LB Round ${r}` : `LB Round ${r}`;
  };

  return (
    <div className="space-y-6">
      {/* Winners Bracket */}
      <BracketSection
        title="Winners Bracket"
        rounds={wbRounds}
        roundData={grid.winners}
        playerMap={playerMap}
        isAdmin={isAdmin}
        onScoreClick={onScoreClick}
        getRoundLabel={getWBLabel}
        bgColor="bg-brand-50"
      />

      {/* Losers Bracket */}
      {lbRounds > 0 && (
        <BracketSection
          title="Losers Bracket"
          rounds={lbRounds}
          roundData={grid.losers}
          playerMap={playerMap}
          isAdmin={isAdmin}
          onScoreClick={onScoreClick}
          getRoundLabel={getLBLabel}
          bgColor="bg-orange-50"
        />
      )}

      {/* Grand Finals */}
      {gfMatches.length > 0 && (
        <div className="bg-accent-50 rounded-xl p-4 border-2 border-accent-300">
          <h3 className="text-sm font-bold text-accent-800 uppercase tracking-wider mb-3">
            Grand Finals
          </h3>
          <div className="flex gap-6 flex-wrap">
            {gfMatches.map((match, idx) => (
              <div key={match.id}>
                <p className="text-xs text-accent-700 font-medium mb-1.5 text-center">
                  {idx === 0 ? 'Grand Final' : 'Reset Match'}
                </p>
                <MatchCard
                  match={match}
                  isAdmin={isAdmin}
                  onScoreClick={onScoreClick}
                />
                {idx === 1 && match.status === 'pending' && !match.player1_id && (
                  <p className="text-xs text-accent-600 mt-1 text-center italic">
                    Only if needed
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

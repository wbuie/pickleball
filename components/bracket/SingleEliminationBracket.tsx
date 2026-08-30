'use client';

import MatchCard from './MatchCard';
import type { Match, BracketEntry, BracketGrid } from '@/lib/types/app';
import type { ScoreAccess } from '@/lib/scoreAccess';
import { getWinnersRoundCount } from '@/lib/bracket/utils';

interface SingleEliminationBracketProps {
  grid: BracketGrid;
  playerMap: Map<string, BracketEntry>;
  access?: ScoreAccess;
  onScoreClick?: (matchId: string) => void;
}

function enrichMatch(match: Match, playerMap: Map<string, BracketEntry>): Match & { player1?: BracketEntry; player2?: BracketEntry } {
  return {
    ...match,
    player1: match.player1_id ? playerMap.get(match.player1_id) : undefined,
    player2: match.player2_id ? playerMap.get(match.player2_id) : undefined,
    winner: match.winner_id ? playerMap.get(match.winner_id) : undefined,
  };
}

// Each match occupies a vertical "slot" whose height doubles with each round
// Round 1: slot height = BASE_HEIGHT
// Round 2: slot height = 2 * BASE_HEIGHT
// Round r: slot height = 2^(r-1) * BASE_HEIGHT
const BASE_HEIGHT = 76; // px (match card + gap)

export default function SingleEliminationBracket({
  grid,
  playerMap,
  access,
  onScoreClick,
}: SingleEliminationBracketProps) {
  const numRounds = getWinnersRoundCount(grid);
  const bracketSize = Math.pow(2, numRounds);
  const totalHeight = bracketSize * BASE_HEIGHT;

  const getRoundLabel = (round: number) => {
    if (round === numRounds) return 'Final';
    if (round === numRounds - 1) return 'Semifinal';
    if (round === numRounds - 2) return 'Quarterfinal';
    return `Round ${round}`;
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div
        className="flex gap-0 min-w-max"
        style={{ height: totalHeight + 40 }}
      >
        {Array.from({ length: numRounds }, (_, i) => i + 1).map(round => {
          const matches = (grid.winners[round] || []).map(m => enrichMatch(m, playerMap));
          const matchesInRound = bracketSize / Math.pow(2, round);
          const slotHeight = (totalHeight / matchesInRound);
          const isLastRound = round === numRounds;

          return (
            <div key={round} className="flex gap-0">
              {/* Round column */}
              <div className="flex flex-col" style={{ width: 200 }}>
                {/* Round label */}
                <div className="h-8 flex items-center justify-center mb-2">
                  <span className="text-xs font-semibold text-brand-700 uppercase tracking-wider">
                    {getRoundLabel(round)}
                  </span>
                </div>

                {/* Match slots */}
                <div className="relative flex-1">
                  {matches.map((match, idx) => {
                    const topOffset = idx * slotHeight + slotHeight / 2 - BASE_HEIGHT / 2 + 2;
                    return (
                      <div
                        key={match.id}
                        className="absolute"
                        style={{ top: topOffset, left: 8, right: 8 }}
                      >
                        <MatchCard
                          match={match}
                          access={access}
                          onScoreClick={onScoreClick}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connector between rounds */}
              {!isLastRound && (
                // The connectors below are positioned absolutely against this
                // column, so it has to establish the containing block — without
                // `relative` they escape to the page and draw full-width rules
                // across everything above the bracket.
                <div className="relative flex flex-col" style={{ width: 24, marginTop: 40 }}>
                  {Array.from({ length: matchesInRound / 2 }, (_, pairIdx) => {
                    const pairSlotHeight = slotHeight * 2;
                    const topMatch = pairIdx * pairSlotHeight + slotHeight / 2 - BASE_HEIGHT / 2 + 2;
                    const bottomMatch = topMatch + slotHeight;
                    const connectorHeight = bottomMatch - topMatch + BASE_HEIGHT;

                    return (
                      <div
                        key={pairIdx}
                        className="absolute"
                        style={{
                          top: topMatch + BASE_HEIGHT / 2,
                          height: connectorHeight,
                          left: 0,
                          right: 0,
                        }}
                      >
                        <div className="flex flex-col h-full">
                          <div className="bracket-line-top" style={{ height: '50%' }} />
                          <div className="bracket-line-bottom" style={{ height: '50%' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

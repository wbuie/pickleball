'use client';

import { useState } from 'react';
import SingleEliminationBracket from './SingleEliminationBracket';
import DoubleEliminationBracket from './DoubleEliminationBracket';
import ScoreModal from '@/components/admin/ScoreModal';
import type { Match, Profile, BracketGrid, TournamentFormat } from '@/lib/types/app';

interface BracketViewerProps {
  matches: Match[];
  players: Profile[];
  format: TournamentFormat;
  isAdmin?: boolean;
}

export default function BracketViewer({ matches, players, format, isAdmin }: BracketViewerProps) {
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);

  const playerMap = new Map<string, Profile>(players.map(p => [p.id, p]));

  // Group matches into grid
  const grid: BracketGrid = { winners: {}, losers: {}, grandFinals: [] };
  for (const match of matches) {
    if (match.bracket_type === 'grand_finals') {
      grid.grandFinals.push(match);
    } else if (match.bracket_type === 'winners') {
      if (!grid.winners[match.round]) grid.winners[match.round] = [];
      grid.winners[match.round].push(match);
    } else {
      if (!grid.losers[match.round]) grid.losers[match.round] = [];
      grid.losers[match.round].push(match);
    }
  }

  Object.values(grid.winners).forEach(r => r.sort((a, b) => a.position - b.position));
  Object.values(grid.losers).forEach(r => r.sort((a, b) => a.position - b.position));
  grid.grandFinals.sort((a, b) => a.round - b.round);

  const scoringMatch = scoringMatchId ? matches.find(m => m.id === scoringMatchId) : null;

  if (matches.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <div className="text-5xl mb-3">🏆</div>
        <p className="font-medium">Bracket not generated yet</p>
        <p className="text-sm mt-1">An admin will generate the bracket once registration closes</p>
      </div>
    );
  }

  return (
    <div>
      {format === 'single_elimination' ? (
        <SingleEliminationBracket
          grid={grid}
          playerMap={playerMap}
          isAdmin={isAdmin}
          onScoreClick={setScoringMatchId}
        />
      ) : (
        <DoubleEliminationBracket
          grid={grid}
          playerMap={playerMap}
          isAdmin={isAdmin}
          onScoreClick={setScoringMatchId}
        />
      )}

      {scoringMatch && isAdmin && (
        <ScoreModal
          match={{
            ...scoringMatch,
            player1: scoringMatch.player1_id ? playerMap.get(scoringMatch.player1_id) : undefined,
            player2: scoringMatch.player2_id ? playerMap.get(scoringMatch.player2_id) : undefined,
          }}
          onClose={() => setScoringMatchId(null)}
          onSuccess={() => {
            setScoringMatchId(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

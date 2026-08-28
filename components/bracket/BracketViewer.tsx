'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import SingleEliminationBracket from './SingleEliminationBracket';
import DoubleEliminationBracket from './DoubleEliminationBracket';
import MatchList from './MatchList';
import ScoreModal from '@/components/admin/ScoreModal';
import { createClient } from '@/lib/supabase/client';
import { canScoreMatch } from '@/lib/types/app';
import type { Match, BracketEntry, BracketGrid, TournamentFormat } from '@/lib/types/app';

interface BracketViewerProps {
  tournamentId: string;
  matches: Match[];
  players: BracketEntry[];
  format: TournamentFormat;
  isAdmin?: boolean;
  // The organizer has opened scoring up: anyone can enter the score for a match
  // that hasn't been played yet (an admin is still the only one who can change
  // a score that's already in).
  openScoring?: boolean;
  // How many courts the tournament runs on, so an admin can move a match.
  courtCount: number;
  // Registration id of the signed-in viewer's entry, if any — used by the list
  // view to mark and pre-filter to "your" matches.
  highlightEntryId?: string;
}

type View = 'bracket' | 'list';

const MOBILE_QUERY = '(max-width: 767px)';

// Subscribe to a media query without a setState-in-effect. Returns false on the
// server (and during hydration) so markup matches, then reconciles on the client.
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    cb => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export default function BracketViewer({ tournamentId, matches, players, format, isAdmin, openScoring, courtCount, highlightEntryId }: BracketViewerProps) {
  const router = useRouter();
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);

  // Default to the mobile-friendly list on small screens (where the wide
  // bracket diagram is hardest to read) and the diagram on larger screens,
  // until the viewer explicitly picks a view.
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [override, setOverride] = useState<View | null>(null);
  const view: View = override ?? (isMobile ? 'list' : 'bracket');
  const setView = (v: View) => setOverride(v);

  // Live updates: refresh the server-rendered bracket whenever a match in this
  // tournament changes, so spectators see scores roll in without refreshing.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`matches:${tournamentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  const playerMap = new Map<string, BracketEntry>(players.map(p => [p.id, p]));

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
  // Re-check the permission here rather than trusting the click: the bracket
  // refreshes live, so a match can be scored by someone else while the modal is
  // open — and once it is, only an admin may change it.
  const canScore =
    scoringMatch !== null &&
    scoringMatch !== undefined &&
    canScoreMatch({
      isAdmin: Boolean(isAdmin),
      openScoring: Boolean(openScoring),
      status: scoringMatch.status,
    });

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
      {/* View toggle: readable list (great on phones) vs. the full diagram */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-brand-200 bg-brand-50 p-0.5" role="group" aria-label="Bracket view">
          {(['list', 'bracket'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                view === v ? 'bg-white text-brand-800 shadow-sm' : 'text-brand-600 hover:text-brand-800'
              }`}
            >
              {v === 'list' ? 'Scores' : 'Bracket'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <MatchList
          grid={grid}
          playerMap={playerMap}
          format={format}
          isAdmin={isAdmin}
          openScoring={openScoring}
          onScoreClick={setScoringMatchId}
          highlightEntryId={highlightEntryId}
        />
      ) : format === 'single_elimination' ? (
        <SingleEliminationBracket
          grid={grid}
          playerMap={playerMap}
          isAdmin={isAdmin}
          openScoring={openScoring}
          onScoreClick={setScoringMatchId}
        />
      ) : (
        <DoubleEliminationBracket
          grid={grid}
          playerMap={playerMap}
          isAdmin={isAdmin}
          openScoring={openScoring}
          onScoreClick={setScoringMatchId}
        />
      )}

      {scoringMatch && canScore && (
        <ScoreModal
          match={{
            ...scoringMatch,
            player1: scoringMatch.player1_id ? playerMap.get(scoringMatch.player1_id) : undefined,
            player2: scoringMatch.player2_id ? playerMap.get(scoringMatch.player2_id) : undefined,
          }}
          isAdmin={Boolean(isAdmin)}
          courtCount={courtCount}
          onClose={() => setScoringMatchId(null)}
          onChange={() => router.refresh()}
          onSuccess={() => {
            setScoringMatchId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

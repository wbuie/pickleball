'use client';

import { useMemo, useState } from 'react';
import type { Match, BracketEntry, BracketGrid, TournamentFormat } from '@/lib/types/app';
import { getWinnersRoundCount, getLosersRoundCount } from '@/lib/bracket/utils';

interface MatchListProps {
  grid: BracketGrid;
  playerMap: Map<string, BracketEntry>;
  format: TournamentFormat;
  isAdmin?: boolean;
  onScoreClick?: (matchId: string) => void;
  // Registration id of the signed-in viewer's entry, if they're in this
  // tournament — used to mark and pre-filter to "your" matches.
  highlightEntryId?: string;
}

type EnrichedMatch = Match & { player1?: BracketEntry; player2?: BracketEntry };

interface RoundGroup {
  label: string;
  matches: EnrichedMatch[];
}

interface Section {
  title: string | null;
  rounds: RoundGroup[];
}

function enrich(match: Match, playerMap: Map<string, BracketEntry>): EnrichedMatch {
  return {
    ...match,
    player1: match.player1_id ? playerMap.get(match.player1_id) : undefined,
    player2: match.player2_id ? playerMap.get(match.player2_id) : undefined,
  };
}

// A single player's line inside a match row: name on the left, score on the
// right, winner highlighted and loser dimmed once the match is final.
function PlayerLine({
  player,
  score,
  isWinner,
  isLoser,
  isCompleted,
  isYou,
  label,
}: {
  player?: BracketEntry;
  score: number | null;
  isWinner: boolean;
  isLoser: boolean;
  isCompleted: boolean;
  isYou: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
        isWinner ? 'bg-brand-50 border-l-4 border-l-brand-500' : isLoser ? 'opacity-55' : 'border-l-4 border-l-transparent'
      }`}
    >
      <span className={`text-sm truncate ${isWinner ? 'font-bold text-brand-800' : 'font-medium text-gray-800'}`}>
        {player ? player.display_name : <span className="text-gray-400 italic">{label}</span>}
        {isYou && <span className="ml-1.5 text-brand-600 text-xs font-semibold">(you)</span>}
      </span>
      {isCompleted && (
        <span className={`text-base font-bold tabular-nums flex-shrink-0 ${isWinner ? 'text-brand-700' : 'text-gray-400'}`}>
          {score ?? '–'}
        </span>
      )}
    </div>
  );
}

function MatchRow({
  match,
  isAdmin,
  onScoreClick,
  highlightEntryId,
}: {
  match: EnrichedMatch;
  isAdmin?: boolean;
  onScoreClick?: (matchId: string) => void;
  highlightEntryId?: string;
}) {
  const isCompleted = match.status === 'completed';
  const isBye = match.status === 'bye';
  const isLive = match.status === 'in_progress';
  const bothPlayers = Boolean(match.player1_id && match.player2_id);
  const isClickable = Boolean(isAdmin && !isBye && bothPlayers);
  const involvesYou =
    Boolean(highlightEntryId) &&
    (match.player1_id === highlightEntryId || match.player2_id === highlightEntryId);
  const court = match.court ?? null;

  if (isBye) {
    const byePlayer = match.player1 || match.player2;
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3.5 py-2.5">
        <span className="text-sm text-gray-500 italic">
          {byePlayer ? `${byePlayer.display_name} — bye` : 'Bye'}
        </span>
      </div>
    );
  }

  const Wrapper = isClickable ? 'button' : 'div';
  const p1IsWinner = isCompleted && match.winner_id === match.player1_id;
  const p2IsWinner = isCompleted && match.winner_id === match.player2_id;

  return (
    <Wrapper
      type={isClickable ? 'button' : undefined}
      onClick={() => isClickable && onScoreClick?.(match.id)}
      aria-label={
        isClickable
          ? `${isCompleted ? 'Edit score' : 'Enter score'} for ${match.player1?.display_name ?? 'TBD'} versus ${match.player2?.display_name ?? 'TBD'}`
          : undefined
      }
      className={`block w-full text-left rounded-xl border bg-white overflow-hidden shadow-sm transition-all ${
        involvesYou ? 'border-brand-400 ring-2 ring-brand-200' : isCompleted ? 'border-brand-200' : 'border-gray-200'
      } ${isClickable ? 'cursor-pointer hover:shadow-md hover:border-brand-400' : ''}`}
    >
      <PlayerLine
        player={match.player1}
        score={match.player1_score}
        isWinner={p1IsWinner}
        isLoser={isCompleted && !p1IsWinner}
        isCompleted={isCompleted}
        isYou={match.player1_id === highlightEntryId}
        label="TBD"
      />
      <div className="border-t border-gray-100" />
      <PlayerLine
        player={match.player2}
        score={match.player2_score}
        isWinner={p2IsWinner}
        isLoser={isCompleted && !p2IsWinner}
        isCompleted={isCompleted}
        isYou={match.player2_id === highlightEntryId}
        label="TBD"
      />
      <div
        className={`flex items-center justify-between border-t px-3.5 py-1.5 text-xs font-medium ${
          isCompleted
            ? 'bg-brand-50 border-brand-100 text-brand-700'
            : isLive
            ? 'bg-blue-50 border-blue-100 text-blue-700'
            : 'bg-gray-50 border-gray-100 text-gray-500'
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            {isLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
            )}
            {isCompleted ? 'Final' : isLive ? 'Live' : bothPlayers ? 'Upcoming' : 'Awaiting players'}
          </span>
          {court !== null && (
            <span className="inline-flex items-center rounded-full border border-brand-200 bg-white px-2 py-0.5 text-[11px] font-bold text-brand-700">
              Court {court}
            </span>
          )}
          {court === null && !isCompleted && bothPlayers && (
            <span className="text-gray-400">on deck</span>
          )}
        </span>
        {isClickable && (
          <span className="text-accent-700">{isCompleted ? 'Edit score' : 'Enter score'}</span>
        )}
      </div>
    </Wrapper>
  );
}

export default function MatchList({
  grid,
  playerMap,
  format,
  isAdmin,
  onScoreClick,
  highlightEntryId,
}: MatchListProps) {
  // Pre-fill the filter with the viewer's own matches when we know who they are.
  const myName = highlightEntryId ? playerMap.get(highlightEntryId)?.display_name ?? '' : '';
  const [query, setQuery] = useState(myName);

  const sections = useMemo<Section[]>(() => {
    const wbRounds = getWinnersRoundCount(grid);
    const lbRounds = getLosersRoundCount(grid);

    const seLabel = (r: number) => {
      if (r === wbRounds) return 'Final';
      if (r === wbRounds - 1) return 'Semifinals';
      if (r === wbRounds - 2) return 'Quarterfinals';
      return `Round ${r}`;
    };
    const wbLabel = (r: number) => (r === wbRounds ? 'WB Finals' : r === wbRounds - 1 ? 'WB Semis' : `WB Round ${r}`);
    const lbLabel = (r: number) => (r === lbRounds ? 'LB Finals' : `LB Round ${r}`);

    const roundsFrom = (data: Record<number, Match[]>, count: number, label: (r: number) => string): RoundGroup[] =>
      Array.from({ length: count }, (_, i) => i + 1)
        .map(r => ({
          label: label(r),
          matches: (data[r] || [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map(m => enrich(m, playerMap)),
        }))
        .filter(g => g.matches.length > 0);

    if (format === 'single_elimination') {
      return [{ title: null, rounds: roundsFrom(grid.winners, wbRounds, seLabel) }];
    }

    const result: Section[] = [
      { title: 'Winners Bracket', rounds: roundsFrom(grid.winners, wbRounds, wbLabel) },
    ];
    if (lbRounds > 0) {
      result.push({ title: 'Losers Bracket', rounds: roundsFrom(grid.losers, lbRounds, lbLabel) });
    }
    if (grid.grandFinals.length > 0) {
      result.push({
        title: 'Grand Finals',
        rounds: [
          {
            label: '',
            matches: grid.grandFinals
              .slice()
              .sort((a, b) => a.round - b.round)
              .map(m => enrich(m, playerMap)),
          },
        ],
      });
    }
    return result;
  }, [grid, playerMap, format]);

  const q = query.trim().toLowerCase();
  const matchesQuery = (m: EnrichedMatch) =>
    !q ||
    m.player1?.display_name.toLowerCase().includes(q) ||
    m.player2?.display_name.toLowerCase().includes(q) ||
    (m.court != null && `court ${m.court}`.includes(q));

  const filtered = sections
    .map(s => ({
      ...s,
      rounds: s.rounds
        .map(r => ({ ...r, matches: r.matches.filter(matchesQuery) }))
        .filter(r => r.matches.length > 0),
    }))
    .filter(s => s.rounds.length > 0);

  const hasResults = filtered.length > 0;

  return (
    <div>
      {/* Find-your-name filter */}
      <div className="relative mb-5">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find your name or court…"
          aria-label="Filter matches by player name or court"
          className="w-full rounded-xl border border-gray-300 bg-white pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {!hasResults && (
        <p className="text-center text-gray-500 text-sm py-10">
          No matches found for &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      <div className="space-y-7">
        {filtered.map((section, si) => (
          <div key={section.title ?? si}>
            {section.title && (
              <h3 className="text-sm font-bold text-brand-800 uppercase tracking-wider mb-3">{section.title}</h3>
            )}
            <div className="space-y-5">
              {section.rounds.map((round, ri) => (
                <div key={round.label || ri}>
                  {round.label && (
                    <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-2">{round.label}</p>
                  )}
                  <div className="space-y-2.5">
                    {round.matches.map(match => (
                      <MatchRow
                        key={match.id}
                        match={match}
                        isAdmin={isAdmin}
                        onScoreClick={onScoreClick}
                        highlightEntryId={highlightEntryId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

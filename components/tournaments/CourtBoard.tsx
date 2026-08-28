import type { BracketEntry, Match } from '@/lib/types/app';
import { isPlayable } from '@/lib/bracket/courts';

interface CourtBoardProps {
  matches: Match[];
  entries: Map<string, BracketEntry>;
  courtCount: number;
  // Registration id of the signed-in viewer's entry, so we can tell them where
  // to go rather than making them hunt for their name.
  highlightEntryId?: string;
}

function roundLabel(match: Match): string {
  if (match.bracket_type === 'grand_finals') {
    return match.round === 2 ? 'Grand Final — Reset' : 'Grand Final';
  }
  const prefix = match.bracket_type === 'winners' ? 'Winners' : 'Losers';
  return `${prefix} · Round ${match.round}`;
}

// The two sides of a match, one per line, with the viewer's own entry called out.
function Matchup({
  match,
  entries,
  highlightEntryId,
}: {
  match: Match;
  entries: Map<string, BracketEntry>;
  highlightEntryId?: string;
}) {
  const sides = [match.player1_id, match.player2_id];
  return (
    <div className="space-y-0.5">
      {sides.map((entryId, i) => (
        <p
          key={i}
          className={`text-sm truncate ${
            entryId && entryId === highlightEntryId ? 'font-bold text-brand-800' : 'font-medium text-gray-800'
          }`}
        >
          {entryId ? entries.get(entryId)?.display_name ?? 'TBD' : 'TBD'}
          {entryId && entryId === highlightEntryId && (
            <span className="ml-1 text-brand-600 text-xs font-semibold">(you)</span>
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * The "where do I go?" board: one tile per court showing the match on it, plus
 * the matches waiting for a court to open up. Courts are assigned automatically
 * as matches become ready, so this is always the live picture.
 */
export default function CourtBoard({
  matches,
  entries,
  courtCount,
  highlightEntryId,
}: CourtBoardProps) {
  const live = matches.filter(isPlayable);
  const onCourt = new Map<number, Match>();
  for (const match of live) {
    if (match.court !== null && match.court >= 1 && match.court <= courtCount) {
      onCourt.set(match.court, match);
    }
  }
  const waiting = live.filter(m => !m.court || m.court > courtCount);

  if (live.length === 0) return null;

  const yourMatch = highlightEntryId
    ? live.find(m => m.player1_id === highlightEntryId || m.player2_id === highlightEntryId)
    : undefined;

  const courts = Array.from({ length: courtCount }, (_, i) => i + 1);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-bold text-gray-900 text-xl">On the courts</h2>
        <p className="text-sm text-gray-500">
          {courtCount} court{courtCount === 1 ? '' : 's'} · {onCourt.size} in play
          {waiting.length > 0 && ` · ${waiting.length} waiting`}
        </p>
      </div>

      {yourMatch && (
        <div className="bg-accent-50 border border-accent-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-accent-900 font-bold">
            {yourMatch.court
              ? `You're up on Court ${yourMatch.court}`
              : "You're on deck — waiting for a court"}
          </p>
          <p className="text-accent-700 text-sm mt-0.5">
            {roundLabel(yourMatch)} ·{' '}
            {[yourMatch.player1_id, yourMatch.player2_id]
              .map(entryId => (entryId ? entries.get(entryId)?.display_name ?? 'TBD' : 'TBD'))
              .join(' vs ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {courts.map(court => {
          const match = onCourt.get(court);
          const isYours = Boolean(
            match &&
              highlightEntryId &&
              (match.player1_id === highlightEntryId || match.player2_id === highlightEntryId)
          );
          return (
            <div
              key={court}
              className={`rounded-xl border p-3.5 ${
                isYours
                  ? 'border-brand-400 ring-2 ring-brand-200 bg-brand-50'
                  : match
                  ? 'border-brand-200 bg-white'
                  : 'border-dashed border-gray-200 bg-gray-50'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-brand-700 mb-1.5">
                Court {court}
              </p>
              {match ? (
                <>
                  <Matchup match={match} entries={entries} highlightEntryId={highlightEntryId} />
                  <p className="text-xs text-gray-400 mt-1.5">{roundLabel(match)}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">Open</p>
              )}
            </div>
          );
        })}
      </div>

      {waiting.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-2">
            Waiting for a court
          </p>
          <ul className="space-y-1.5">
            {waiting.map(match => (
              <li key={match.id} className="text-sm text-gray-600 truncate">
                {[match.player1_id, match.player2_id]
                  .map(entryId => (entryId ? entries.get(entryId)?.display_name ?? 'TBD' : 'TBD'))
                  .join(' vs ')}
                <span className="text-gray-400"> · {roundLabel(match)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

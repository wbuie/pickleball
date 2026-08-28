import type { SupabaseClient } from '@supabase/supabase-js';

// Courts are a scarce resource an organizer hands out: a tournament runs on
// `court_count` courts, and every match that's ready to be played gets one so
// players know where to go. Matches that are ready but have no free court wait
// in line ("on deck") until a court comes back.
//
// Assignment is deliberately sticky — a match keeps the court it was given —
// so nobody gets moved mid-game by an unrelated result rolling in.

// The columns the assignment logic reads. Kept structural (not the full Match
// type) so both the DB rows and test fixtures satisfy it.
export interface CourtMatch {
  id: string;
  bracket_type: string;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  status: string;
  court: number | null;
}

// A match needs a court once both sides are known and it hasn't been played
// (or byed) yet.
export function isPlayable(match: CourtMatch): boolean {
  return (
    Boolean(match.player1_id) &&
    Boolean(match.player2_id) &&
    match.status !== 'completed' &&
    match.status !== 'bye'
  );
}

// Roughly the order matches get played, used to decide who takes the next free
// court: earlier rounds first, winners before losers within a round, and the
// grand finals last of all (their round numbers restart at 1).
function playOrder(match: CourtMatch): [number, number, number, number] {
  const stage = match.bracket_type === 'grand_finals' ? 1 : 0;
  const bracket = match.bracket_type === 'winners' ? 0 : 1;
  return [stage, match.round, bracket, match.position];
}

function comparePlayOrder(a: CourtMatch, b: CourtMatch): number {
  const oa = playOrder(a);
  const ob = playOrder(b);
  for (let i = 0; i < oa.length; i++) {
    if (oa[i] !== ob[i]) return oa[i] - ob[i];
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Decide which court every match should be on.
 *
 * - Playable matches already holding a valid court keep it (no shuffling).
 * - Remaining free courts go to the playable matches next in line to be played.
 * - Playable matches with no court left over stay unassigned (on deck).
 * - Finished matches keep their court as a record but stop occupying it, so it
 *   is immediately available for the next match.
 *
 * Returns only the matches whose court should change, as id → court (or null).
 */
export function assignCourts(
  matches: CourtMatch[],
  courtCount: number
): Map<string, number | null> {
  const courts = Math.max(1, Math.floor(courtCount) || 1);
  const changes = new Map<string, number | null>();

  const playable = matches.filter(isPlayable);

  // Courts still in use by a match that hasn't been played. A court number
  // beyond the current count (the organizer dropped a court) doesn't count as
  // held — those matches get re-queued below.
  const held = new Set<number>();
  const keeping = new Set<string>();
  for (const match of playable.slice().sort(comparePlayOrder)) {
    const court = match.court ?? null;
    if (court === null || court < 1 || court > courts || held.has(court)) continue;
    held.add(court);
    keeping.add(match.id);
  }

  const free: number[] = [];
  for (let court = 1; court <= courts; court++) {
    if (!held.has(court)) free.push(court);
  }

  // Hand the free courts to whoever is up next; anyone left over waits.
  const waiting = playable.filter(m => !keeping.has(m.id)).sort(comparePlayOrder);
  for (const match of waiting) {
    const next = free.shift() ?? null;
    if ((match.court ?? null) !== next) changes.set(match.id, next);
  }

  return changes;
}

// Recompute and persist court assignments for a tournament. Called whenever the
// set of playable matches changes (bracket generated, score recorded) or the
// organizer changes how many courts are available.
export async function syncCourtAssignments(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<void> {
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('court_count')
    .eq('id', tournamentId)
    .single<{ court_count: number | null }>();

  const { data: matches } = await supabase
    .from('matches')
    .select('id, bracket_type, round, position, player1_id, player2_id, status, court')
    .eq('tournament_id', tournamentId);

  if (!matches || matches.length === 0) return;

  const changes = assignCourts(matches as CourtMatch[], tournament?.court_count ?? 1);
  for (const [id, court] of changes) {
    await supabase.from('matches').update({ court }).eq('id', id);
  }
}

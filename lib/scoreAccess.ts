// Who may put a score on a match.
//
// By default scoring belongs to the organizers, which means someone with the
// admin account has to be standing there when every game ends. A tournament can
// instead be run with `open_scoring` on, and then anyone looking at the page —
// signed in or not — can report the result of a game that has just finished.
// Fixing a score that's already final stays with the organizers either way, so
// an open event can't have its bracket rewritten from underneath it.

import type { Match } from '@/lib/types/app';

export type ScoreAccess =
  // Read-only: no score entry offered at all.
  | 'none'
  // Anyone can report the result of a match that hasn't been played.
  | 'report'
  // Organizers: report results and correct scores that are already final.
  | 'full';

export function scoreAccessFor(isAdmin: boolean, openScoring: boolean | null | undefined): ScoreAccess {
  if (isAdmin) return 'full';
  return openScoring ? 'report' : 'none';
}

// The part of a match this decision reads — kept narrow so callers can pass a
// row straight from the database or an enriched bracket match.
type ScorableMatch = Pick<Match, 'status' | 'player1_id' | 'player2_id'>;

/** True when someone with this access can enter (or change) this match's score. */
export function canScoreMatch(access: ScoreAccess, match: ScorableMatch): boolean {
  if (access === 'none') return false;
  if (match.status === 'bye') return false;
  if (!match.player1_id || !match.player2_id) return false;
  // A final score is a correction, not a report — organizers only.
  if (match.status === 'completed') return access === 'full';
  return true;
}

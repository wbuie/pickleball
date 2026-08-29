// A doubles entry carries two players on one row (captain + partner) and a
// roster entry carries a captain plus member rows, so "remove this player" is
// not always "delete this row". This works out which it is, kept separate from
// the route so the decision is easy to test.

export type RemovalTarget = {
  player_id: string;
  partner_id: string | null;
  members?: { player_id: string }[] | null;
};

export type RemovalPlan =
  // The whole entry goes: a solo/singles player, or a captain with nobody to
  // hand the entry to.
  | { kind: 'delete-entry' }
  // A doubles partner steps out and leaves the captain solo.
  | { kind: 'clear-partner' }
  // A doubles captain steps out; their partner keeps the entry (and its seed).
  | { kind: 'promote-partner'; playerId: string }
  // A roster player who is not the captain.
  | { kind: 'remove-member'; playerId: string }
  | { kind: 'not-found' };

// `playerId` omitted means "remove the entry itself", which is how an organizer
// drops a whole team.
export function planRemoval(entry: RemovalTarget, playerId?: string | null): RemovalPlan {
  if (!playerId) return { kind: 'delete-entry' };
  if (playerId === entry.partner_id) return { kind: 'clear-partner' };
  if (playerId === entry.player_id) {
    return entry.partner_id
      ? { kind: 'promote-partner', playerId: entry.partner_id }
      : { kind: 'delete-entry' };
  }
  if ((entry.members ?? []).some(m => m.player_id === playerId)) {
    return { kind: 'remove-member', playerId };
  }
  return { kind: 'not-found' };
}

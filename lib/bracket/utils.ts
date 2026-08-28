import type { Match, BracketGrid } from '@/lib/types/app';

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function getNumRounds(numPlayers: number): number {
  return Math.log2(nextPowerOf2(numPlayers));
}

// Returns seedAtSlot[i] = which seed number goes in slot i
// Ensures seeds 1 and 2 are on opposite sides of the bracket
export function getSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  if (size === 2) return [1, 2];
  const half = getSeedOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed);
    result.push(size + 1 - seed);
  }
  return result;
}

export function groupMatchesByBracketAndRound(matches: Match[]): BracketGrid {
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

  // Sort by position within each round
  Object.values(grid.winners).forEach(r => r.sort((a, b) => a.position - b.position));
  Object.values(grid.losers).forEach(r => r.sort((a, b) => a.position - b.position));
  grid.grandFinals.sort((a, b) => a.round - b.round);

  return grid;
}

export function getWinnersRoundCount(grid: BracketGrid): number {
  return Math.max(...Object.keys(grid.winners).map(Number), 0);
}

export function getLosersRoundCount(grid: BracketGrid): number {
  return Math.max(...Object.keys(grid.losers).map(Number), 0);
}

// Close the gaps in a field's seeds after entries are removed, so they run
// 1..n again. Seeds aren't cosmetic: getSeedOrder maps a bracket slot to a seed
// *number* and generation drops any seed above the field size, so a hole left
// by a withdrawn entry (say 1, 2, 4 for three entries) would silently turn a
// real entry into a bye. Entries keep their relative order — an unseeded entry
// (null) sorts last. Only the rows that actually move are returned, so the
// caller writes as little as possible.
export function resequenceSeeds<T extends { id: string; seed: number | null }>(
  entries: T[]
): { id: string; seed: number }[] {
  const ordered = [...entries].sort((a, b) => {
    if (a.seed === null && b.seed === null) return 0;
    if (a.seed === null) return 1;
    if (b.seed === null) return -1;
    return a.seed - b.seed;
  });

  return ordered
    .map((entry, i) => ({ id: entry.id, seed: i + 1, was: entry.seed }))
    .filter(row => row.was !== row.seed)
    .map(({ id, seed }) => ({ id, seed }));
}

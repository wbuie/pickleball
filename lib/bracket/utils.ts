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

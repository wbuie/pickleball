import { describe, it, expect } from 'vitest';
import { assignSeeds, firstRoundSeedPairs, youthPairCount, type RankedEntry } from './youth';
import { nextPowerOf2 } from './utils';

// Build a field ranked strongest-first. `youth` lists the ids that carry the tag.
function field(size: number, youth: string[] = []): RankedEntry[] {
  return Array.from({ length: size }, (_, i) => {
    const id = `e${i + 1}`;
    return { id, is_youth: youth.includes(id) };
  });
}

// The round-1 games the assigned seeds actually produce, as pairs of entry ids.
// A pairing that includes a seed nobody holds is a bye, and is left out.
function firstRoundGames(assigned: { id: string; seed: number }[]): [string, string][] {
  const bySeed = new Map(assigned.map(a => [a.seed, a.id]));
  return firstRoundSeedPairs(nextPowerOf2(assigned.length))
    .map(([a, b]) => [bySeed.get(a), bySeed.get(b)] as [string | undefined, string | undefined])
    .filter((game): game is [string, string] => !!game[0] && !!game[1]);
}

function allYouthGames(assigned: { id: string; seed: number }[], youth: string[]): number {
  return firstRoundGames(assigned).filter(
    ([a, b]) => youth.includes(a) && youth.includes(b)
  ).length;
}

describe('assignSeeds', () => {
  it('seeds straight down the ranking when nothing is tagged Youth', () => {
    const assigned = assignSeeds(field(8));
    expect(assigned).toEqual([
      { id: 'e1', seed: 1 }, { id: 'e2', seed: 2 }, { id: 'e3', seed: 3 }, { id: 'e4', seed: 4 },
      { id: 'e5', seed: 5 }, { id: 'e6', seed: 6 }, { id: 'e7', seed: 7 }, { id: 'e8', seed: 8 },
    ]);
  });

  it('leaves a lone Youth entry seeded on rating — there is nobody to pair it with', () => {
    const assigned = assignSeeds(field(8, ['e5']));
    expect(assigned.find(a => a.id === 'e5')?.seed).toBe(5);
    expect(youthPairCount(field(8, ['e5']))).toBe(0);
  });

  it('puts two Youth entries in the same round-1 game', () => {
    const youth = ['e6', 'e7'];
    const assigned = assignSeeds(field(8, youth));
    expect(allYouthGames(assigned, youth)).toBe(1);
    expect(youthPairCount(field(8, youth))).toBe(1);
  });

  it('pairs off four Youth entries into two all-Youth games', () => {
    const youth = ['e5', 'e6', 'e7', 'e8'];
    const assigned = assignSeeds(field(8, youth));
    expect(allYouthGames(assigned, youth)).toBe(2);
    // They take the middle of the draw (4v5 and 3v6 in an 8-draw), not the
    // bottom seeds that would have sent them straight at the top two.
    expect(assigned.filter(a => youth.includes(a.id)).map(a => a.seed).sort()).toEqual([3, 4, 5, 6]);
  });

  it('keeps the ranking inside each group', () => {
    const youth = ['e5', 'e6', 'e7', 'e8'];
    const assigned = assignSeeds(field(8, youth));
    const seedOf = (id: string) => assigned.find(a => a.id === id)!.seed;
    // Strongest youth takes the best youth seed, and so on down.
    expect(seedOf('e5')).toBeLessThan(seedOf('e6'));
    expect(seedOf('e6')).toBeLessThan(seedOf('e7'));
    expect(seedOf('e7')).toBeLessThan(seedOf('e8'));
    // Non-youth keep their order relative to each other too.
    expect(seedOf('e1')).toBeLessThan(seedOf('e2'));
    expect(seedOf('e2')).toBeLessThan(seedOf('e3'));
    expect(seedOf('e3')).toBeLessThan(seedOf('e4'));
  });

  it('pairs what it can and seeds the odd one out normally', () => {
    const youth = ['e4', 'e5', 'e6'];
    const assigned = assignSeeds(field(8, youth));
    expect(allYouthGames(assigned, youth)).toBe(1);
    expect(youthPairCount(field(8, youth))).toBe(1);
  });

  it('handles a field that is entirely Youth', () => {
    const youth = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'];
    const assigned = assignSeeds(field(8, youth));
    expect(allYouthGames(assigned, youth)).toBe(4);
    expect(assigned.map(a => a.seed).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('only claims pairings that are real games, not byes', () => {
    // 6 entries in an 8-draw: seeds 1 and 2 have byes, so 3v6 and 4v5 are the
    // only contested first-round games — at most two youth pairings exist.
    const youth = ['e3', 'e4', 'e5', 'e6'];
    const assigned = assignSeeds(field(6, youth));
    expect(allYouthGames(assigned, youth)).toBe(2);
    expect(youthPairCount(field(6, youth))).toBe(2);
  });

  it('caps pairings at the number of contested games in the draw', () => {
    // 5 entries in an 8-draw: 4v5 is the single contested game, so a field of
    // five youth entries can still only produce one all-youth first round.
    const youth = ['e1', 'e2', 'e3', 'e4', 'e5'];
    const assigned = assignSeeds(field(5, youth));
    expect(allYouthGames(assigned, youth)).toBe(1);
    expect(youthPairCount(field(5, youth))).toBe(1);
  });

  it('always hands out each seed from 1..n exactly once', () => {
    for (const [n, youthCount] of [[4, 2], [7, 3], [12, 6], [16, 5], [23, 11]] as const) {
      const youth = Array.from({ length: youthCount }, (_, i) => `e${n - i}`);
      const assigned = assignSeeds(field(n, youth));
      expect(assigned).toHaveLength(n);
      expect(assigned.map(a => a.seed).sort((a, b) => a - b)).toEqual(
        Array.from({ length: n }, (_, i) => i + 1)
      );
      expect(new Set(assigned.map(a => a.id)).size).toBe(n);
      expect(allYouthGames(assigned, youth)).toBe(youthPairCount(field(n, youth)));
    }
  });

  it('returns nothing for an empty field', () => {
    expect(assignSeeds([])).toEqual([]);
  });
});

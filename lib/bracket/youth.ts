import { nextPowerOf2, getSeedOrder } from './utils';

export interface RankedEntry {
  id: string;
  is_youth?: boolean | null;
}

export interface AssignedSeed {
  id: string;
  seed: number;
}

// Which seed numbers meet each other in round 1 of a bracket of `size` slots.
// Slot order pairs (0,1), (2,3), … into the first-round matches, so each
// consecutive pair of slots is one game.
export function firstRoundSeedPairs(size: number): [number, number][] {
  const order = getSeedOrder(size);
  const pairs: [number, number][] = [];
  for (let p = 0; p < size / 2; p++) {
    pairs.push([order[p * 2], order[p * 2 + 1]]);
  }
  return pairs;
}

/**
 * Turn a field ranked strongest-first into seed numbers, keeping youth entries
 * on the same side of the same round-1 games.
 *
 * Without this, seeding purely by rating puts the youth entries at the bottom of
 * the draw — which is exactly where a standard bracket sends them up against the
 * top seeds (16 plays 1, 15 plays 2). Instead we hand the youth entries a set of
 * seeds that already face each other in round 1: in a 16 draw that's 8v9 first,
 * then 7v10, then 6v11, working out from the middle of the bracket, which is
 * where the evenest first-round games live anyway.
 *
 * Within each group the ranking is preserved — the strongest youth entry gets
 * the best of the youth seeds, and everyone else fills what's left in rank
 * order. An odd youth entry out (or one with no youth pairing left to give it)
 * simply seeds normally by rating.
 *
 * Grouping does move some non-youth entries off the seed they'd have had on
 * rating alone; that's unavoidable once you constrain who plays whom, and it
 * only affects the draw, never a result.
 */
export function assignSeeds(ranked: RankedEntry[]): AssignedSeed[] {
  const n = ranked.length;
  if (n === 0) return [];

  const youth = ranked.filter(e => e.is_youth);
  const pairsWanted = Math.floor(youth.length / 2);

  let youthSeeds: number[] = [];
  if (pairsWanted > 0) {
    // Only pairings where both seeds are a real entry are worth claiming — the
    // rest are byes, where nobody plays anybody.
    const contested = firstRoundSeedPairs(nextPowerOf2(n)).filter(
      ([a, b]) => a <= n && b <= n
    );
    // Weakest pairing first: the highest "best seed in this game" is the most
    // evenly matched game in the draw, and the least disruptive to give away.
    const chosen = contested
      .sort((a, b) => Math.min(b[0], b[1]) - Math.min(a[0], a[1]))
      .slice(0, pairsWanted);
    youthSeeds = chosen.flat().sort((a, b) => a - b);
  }

  const placed = youth.slice(0, youthSeeds.length);
  const placedIds = new Set(placed.map(e => e.id));
  const taken = new Set(youthSeeds);

  const restSeeds: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    if (!taken.has(seed)) restSeeds.push(seed);
  }
  const rest = ranked.filter(e => !placedIds.has(e.id));

  return [
    ...placed.map((entry, i) => ({ id: entry.id, seed: youthSeeds[i] })),
    ...rest.map((entry, i) => ({ id: entry.id, seed: restSeeds[i] })),
  ];
}

/**
 * How many round-1 games this field will produce with youth on both sides —
 * what the tag actually buys the organizer, byes and all.
 */
export function youthPairCount(entries: RankedEntry[]): number {
  const n = entries.length;
  const wanted = Math.floor(entries.filter(e => e.is_youth).length / 2);
  if (wanted === 0) return 0;
  const contested = firstRoundSeedPairs(nextPowerOf2(n)).filter(
    ([a, b]) => a <= n && b <= n
  ).length;
  return Math.min(wanted, contested);
}

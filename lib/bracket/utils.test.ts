import { describe, it, expect } from 'vitest';
import { nextPowerOf2, getNumRounds, getSeedOrder, groupMatchesByBracketAndRound } from './utils';
import { getLBMatchCount, getLBRoundCount } from './doubleElimination';
import type { Match } from '@/lib/types/app';

describe('nextPowerOf2', () => {
  it('rounds up to the next power of two', () => {
    expect(nextPowerOf2(1)).toBe(1);
    expect(nextPowerOf2(2)).toBe(2);
    expect(nextPowerOf2(3)).toBe(4);
    expect(nextPowerOf2(5)).toBe(8);
    expect(nextPowerOf2(8)).toBe(8);
    expect(nextPowerOf2(9)).toBe(16);
  });
});

describe('getNumRounds', () => {
  it('counts knockout rounds', () => {
    expect(getNumRounds(2)).toBe(1);
    expect(getNumRounds(4)).toBe(2);
    expect(getNumRounds(8)).toBe(3);
    expect(getNumRounds(5)).toBe(3); // rounds up to 8
  });
});

describe('getSeedOrder', () => {
  it('keeps seeds 1 and 2 on opposite halves', () => {
    const order = getSeedOrder(8);
    expect(order).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const firstHalf = order.slice(0, 4);
    const secondHalf = order.slice(4);
    expect(firstHalf).toContain(1);
    expect(secondHalf).toContain(2);
  });

  it('is a permutation of 1..size with no duplicates', () => {
    for (const size of [2, 4, 8, 16, 32]) {
      const order = getSeedOrder(size);
      expect(order).toHaveLength(size);
      expect(new Set(order).size).toBe(size);
      expect(Math.min(...order)).toBe(1);
      expect(Math.max(...order)).toBe(size);
    }
  });

  it('pairs each first-round slot to seeds summing to size+1', () => {
    const size = 16;
    const order = getSeedOrder(size);
    for (let i = 0; i < size; i += 2) {
      expect(order[i] + order[i + 1]).toBe(size + 1);
    }
  });
});

describe('losers-bracket sizing', () => {
  it('has 2*(wbRounds-1) LB rounds', () => {
    expect(getLBRoundCount(2)).toBe(2); // 4 players
    expect(getLBRoundCount(3)).toBe(4); // 8 players
    expect(getLBRoundCount(4)).toBe(6); // 16 players
  });

  it('matches the expected per-round counts for an 8-player draw', () => {
    // bracketSize 8 → LB rounds: [2,2,1,1]
    expect(getLBMatchCount(1, 8)).toBe(2);
    expect(getLBMatchCount(2, 8)).toBe(2);
    expect(getLBMatchCount(3, 8)).toBe(1);
    expect(getLBMatchCount(4, 8)).toBe(1);
  });
});

describe('groupMatchesByBracketAndRound', () => {
  it('buckets and sorts matches by bracket, round and position', () => {
    const m = (over: Partial<Match>): Match => ({
      id: Math.random().toString(),
      tournament_id: 't',
      bracket_type: 'winners',
      round: 1,
      position: 0,
      player1_id: null,
      player2_id: null,
      player1_score: null,
      player2_score: null,
      winner_id: null,
      loser_id: null,
      status: 'pending',
      winner_next_match_id: null,
      loser_next_match_id: null,
      winner_next_slot: null,
      loser_next_slot: null,
      created_at: '',
      ...over,
    });

    const grid = groupMatchesByBracketAndRound([
      m({ bracket_type: 'winners', round: 1, position: 1 }),
      m({ bracket_type: 'winners', round: 1, position: 0 }),
      m({ bracket_type: 'losers', round: 2, position: 0 }),
      m({ bracket_type: 'grand_finals', round: 2, position: 0 }),
      m({ bracket_type: 'grand_finals', round: 1, position: 0 }),
    ]);

    expect(grid.winners[1].map(x => x.position)).toEqual([0, 1]);
    expect(grid.losers[2]).toHaveLength(1);
    expect(grid.grandFinals.map(x => x.round)).toEqual([1, 2]);
  });
});

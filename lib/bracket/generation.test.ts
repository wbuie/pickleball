import { describe, it, expect } from 'vitest';
import { FakeSupabase } from './fakeSupabase';
import { generateSingleEliminationBracket } from './singleElimination';
import { recordMatchResult } from './scoring';
import type { SupabaseClient } from '@supabase/supabase-js';

function newDb() {
  return new FakeSupabase({ tournaments: [{ id: 'T', status: 'registration' }], matches: [] });
}

const fourPlayers = [
  { id: 'A', seed: 1 },
  { id: 'B', seed: 2 },
  { id: 'C', seed: 3 },
  { id: 'D', seed: 4 },
];

describe('single elimination generation', () => {
  it('creates 2^k - 1 matches and marks byes for a non-power-of-two field', async () => {
    const db = newDb();
    const players = [1, 2, 3, 4, 5].map(s => ({ id: `p${s}`, seed: s }));
    await generateSingleEliminationBracket(db as unknown as SupabaseClient, 'T', players);

    const matches = db.tables.matches;
    expect(matches).toHaveLength(7); // 4 + 2 + 1 for an 8-draw
    expect(matches.filter(m => m.round === 1)).toHaveLength(4);
    // 8 - 5 = 3 first-round byes; these auto-complete with their lone player.
    const r1Byes = matches.filter(m => m.round === 1 && m.status === 'completed');
    expect(r1Byes).toHaveLength(3);
    expect(r1Byes.every(m => m.winner_id)).toBe(true);
    expect(db.tables.tournaments[0].status).toBe('active');
  });

  it('wires winners into the next round and advances byes', async () => {
    const db = newDb();
    const players = [1, 2, 3, 4, 5].map(s => ({ id: `p${s}`, seed: s }));
    await generateSingleEliminationBracket(db as unknown as SupabaseClient, 'T', players);

    const r1 = db.tables.matches.filter(m => m.round === 1);
    for (const m of r1) {
      expect(m.winner_next_match_id).toBeTruthy();
      expect([1, 2]).toContain(m.winner_next_slot);
    }
    // Top seed (seed 1) got a bye, so they should already sit in a round-2 slot.
    const round2 = db.tables.matches.filter(m => m.round === 2);
    const advanced = round2.some(m => m.player1_id === 'p1' || m.player2_id === 'p1');
    expect(advanced).toBe(true);
  });
});

describe('scoring + advancement', () => {
  async function setup() {
    const db = newDb();
    await generateSingleEliminationBracket(db as unknown as SupabaseClient, 'T', fourPlayers);
    const find = (round: number, position: number) =>
      db.tables.matches.find(m => m.round === round && m.position === position)!;
    return { db, find };
  }

  it('advances the winner into the correct final slot', async () => {
    const { db, find } = await setup();
    const r1m0 = find(1, 0); // A vs D
    const sb = db as unknown as SupabaseClient;

    const aIsP1 = r1m0.player1_id === 'A';
    await recordMatchResult(sb, r1m0.id, aIsP1 ? 11 : 5, aIsP1 ? 5 : 11);

    const final = find(2, 0);
    const slot = r1m0.winner_next_slot === 1 ? final.player1_id : final.player2_id;
    expect(slot).toBe('A');
  });

  it('re-scoring that flips the winner moves the right player forward', async () => {
    const { db, find } = await setup();
    const r1m0 = find(1, 0);
    const sb = db as unknown as SupabaseClient;
    const aIsP1 = r1m0.player1_id === 'A';

    await recordMatchResult(sb, r1m0.id, aIsP1 ? 11 : 5, aIsP1 ? 5 : 11); // A wins
    await recordMatchResult(sb, r1m0.id, aIsP1 ? 5 : 11, aIsP1 ? 11 : 5); // edit: D wins

    const final = find(2, 0);
    const slotField = r1m0.winner_next_slot === 1 ? 'player1_id' : 'player2_id';
    expect(final[slotField]).toBe('D');
    expect(r1m0.winner_id).toBe('D');
  });

  it('refuses to flip a winner once a later match is already played', async () => {
    const { db, find } = await setup();
    const sb = db as unknown as SupabaseClient;
    const r1m0 = find(1, 0);
    const r1m1 = find(1, 1);

    const aP1 = r1m0.player1_id === 'A';
    await recordMatchResult(sb, r1m0.id, aP1 ? 11 : 0, aP1 ? 0 : 11); // A advances
    const bP1 = r1m1.player1_id === 'B';
    await recordMatchResult(sb, r1m1.id, bP1 ? 11 : 0, bP1 ? 0 : 11); // B advances

    const final = find(2, 0);
    const fP1 = final.player1_id === 'A';
    await recordMatchResult(sb, final.id, fP1 ? 11 : 0, fP1 ? 0 : 11); // final played

    await expect(
      recordMatchResult(sb, r1m0.id, aP1 ? 0 : 11, aP1 ? 11 : 0)
    ).rejects.toThrow(/later match/i);
  });

  it('rejects tied and negative scores', async () => {
    const { db, find } = await setup();
    const sb = db as unknown as SupabaseClient;
    const r1m0 = find(1, 0);
    await expect(recordMatchResult(sb, r1m0.id, 11, 11)).rejects.toThrow(/tied/i);
    await expect(recordMatchResult(sb, r1m0.id, -1, 5)).rejects.toThrow(/negative/i);
    await expect(recordMatchResult(sb, r1m0.id, 1.5, 5)).rejects.toThrow(/whole number/i);
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { nextPowerOf2, getSeedOrder } from './utils';

interface Player {
  id: string;
  seed: number;
}

type MatchInsert = {
  tournament_id: string;
  bracket_type: string;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  status: string;
};

// Returns matches per LB round: rounds alternate between "drop-in" and "fight-back"
// LB round 1 = fight-back (WB R1 losers fight each other)
// LB round 2 = drop-in (WB R2 losers join LB R1 survivors)
// LB round 3 = fight-back, etc.
export function getLBMatchCount(lbRound: number, bracketSize: number): number {
  const k = Math.ceil(lbRound / 2);
  return bracketSize / Math.pow(2, k + 1);
}

export function getLBRoundCount(wbRounds: number): number {
  return 2 * (wbRounds - 1);
}

export async function generateDoubleEliminationBracket(
  supabase: SupabaseClient,
  tournamentId: string,
  players: Player[]
): Promise<void> {
  const n = players.length;
  if (n < 4) throw new Error('Double elimination requires at least 4 players');

  const bracketSize = nextPowerOf2(n);
  const wbRounds = Math.log2(bracketSize);
  const lbRounds = getLBRoundCount(wbRounds);
  const seedOrder = getSeedOrder(bracketSize);

  const slotPlayer = (slotIndex: number): string | null => {
    const seed = seedOrder[slotIndex];
    if (seed > n) return null;
    return players.find(p => p.seed === seed)?.id ?? null;
  };

  const stubs: MatchInsert[] = [];

  // === WINNERS BRACKET ===
  for (let round = 1; round <= wbRounds; round++) {
    const matchCount = bracketSize / Math.pow(2, round);
    for (let pos = 0; pos < matchCount; pos++) {
      let p1: string | null = null;
      let p2: string | null = null;
      let status = 'pending';

      if (round === 1) {
        p1 = slotPlayer(pos * 2);
        p2 = slotPlayer(pos * 2 + 1);
        if (p1 === null || p2 === null) status = 'bye';
      }

      stubs.push({ tournament_id: tournamentId, bracket_type: 'winners', round, position: pos, player1_id: p1, player2_id: p2, status });
    }
  }

  // === LOSERS BRACKET ===
  for (let lbRound = 1; lbRound <= lbRounds; lbRound++) {
    const matchCount = getLBMatchCount(lbRound, bracketSize);
    for (let pos = 0; pos < matchCount; pos++) {
      stubs.push({ tournament_id: tournamentId, bracket_type: 'losers', round: lbRound, position: pos, player1_id: null, player2_id: null, status: 'pending' });
    }
  }

  // === GRAND FINALS ===
  // Round 1 = primary GF, Round 2 = reset (conditionally played)
  stubs.push({ tournament_id: tournamentId, bracket_type: 'grand_finals', round: 1, position: 0, player1_id: null, player2_id: null, status: 'pending' });
  stubs.push({ tournament_id: tournamentId, bracket_type: 'grand_finals', round: 2, position: 0, player1_id: null, player2_id: null, status: 'pending' });

  // === INSERT ALL MATCHES ===
  const { data: inserted, error } = await supabase
    .from('matches')
    .insert(stubs)
    .select('id, round, position, bracket_type, player1_id, player2_id, status');

  if (error) throw new Error(`Failed to insert matches: ${error.message}`);
  if (!inserted) throw new Error('No matches returned');

  const wb = (round: number, pos: number) =>
    inserted.find(m => m.bracket_type === 'winners' && m.round === round && m.position === pos)!;
  const lb = (round: number, pos: number) =>
    inserted.find(m => m.bracket_type === 'losers' && m.round === round && m.position === pos)!;
  const gf = (round: number) =>
    inserted.find(m => m.bracket_type === 'grand_finals' && m.round === round)!;

  type MatchUpdate = {
    id: string;
    winner_next_match_id?: string;
    winner_next_slot?: number;
    loser_next_match_id?: string;
    loser_next_slot?: number;
  };

  const updates: MatchUpdate[] = [];

  // === WIRE WB INTERNAL (winner advancement) ===
  for (let round = 1; round < wbRounds; round++) {
    const matchCount = bracketSize / Math.pow(2, round);
    for (let pos = 0; pos < matchCount; pos++) {
      const nextPos = Math.floor(pos / 2);
      const nextSlot = (pos % 2) + 1;
      updates.push({ id: wb(round, pos).id, winner_next_match_id: wb(round + 1, nextPos).id, winner_next_slot: nextSlot });
    }
  }

  // WB Finals winner → GF slot 1 (WB champion)
  updates.push({ id: wb(wbRounds, 0).id, winner_next_match_id: gf(1).id, winner_next_slot: 1 });

  // === WIRE WB LOSER DROPS TO LB ===
  // WB round 1 losers → LB round 1 (fight-back). Adjacent WB matches feed one LB
  // match (0+1 → 0, 2+3 → 1, …). No crossing is needed here: a WB R1 loser and
  // the player who beat them are never both in LB R1, so there's no rematch risk.
  // (Cross-seeding matters for the later drop-in rounds, handled below.)
  const wbR1Count = bracketSize / 2;
  for (let pos = 0; pos < wbR1Count; pos++) {
    const lbPos = Math.floor(pos / 2);
    const lbSlot = (pos % 2) + 1;
    updates.push({ id: wb(1, pos).id, loser_next_match_id: lb(1, lbPos).id, loser_next_slot: lbSlot });
  }

  // WB rounds 2+ losers → LB drop-in rounds (even LB rounds)
  for (let wbRound = 2; wbRound <= wbRounds; wbRound++) {
    const wbMatchCount = bracketSize / Math.pow(2, wbRound);
    const lbDropRound = 2 * (wbRound - 1);

    if (wbRound === wbRounds) {
      // WB Finals loser → last LB drop-in round
      updates.push({ id: wb(wbRounds, 0).id, loser_next_match_id: lb(lbRounds, 0).id, loser_next_slot: 2 });
    } else {
      const lbMatchCount = getLBMatchCount(lbDropRound, bracketSize);
      for (let pos = 0; pos < wbMatchCount; pos++) {
        // Cross seeding: reversed order for drop-ins
        const lbPos = lbMatchCount - 1 - pos;
        updates.push({ id: wb(wbRound, pos).id, loser_next_match_id: lb(lbDropRound, lbPos).id, loser_next_slot: 2 });
      }
    }
  }

  // === WIRE LB INTERNAL ===
  for (let lbRound = 1; lbRound < lbRounds; lbRound++) {
    const matchCount = getLBMatchCount(lbRound, bracketSize);
    const isFightBack = lbRound % 2 === 1;

    for (let pos = 0; pos < matchCount; pos++) {
      if (isFightBack) {
        // Fight-back → drop-in: the next (drop-in) round has the same match
        // count, so the survivor stays in the same position and takes slot 1.
        // Slot 2 of that match is reserved for the dropping WB loser.
        updates.push({ id: lb(lbRound, pos).id, winner_next_match_id: lb(lbRound + 1, pos).id, winner_next_slot: 1 });
      } else {
        // Drop-in → fight-back: the next (fight-back) round has half as many
        // matches, so adjacent survivors are paired into one match.
        const nextPos = Math.floor(pos / 2);
        const nextSlot = (pos % 2) + 1;
        updates.push({ id: lb(lbRound, pos).id, winner_next_match_id: lb(lbRound + 1, nextPos).id, winner_next_slot: nextSlot });
      }
    }
  }

  // LB Finals winner → GF slot 2 (LB champion)
  updates.push({ id: lb(lbRounds, 0).id, winner_next_match_id: gf(1).id, winner_next_slot: 2 });

  // GF round 1 winner/loser routing
  // If WB champ wins → tournament over (no reset)
  // If LB champ wins → reset match (GF round 2)
  // We set winner_next_match_id on GF1 to GF2 for the case LB champ wins (handled in scoring)
  updates.push({ id: gf(1).id, winner_next_match_id: gf(2).id, winner_next_slot: 1, loser_next_match_id: gf(2).id, loser_next_slot: 2 });

  // === COLLAPSE LOSER-BRACKET BYES ===
  // A WB round-1 bye produces a winner but no loser, so the LB slot that loser
  // would have dropped into never fills. Left alone, the LB match it feeds would
  // be stuck forever waiting for a second player. We resolve this statically:
  //  - If both incoming slots of an LB match are dead, the match is a bye and
  //    its own winner slot downstream becomes dead too (cascade).
  //  - If only one slot is dead, the match is a pass-through: we rewire the live
  //    feeder to skip it and point straight at this match's downstream target,
  //    then mark the skipped match as a bye. This collapses the empty matches
  //    out of the live bracket so scoring never sees a half-filled LB match.
  const deadSlots = new Set<string>();
  const byeMatchIds = new Set<string>();

  type Feeder = { update: MatchUpdate; edge: 'winner' | 'loser' };
  const findFeeder = (matchId: string, slot: number): Feeder | null => {
    for (const u of updates) {
      if (u.loser_next_match_id === matchId && u.loser_next_slot === slot) return { update: u, edge: 'loser' };
      if (u.winner_next_match_id === matchId && u.winner_next_slot === slot) return { update: u, edge: 'winner' };
    }
    return null;
  };

  // Seed: each WB round-1 bye kills the LB slot its absent loser would fill.
  for (const m of inserted) {
    if (m.bracket_type === 'winners' && m.round === 1 && m.status === 'bye') {
      const drop = updates.find(u => u.id === m.id && u.loser_next_match_id);
      if (drop?.loser_next_match_id) deadSlots.add(`${drop.loser_next_match_id}:${drop.loser_next_slot}`);
    }
  }

  // Walk LB rounds in order so a match's feeders are settled before it's processed.
  for (let lbRound = 1; lbRound <= lbRounds; lbRound++) {
    const matchCount = getLBMatchCount(lbRound, bracketSize);
    for (let pos = 0; pos < matchCount; pos++) {
      const m = lb(lbRound, pos);
      const s1Dead = deadSlots.has(`${m.id}:1`);
      const s2Dead = deadSlots.has(`${m.id}:2`);
      if (!s1Dead && !s2Dead) continue;

      byeMatchIds.add(m.id);
      const wn = updates.find(u => u.id === m.id && u.winner_next_match_id);

      if (s1Dead && s2Dead) {
        // No one can ever come out of here — kill the downstream slot too.
        if (wn?.winner_next_match_id) deadSlots.add(`${wn.winner_next_match_id}:${wn.winner_next_slot}`);
      } else if (wn?.winner_next_match_id) {
        // Pass-through: route the live feeder straight to our downstream target.
        const liveSlot = s1Dead ? 2 : 1;
        const feeder = findFeeder(m.id, liveSlot);
        if (feeder) {
          if (feeder.edge === 'loser') {
            feeder.update.loser_next_match_id = wn.winner_next_match_id;
            feeder.update.loser_next_slot = wn.winner_next_slot;
          } else {
            feeder.update.winner_next_match_id = wn.winner_next_match_id;
            feeder.update.winner_next_slot = wn.winner_next_slot;
          }
        }
      }
    }
  }

  // === APPLY UPDATES ===
  for (const update of updates) {
    const { id, ...fields } = update;
    await supabase.from('matches').update(fields).eq('id', id);
  }

  // Mark the collapsed LB matches as byes so they render as such and never
  // sit waiting for players that will never arrive.
  for (const id of byeMatchIds) {
    await supabase.from('matches').update({ status: 'bye' }).eq('id', id);
  }

  // === HANDLE WB BYE ADVANCEMENT ===
  const byeMatches = inserted.filter(m => m.bracket_type === 'winners' && m.status === 'bye');
  for (const byeMatch of byeMatches) {
    const winnerId = byeMatch.player1_id || byeMatch.player2_id;
    if (!winnerId) continue;

    await supabase
      .from('matches')
      .update({ winner_id: winnerId, status: 'completed' })
      .eq('id', byeMatch.id);

    const nextInfo = updates.find(u => u.id === byeMatch.id && u.winner_next_match_id);
    if (nextInfo?.winner_next_match_id) {
      const field = nextInfo.winner_next_slot === 1 ? 'player1_id' : 'player2_id';
      await supabase
        .from('matches')
        .update({ [field]: winnerId })
        .eq('id', nextInfo.winner_next_match_id);
    }
  }

  // Update tournament to active
  await supabase
    .from('tournaments')
    .update({ status: 'active' })
    .eq('id', tournamentId);
}

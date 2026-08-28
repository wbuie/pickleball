// Turning a registration export into doubles teams.
//
// Sign-up forms ask "who is your teammate?" as free text, so the answers are
// messy: nicknames ("Jess Mann" for Jesse Mann), both names of the pair
// ("Lucie & Duncan Rein"), or a note ("Iris Gibson if not her than random").
// This module resolves those answers against the imported roster and pairs
// everyone else, so an organizer only has to review the leftovers.

import { normalizeName, type ParsedPlayer } from './csv';

export type PairReason = 'mutual' | 'requested' | 'registration' | 'random';

export interface PairedTeam {
  players: [ParsedPlayer, ParsedPlayer];
  reason: PairReason;
}

export interface PairingResult {
  teams: PairedTeam[];
  // Players left without a partner (an odd head count).
  unpaired: ParsedPlayer[];
  // Things an organizer should eyeball before committing the import.
  warnings: string[];
}

// Common given-name equivalences. Anything not listed still matches by prefix
// (Jess → Jesse), so this only needs the cases prefixes miss.
const NICKNAME_GROUPS: string[][] = [
  ['alex', 'alexander', 'alexandra', 'alexis'],
  ['bill', 'billy', 'will', 'willie', 'william'],
  ['bob', 'bobby', 'rob', 'robby', 'robbie', 'robert'],
  ['cathy', 'kathy', 'catherine', 'katherine', 'kate', 'katie'],
  ['chris', 'christopher', 'christian', 'christina', 'christine'],
  ['dan', 'danny', 'daniel'],
  ['dave', 'david'],
  ['dick', 'rick', 'ricky', 'richard'],
  ['ed', 'eddie', 'edward'],
  ['gus', 'august', 'augustine'],
  ['hank', 'henry'],
  ['jack', 'jackson', 'john', 'johnny', 'jonathan', 'jon'],
  ['jim', 'jimmy', 'james'],
  ['joe', 'joey', 'joseph'],
  ['ken', 'kenny', 'kenneth'],
  ['liz', 'beth', 'betsy', 'elizabeth'],
  ['maggie', 'meg', 'margaret'],
  ['mike', 'mikey', 'michael'],
  ['nate', 'nathan', 'nathaniel'],
  ['nick', 'nicholas'],
  ['peggy', 'peg', 'margaret'],
  ['pete', 'peter'],
  ['sam', 'sammy', 'samuel', 'samantha'],
  ['steve', 'stephen', 'steven'],
  ['ted', 'teddy', 'theodore', 'edward'],
  ['tom', 'tommy', 'thomas'],
  ['tony', 'anthony'],
  ['zach', 'zack', 'zachary'],
];

const NICKNAME_LOOKUP = new Map<string, Set<number>>();
NICKNAME_GROUPS.forEach((group, i) => {
  group.forEach(n => {
    const groups = NICKNAME_LOOKUP.get(n) ?? new Set<number>();
    groups.add(i);
    NICKNAME_LOOKUP.set(n, groups);
  });
});

function sameNickname(a: string, b: string): boolean {
  const ga = NICKNAME_LOOKUP.get(a);
  const gb = NICKNAME_LOOKUP.get(b);
  if (!ga || !gb) return false;
  return [...ga].some(g => gb.has(g));
}

// How strongly a typed token matches a given name. Exact beats a nickname or a
// shortened form, which is why the scores differ.
function firstNameScore(token: string, first: string): number {
  if (token === first) return 2;
  if (sameNickname(token, first)) return 1.5;
  const short = token.length < first.length ? token : first;
  const long = token.length < first.length ? first : token;
  if (short.length >= 3 && long.startsWith(short)) return 1.5;
  return 0;
}

function nameParts(player: ParsedPlayer): { first: string; last: string } {
  const parts = normalizeName(player.display_name).split(' ').filter(Boolean);
  return { first: parts[0] ?? '', last: parts[parts.length - 1] ?? '' };
}

// Score a roster player against the words someone typed. Matching the surname
// and the given name (2 + 2) is a confident hit; one of the two is only
// accepted when nobody else comes close.
function scoreCandidate(tokens: Set<string>, candidate: ParsedPlayer): number {
  const { first, last } = nameParts(candidate);
  let score = 0;
  if (last && tokens.has(last)) score += 2;
  if (first) {
    let best = 0;
    for (const token of tokens) best = Math.max(best, firstNameScore(token, first));
    score += best;
  }
  return score;
}

export interface PartnerMatch {
  player: ParsedPlayer | null;
  // Why the text couldn't be resolved, for the organizer's review list.
  // Absent when there is nothing to report (e.g. they typed their own name).
  note?: string;
}

// Resolve one free-text teammate answer against the roster.
export function resolvePartner(
  hint: string,
  self: ParsedPlayer,
  roster: ParsedPlayer[]
): PartnerMatch {
  const tokens = new Set(normalizeName(hint).split(' ').filter(Boolean));
  if (tokens.size === 0) return { player: null };

  const scored = roster
    .filter(p => p !== self)
    .map(p => ({ player: p, score: scoreCandidate(tokens, p) }))
    .filter(s => s.score >= 2)
    .sort((a, b) => b.score - a.score);

  // Plenty of people answer with their own name, or with both names of the
  // pair. Only treat it as self-reference when nobody else fits better —
  // "Lucie & Duncan Rein" still has to find Duncan.
  const selfScore = scoreCandidate(tokens, self);
  if (selfScore >= 3.5 && selfScore > (scored[0]?.score ?? 0)) {
    return { player: null };
  }

  if (scored.length === 0) {
    return { player: null, note: 'no one in the file matches that name' };
  }

  const best = scored[0];
  const runnerUp = scored[1];

  // A surname-only (or given-name-only) hit is fine when it's the only one.
  if (best.score < 3.5 && runnerUp) {
    return {
      player: null,
      note: `it could be ${scored.slice(0, 3).map(s => s.player.display_name).join(' or ')}`,
    };
  }
  if (runnerUp && runnerUp.score === best.score) {
    return {
      player: null,
      note: `it could be ${scored
        .filter(s => s.score === best.score)
        .map(s => s.player.display_name)
        .join(' or ')}`,
    };
  }

  return { player: best.player };
}

// Build doubles teams from an imported roster.
//
// Priority: teammates who named each other, then one-sided requests, then
// people who were signed up in the same registration, then a skill-balanced
// shuffle for whoever is left (strongest with weakest, so the random teams
// come out roughly even).
export function pairPlayers(players: ParsedPlayer[]): PairingResult {
  const warnings: string[] = [];
  const teams: PairedTeam[] = [];
  const teammate = new Map<ParsedPlayer, ParsedPlayer>();

  const pair = (a: ParsedPlayer, b: ParsedPlayer, reason: PairReason) => {
    teammate.set(a, b);
    teammate.set(b, a);
    teams.push({ players: [a, b], reason });
  };

  // 1. Resolve what everyone typed. Anything that doesn't resolve is reported
  //    at the end, once we can say who they ended up with instead.
  const requested = new Map<ParsedPlayer, ParsedPlayer>();
  const unresolved: { player: ParsedPlayer; note: string }[] = [];
  for (const p of players) {
    if (!p.partner_hint) continue;
    const { player, note } = resolvePartner(p.partner_hint, p, players);
    if (player) requested.set(p, player);
    else if (note) unresolved.push({ player: p, note });
  }

  // 2. Pairs who named each other are the surest thing in the file.
  for (const p of players) {
    const q = requested.get(p);
    if (!q || teammate.has(p) || teammate.has(q)) continue;
    if (requested.get(q) === p) pair(p, q, 'mutual');
  }

  // 3. One-sided requests: the named partner didn't fill the question in (or
  //    named someone else entirely).
  for (const p of players) {
    const q = requested.get(p);
    if (!q || teammate.has(p) || teammate.has(q)) continue;
    pair(p, q, 'requested');
  }

  // 4. Signed up in the same submission and still unattached — almost always a
  //    couple or a parent registering both halves of the team.
  const groups = new Map<string, ParsedPlayer[]>();
  for (const p of players) {
    if (!p.group_id) continue;
    groups.set(p.group_id, [...(groups.get(p.group_id) ?? []), p]);
  }
  for (const [groupId, members] of groups) {
    const free = members.filter(m => !teammate.has(m));
    if (free.length === 2) {
      pair(free[0], free[1], 'registration');
    } else if (free.length > 2) {
      warnings.push(
        `Registration ${groupId} has ${free.length} people without a named teammate ` +
          `(${free.map(m => m.display_name).join(', ')}) — pair them by hand.`
      );
    }
  }

  // 5. Balanced random pairing for the rest.
  const pool = players
    .filter(p => !teammate.has(p))
    .sort((a, b) => b.skill_level - a.skill_level || a.display_name.localeCompare(b.display_name));

  let lo = 0;
  let hi = pool.length - 1;
  while (lo < hi) {
    pair(pool[lo], pool[hi], 'random');
    lo++;
    hi--;
  }

  // 6. Report every request we couldn't honour, now that the teams are final.
  const landedWith = (p: ParsedPlayer) => {
    const mate = teammate.get(p);
    return mate ? `paired with ${mate.display_name} instead` : 'left without a partner';
  };

  for (const { player: p, note } of unresolved) {
    warnings.push(
      `${p.display_name} listed “${p.partner_hint}” as a teammate — ${note}; ${landedWith(p)}.`
    );
  }

  for (const [p, q] of requested) {
    if (teammate.get(p) === q) continue;
    const qMate = teammate.get(q);
    warnings.push(
      qMate
        ? `${p.display_name} asked for ${q.display_name}, who is teamed with ${qMate.display_name}; ${landedWith(p)}.`
        : `${p.display_name} asked for ${q.display_name} but was already teamed up; ${landedWith(p)}.`
    );
  }

  const unpaired = players.filter(p => !teammate.has(p));
  for (const p of unpaired) {
    warnings.push(`${p.display_name} has no partner — the head count is odd.`);
  }

  return { teams, unpaired, warnings };
}

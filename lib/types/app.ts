export type SkillLevel = 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0;
export type TournamentFormat = 'single_elimination' | 'double_elimination';
export type Sport = 'pickleball' | 'basketball';
// An event describes how many players make up one entry. Pickleball runs
// singles/doubles; basketball runs fixed-size teams (3v3, 4v4, 5v5). More
// sports/events can be added by extending Sport, EventType, and the tables below.
export type EventType = 'singles' | 'doubles' | '3v3' | '4v4' | '5v5';
export type TournamentStatus = 'registration' | 'seeding' | 'active' | 'completed';
export type MatchStatus = 'pending' | 'bye' | 'in_progress' | 'completed';
export type BracketType = 'winners' | 'losers' | 'grand_finals';

export interface Profile {
  id: string;
  display_name: string;
  skill_level: number | null;
  basketball_skill_level: number | null;
  is_admin: boolean;
  is_managed: boolean;
  email: string | null;
  created_at: string;
}

export interface AppSettings {
  id: number;
  require_email: boolean;
  updated_at: string;
}

// An email on the admin allowlist. Grants admin to a matching profile now (and
// on signup for emails that haven't registered yet).
export interface AdminEmail {
  email: string;
  added_by: string | null;
  created_at: string;
}

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  sport: Sport;
  format: TournamentFormat;
  event_type: EventType;
  status: TournamentStatus;
  max_players: number;
  // How many courts the event runs on. Playable matches are handed a court
  // number from 1..court_count so players know where to go.
  court_count: number;
  // Rules & regulations for this event, as free text the organizer types in.
  // NULL/empty means nothing has been posted yet.
  rules: string | null;
  start_date: string | null;
  location: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// A team-roster member beyond the captain. Used for basketball entries
// (3v3/4v4/5v5); the captain is the registration's player_id, everyone else
// is a row here.
export interface RegistrationMember {
  id: string;
  registration_id: string;
  player_id: string;
  created_at: string;
  profiles?: Profile | null;
}

export interface TournamentRegistration {
  id: string;
  tournament_id: string;
  player_id: string;
  partner_id: string | null;
  team_name: string | null;
  seed: number | null;
  registered_at: string;
  profiles?: Profile;
  partner?: Profile | null;
  members?: RegistrationMember[];
}

// A bracket "slot" — the entity that plays a match. In singles this is one
// person; in doubles it's a two-person team. Identified by the registration id.
export interface BracketEntry {
  id: string;
  display_name: string;
}

export interface Match {
  id: string;
  tournament_id: string;
  bracket_type: BracketType;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  player1_score: number | null;
  player2_score: number | null;
  winner_id: string | null;
  loser_id: string | null;
  status: MatchStatus;
  winner_next_match_id: string | null;
  loser_next_match_id: string | null;
  winner_next_slot: 1 | 2 | null;
  loser_next_slot: 1 | 2 | null;
  // Court this match is played on (1..tournament.court_count), or null while
  // it's still waiting for a court to free up.
  court: number | null;
  created_at: string;
  player1?: BracketEntry;
  player2?: BracketEntry;
  winner?: BracketEntry;
}

export interface TournamentWithCounts extends Tournament {
  registered_count: number;
  creator?: Profile;
}

export interface BracketGrid {
  winners: Record<number, Match[]>;
  losers: Record<number, Match[]>;
  grandFinals: Match[];
}

export const SKILL_LEVELS: { value: string; label: string }[] = [
  { value: '2.0', label: '2.0 - Beginner' },
  { value: '2.5', label: '2.5 - Beginner+' },
  { value: '3.0', label: '3.0 - Intermediate' },
  { value: '3.5', label: '3.5 - Intermediate+' },
  { value: '4.0', label: '4.0 - Advanced' },
  { value: '4.5', label: '4.5 - Advanced+' },
  { value: '5.0', label: '5.0 - Pro' },
];

// Plain-language self-assessment for players who don't know their DUPR rating.
// Each option maps to an approximate DUPR value used for seeding.
export const SKILL_DESCRIPTIONS: {
  value: string;
  title: string;
  description: string;
}[] = [
  {
    value: '2.0',
    title: 'Brand new',
    description: "I've barely played — still learning how the game works.",
  },
  {
    value: '2.5',
    title: 'Beginner',
    description: 'I know the basic rules and can keep a short rally going.',
  },
  {
    value: '3.0',
    title: 'Recreational',
    description: 'I play casually for fun and can sustain a rally.',
  },
  {
    value: '3.5',
    title: 'Intermediate',
    description: 'Consistent serves and returns, and I understand basic strategy.',
  },
  {
    value: '4.0',
    title: 'Advanced',
    description: 'I play competitively with strong shots, placement, and positioning.',
  },
  {
    value: '4.5',
    title: 'Highly competitive',
    description: 'Tournament-level player with a complete, refined game.',
  },
  {
    value: '5.0',
    title: 'Pro',
    description: 'Elite, professional-level play — mastery of every shot and strategy.',
  },
];

// Basketball rating tiers. Unlike pickleball's DUPR (2.0–5.0), basketball uses
// a 1–5 tier scale (Beginner → Elite); the numeric value drives seeding.
export const BASKETBALL_SKILL_LEVELS: { value: string; label: string }[] = [
  { value: '1', label: 'Beginner' },
  { value: '2', label: 'Recreational' },
  { value: '3', label: 'Intermediate' },
  { value: '4', label: 'Competitive' },
  { value: '5', label: 'Elite' },
];

export const BASKETBALL_SKILL_DESCRIPTIONS: {
  value: string;
  title: string;
  description: string;
}[] = [
  { value: '1', title: 'Beginner', description: 'New to organized play — still learning the game.' },
  { value: '2', title: 'Recreational', description: 'Play casually for fun; comfortable in a pickup game.' },
  { value: '3', title: 'Intermediate', description: 'Solid fundamentals and understand team play.' },
  { value: '4', title: 'Competitive', description: 'Play in leagues with strong skills and IQ.' },
  { value: '5', title: 'Elite', description: 'Top-tier, highly competitive player.' },
];

// The tier label nearest a stored/averaged basketball rating (for display).
export function basketballTierLabel(level: number | null): string {
  if (level === null || Number.isNaN(level)) return 'Unrated';
  const rounded = Math.min(5, Math.max(1, Math.round(level)));
  return BASKETBALL_SKILL_LEVELS[rounded - 1]?.label ?? String(level);
}

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  registration: 'Registration Open',
  seeding: 'Seeding',
  active: 'In Progress',
  completed: 'Completed',
};

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elimination: 'Single Elimination',
  double_elimination: 'Double Elimination',
};

export const SPORT_LABELS: Record<Sport, string> = {
  pickleball: 'Pickleball',
  basketball: 'Basketball',
};

export const EVENT_LABELS: Record<EventType, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  '3v3': '3v3',
  '4v4': '4v4',
  '5v5': '5v5',
};

// Which events belong to each sport. Drives the create/edit form and validation.
export const SPORT_EVENT_TYPES: Record<Sport, EventType[]> = {
  pickleball: ['singles', 'doubles'],
  basketball: ['3v3', '4v4', '5v5'],
};

// How many players make up one entry for a given event.
export const TEAM_SIZE: Record<EventType, number> = {
  singles: 1,
  doubles: 2,
  '3v3': 3,
  '4v4': 4,
  '5v5': 5,
};

// Courts an organizer can pick from when setting up a tournament.
export const MIN_COURTS = 1;
export const MAX_COURTS = 32;

// Starter rules an organizer can load into the tournament form and then edit.
// These are the common house rules for each sport — they're a first draft, not
// a fixed policy, and whatever the organizer saves is what players see.
export const RULES_TEMPLATES: Record<Sport, string> = {
  pickleball: `Scoring
- Each match is a single game to 11 points, win by 2.
- Only the serving side scores (traditional side-out scoring).
- Call the score out loud before every serve: server's score, receiver's score, and server number in doubles.

Serving
- Serve underhand, contacting the ball below waist level, with both feet behind the baseline.
- The serve goes crosscourt and must clear the non-volley zone (the kitchen) and its line.
- One serve attempt per rally. A serve that clips the net and lands in is live — play it out.

The kitchen (non-volley zone)
- You may not volley the ball while any part of you is touching the kitchen or its line.
- Momentum counts: volleying and then falling into the kitchen is a fault.
- You may stand in the kitchen any time the ball has bounced.

Two-bounce rule
- The serve must bounce, and the return must bounce, before either side may volley.

Line calls
- Players call the lines on their own side, and the benefit of the doubt goes to the opponent.
- If your team can't agree on a call, replay the rally.
- Anything that can't be settled on court goes to the tournament director, whose decision is final.

Match play
- Be at your court and ready when your match is called; a team not ready five minutes after the call forfeits.
- Report the final score to an organizer as soon as the match ends — the bracket updates automatically once it's entered.
- Warm up for no more than five minutes before a match so the courts keep moving.

Conduct
- Play hard, keep it friendly, and treat opponents, partners, and volunteers with respect.
- Foul language, arguing calls, and throwing paddles are grounds for removal from the tournament.`,
  basketball: `Scoring
- Baskets inside the arc count 1 point; baskets behind the arc count 2.
- Games run to 21 points, win by 2, with a 15-minute cap — whoever leads when time expires wins.
- If the score is tied when time expires, the next basket wins.

Possession
- Check the ball at the top of the key to start play and after every dead ball.
- The ball must clear the arc on every change of possession.
- After a made basket the ball goes to the other team — no make-it-take-it.

Fouls
- Players call their own fouls; the fouled team takes the ball out at the top of the key.
- A foul on a shot inside the arc is one free throw, behind the arc is two.
- After a team's fifth foul, every following foul goes to the free-throw line.

Match play
- Be at your court and ready when your game is called; a team not ready five minutes after the call forfeits.
- Report the final score to an organizer as soon as the game ends — the bracket updates automatically once it's entered.
- Only rostered players may play; substitutions happen on dead balls.

Conduct
- Play hard, keep it friendly, and treat opponents, teammates, and volunteers with respect.
- Foul language, arguing calls, and rough play are grounds for removal from the tournament.`,
};


export function isSport(value: unknown): value is Sport {
  return value === 'pickleball' || value === 'basketball';
}

// True for events whose entries are named, multi-player teams managed through a
// roster (basketball). Distinguished from doubles, which pairs two players via
// partner_id rather than a named roster.
export function isRosterEvent(eventType: EventType): boolean {
  return eventType === '3v3' || eventType === '4v4' || eventType === '5v5';
}

// The noun for an entry in this event, e.g. "Players" (singles) or "Teams".
export function entryNoun(eventType: EventType, plural = true): string {
  const team = eventType !== 'singles';
  const word = team ? 'Team' : 'Player';
  return plural ? `${word}s` : word;
}

// True when an event's entries pair/group multiple players (doubles or roster).
export function isTeamEvent(eventType: EventType): boolean {
  return eventType !== 'singles';
}

// The subset of a registration these helpers read. Kept loose (all fields
// optional) so callers can pass partial rows without the full shape.
export type EntryLike = {
  profiles?: Profile | null;
  partner?: Profile | null;
  team_name?: string | null;
  members?: Pick<RegistrationMember, 'profiles'>[] | null;
};

// Display name for an entry: a named team wins if set (basketball); otherwise
// the captain alone (singles) or both partners joined with a slash (doubles).
export function entryName(reg: EntryLike): string {
  if (reg.team_name && reg.team_name.trim()) return reg.team_name.trim();
  const captain = reg.profiles?.display_name ?? 'Unknown';
  const partner = reg.partner?.display_name;
  return partner ? `${captain} / ${partner}` : captain;
}

// Every player on an entry's roster: the captain, then a doubles partner or any
// basketball roster members.
export function entryPlayers(reg: EntryLike): Profile[] {
  const players: Profile[] = [];
  if (reg.profiles) players.push(reg.profiles);
  if (reg.partner) players.push(reg.partner);
  (reg.members ?? []).forEach(m => {
    if (m.profiles) players.push(m.profiles);
  });
  return players;
}

// Seeding value for an entry: the average rating across everyone on the roster,
// otherwise the individual's. Basketball reads each player's basketball rating;
// every other sport reads the pickleball (DUPR) skill. Missing ratings fall back
// to 3.0 (the mid-scale default for both).
export function entrySkill(reg: EntryLike, sport: Sport = 'pickleball'): number {
  const ratingOf = (p: Pick<Profile, 'skill_level' | 'basketball_skill_level'> | null | undefined) =>
    (sport === 'basketball' ? p?.basketball_skill_level : p?.skill_level) ?? 3.0;

  const ratings: number[] = [ratingOf(reg.profiles)];
  if (reg.partner) ratings.push(ratingOf(reg.partner));
  (reg.members ?? []).forEach(m => ratings.push(ratingOf(m.profiles)));
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

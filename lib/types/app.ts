export type SkillLevel = 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0;
export type TournamentFormat = 'single_elimination' | 'double_elimination';
export type EventType = 'singles' | 'doubles';
export type TournamentStatus = 'registration' | 'seeding' | 'active' | 'completed';
export type MatchStatus = 'pending' | 'bye' | 'in_progress' | 'completed';
export type BracketType = 'winners' | 'losers' | 'grand_finals';

export interface Profile {
  id: string;
  display_name: string;
  skill_level: number | null;
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

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  format: TournamentFormat;
  event_type: EventType;
  status: TournamentStatus;
  max_players: number;
  start_date: string | null;
  location: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TournamentRegistration {
  id: string;
  tournament_id: string;
  player_id: string;
  partner_id: string | null;
  seed: number | null;
  registered_at: string;
  profiles?: Profile;
  partner?: Profile | null;
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

export const EVENT_LABELS: Record<EventType, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
};

// Display name for an entry: the captain alone (singles), or both partners
// joined with a slash (doubles).
export function entryName(reg: Pick<TournamentRegistration, 'profiles' | 'partner'>): string {
  const captain = reg.profiles?.display_name ?? 'Unknown';
  const partner = reg.partner?.display_name;
  return partner ? `${captain} / ${partner}` : captain;
}

// Seeding value for an entry: the team's average skill in doubles, otherwise the
// individual's. Missing ratings fall back to 3.0 (the default skill level).
export function entrySkill(reg: Pick<TournamentRegistration, 'profiles' | 'partner'>): number {
  const a = reg.profiles?.skill_level ?? 3.0;
  if (reg.partner) {
    const b = reg.partner.skill_level ?? 3.0;
    return (a + b) / 2;
  }
  return a;
}

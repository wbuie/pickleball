'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkillBadge, BasketballBadge } from '@/components/ui/Badge';
import type { Profile, Tournament, TournamentRegistration } from '@/lib/types/app';
import {
  FORMAT_LABELS,
  STATUS_LABELS,
  EVENT_LABELS,
  SPORT_LABELS,
  entryName,
  entrySkill,
  entryNoun as entryNounFor,
  isRosterEvent,
  TEAM_SIZE,
  MIN_COURTS,
  MAX_COURTS,
} from '@/lib/types/app';

interface MemberOption {
  id: string;
  display_name: string;
  skill_level: number | null;
  is_admin: boolean;
  is_managed: boolean;
}

interface AdminPanelProps {
  tournament: Tournament;
  registrations: TournamentRegistration[];
  members: MemberOption[];
}

export default function AdminPanel({ tournament, registrations, members }: AdminPanelProps) {
  const router = useRouter();
  const id = tournament.id;
  const isDoubles = tournament.event_type === 'doubles';
  const isRoster = isRosterEvent(tournament.event_type);
  const teamSize = TEAM_SIZE[tournament.event_type];
  const entryNoun = entryNounFor(tournament.event_type);
  const sport = tournament.sport;

  const [generating, setGenerating] = useState(false);
  const [randomizing, setRandomizing] = useState(false);
  // The entry list the panel renders. It starts as the server's copy, but every
  // change lands here first so a click shows its result straight away instead of
  // a server round-trip later; the refresh that follows reconciles the two.
  const [rows, setRows] = useState(registrations);
  // The last list the server sent, kept only to notice when a new one arrives.
  const [serverRows, setServerRows] = useState(registrations);
  // Entries with a request in flight, keyed by registration id.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [, startRefresh] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingPartner, setPendingPartner] = useState<Record<string, string>>({});
  const [pendingMember, setPendingMember] = useState<Record<string, string>>({});
  // Seeds and team names the organizer has typed but not saved. They sit over
  // the entry's own values, so an entry that shows up later needs no seeding in.
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [courtDraft, setCourtDraft] = useState(String(tournament.court_count ?? 1));
  const [savingCourts, setSavingCourts] = useState(false);
  const [savingScoring, setSavingScoring] = useState(false);
  const [playerToAdd, setPlayerToAdd] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [seeds, setSeeds] = useState<Record<string, number>>({});

  // Whatever the server sends wins: a refresh after a change, an import, or
  // another organizer's edit. Taking it during render rather than in an effect
  // means the list never flashes the old data back on the way through.
  if (serverRows !== registrations) {
    setServerRows(registrations);
    setRows(registrations);
  }

  const isBracketGenerated = tournament.status === 'active' || tournament.status === 'completed';
  const unpairedCount = isDoubles ? rows.filter(r => !r.partner_id).length : 0;
  const unnamedCount = isRoster ? rows.filter(r => !r.team_name || !r.team_name.trim()).length : 0;
  const incompleteCount = unpairedCount + unnamedCount;

  // Everyone currently in this tournament (captains + partners).
  const enrolled = new Set<string>();
  rows.forEach(r => {
    enrolled.add(r.player_id);
    if (r.partner_id) enrolled.add(r.partner_id);
  });
  const availableProfiles = members.filter(m => !m.is_admin && !enrolled.has(m.id));

  // Players who are locked onto a complete team (captain-with-partner or partner)
  // and so can't be offered as a partner for someone else.
  const pairedPlayers = new Set<string>();
  rows.forEach(r => {
    if (r.partner_id) {
      pairedPlayers.add(r.player_id);
      pairedPlayers.add(r.partner_id);
    }
  });
  // The seed shown for an entry: what the organizer typed, else what is saved,
  // else its place in the list — so an entry added just now is seeded too.
  const seedOf = (reg: TournamentRegistration, index: number) => seeds[reg.id] ?? reg.seed ?? index + 1;
  const entriesBySeed = rows
    .map((reg, index) => ({ reg, seed: seedOf(reg, index) }))
    .sort((a, b) => a.seed - b.seed);

  // Everyone still available to partner this entry, closest rating first, so
  // pairing by hand is a matter of taking the name at the top.
  const candidatesFor = (reg: TournamentRegistration) => {
    const target = entrySkill(reg, sport);
    return members
      .filter(m => m.id !== reg.player_id && !pairedPlayers.has(m.id))
      .map(m => ({ ...m, rating: m.skill_level ?? 3.0 }))
      .sort(
        (a, b) =>
          Math.abs(a.rating - target) - Math.abs(b.rating - target) ||
          a.display_name.localeCompare(b.display_name)
      );
  };

  const handleAddPlayer = async () => {
    if (!playerToAdd) return;
    if (isRoster && !newTeamName.trim()) {
      setError('Give the new team a name');
      return;
    }
    setAddingPlayer(true);
    setError('');
    setSuccess('');
    const res = await fetch(`/api/tournaments/${id}/register-player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id: playerToAdd,
        ...(isRoster ? { team_name: newTeamName.trim() } : {}),
      }),
    });
    if (res.ok) {
      setSuccess(
        isRoster
          ? 'Team created — add players to its roster below.'
          : isDoubles
          ? 'Player added — pair them into a team below.'
          : 'Player added!'
      );
      setPlayerToAdd('');
      setNewTeamName('');
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to add player');
    }
    setAddingPlayer(false);
  };

  // Change one entry: show the result immediately, then let the server confirm
  // it. A call that fails puts the old list back and says why.
  const mutateEntry = async (
    registrationId: string,
    optimistic: (list: TournamentRegistration[]) => TournamentRegistration[],
    request: () => Promise<Response>,
    fallbackError: string
  ) => {
    const previous = rows;
    setError('');
    setSuccess('');
    setBusy(b => ({ ...b, [registrationId]: true }));
    setRows(optimistic);
    try {
      const res = await request();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRows(previous);
        setError(data.error || fallbackError);
        return;
      }
      // Pull the server's own copy back in — it may have folded an entry into a
      // team or handed a solo entry back to a freed-up partner.
      startRefresh(() => router.refresh());
    } catch {
      setRows(previous);
      setError(fallbackError);
    } finally {
      setBusy(b => {
        const next = { ...b };
        delete next[registrationId];
        return next;
      });
    }
  };

  const post = (path: string, method: string, body: Record<string, string | null>) => () =>
    fetch(`/api/tournaments/${id}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  // The member list is the only thing on hand to fill in a player's row before
  // the server answers; the refresh replaces it with the real profile.
  const asProfile = (m: MemberOption): Profile => ({
    id: m.id,
    display_name: m.display_name,
    skill_level: m.skill_level,
    basketball_skill_level: null,
    is_admin: m.is_admin,
    is_managed: m.is_managed,
    email: null,
    created_at: '',
  });

  const pairEntry = (reg: TournamentRegistration, partnerPlayerId: string) => {
    const partner = members.find(m => m.id === partnerPlayerId);
    setPendingPartner(prev => ({ ...prev, [reg.id]: '' }));
    return mutateEntry(
      reg.id,
      list =>
        list
          // Any solo entry the partner had folds into this team, as it does on
          // the server.
          .filter(r => r.id === reg.id || r.player_id !== partnerPlayerId)
          .map(r =>
            r.id === reg.id
              ? { ...r, partner_id: partnerPlayerId, partner: partner ? asProfile(partner) : null }
              : r
          ),
      post('teams', 'PUT', { action: 'pair', registrationId: reg.id, partnerPlayerId }),
      'Failed to update teams'
    );
  };

  // Split a team back up. Both players stay in the tournament — the partner gets
  // their own solo entry back, which arrives with the refresh.
  const unpairEntry = (reg: TournamentRegistration) =>
    mutateEntry(
      reg.id,
      list => list.map(r => (r.id === reg.id ? { ...r, partner_id: null, partner: null } : r)),
      post('teams', 'PUT', { action: 'unpair', registrationId: reg.id }),
      'Failed to update teams'
    );

  // Drop a whole entry: a singles player, a doubles team, a basketball team.
  const removeEntry = (reg: TournamentRegistration) => {
    if (!confirm(`Remove ${entryName(reg)} from this tournament?`)) return;
    return mutateEntry(
      reg.id,
      list => list.filter(r => r.id !== reg.id),
      post('registrations', 'DELETE', { registrationId: reg.id }),
      'Failed to remove entry'
    );
  };

  // Drop one player out of the tournament. A doubles partner leaves their
  // captain solo; a captain hands the entry (and its seed) to their partner; a
  // player on their own takes the entry with them.
  const removePlayer = (reg: TournamentRegistration, playerId: string, name: string) => {
    if (!confirm(`Remove ${name} from this tournament?`)) return;
    return mutateEntry(
      reg.id,
      list =>
        list.flatMap(r => {
          if (r.id !== reg.id) return [r];
          if (playerId === r.partner_id) return [{ ...r, partner_id: null, partner: null }];
          if (playerId !== r.player_id) {
            return [{ ...r, members: (r.members ?? []).filter(m => m.player_id !== playerId) }];
          }
          if (!r.partner_id) return [];
          return [
            { ...r, player_id: r.partner_id, profiles: r.partner ?? undefined, partner_id: null, partner: null },
          ];
        }),
      post('registrations', 'DELETE', { registrationId: reg.id, playerId }),
      'Failed to remove player'
    );
  };

  // Basketball roster: add a player to a team, or take one off it. The team
  // itself stays either way — removeEntry is what drops a whole team.
  const addMember = (reg: TournamentRegistration, playerId: string) => {
    const player = members.find(m => m.id === playerId);
    setPendingMember(prev => ({ ...prev, [reg.id]: '' }));
    return mutateEntry(
      reg.id,
      list =>
        list.map(r =>
          r.id === reg.id
            ? {
                ...r,
                members: [
                  ...(r.members ?? []),
                  {
                    // Stands in until the refresh brings back the real row.
                    id: `pending-${playerId}`,
                    registration_id: r.id,
                    player_id: playerId,
                    created_at: '',
                    profiles: player ? asProfile(player) : null,
                  },
                ],
              }
            : r
        ),
      post('members', 'POST', { registrationId: reg.id, playerId }),
      'Failed to update roster'
    );
  };

  const removeMember = (reg: TournamentRegistration, playerId: string, name: string) => {
    if (!confirm(`Remove ${name} from ${entryName(reg)}?`)) return;
    return mutateEntry(
      reg.id,
      list =>
        list.map(r =>
          r.id === reg.id
            ? { ...r, members: (r.members ?? []).filter(m => m.player_id !== playerId) }
            : r
        ),
      post('members', 'DELETE', { registrationId: reg.id, playerId }),
      'Failed to update roster'
    );
  };

  const renameTeam = async (registrationId: string, teamName: string) => {
    const reg = rows.find(r => r.id === registrationId);
    if (!teamName.trim() || teamName.trim() === (reg?.team_name ?? '')) return;
    setError('');
    setSuccess('');
    const res = await fetch(`/api/tournaments/${id}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, teamName: teamName.trim() }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to rename team');
    }
  };

  // Courts can change on the day — a court gets rained out, another opens up.
  // Saving re-flows the assignments across whatever is left.
  const handleSaveCourts = async () => {
    const courts = parseInt(courtDraft);
    if (!Number.isInteger(courts) || courts < MIN_COURTS || courts > MAX_COURTS) {
      setError(`Courts must be between ${MIN_COURTS} and ${MAX_COURTS}`);
      return;
    }
    setSavingCourts(true);
    setError('');
    setSuccess('');
    const res = await fetch(`/api/tournaments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ court_count: courts }),
    });
    if (res.ok) {
      setSuccess(`Now running on ${courts} court${courts === 1 ? '' : 's'}.`);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update courts');
    }
    setSavingCourts(false);
  };

  // Who reports scores can change mid-event too — an organizer who ends up
  // short-handed hands scoring to the players rather than running court to court.
  const handleToggleOpenScoring = async (open: boolean) => {
    setSavingScoring(true);
    setError('');
    setSuccess('');
    const res = await fetch(`/api/tournaments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_scoring: open }),
    });
    if (res.ok) {
      setSuccess(
        open
          ? 'Anyone on the tournament page can now report scores.'
          : 'Score reporting is back to organizers only.'
      );
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update score reporting');
    }
    setSavingScoring(false);
  };

  const handleSaveSeeds = async () => {
    setError('');
    setSuccess('');
    const seedArray = rows.map((r, i) => ({ id: r.id, seed: seedOf(r, i) }));
    const res = await fetch(`/api/tournaments/${id}/seed`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seeds: seedArray }),
    });
    if (res.ok) {
      setSuccess('Seeds saved!');
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to save seeds');
    }
  };

  const handleGenerateBracket = async () => {
    if (!confirm('Generate the bracket? This will lock registrations and start the tournament.')) return;
    setGenerating(true);
    setError('');
    const res = await fetch(`/api/tournaments/${id}/bracket/generate`, { method: 'POST' });
    if (res.ok) {
      setSuccess('Bracket generated!');
      router.push(`/tournaments/${id}`);
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to generate bracket');
      setGenerating(false);
    }
  };

  const handleAutoSeed = () => {
    const sorted = [...rows].sort((a, b) => entrySkill(b, sport) - entrySkill(a, sport));
    const newSeeds: Record<string, number> = {};
    sorted.forEach((r, i) => {
      newSeeds[r.id] = i + 1;
    });
    setSeeds(newSeeds);
  };

  // Pair every solo entry at once, closest ratings together.
  const handleRandomizePairs = async () => {
    if (
      !confirm(
        `Pair the ${unpairedCount} solo players by rating? Players with similar ratings ` +
          'end up on the same team. You can still unpair anyone afterwards.'
      )
    ) {
      return;
    }
    setRandomizing(true);
    setError('');
    setSuccess('');

    const res = await fetch(`/api/tournaments/${id}/teams`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'randomize' }),
    });
    const data = await res.json();

    if (res.ok) {
      setSuccess(
        `Made ${data.paired} team${data.paired === 1 ? '' : 's'}` +
          (data.leftover
            ? ` — ${data.leftover} is still solo, there was an odd number of players.`
            : '.')
      );
      router.refresh();
    } else {
      setError(data.error || 'Failed to pair players');
    }
    setRandomizing(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-6">
        <div>
          <Link href={`/tournaments/${id}`} className="text-brand-600 text-sm hover:underline mb-1 block">
            ← Back to tournament
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-500 text-sm mt-0.5">{tournament.name}</p>
        </div>
        <div className="text-left sm:text-right text-sm">
          <p className="text-gray-400">{SPORT_LABELS[tournament.sport]} · {EVENT_LABELS[tournament.event_type]} · {FORMAT_LABELS[tournament.format]}</p>
          <p className="font-medium text-gray-700">{STATUS_LABELS[tournament.status]}</p>
          <Link
            href={`/tournaments/${id}/edit`}
            className="inline-block mt-1.5 text-brand-700 border border-brand-300 px-3 py-1 rounded-lg hover:bg-brand-50 transition-colors"
          >
            Edit details
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
      )}
      {success && (
        <div role="status" className="bg-brand-50 border border-brand-200 text-brand-700 rounded-xl px-4 py-3 mb-4 text-sm">{success}</div>
      )}

      {/* Seeding + team building */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{entryNoun} ({rows.length})</h2>
          {!isBracketGenerated && rows.length > 0 && (
            <button
              onClick={handleAutoSeed}
              className="text-sm text-brand-700 border border-brand-300 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
            >
              Auto-seed by skill
            </button>
          )}
        </div>

        {rows.length === 0 && (
          <p className="text-gray-400 text-sm italic">No {isDoubles ? 'teams' : 'players'} registered</p>
        )}

        {isDoubles && !isBracketGenerated && unpairedCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 mb-4 text-sm flex flex-wrap items-center justify-between gap-3">
            <span className="flex-1 min-w-[14rem]">
              {unpairedCount} {unpairedCount === 1 ? 'entry needs' : 'entries need'} a partner before you can
              generate the bracket. Pair them below{unpairedCount > 1 ? ', or pair them all by rating' : ''}.
            </span>
            {unpairedCount > 1 && (
              <button
                onClick={handleRandomizePairs}
                disabled={randomizing}
                className="text-sm bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {randomizing ? 'Pairing…' : '🎲 Randomize pairs'}
              </button>
            )}
          </div>
        )}

        {isRoster && !isBracketGenerated && unnamedCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 mb-4 text-sm">
            {unnamedCount} {unnamedCount === 1 ? 'team needs' : 'teams need'} a name before you can generate
            the bracket. Name them below.
          </div>
        )}

        <div className="space-y-2">
          {entriesBySeed.map(({ reg, seed }) => {
            const unpaired = isDoubles && !reg.partner_id;
            const unnamed = isRoster && (!reg.team_name || !reg.team_name.trim());
            const rosterFull = (reg.members?.length ?? 0) + 1 >= teamSize; // + captain
            return (
              <div key={reg.id} className="py-2 border-b border-gray-50 last:border-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-shrink-0">
                    {!isBracketGenerated ? (
                      <input
                        type="number"
                        min="1"
                        max={rows.length}
                        aria-label={`Seed for ${entryName(reg)}`}
                        value={seed}
                        onChange={e =>
                          setSeeds(prev => ({ ...prev, [reg.id]: parseInt(e.target.value) || 0 }))
                        }
                        className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-base sm:text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    ) : (
                      <span className="w-14 text-center text-gray-400 text-sm inline-block">#{reg.seed}</span>
                    )}
                  </div>

                  {isRoster && !isBracketGenerated ? (
                    <input
                      type="text"
                      aria-label="Team name"
                      placeholder="Team name"
                      value={nameDrafts[reg.id] ?? reg.team_name ?? ''}
                      onChange={e => setNameDrafts(prev => ({ ...prev, [reg.id]: e.target.value }))}
                      onBlur={e => renameTeam(reg.id, e.target.value)}
                      className={`flex-1 min-w-[8rem] border rounded-lg px-2 py-1 text-base sm:text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 ${unnamed ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                    />
                  ) : (
                    <span className="flex-1 min-w-[8rem] font-medium text-gray-800">
                      {entryName(reg)}
                      {unpaired && <span className="ml-1 text-amber-600 text-xs font-normal">· solo</span>}
                    </span>
                  )}

                  {sport === 'basketball'
                    ? <BasketballBadge level={entrySkill(reg, sport)} />
                    : <SkillBadge level={entrySkill(reg, sport)} />}

                  {isDoubles && !isBracketGenerated && (
                    unpaired ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                          aria-label={`Partner for ${entryName(reg)}`}
                          value={pendingPartner[reg.id] ?? ''}
                          onChange={e => setPendingPartner(prev => ({ ...prev, [reg.id]: e.target.value }))}
                          className="flex-1 sm:flex-none border border-gray-300 rounded-lg px-2 py-1.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="">Pair with… (closest rating first)</option>
                          {candidatesFor(reg).map(m => (
                            <option key={m.id} value={m.id}>
                              {m.display_name} · {m.rating.toFixed(1)}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={!pendingPartner[reg.id] || !!busy[reg.id]}
                          onClick={() => pairEntry(reg, pendingPartner[reg.id])}
                          className="text-sm bg-brand-700 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {busy[reg.id] ? 'Pairing…' : 'Pair'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => unpairEntry(reg)}
                        disabled={!!busy[reg.id]}
                        className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        Unpair
                      </button>
                    )
                  )}

                  {!isBracketGenerated && (
                    <button
                      onClick={() => removeEntry(reg)}
                      disabled={!!busy[reg.id]}
                      aria-label={`Remove ${entryName(reg)}`}
                      title={
                        isRoster
                          ? 'Remove this team from the tournament'
                          : isDoubles
                          ? 'Remove this entry — both players — from the tournament'
                          : 'Remove this player from the tournament'
                      }
                      className="text-xs text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Doubles team: either player can be taken out on their own. */}
                {isDoubles && reg.partner_id && !isBracketGenerated && (
                  <div className="ml-[4.25rem] mt-2 flex flex-wrap items-center gap-1.5">
                    {[
                      { playerId: reg.player_id, name: reg.profiles?.display_name ?? 'Player' },
                      { playerId: reg.partner_id, name: reg.partner?.display_name ?? 'Partner' },
                    ].map(p => (
                      <span
                        key={p.playerId}
                        className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-lg"
                      >
                        {p.name}
                        <button
                          aria-label={`Remove ${p.name}`}
                          title={`Remove ${p.name} from the tournament`}
                          disabled={!!busy[reg.id]}
                          onClick={() => removePlayer(reg, p.playerId, p.name)}
                          className="text-gray-400 hover:text-red-600 font-bold disabled:opacity-50"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <span className="text-xs text-gray-400">· the other one stays, solo</span>
                  </div>
                )}

                {/* Basketball roster: captain + members, with add/remove. */}
                {isRoster && (
                  <div className="ml-[4.25rem] mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-800 text-xs px-2 py-1 rounded-lg">
                      {reg.profiles?.display_name ?? 'Captain'}
                      <span className="text-brand-500">· C</span>
                    </span>
                    {(reg.members ?? []).map(m => (
                      <span key={m.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-lg">
                        {m.profiles?.display_name ?? 'Player'}
                        {!isBracketGenerated && (
                          <button
                            aria-label={`Remove ${m.profiles?.display_name ?? 'player'}`}
                            disabled={!!busy[reg.id]}
                            onClick={() =>
                              removeMember(reg, m.player_id, m.profiles?.display_name ?? 'this player')
                            }
                            className="text-gray-400 hover:text-red-600 font-bold disabled:opacity-50"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    <span className="text-xs text-gray-400">
                      {(reg.members?.length ?? 0) + 1}/{teamSize}
                    </span>
                    {!isBracketGenerated && !rosterFull && availableProfiles.length > 0 && (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
                        <select
                          aria-label={`Add a player to ${entryName(reg)}`}
                          value={pendingMember[reg.id] ?? ''}
                          onChange={e => setPendingMember(prev => ({ ...prev, [reg.id]: e.target.value }))}
                          className="flex-1 sm:flex-none border border-gray-300 rounded-lg px-2 py-1 text-base sm:text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="">Add player…</option>
                          {availableProfiles.map(m => (
                            <option key={m.id} value={m.id}>{m.display_name}</option>
                          ))}
                        </select>
                        <button
                          disabled={!pendingMember[reg.id] || !!busy[reg.id]}
                          onClick={() => addMember(reg, pendingMember[reg.id])}
                          className="text-xs bg-brand-700 hover:bg-brand-600 text-white px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {busy[reg.id] ? 'Adding…' : 'Add'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isBracketGenerated && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label htmlFor="add-player" className="block text-xs font-medium text-gray-600 mb-1.5">
              {isRoster
                ? 'Create a team — name it and pick its captain (add the rest of the roster afterward)'
                : `Add an existing ${isDoubles ? 'player (as a solo entry to pair)' : 'player'} to this tournament`}
            </label>
            <div className="flex flex-wrap gap-2">
              {isRoster && (
                <input
                  type="text"
                  aria-label="New team name"
                  placeholder="Team name"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="flex-1 min-w-[9rem] border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              )}
              <select
                id="add-player"
                value={playerToAdd}
                onChange={e => setPlayerToAdd(e.target.value)}
                className="flex-1 min-w-[9rem] border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">
                  {availableProfiles.length
                    ? isRoster ? 'Select a captain…' : 'Select a player…'
                    : 'No unregistered players'}
                </option>
                {availableProfiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                    {p.skill_level ? ` (${p.skill_level.toFixed(1)})` : ''}
                    {p.is_managed ? ' — roster' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddPlayer}
                disabled={!playerToAdd || addingPlayer || (isRoster && !newTeamName.trim())}
                className="bg-white border border-brand-300 text-brand-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50"
              >
                {addingPlayer ? 'Adding…' : isRoster ? 'Create Team' : 'Add'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Need someone not listed?{' '}
              <Link href="/admin" className="text-brand-600 hover:underline">
                Add or import players
              </Link>
              .
            </p>
          </div>
        )}

        {!isBracketGenerated && rows.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={handleSaveSeeds}
              className="flex-1 bg-white border border-brand-300 text-brand-700 text-sm font-medium py-2 rounded-lg hover:bg-brand-50 transition-colors"
            >
              Save Seeds
            </button>
            <button
              onClick={handleGenerateBracket}
              disabled={generating || rows.length < 2 || incompleteCount > 0}
              className="flex-1 bg-brand-700 hover:bg-brand-600 text-white text-sm font-bold py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {generating ? 'Generating…' : '🏆 Generate Bracket'}
            </button>
          </div>
        )}

        {isBracketGenerated && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-500 text-center">
              Bracket is live.{' '}
              <Link href={`/tournaments/${id}`} className="text-brand-700 hover:underline font-medium">
                View and score matches →
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* Courts */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Courts</h2>
        <p className="text-sm text-gray-500 mb-4">
          Matches are handed a court number as they become ready, and a court is passed on to the next
          match the moment a score is entered. Players see their court on the tournament page.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="court-count" className="text-sm text-gray-600">
            Courts in play
          </label>
          <input
            id="court-count"
            type="number"
            min={MIN_COURTS}
            max={MAX_COURTS}
            step={1}
            value={courtDraft}
            onChange={e => setCourtDraft(e.target.value)}
            className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={handleSaveCourts}
            disabled={savingCourts || courtDraft === String(tournament.court_count ?? 1)}
            className="bg-white border border-brand-300 text-brand-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50"
          >
            {savingCourts ? 'Saving…' : 'Update courts'}
          </button>
        </div>
      </div>

      {/* Who can report scores */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Score reporting</h2>
        <p className="text-sm text-gray-500 mb-4">
          By default only organizers can enter a score, so someone with an admin account has to be
          there when every game ends. Open it up and anyone on the tournament page can report the
          result of a game that has just finished — no sign-in, no account. Correcting a score
          that&rsquo;s already final stays with you either way.
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={tournament.open_scoring ?? false}
            disabled={savingScoring}
            onChange={e => handleToggleOpenScoring(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-gray-300 text-brand-700 focus:ring-brand-500 disabled:opacity-50"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-800">
              Let anyone report scores for this tournament
            </span>
            <span className="block text-gray-500">
              {savingScoring
                ? 'Saving…'
                : tournament.open_scoring
                ? 'On — players tap their court and enter the score themselves.'
                : 'Off — organizers enter every score.'}
            </span>
          </span>
        </label>
      </div>

      {/* Tournament Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Tournament Info</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Sport</dt>
            <dd className="font-medium text-gray-800">{SPORT_LABELS[tournament.sport]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Event</dt>
            <dd className="font-medium text-gray-800">{EVENT_LABELS[tournament.event_type]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Format</dt>
            <dd className="font-medium text-gray-800">{FORMAT_LABELS[tournament.format]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Status</dt>
            <dd className="font-medium text-gray-800">{STATUS_LABELS[tournament.status]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Max {entryNoun}</dt>
            <dd className="font-medium text-gray-800">{tournament.max_players}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Courts</dt>
            <dd className="font-medium text-gray-800">{tournament.court_count ?? 1}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Score reporting</dt>
            <dd className="font-medium text-gray-800">
              {tournament.open_scoring ? 'Open to anyone' : 'Organizers only'}
            </dd>
          </div>
          {tournament.start_date && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32">Date</dt>
              <dd className="font-medium text-gray-800">
                {new Date(tournament.start_date + 'T12:00:00').toLocaleDateString()}
              </dd>
            </div>
          )}
          {tournament.location && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32">Location</dt>
              <dd className="font-medium text-gray-800">{tournament.location}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

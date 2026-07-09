'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkillBadge, BasketballBadge } from '@/components/ui/Badge';
import type { Tournament, TournamentRegistration } from '@/lib/types/app';
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingPartner, setPendingPartner] = useState<Record<string, string>>({});
  const [pendingMember, setPendingMember] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    registrations.forEach(r => { d[r.id] = r.team_name ?? ''; });
    return d;
  });
  const [playerToAdd, setPlayerToAdd] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [seeds, setSeeds] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    registrations.forEach((r, i) => {
      s[r.id] = r.seed ?? i + 1;
    });
    return s;
  });

  const isBracketGenerated = tournament.status === 'active' || tournament.status === 'completed';
  const unpairedCount = isDoubles ? registrations.filter(r => !r.partner_id).length : 0;
  const unnamedCount = isRoster ? registrations.filter(r => !r.team_name || !r.team_name.trim()).length : 0;
  const incompleteCount = unpairedCount + unnamedCount;

  // Everyone currently in this tournament (captains + partners).
  const enrolled = new Set<string>();
  registrations.forEach(r => {
    enrolled.add(r.player_id);
    if (r.partner_id) enrolled.add(r.partner_id);
  });
  const availableProfiles = members.filter(m => !m.is_admin && !enrolled.has(m.id));

  // Players who are locked onto a complete team (captain-with-partner or partner)
  // and so can't be offered as a partner for someone else.
  const pairedPlayers = new Set<string>();
  registrations.forEach(r => {
    if (r.partner_id) {
      pairedPlayers.add(r.player_id);
      pairedPlayers.add(r.partner_id);
    }
  });
  const candidatesFor = (reg: TournamentRegistration) =>
    members.filter(m => m.id !== reg.player_id && !pairedPlayers.has(m.id));

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

  // Basketball roster actions (add/remove a member, rename a team).
  const memberAction = async (method: 'POST' | 'DELETE', body: Record<string, string>) => {
    setError('');
    setSuccess('');
    const res = await fetch(`/api/tournaments/${id}/members`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update roster');
    }
  };

  const renameTeam = async (registrationId: string, teamName: string) => {
    const reg = registrations.find(r => r.id === registrationId);
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

  const handleSaveSeeds = async () => {
    setError('');
    setSuccess('');
    const seedArray = Object.entries(seeds).map(([id, seed]) => ({ id, seed }));
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
    const sorted = [...registrations].sort((a, b) => entrySkill(b, sport) - entrySkill(a, sport));
    const newSeeds: Record<string, number> = {};
    sorted.forEach((r, i) => {
      newSeeds[r.id] = i + 1;
    });
    setSeeds(newSeeds);
  };

  const teamAction = async (body: Record<string, string>) => {
    setError('');
    setSuccess('');
    const res = await fetch(`/api/tournaments/${id}/teams`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update teams');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/tournaments/${id}`} className="text-brand-600 text-sm hover:underline mb-1 block">
            ← Back to tournament
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-500 text-sm mt-0.5">{tournament.name}</p>
        </div>
        <div className="text-right text-sm">
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
          <h2 className="text-lg font-bold text-gray-900">{entryNoun} ({registrations.length})</h2>
          {!isBracketGenerated && registrations.length > 0 && (
            <button
              onClick={handleAutoSeed}
              className="text-sm text-brand-700 border border-brand-300 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
            >
              Auto-seed by skill
            </button>
          )}
        </div>

        {registrations.length === 0 && (
          <p className="text-gray-400 text-sm italic">No {isDoubles ? 'teams' : 'players'} registered</p>
        )}

        {isDoubles && !isBracketGenerated && unpairedCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 mb-4 text-sm">
            {unpairedCount} {unpairedCount === 1 ? 'entry needs' : 'entries need'} a partner before you can
            generate the bracket. Pair them below.
          </div>
        )}

        {isRoster && !isBracketGenerated && unnamedCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 mb-4 text-sm">
            {unnamedCount} {unnamedCount === 1 ? 'team needs' : 'teams need'} a name before you can generate
            the bracket. Name them below.
          </div>
        )}

        <div className="space-y-2">
          {registrations
            .slice()
            .sort((a, b) => (seeds[a.id] ?? 99) - (seeds[b.id] ?? 99))
            .map(reg => {
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
                          max={registrations.length}
                          aria-label={`Seed for ${entryName(reg)}`}
                          value={seeds[reg.id] ?? ''}
                          onChange={e =>
                            setSeeds(prev => ({ ...prev, [reg.id]: parseInt(e.target.value) || 0 }))
                          }
                          className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                        value={nameDrafts[reg.id] ?? ''}
                        onChange={e => setNameDrafts(prev => ({ ...prev, [reg.id]: e.target.value }))}
                        onBlur={e => renameTeam(reg.id, e.target.value)}
                        className={`flex-1 min-w-[8rem] border rounded-lg px-2 py-1 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 ${unnamed ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
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
                            className="flex-1 sm:flex-none border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            <option value="">Pair with…</option>
                            {candidatesFor(reg).map(m => (
                              <option key={m.id} value={m.id}>{m.display_name}</option>
                            ))}
                          </select>
                          <button
                            disabled={!pendingPartner[reg.id]}
                            onClick={() =>
                              teamAction({ action: 'pair', registrationId: reg.id, partnerPlayerId: pendingPartner[reg.id] })
                            }
                            className="text-sm bg-brand-700 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            Pair
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => teamAction({ action: 'unpair', registrationId: reg.id })}
                          className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Unpair
                        </button>
                      )
                    )}
                  </div>

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
                              onClick={() => memberAction('DELETE', { registrationId: reg.id, playerId: m.player_id })}
                              className="text-gray-400 hover:text-red-600 font-bold"
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
                            className="flex-1 sm:flex-none border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            <option value="">Add player…</option>
                            {availableProfiles.map(m => (
                              <option key={m.id} value={m.id}>{m.display_name}</option>
                            ))}
                          </select>
                          <button
                            disabled={!pendingMember[reg.id]}
                            onClick={() => {
                              memberAction('POST', { registrationId: reg.id, playerId: pendingMember[reg.id] });
                              setPendingMember(prev => ({ ...prev, [reg.id]: '' }));
                            }}
                            className="text-xs bg-brand-700 hover:bg-brand-600 text-white px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            Add
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
                  className="flex-1 min-w-[9rem] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              )}
              <select
                id="add-player"
                value={playerToAdd}
                onChange={e => setPlayerToAdd(e.target.value)}
                className="flex-1 min-w-[9rem] border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
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

        {!isBracketGenerated && registrations.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={handleSaveSeeds}
              className="flex-1 bg-white border border-brand-300 text-brand-700 text-sm font-medium py-2 rounded-lg hover:bg-brand-50 transition-colors"
            >
              Save Seeds
            </button>
            <button
              onClick={handleGenerateBracket}
              disabled={generating || registrations.length < 2 || incompleteCount > 0}
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

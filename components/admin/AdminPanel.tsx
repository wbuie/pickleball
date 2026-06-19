'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkillBadge } from '@/components/ui/Badge';
import type { Tournament, TournamentRegistration } from '@/lib/types/app';
import { FORMAT_LABELS, STATUS_LABELS, EVENT_LABELS, entryName, entrySkill } from '@/lib/types/app';

interface AdminPanelProps {
  tournament: Tournament;
  registrations: TournamentRegistration[];
  members: { id: string; display_name: string }[];
}

export default function AdminPanel({ tournament, registrations, members }: AdminPanelProps) {
  const router = useRouter();
  const id = tournament.id;
  const isDoubles = tournament.event_type === 'doubles';
  const entryNoun = isDoubles ? 'Teams' : 'Players';

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingPartner, setPendingPartner] = useState<Record<string, string>>({});
  const [seeds, setSeeds] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    registrations.forEach((r, i) => {
      s[r.id] = r.seed ?? i + 1;
    });
    return s;
  });

  const isBracketGenerated = tournament.status === 'active' || tournament.status === 'completed';
  const unpairedCount = isDoubles ? registrations.filter(r => !r.partner_id).length : 0;

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
    const sorted = [...registrations].sort((a, b) => entrySkill(b) - entrySkill(a));
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
          <p className="text-gray-400">{EVENT_LABELS[tournament.event_type]} · {FORMAT_LABELS[tournament.format]}</p>
          <p className="font-medium text-gray-700">{STATUS_LABELS[tournament.status]}</p>
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

        <div className="space-y-2">
          {registrations
            .slice()
            .sort((a, b) => (seeds[a.id] ?? 99) - (seeds[b.id] ?? 99))
            .map(reg => {
              const unpaired = isDoubles && !reg.partner_id;
              return (
                <div key={reg.id} className="flex flex-wrap items-center gap-3 py-2 border-b border-gray-50 last:border-0">
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
                  <span className="flex-1 min-w-[8rem] font-medium text-gray-800">
                    {entryName(reg)}
                    {unpaired && <span className="ml-1 text-amber-600 text-xs font-normal">· solo</span>}
                  </span>
                  <SkillBadge level={entrySkill(reg)} />

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
              );
            })}
        </div>

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
              disabled={generating || registrations.length < 2 || unpairedCount > 0}
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

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkillBadge } from '@/components/ui/Badge';
import type { Tournament, TournamentRegistration, Profile } from '@/lib/types/app';
import { FORMAT_LABELS, STATUS_LABELS } from '@/lib/types/app';

interface AdminPanelProps {
  tournament: Tournament;
  registrations: TournamentRegistration[];
}

export default function AdminPanel({ tournament, registrations }: AdminPanelProps) {
  const router = useRouter();
  const id = tournament.id;

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [seeds, setSeeds] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    registrations.forEach((r, i) => {
      s[r.player_id] = r.seed ?? i + 1;
    });
    return s;
  });

  const isBracketGenerated = tournament.status === 'active' || tournament.status === 'completed';

  const handleSaveSeeds = async () => {
    setError('');
    setSuccess('');
    const seedArray = Object.entries(seeds).map(([player_id, seed]) => ({ player_id, seed }));

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
    const sorted = [...registrations].sort((a, b) => {
      const aSkill = (a.profiles as Profile)?.skill_level ?? 3.0;
      const bSkill = (b.profiles as Profile)?.skill_level ?? 3.0;
      return bSkill - aSkill;
    });

    const newSeeds: Record<string, number> = {};
    sorted.forEach((r, i) => {
      newSeeds[r.player_id] = i + 1;
    });
    setSeeds(newSeeds);
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
          <p className="text-gray-400">{FORMAT_LABELS[tournament.format]}</p>
          <p className="font-medium text-gray-700">{STATUS_LABELS[tournament.status]}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
      )}
      {success && (
        <div role="status" className="bg-brand-50 border border-brand-200 text-brand-700 rounded-xl px-4 py-3 mb-4 text-sm">{success}</div>
      )}

      {/* Player Seeding */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Players ({registrations.length})</h2>
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
          <p className="text-gray-400 text-sm italic">No players registered</p>
        )}

        <div className="space-y-2">
          {registrations
            .slice()
            .sort((a, b) => (seeds[a.player_id] ?? 99) - (seeds[b.player_id] ?? 99))
            .map(reg => {
              const p = reg.profiles as Profile;
              return (
                <div key={reg.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-shrink-0">
                    {!isBracketGenerated ? (
                      <input
                        type="number"
                        min="1"
                        max={registrations.length}
                        aria-label={`Seed for ${p?.display_name ?? 'player'}`}
                        value={seeds[reg.player_id] ?? ''}
                        onChange={e =>
                          setSeeds(prev => ({
                            ...prev,
                            [reg.player_id]: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    ) : (
                      <span className="w-14 text-center text-gray-400 text-sm inline-block">#{reg.seed}</span>
                    )}
                  </div>
                  <span className="flex-1 font-medium text-gray-800">{p?.display_name}</span>
                  <SkillBadge level={p?.skill_level ?? null} />
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
              disabled={generating || registrations.length < 2}
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
            <dt className="text-gray-500 w-32">Format</dt>
            <dd className="font-medium text-gray-800">{FORMAT_LABELS[tournament.format]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Status</dt>
            <dd className="font-medium text-gray-800">{STATUS_LABELS[tournament.status]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Max Players</dt>
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

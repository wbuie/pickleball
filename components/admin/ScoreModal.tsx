'use client';

import { useState } from 'react';
import type { Match, Profile } from '@/lib/types/app';

interface ScoreModalProps {
  match: Match & { player1?: Profile; player2?: Profile };
  onClose: () => void;
  onSuccess: () => void;
}

export default function ScoreModal({ match, onClose, onSuccess }: ScoreModalProps) {
  const [p1Score, setP1Score] = useState('');
  const [p2Score, setP2Score] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s1 = parseInt(p1Score);
    const s2 = parseInt(p2Score);

    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      setError('Please enter valid scores');
      return;
    }
    if (s1 === s2) {
      setError('Scores cannot be tied');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/matches/${match.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1Score: s1, player2Score: s2 }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save score');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="bg-green-800 text-white px-6 py-4 rounded-t-2xl">
          <h2 className="font-bold text-lg">Enter Score</h2>
          <p className="text-green-200 text-sm mt-0.5">
            {match.bracket_type === 'winners' && `WB Round ${match.round}`}
            {match.bracket_type === 'losers' && `LB Round ${match.round}`}
            {match.bracket_type === 'grand_finals' && match.round === 1 && 'Grand Final'}
            {match.bracket_type === 'grand_finals' && match.round === 2 && 'Grand Final – Reset'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Player 1 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {match.player1?.display_name ?? 'Player 1'}
            </label>
            <input
              type="number"
              min="0"
              max="99"
              value={p1Score}
              onChange={e => setP1Score(e.target.value)}
              placeholder="Score"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-sm font-medium">vs</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Player 2 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {match.player2?.display_name ?? 'Player 2'}
            </label>
            <input
              type="number"
              min="0"
              max="99"
              value={p2Score}
              onChange={e => setP2Score(e.target.value)}
              placeholder="Score"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving…' : 'Save Score'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

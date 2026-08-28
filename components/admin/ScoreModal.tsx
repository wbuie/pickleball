'use client';

import { useState } from 'react';
import type { Match, BracketEntry } from '@/lib/types/app';

interface ScoreModalProps {
  match: Match & { player1?: BracketEntry; player2?: BracketEntry };
  // How many courts this tournament runs on, so the court can be reassigned.
  courtCount: number;
  onClose: () => void;
  // Called after a change that the page needs to re-read (a court move).
  onChange?: () => void;
  onSuccess: () => void;
}

export default function ScoreModal({ match, courtCount, onClose, onChange, onSuccess }: ScoreModalProps) {
  const isEdit = match.status === 'completed';
  const [p1Score, setP1Score] = useState(match.player1_score?.toString() ?? '');
  const [p2Score, setP2Score] = useState(match.player2_score?.toString() ?? '');
  const [movingCourt, setMovingCourt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // The court shown is always the saved one — a move round-trips to the server
  // and comes back through onChange, so the modal can't drift from reality.
  const court = match.court ?? null;

  // Courts are handed out automatically, but an organizer sometimes needs to
  // move a match — a court is wet, a game before it is running long.
  const handleCourtChange = async (value: string) => {
    const next = value === '' ? null : parseInt(value);
    setMovingCourt(true);
    setError('');
    try {
      const res = await fetch(`/api/matches/${match.id}/court`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ court: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to move the match');
      }
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setMovingCourt(false);
    }
  };

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
        <div className="bg-brand-800 text-white px-6 py-4 rounded-t-2xl">
          <h2 className="font-bold text-lg">{isEdit ? 'Edit Score' : 'Enter Score'}</h2>
          <p className="text-brand-200 text-sm mt-0.5">
            {match.bracket_type === 'winners' && `WB Round ${match.round}`}
            {match.bracket_type === 'losers' && `LB Round ${match.round}`}
            {match.bracket_type === 'grand_finals' && match.round === 1 && 'Grand Final'}
            {match.bracket_type === 'grand_finals' && match.round === 2 && 'Grand Final – Reset'}
            {court !== null && ` · Court ${court}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Player 1 */}
          <div>
            <label htmlFor="p1-score" className="block text-sm font-medium text-gray-700 mb-1">
              {match.player1?.display_name ?? 'Player 1'}
            </label>
            <input
              id="p1-score"
              type="number"
              min="0"
              max="99"
              value={p1Score}
              onChange={e => setP1Score(e.target.value)}
              placeholder="Score"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
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
            <label htmlFor="p2-score" className="block text-sm font-medium text-gray-700 mb-1">
              {match.player2?.display_name ?? 'Player 2'}
            </label>
            <input
              id="p2-score"
              type="number"
              min="0"
              max="99"
              value={p2Score}
              onChange={e => setP2Score(e.target.value)}
              placeholder="Score"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="match-court" className="block text-sm font-medium text-gray-700 mb-1">
              Court
            </label>
            <select
              id="match-court"
              value={court ?? ''}
              disabled={movingCourt}
              onChange={e => handleCourtChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">Assign automatically</option>
              {Array.from({ length: courtCount }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Court {n}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Saved right away. Moving a match here bumps whoever was on that court back into the
              queue; &ldquo;automatically&rdquo; hands it the next court that frees up.
            </p>
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
              className="flex-1 px-4 py-2 bg-brand-700 text-white rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Score'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

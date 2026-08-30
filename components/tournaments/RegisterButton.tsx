'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EventType } from '@/lib/types/app';
import { isRosterEvent, TEAM_SIZE } from '@/lib/types/app';

interface RegisterButtonProps {
  tournamentId: string;
  isRegistered: boolean;
  isFull: boolean;
  eventType: EventType;
  // Members not already on a team here (used to pick a doubles partner or fill
  // out a basketball roster).
  eligiblePartners?: { id: string; display_name: string }[];
}

export default function RegisterButton({
  tournamentId,
  isRegistered,
  isFull,
  eventType,
  eligiblePartners = [],
}: RegisterButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const isDoubles = eventType === 'doubles';
  const isRoster = isRosterEvent(eventType);
  const maxMembers = TEAM_SIZE[eventType] - 1; // captain fills one slot

  const toggleMember = (memberId: string) => {
    setMemberIds(prev =>
      prev.includes(memberId)
        ? prev.filter(m => m !== memberId)
        : prev.length < maxMembers
        ? [...prev, memberId]
        : prev
    );
  };

  const submit = async (method: 'POST' | 'DELETE') => {
    setLoading(true);
    setError('');
    try {
      let payload: string | undefined;
      if (method === 'POST') {
        if (isDoubles) payload = JSON.stringify({ partner_id: partnerId });
        else if (isRoster) payload = JSON.stringify({ team_name: teamName, member_ids: memberIds });
      }
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Action failed');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Already in — allow withdrawing.
  if (isRegistered) {
    return (
      <div>
        <button
          onClick={() => submit('DELETE')}
          disabled={loading}
          className="text-sm font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
        >
          {loading ? '…' : 'Withdraw'}
        </button>
        {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
        <p className="text-brand-600 text-xs mt-1 text-center">✓ You&apos;re registered!</p>
      </div>
    );
  }

  if (isFull) {
    return (
      <button disabled className="bg-gray-100 text-gray-400 text-sm font-medium px-5 py-2.5 rounded-xl cursor-not-allowed">
        Tournament Full
      </button>
    );
  }

  // Basketball roster teams: name the team, then pick teammates.
  if (isRoster) {
    return (
      <div className="flex flex-col items-stretch gap-2 w-full sm:w-72">
        <input
          type="text"
          aria-label="Team name"
          placeholder="Team name"
          value={teamName}
          onChange={e => setTeamName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div>
          <p className="text-xs text-gray-500 mb-1">
            Add teammates ({memberIds.length}/{maxMembers}) — optional, you can also let an organizer fill the roster.
          </p>
          {eligiblePartners.length === 0 ? (
            <p className="text-gray-400 text-xs italic">No other players available yet.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {eligiblePartners.map(p => {
                const checked = memberIds.includes(p.id);
                const atCap = !checked && memberIds.length >= maxMembers;
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm ${atCap ? 'opacity-40' : 'cursor-pointer hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => toggleMember(p.id)}
                      className="accent-brand-600"
                    />
                    <span className="truncate">{p.display_name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={() => submit('POST')}
          disabled={loading || !teamName.trim()}
          className="bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          {loading ? '…' : 'Register Team'}
        </button>
        {error && <p className="text-red-600 text-xs">{error}</p>}
      </div>
    );
  }

  // Doubles: pick a partner, then register the team.
  if (isDoubles) {
    if (eligiblePartners.length === 0) {
      return (
        <div className="text-right">
          <button disabled className="bg-gray-100 text-gray-400 text-sm font-medium px-5 py-2.5 rounded-xl cursor-not-allowed">
            Register Team
          </button>
          <p className="text-gray-500 text-xs mt-1 max-w-[14rem]">
            No available partners yet — another member needs to create an account first, or ask an
            organizer to pair you.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-end gap-2">
        <select
          aria-label="Choose your partner"
          value={partnerId}
          onChange={e => setPartnerId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[12rem]"
        >
          <option value="">Choose your partner…</option>
          {eligiblePartners.map(p => (
            <option key={p.id} value={p.id}>{p.display_name}</option>
          ))}
        </select>
        <button
          onClick={() => submit('POST')}
          disabled={loading || !partnerId}
          className="bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-50"
        >
          {loading ? '…' : 'Register Team'}
        </button>
        {error && <p className="text-red-600 text-xs">{error}</p>}
      </div>
    );
  }

  // Singles.
  return (
    <div>
      <button
        onClick={() => submit('POST')}
        disabled={loading}
        className="text-sm font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 bg-brand-700 hover:bg-brand-600 text-white shadow-sm"
      >
        {loading ? '…' : 'Register Now'}
      </button>
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

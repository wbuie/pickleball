'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EventType } from '@/lib/types/app';

interface RegisterButtonProps {
  tournamentId: string;
  isRegistered: boolean;
  isFull: boolean;
  eventType: EventType;
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

  const isDoubles = eventType === 'doubles';

  const submit = async (method: 'POST' | 'DELETE') => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' && isDoubles ? JSON.stringify({ partner_id: partnerId }) : undefined,
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
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[12rem]"
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

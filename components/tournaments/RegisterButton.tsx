'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RegisterButtonProps {
  tournamentId: string;
  isRegistered: boolean;
  isFull: boolean;
}

export default function RegisterButton({ tournamentId, isRegistered, isFull }: RegisterButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method: isRegistered ? 'DELETE' : 'POST',
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

  if (!isRegistered && isFull) {
    return (
      <button disabled className="bg-gray-100 text-gray-400 text-sm font-medium px-5 py-2.5 rounded-xl cursor-not-allowed">
        Tournament Full
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`text-sm font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
          isRegistered
            ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
            : 'bg-brand-700 hover:bg-brand-600 text-white shadow-sm'
        }`}
      >
        {loading ? '…' : isRegistered ? 'Withdraw' : 'Register Now'}
      </button>
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
      {isRegistered && (
        <p className="text-brand-600 text-xs mt-1 text-center">✓ You&apos;re registered!</p>
      )}
    </div>
  );
}

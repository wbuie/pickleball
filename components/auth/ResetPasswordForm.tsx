'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BrandMark from '@/components/BrandMark';

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // null = still checking for a recovery session; false = link invalid/expired.
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Arriving from the emailed link (via /auth/callback) establishes a
    // recovery session. Without one, there's nothing to update.
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
    router.refresh();
  };

  if (ready === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <span className="text-5xl">⏳</span>
          <h1 className="text-2xl font-bold text-brand-900 mt-3">Link expired</h1>
          <p className="text-gray-600 mt-2">
            This password reset link is invalid or has already been used. Request a new one to try again.
          </p>
          <Link
            href="/auth/forgot"
            className="inline-block mt-6 bg-brand-700 hover:bg-brand-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <span className="text-5xl">✅</span>
          <h1 className="text-2xl font-bold text-brand-900 mt-3">Password updated</h1>
          <p className="text-gray-600 mt-2">You&apos;re all set — your new password is ready to use.</p>
          <Link
            href="/tournaments"
            className="inline-block mt-6 bg-brand-700 hover:bg-brand-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Go to tournaments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BrandMark className="w-14 h-14 mx-auto text-brand-500" />
          <h1 className="text-2xl font-bold text-brand-900 mt-3">Choose a new password</h1>
          <p className="text-gray-500 mt-1">Enter a new password for your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || ready === null}
              className="w-full bg-brand-700 hover:bg-brand-600 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating…' : ready === null ? 'Loading…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

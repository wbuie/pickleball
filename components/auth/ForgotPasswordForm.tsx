'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BrandMark from '@/components/BrandMark';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    // The emailed link lands on /auth/callback, which exchanges the recovery
    // code for a session and forwards to /auth/reset to set a new password.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Always show the same confirmation, whether or not the email is on file —
    // don't reveal which addresses have accounts.
    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <span className="text-5xl">📧</span>
          <h1 className="text-2xl font-bold text-brand-900 mt-3">Check your email</h1>
          <p className="text-gray-600 mt-2">
            If an account exists for <span className="font-medium">{email}</span>, we sent a link to
            reset your password. Open it in this browser to continue.
          </p>
          <Link
            href="/auth/login"
            className="inline-block mt-6 bg-brand-700 hover:bg-brand-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Back to sign in
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
          <h1 className="text-2xl font-bold text-brand-900 mt-3">Reset your password</h1>
          <p className="text-gray-500 mt-1">Enter your email and we&apos;ll send you a reset link</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-700 hover:bg-brand-600 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Remembered it?{' '}
            <Link href="/auth/login" className="text-brand-700 font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

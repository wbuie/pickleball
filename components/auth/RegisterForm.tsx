'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SKILL_LEVELS, SKILL_DESCRIPTIONS } from '@/lib/types/app';

export default function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [skillLevel, setSkillLevel] = useState('3.0');
  const [knowsDupr, setKnowsDupr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmEmail, setConfirmEmail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');

    const supabase = createClient();

    // Pass name + skill into user metadata so the `handle_new_user` DB trigger
    // can seed the profile correctly. (We can't update the profile from the
    // client here: when email confirmation is on there's no session yet, so an
    // RLS-protected update would silently fail.)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, skill_level: parseFloat(skillLevel) } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // No session means Supabase is waiting on email confirmation.
    if (!data.session) {
      setConfirmEmail(true);
      setLoading(false);
      return;
    }

    router.push('/tournaments');
    router.refresh();
  };

  if (confirmEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <span className="text-5xl">📧</span>
          <h1 className="text-2xl font-bold text-brand-900 mt-3">Check your email</h1>
          <p className="text-gray-600 mt-2">
            We sent a confirmation link to <span className="font-medium">{email}</span>. Click it to
            activate your account, then sign in.
          </p>
          <Link
            href="/auth/login"
            className="inline-block mt-6 bg-brand-700 hover:bg-brand-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">🏓</span>
          <p className="text-accent-600 font-semibold tracking-wide uppercase text-xs mt-2">
            Christ Fellowship Church
          </p>
          <h1 className="text-2xl font-bold text-brand-900 mt-1">Join the CFC Pickleball League</h1>
          <p className="text-gray-500 mt-1">Create your account to enter tournaments</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {/* Skill level */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  How would you describe your game?
                </label>
              </div>

              {!knowsDupr ? (
                <>
                  <div className="space-y-2">
                    {SKILL_DESCRIPTIONS.map(level => {
                      const selected = skillLevel === level.value;
                      return (
                        <button
                          key={level.value}
                          type="button"
                          onClick={() => setSkillLevel(level.value)}
                          className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors ${
                            selected
                              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                              : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex-shrink-0 w-4 h-4 rounded-full border-2 ${
                                selected ? 'border-brand-600 bg-brand-600' : 'border-gray-300'
                              }`}
                            />
                            <span className={`text-sm font-semibold ${selected ? 'text-brand-800' : 'text-gray-800'}`}>
                              {level.title}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 ml-6">{level.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setKnowsDupr(true)}
                    className="text-brand-700 text-xs font-medium hover:underline mt-2.5"
                  >
                    I know my DUPR rating — let me enter it instead
                  </button>
                </>
              ) : (
                <>
                  <select
                    value={skillLevel}
                    onChange={e => setSkillLevel(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
                  >
                    {SKILL_LEVELS.map(level => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setKnowsDupr(false)}
                    className="text-brand-700 text-xs font-medium hover:underline mt-2.5"
                  >
                    Not sure of your rating? Describe your game instead
                  </button>
                </>
              )}
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-700 hover:bg-brand-600 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-brand-700 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

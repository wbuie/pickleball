'use client';

import { useEffect, useState } from 'react';
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
  // Whether an email is required is controlled by the admin (app_settings).
  const [requireEmail, setRequireEmail] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('app_settings')
      .select('require_email')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) setRequireEmail(data.require_email);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // No-email path: only available when the admin has made email optional and
    // the player left it blank. Creates a roster-only profile (no login).
    if (!requireEmail && !email.trim()) {
      setLoading(true);
      const res = await fetch('/api/auth/register-managed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, skill_level: skillLevel }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }
      router.push('/tournaments?registered=1');
      router.refresh();
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);

    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase
        .from('profiles')
        .update({ skill_level: parseFloat(skillLevel), display_name: displayName })
        .eq('id', data.user.id);
    }

    router.push('/tournaments');
    router.refresh();
  };

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
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email{!requireEmail && <span className="text-gray-400 font-normal"> (optional)</span>}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required={requireEmail}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {!requireEmail && (
                <p className="text-xs text-gray-400 mt-1">
                  No email? Leave this blank to join the roster — an admin will add you to tournaments.
                </p>
              )}
            </div>

            {/* Password is only needed when registering with an email (login account). */}
            {(requireEmail || email.trim() !== '') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            )}

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

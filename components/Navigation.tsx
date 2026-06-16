'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types/app';

interface NavigationProps {
  user: Profile | null;
}

export default function Navigation({ user }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const navLinks = [
    { href: '/tournaments', label: 'Tournaments' },
    ...(user?.is_admin ? [{ href: '/tournaments/new', label: 'Create Tournament' }] : []),
  ];

  return (
    <nav className="bg-green-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <span className="text-yellow-400 text-2xl">🥒</span>
            <span>PickleBracket</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-yellow-400 ${
                  pathname?.startsWith(link.href) ? 'text-yellow-400' : 'text-green-100'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-green-200 text-sm">{user.display_name}</span>
                {user.is_admin && (
                  <span className="bg-yellow-500 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
                    ADMIN
                  </span>
                )}
                <button
                  onClick={handleSignOut}
                  className="bg-green-700 hover:bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth/login"
                  className="text-green-100 hover:text-yellow-400 text-sm font-medium transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="bg-yellow-500 hover:bg-yellow-400 text-yellow-900 text-sm font-bold px-4 py-1.5 rounded-lg transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-green-100 hover:bg-green-700"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-green-900 border-t border-green-700 px-4 py-3 space-y-2">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-green-100 hover:text-yellow-400 py-1"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {user ? (
            <>
              <p className="text-green-400 text-sm pt-2 border-t border-green-700">{user.display_name}</p>
              <button onClick={handleSignOut} className="text-green-100 hover:text-yellow-400 text-sm">
                Sign Out
              </button>
            </>
          ) : (
            <div className="pt-2 border-t border-green-700 space-y-1">
              <Link href="/auth/login" className="block text-green-100" onClick={() => setMenuOpen(false)}>Sign In</Link>
              <Link href="/auth/register" className="block text-yellow-400 font-medium" onClick={() => setMenuOpen(false)}>Register</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

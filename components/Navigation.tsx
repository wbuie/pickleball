'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import BrandMark from '@/components/BrandMark';
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
    ...(user?.is_admin
      ? [
          { href: '/tournaments/new', label: 'Create Tournament' },
          { href: '/admin', label: 'Admin' },
        ]
      : []),
  ];

  return (
    <nav className="bg-brand-800 text-white shadow-lg print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <BrandMark className="w-7 h-7 text-accent-400" />
            <span>CFC Sports Tournaments</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-accent-400 ${
                  pathname?.startsWith(link.href) ? 'text-accent-400' : 'text-brand-100'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-brand-200 text-sm">{user.display_name}</span>
                {user.is_admin && (
                  <span className="bg-accent-500 text-accent-900 text-xs font-bold px-2 py-0.5 rounded-full">
                    ADMIN
                  </span>
                )}
                <button
                  onClick={handleSignOut}
                  className="bg-brand-700 hover:bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth/login"
                  className="text-brand-100 hover:text-accent-400 text-sm font-medium transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="bg-accent-500 hover:bg-accent-400 text-accent-900 text-sm font-bold px-4 py-1.5 rounded-lg transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-brand-100 hover:bg-brand-700"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
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
        <div className="md:hidden bg-brand-900 border-t border-brand-700 px-4 py-3 space-y-2">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-brand-100 hover:text-accent-400 py-1"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {user ? (
            <>
              <p className="text-brand-400 text-sm pt-2 border-t border-brand-700">{user.display_name}</p>
              <button onClick={handleSignOut} className="text-brand-100 hover:text-accent-400 text-sm">
                Sign Out
              </button>
            </>
          ) : (
            <div className="pt-2 border-t border-brand-700 space-y-1">
              <Link href="/auth/login" className="block text-brand-100" onClick={() => setMenuOpen(false)}>Sign In</Link>
              <Link href="/auth/register" className="block text-accent-400 font-medium" onClick={() => setMenuOpen(false)}>Register</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

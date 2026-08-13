'use client';

import { useEffect } from 'react';

// Supabase password-recovery links carry the session as a URL hash (implicit
// flow). If the project's redirect allowlist doesn't match the requested
// `/auth/reset` target, Supabase falls back to the Site URL — dropping the user
// on the site root holding a recovery token with no way to use it. Mounted
// app-wide, this forwards any stray recovery hash to /auth/reset (preserving the
// hash so the reset page can establish the session), making the flow resilient
// to that misconfiguration.
export default function RecoveryHashRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const { hash, pathname } = window.location;
    if (pathname === '/auth/reset') return;

    // Only act on password-recovery links — never generic hashes or other auth
    // flows (magic link, OAuth) that should land on their own destinations.
    const isRecovery = hash.includes('type=recovery') && hash.includes('access_token');
    if (isRecovery) {
      window.location.replace(`/auth/reset${hash}`);
    }
  }, []);

  return null;
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Send the user back to the login page with a human-readable reason so failures
// (expired link, wrong browser, misconfigured redirect) are visible instead of
// silently dropping them on a generic error.
function loginWithError(origin: string, message: string) {
  return NextResponse.redirect(
    `${origin}/auth/login?error=${encodeURIComponent(message)}`
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/tournaments';

  const supabase = await createClient();

  // Two shapes of link reach this route depending on the Supabase email
  // template: the PKCE templates send a `?code` to exchange for a session,
  // while the OTP templates ({{ .TokenHash }}) link straight here with a
  // `token_hash` + `type`. Support both so recovery works regardless of which
  // template the project has configured.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return loginWithError(origin, error.message);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return loginWithError(origin, error.message);
  }

  return loginWithError(
    origin,
    'This link is missing its verification token. Request a new one and open it in the same browser.'
  );
}

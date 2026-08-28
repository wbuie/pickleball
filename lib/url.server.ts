import { headers } from 'next/headers';

/**
 * The absolute, shareable URL for a path on this deployment — the form that has
 * to go into a QR code or an email, where a relative path is meaningless.
 *
 * Derived from the incoming request so it works unchanged on localhost, a
 * preview deploy, and the production domain. Set `NEXT_PUBLIC_SITE_URL` to pin
 * it to a canonical domain instead (useful behind a proxy that rewrites Host,
 * or when previews should still point at production).
 *
 * Server-only: it reads request headers. Client components want `displayUrl`
 * from `lib/url` instead.
 */
export async function absoluteUrl(path: string): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(path, configured).toString();

  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000';
  const protocol =
    requestHeaders.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

  return new URL(path, `${protocol}://${host}`).toString();
}

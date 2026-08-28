// Pure URL helpers, safe on both sides of the client boundary. Building an
// absolute URL needs the request, so that lives in `lib/url.server.ts`.

// A URL with the scheme (and any trailing slash) trimmed off — what you want
// printed under a QR code, where "https://" is noise.
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

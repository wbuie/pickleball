'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface TournamentQrCodeProps {
  // The absolute URL the code points at — a relative path won't scan.
  url: string;
  // Read out by screen readers in place of the code itself.
  title: string;
  className?: string;
}

/**
 * The QR code for a tournament, as an SVG so it stays sharp at any print size.
 *
 * Rendered at a fixed module grid and scaled with CSS by the caller, so the
 * same component serves both the small preview on the edit screen and the
 * full-page printed sign.
 */
export default function TournamentQrCode({ url, title, className }: TournamentQrCodeProps) {
  return (
    <QRCodeSVG
      value={url}
      title={title}
      // Rendered size is set in CSS; this is just the intrinsic size.
      size={512}
      // Medium correction still scans after a scuff or a fold on a printed sign.
      level="M"
      // The quiet zone the spec asks for — scanners need it, and without it a
      // code butted against a border reads unreliably.
      marginSize={4}
      bgColor="#ffffff"
      fgColor="#252e32"
      className={className}
    />
  );
}

/**
 * Copies the tournament link to the clipboard, for sharing it somewhere a
 * printed code can't go — a group text, a bulletin, a slide.
 */
export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      // Clipboard access is denied outside a secure context, and on some
      // in-app browsers — the link is on screen either way.
      setState('failed');
    }
  };

  return (
    <button type="button" onClick={handleCopy} className={className}>
      {state === 'copied' ? 'Copied!' : state === 'failed' ? 'Press ⌘C to copy' : 'Copy link'}
    </button>
  );
}

/** Opens the browser's print dialog for the current page. */
export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      🖨️ Print
    </button>
  );
}

'use client';

import { useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';

interface TournamentQrCodeProps {
  // The absolute URL the code points at — a relative path won't scan.
  url: string;
  // Read out by screen readers in place of the code itself.
  title: string;
  className?: string;
}

// One definition of what the code looks like, shared by the on-screen sign and
// every downloaded copy, so a flyer can't end up with a different code than the
// wall sign.
const CODE_SETTINGS = {
  // Medium correction still scans after a scuff or a fold on a printed sign.
  level: 'M',
  // The quiet zone the spec asks for — scanners need it, and without it a code
  // butted against a border or a photo reads unreliably.
  marginSize: 4,
  bgColor: '#ffffff',
  fgColor: '#252e32',
} as const;

// Resolution of a downloaded PNG. Big enough to stay crisp across a printed
// half-page; anyone needing more should take the SVG.
const DOWNLOAD_PIXELS = 1024;

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
      {...CODE_SETTINGS}
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

// Turn a tournament name into a filename someone can find later in Downloads.
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'tournament';
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * Downloads the code on its own — for dropping into a flyer, a slide, or a
 * social post, where the full printed sign doesn't fit.
 *
 * Renders its own off-screen copies rather than reading the visible sign, so
 * the file is always at download resolution no matter how the sign is scaled.
 * SVG is the one to reach for (vector, any size); PNG is there because plenty
 * of tools still won't take an SVG.
 */
export function QrDownloadButtons({
  url,
  baseName,
  className,
}: {
  url: string;
  // Human name of the tournament — becomes the filename.
  baseName: string;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');

  const filename = (extension: string) => `${slugify(baseName)}-qr.${extension}`;

  const downloadSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    // XMLSerializer emits the SVG namespace declaration, so the result opens as
    // a standalone file rather than only inside a page.
    const markup = new XMLSerializer().serializeToString(svg);
    saveBlob(
      new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], {
        type: 'image/svg+xml',
      }),
      filename('svg')
    );
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError('');
    canvas.toBlob(blob => {
      if (!blob) {
        setError('Your browser blocked the download — the SVG should still work.');
        return;
      }
      saveBlob(blob, filename('png'));
    }, 'image/png');
  };

  return (
    <>
      <button type="button" onClick={downloadPng} className={className}>
        Download PNG
      </button>
      <button type="button" onClick={downloadSvg} className={className}>
        Download SVG
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}

      {/* The download sources. Kept out of view (not `display: none`, which
          would leave the canvas unpainted in some browsers) and out of the
          accessibility tree — the visible code above already carries the label. */}
      <div
        aria-hidden
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
      >
        <QRCodeSVG
          ref={svgRef}
          value={url}
          size={DOWNLOAD_PIXELS}
          xmlns="http://www.w3.org/2000/svg"
          {...CODE_SETTINGS}
        />
        <QRCodeCanvas ref={canvasRef} value={url} size={DOWNLOAD_PIXELS} {...CODE_SETTINGS} />
      </div>
    </>
  );
}

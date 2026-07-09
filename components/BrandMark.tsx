// A trophy — the sport-neutral mark for CFC Sports Tournaments.
// Uses `currentColor` so it picks up whatever text color it sits on
// (works on the dark nav/hero and on light cards alike).

interface BrandMarkProps {
  className?: string;
  title?: string;
}

export default function BrandMark({ className, title }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}

      {/* Cup with the two side handles cut out (evenodd) */}
      <path
        fillRule="evenodd"
        d="M18 8h28v4c6 0 10 3 10 9 0 7-5 11-12 12a17 17 0 0 1-8 7v6h-8v-6a17 17 0 0 1-8-7C15 39 10 35 10 28c0-6 4-9 10-9V8zm28 8v11c4-1 6-4 6-7 0-2-1-4-6-4zM18 16c-5 0-6 2-6 4 0 3 2 6 6 7V16z"
      />

      {/* Stem and base */}
      <rect x="28" y="46" width="8" height="6" />
      <rect x="20" y="52" width="24" height="5" rx="2" />
    </svg>
  );
}

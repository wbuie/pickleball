// Crossed pickleball paddles with a holed ball — the league mark.
// Uses `currentColor` so it picks up whatever text color it sits on
// (works on the dark nav/hero and on light cards alike).

interface PickleballMarkProps {
  className?: string;
  title?: string;
}

// A ball as a single evenodd path: outer disc with the holes cut out, so the
// background shows through regardless of what's behind it.
const ball = (cx: number, cy: number, r: number, holes: [number, number][], hr: number) => {
  const circle = (x: number, y: number, rad: number) =>
    `M${x - rad} ${y}a${rad} ${rad} 0 1 0 ${rad * 2} 0a${rad} ${rad} 0 1 0 ${-rad * 2} 0Z`;
  return circle(cx, cy, r) + holes.map(([x, y]) => circle(x, y, hr)).join('');
};

export default function PickleballMark({ className, title }: PickleballMarkProps) {
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

      {/* Two crossed paddles */}
      <g transform="rotate(-37 32 46)">
        <ellipse cx="32" cy="22" rx="12" ry="15" />
        <rect x="28.5" y="33" width="7" height="22" rx="3.5" />
      </g>
      <g transform="rotate(37 32 46)">
        <ellipse cx="32" cy="22" rx="12" ry="15" />
        <rect x="28.5" y="33" width="7" height="22" rx="3.5" />
      </g>

      {/* Ball with holes, nestled between the paddle heads */}
      <path
        fillRule="evenodd"
        d={ball(
          32,
          13.5,
          6.5,
          [
            [32, 10],
            [28.8, 12.8],
            [35.2, 12.8],
            [30, 16],
            [34, 16],
            [32, 13.7],
          ],
          1.15
        )}
      />
    </svg>
  );
}

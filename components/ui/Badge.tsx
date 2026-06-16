import type { TournamentStatus, MatchStatus } from '@/lib/types/app';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'green' | 'yellow' | 'blue' | 'gray' | 'red' | 'orange';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'gray', size = 'sm' }: BadgeProps) {
  const colors = {
    green: 'bg-green-100 text-green-800 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
  };
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${colors[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}

export function SkillBadge({ level }: { level: number | null }) {
  if (!level) return <Badge variant="gray">Unrated</Badge>;
  const variant =
    level >= 4.5 ? 'red' :
    level >= 4.0 ? 'orange' :
    level >= 3.0 ? 'blue' :
    'green';
  return <Badge variant={variant}>{level.toFixed(1)}</Badge>;
}

export function StatusBadge({ status }: { status: TournamentStatus }) {
  const config: Record<TournamentStatus, { label: string; variant: BadgeProps['variant'] }> = {
    registration: { label: 'Registration Open', variant: 'green' },
    seeding: { label: 'Seeding', variant: 'yellow' },
    active: { label: 'In Progress', variant: 'blue' },
    completed: { label: 'Completed', variant: 'gray' },
  };
  const { label, variant } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const config: Record<MatchStatus, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'Pending', variant: 'gray' },
    bye: { label: 'Bye', variant: 'yellow' },
    in_progress: { label: 'Live', variant: 'blue' },
    completed: { label: 'Final', variant: 'green' },
  };
  const { label, variant } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

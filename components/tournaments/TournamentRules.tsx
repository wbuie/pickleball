import Link from 'next/link';
import { parseRules, hasRules } from '@/lib/rules';

interface TournamentRulesProps {
  rules: string | null;
  // Admins get a prompt (and a link) when nothing has been posted yet; players
  // just don't see the section at all.
  tournamentId: string;
  isAdmin?: boolean;
}

// Rules run long, so only the opening sections are shown up front and the rest
// sits behind a native <details> toggle — no client JS for a page that's mostly
// static.
const PREVIEW_BLOCKS = 4;

function Blocks({ blocks }: { blocks: ReturnType<typeof parseRules> }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h3 key={i} className="text-sm font-bold uppercase tracking-wide text-brand-700 mt-4 first:mt-0">
                {block.text}
              </h3>
            );
          case 'bullets':
            return (
              <ul key={i} className="mt-2 space-y-1.5 list-disc pl-5 marker:text-brand-300">
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm text-gray-700 leading-relaxed">{item}</li>
                ))}
              </ul>
            );
          case 'steps':
            return (
              <ol key={i} className="mt-2 space-y-1.5 list-decimal pl-5 marker:text-brand-400 marker:font-semibold">
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm text-gray-700 leading-relaxed">{item}</li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i} className="mt-2 text-sm text-gray-700 leading-relaxed">{block.text}</p>
            );
        }
      })}
    </>
  );
}

/**
 * "How this tournament plays" — the rules and regulations an organizer posted,
 * shown on the tournament page so players can read them before they step on
 * the court.
 */
export default function TournamentRules({ rules, tournamentId, isAdmin = false }: TournamentRulesProps) {
  if (!hasRules(rules)) {
    if (!isAdmin) return null;
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-dashed border-brand-200 p-5 mb-6">
        <h2 className="font-bold text-gray-900 text-lg">Rules &amp; Regulations</h2>
        <p className="text-sm text-gray-500 mt-1">
          No rules posted yet — players won&rsquo;t see this section until you add them.{' '}
          <Link href={`/tournaments/${tournamentId}/edit`} className="text-brand-700 font-medium hover:underline">
            Add the rules
          </Link>{' '}
          (the form can start you off with the standard ones for this sport).
        </p>
      </div>
    );
  }

  const blocks = parseRules(rules);
  const preview = blocks.slice(0, PREVIEW_BLOCKS);
  const rest = blocks.slice(PREVIEW_BLOCKS);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-gray-900 text-xl">📋 Rules &amp; Regulations</h2>
        {isAdmin && (
          <Link
            href={`/tournaments/${tournamentId}/edit`}
            className="text-sm text-brand-700 font-medium hover:underline"
          >
            Edit rules
          </Link>
        )}
      </div>

      <div className="mt-4">
        <Blocks blocks={preview} />
      </div>

      {rest.length > 0 && (
        <details className="group mt-1">
          <summary className="mt-3 inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-600 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Read all the rules</span>
            <span className="hidden group-open:inline">Show less</span>
            <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Blocks blocks={rest} />
          </div>
        </details>
      )}
    </section>
  );
}

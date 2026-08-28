'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EventType, Sport, TournamentFormat } from '@/lib/types/app';
import { SPORT_EVENT_TYPES, SPORT_LABELS, EVENT_LABELS, MIN_COURTS, MAX_COURTS } from '@/lib/types/app';

export interface TournamentFormValues {
  name: string;
  description: string | null;
  sport: Sport;
  format: TournamentFormat;
  event_type: EventType;
  max_players: number;
  court_count: number;
  start_date: string | null;
  location: string | null;
}

// Human hint for what one entry is in each event.
const EVENT_HINTS: Record<EventType, string> = {
  singles: 'one player per entry',
  doubles: 'two-player teams',
  '3v3': 'three-player teams',
  '4v4': 'four-player teams',
  '5v5': 'five-player teams',
};

interface TournamentFormProps {
  mode: 'create' | 'edit';
  tournamentId?: string;
  initial?: Partial<TournamentFormValues>;
  // When the bracket is already generated, structural fields (event, format,
  // size) can't change — they'd invalidate the existing matches.
  structuralLocked?: boolean;
  // Lowest allowed max-entries value (can't drop below the current sign-ups).
  minMaxPlayers?: number;
}

const MAX_OPTIONS = [4, 8, 16, 32, 64];

export default function TournamentForm({
  mode,
  tournamentId,
  initial,
  structuralLocked = false,
  minMaxPlayers = 0,
}: TournamentFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sport, setSport] = useState<Sport>(initial?.sport ?? 'pickleball');
  const eventOptions = SPORT_EVENT_TYPES[sport];
  // Keep the event valid for the selected sport (default to that sport's first).
  const [eventType, setEventType] = useState<EventType>(
    initial?.event_type && SPORT_EVENT_TYPES[initial?.sport ?? 'pickleball'].includes(initial.event_type)
      ? initial.event_type
      : SPORT_EVENT_TYPES[initial?.sport ?? 'pickleball'][0]
  );

  const handleSportChange = (next: Sport) => {
    setSport(next);
    if (!SPORT_EVENT_TYPES[next].includes(eventType)) {
      setEventType(SPORT_EVENT_TYPES[next][0]);
    }
  };

  const isEdit = mode === 'edit';
  const maxOptions = initial?.max_players && !MAX_OPTIONS.includes(initial.max_players)
    ? [initial.max_players, ...MAX_OPTIONS].sort((a, b) => a - b)
    : MAX_OPTIONS;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const form = new FormData(e.currentTarget);
    // Locked fields are rendered disabled, so the browser leaves them out of the
    // form data entirely — send them only when they're actually editable, rather
    // than shipping nulls the API would reject.
    const structural = structuralLocked
      ? {}
      : {
          sport: form.get('sport'),
          format: form.get('format'),
          event_type: form.get('event_type'),
          max_players: parseInt(form.get('max_players') as string),
        };
    const data = {
      name: form.get('name'),
      description: form.get('description'),
      ...structural,
      court_count: parseInt(form.get('court_count') as string) || 1,
      start_date: form.get('start_date') || null,
      location: form.get('location') || null,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/tournaments/${tournamentId}` : '/api/tournaments',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || `Failed to ${isEdit ? 'save' : 'create'} tournament`);
      }

      const json = await res.json();
      const goId = isEdit ? tournamentId : json.tournament.id;
      router.push(`/tournaments/${goId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {isEdit ? 'Edit Tournament' : 'Create Tournament'}
        </h1>
        <p className="text-gray-500 mt-1">
          {isEdit ? 'Update the details for this tournament' : 'Set up a new tournament'}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="t-name" className="block text-sm font-medium text-gray-700 mb-1">
              Tournament Name <span className="text-red-500">*</span>
            </label>
            <input
              id="t-name"
              name="name"
              type="text"
              placeholder="Spring Open 2025"
              required
              defaultValue={initial?.name ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="t-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              id="t-description"
              name="description"
              placeholder="Details about the tournament, rules, prizes, etc."
              rows={3}
              defaultValue={initial?.description ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
          </div>

          {structuralLocked && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              The bracket has been generated, so the sport, event, format, and size are locked. You can
              still update the name, description, date, location, and number of courts.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="t-sport" className="block text-sm font-medium text-gray-700 mb-1">
                Sport <span className="text-red-500">*</span>
              </label>
              <select
                id="t-sport"
                name="sport"
                required
                disabled={structuralLocked}
                value={sport}
                onChange={e => handleSportChange(e.target.value as Sport)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                {(Object.keys(SPORT_LABELS) as Sport[]).map(s => (
                  <option key={s} value={s}>{SPORT_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="t-event-type" className="block text-sm font-medium text-gray-700 mb-1">
                Event <span className="text-red-500">*</span>
              </label>
              <select
                id="t-event-type"
                name="event_type"
                required
                disabled={structuralLocked}
                value={eventType}
                onChange={e => setEventType(e.target.value as EventType)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                {eventOptions.map(ev => (
                  <option key={ev} value={ev}>{EVENT_LABELS[ev]} ({EVENT_HINTS[ev]})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="t-format" className="block text-sm font-medium text-gray-700 mb-1">
                Format <span className="text-red-500">*</span>
              </label>
              <select
                id="t-format"
                name="format"
                required
                disabled={structuralLocked}
                defaultValue={initial?.format ?? 'single_elimination'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="single_elimination">Single Elimination</option>
                <option value="double_elimination">Double Elimination</option>
              </select>
            </div>

            <div>
              <label htmlFor="t-max-players" className="block text-sm font-medium text-gray-700 mb-1">
                Max Entries <span className="text-red-500">*</span>
              </label>
              <select
                id="t-max-players"
                name="max_players"
                required
                disabled={structuralLocked}
                defaultValue={String(initial?.max_players ?? 16)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                {maxOptions.map(n => (
                  <option key={n} value={n} disabled={n < minMaxPlayers}>
                    {n} entries{n < minMaxPlayers ? ' — below sign-ups' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Players for singles, teams for doubles</p>
            </div>
          </div>

          <div>
            <label htmlFor="t-court-count" className="block text-sm font-medium text-gray-700 mb-1">
              Courts <span className="text-red-500">*</span>
            </label>
            <input
              id="t-court-count"
              name="court_count"
              type="number"
              min={MIN_COURTS}
              max={MAX_COURTS}
              step={1}
              required
              defaultValue={initial?.court_count ?? 1}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              How many courts you&rsquo;ll play on. Matches are handed a court number as they come up,
              so everyone knows where to go — change this any time if courts open up or go away.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="t-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                id="t-start-date"
                name="start_date"
                type="date"
                defaultValue={initial?.start_date ?? ''}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="t-location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                id="t-location"
                name="location"
                type="text"
                placeholder="City Park Courts"
                defaultValue={initial?.location ?? ''}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-brand-700 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Changes' : 'Create Tournament'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

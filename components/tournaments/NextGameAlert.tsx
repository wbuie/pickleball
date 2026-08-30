'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { BracketEntry, Match } from '@/lib/types/app';
import { isPlayable } from '@/lib/bracket/courts';

interface NextGameAlertProps {
  tournamentId: string;
  matches: Match[];
  entries: BracketEntry[];
  // The signed-in viewer's own entry, when there is one — it pre-selects the
  // picker so they don't have to find themselves in the list.
  defaultEntryId?: string;
}

interface Watch {
  entryId: string;
  // The match we last called out, so a reload doesn't announce it twice.
  notifiedMatchId: string | null;
}

// Remembering the choice matters more than it looks: most people arrive by
// scanning the code, never sign in, and reload the page repeatedly through the
// day. Losing the pick on every reload would make the feature useless.
const storageKey = (tournamentId: string) => `cfc:next-game:${tournamentId}`;

// A tiny store over localStorage, read through useSyncExternalStore so there's
// no setState-in-an-effect and no hydration mismatch: the server (and the first
// client render) see nothing, then the saved watch reconciles in.
const listeners = new Set<() => void>();
// getSnapshot has to return a stable reference or React re-renders forever, so
// the parsed value is cached against the raw string it came from.
let cachedRaw: string | null = null;
let cachedWatch: Watch | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab (a second phone, a reopened page) writing the same key.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readWatch(tournamentId: string): Watch | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(tournamentId));
  } catch {
    // Private mode or blocked storage — behave as if nothing was saved.
    return null;
  }
  if (raw === cachedRaw) return cachedWatch;
  cachedRaw = raw;
  cachedWatch = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Watch>;
      if (typeof parsed?.entryId === 'string') {
        cachedWatch = { entryId: parsed.entryId, notifiedMatchId: parsed.notifiedMatchId ?? null };
      }
    } catch {
      // Something else wrote nonsense under this key; ignore it.
    }
  }
  return cachedWatch;
}

function saveWatch(tournamentId: string, watch: Watch | null) {
  try {
    if (watch) {
      window.localStorage.setItem(storageKey(tournamentId), JSON.stringify(watch));
    } else {
      window.localStorage.removeItem(storageKey(tournamentId));
    }
  } catch {
    // Nothing to do — the alert still works for this visit, just not the next.
  }
  // Update the cache directly: a blocked write shouldn't strand the UI on a
  // value it can't read back.
  cachedRaw = watch ? JSON.stringify(watch) : null;
  cachedWatch = watch;
  listeners.forEach(notify => notify());
}

function useWatch(tournamentId: string): Watch | null {
  return useSyncExternalStore(
    subscribe,
    () => readWatch(tournamentId),
    () => null
  );
}

// Two rising notes, synthesized rather than shipped as an audio file: it's a
// few lines, adds no asset to load, and carries across a noisy gym.
function playChime(ctx: AudioContext) {
  const start = ctx.currentTime;
  [880, 1174.7].forEach((frequency, i) => {
    const at = start + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    // Ramps rather than steps — a square-edged gain change clicks.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.2);
  });
}

/**
 * "Tell me when I'm up next" for whoever is looking at the tournament page.
 *
 * Most players never sign in — they scan the code at the door — so this asks who
 * they are rather than assuming, and keeps the answer in localStorage. From then
 * on, whenever their next match is handed a court, the page chimes, buzzes,
 * shows a banner, and (where the browser allows it) raises a real notification.
 *
 * It rides the realtime refresh the bracket already subscribes to: a scored
 * match re-renders the page, new props arrive here, and the effect below notices
 * that this entry now has a court.
 *
 * What it can't do is reach a phone asleep in a pocket. Browsers suspend
 * backgrounded tabs and drop the socket, and iOS offers no web notifications at
 * all outside an installed home-screen app. Hence the keep-the-screen-on option
 * and the plain wording below: this is a good heads-up for someone watching the
 * page, not a pager.
 */
export default function NextGameAlert({
  tournamentId,
  matches,
  entries,
  defaultEntryId,
}: NextGameAlertProps) {
  const watch = useWatch(tournamentId);
  const [choice, setChoice] = useState(defaultEntryId ?? '');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [keepAwake, setKeepAwake] = useState(false);
  const [audio, setAudio] = useState<AudioContext | null>(null);

  const entryId = watch?.entryId ?? null;
  const live = matches.filter(isPlayable);
  const myMatch = entryId
    ? live.find(m => m.player1_id === entryId || m.player2_id === entryId)
    : undefined;
  const myEntryName = entryId ? entries.find(e => e.id === entryId)?.display_name : undefined;

  // Nothing pending, everything they were in is finished, and they lost one of
  // them: their day is done, and "we'll chime as soon as a court is called"
  // would be a promise this can't keep. Someone still waiting on an opponent to
  // be decided has a pending match, so they don't land here.
  const myMatches = entryId
    ? matches.filter(m => m.player1_id === entryId || m.player2_id === entryId)
    : [];
  const knockedOut =
    !myMatch &&
    myMatches.length > 0 &&
    myMatches.every(m => m.status === 'completed' || m.status === 'bye') &&
    myMatches.some(m => m.loser_id === entryId);

  // Keeping the screen on is the difference between a phone propped on a bench
  // still showing the board and one that's long since gone dark. The browser
  // drops the lock whenever the tab is hidden, so it has to be retaken when the
  // page comes back.
  const acquireWakeLock = useCallback(async (): Promise<WakeLockSentinel | null> => {
    if (!('wakeLock' in navigator)) return null;
    try {
      return await navigator.wakeLock.request('screen');
    } catch {
      // Denied, low battery, or not visible — nothing here depends on it.
      return null;
    }
  }, []);

  useEffect(() => {
    if (!keepAwake) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const take = async () => {
      const next = await acquireWakeLock();
      if (cancelled) next?.release().catch(() => {});
      else sentinel = next;
    };
    take();

    const onVisible = () => {
      if (document.visibilityState === 'visible') take();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [keepAwake, acquireWakeLock]);

  // The alert itself: fires once per match, the moment it has a court. Writing
  // the match id back into the watch is what stops it firing twice — and what
  // keeps it quiet across a reload.
  useEffect(() => {
    if (!watch || !myMatch || myMatch.court === null) return;
    if (watch.notifiedMatchId === myMatch.id) return;

    saveWatch(tournamentId, { entryId: watch.entryId, notifiedMatchId: myMatch.id });

    const body = `${myEntryName ?? 'You'} — Court ${myMatch.court}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification("You're up next", { body, tag: `next-game-${tournamentId}` });
      } catch {
        // Some browsers only allow notifications from a service worker; the
        // chime and the banner still land.
      }
    }
    if (audio) {
      audio.resume().then(() => playChime(audio)).catch(() => {});
    }
    navigator.vibrate?.([200, 100, 200]);
  }, [watch, myMatch, myEntryName, tournamentId, audio]);

  const arm = async () => {
    if (!choice) return;

    // Both of these have to happen inside the tap: a permission prompt is only
    // allowed from a user gesture, and an AudioContext created any other way
    // starts suspended and stays silent on mobile.
    if ('Notification' in window) {
      try {
        setPermission(await Notification.requestPermission());
      } catch {
        setPermission(Notification.permission);
      }
    }
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      setAudio(ctx);
    } catch {
      // No audio — the banner and the vibration still work.
    }

    // Don't announce the game they're already standing on a court for; start
    // watching from whatever comes next.
    const current = live.find(m => m.player1_id === choice || m.player2_id === choice);
    saveWatch(tournamentId, {
      entryId: choice,
      notifiedMatchId: current?.court != null ? current.id : null,
    });
  };

  const stop = () => {
    setChoice(entryId ?? defaultEntryId ?? '');
    setKeepAwake(false);
    saveWatch(tournamentId, null);
  };

  if (entries.length === 0) return null;

  // Nobody watching yet: the invitation.
  if (!watch) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5 mb-6">
        <h2 className="font-bold text-gray-900">Get told when you&rsquo;re up</h2>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Pick your name and this page will chime and light up the moment your court is called. No
          sign-in needed — just leave the page open.
        </p>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="next-game-entry" className="sr-only">
            Which entry are you?
          </label>
          <select
            id="next-game-entry"
            value={choice}
            onChange={e => setChoice(e.target.value)}
            className="flex-1 min-w-[10rem] border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Who are you?</option>
            {entries.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.display_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={arm}
            disabled={!choice}
            className="bg-brand-700 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            🔔 Notify me
          </button>
        </div>
      </div>
    );
  }

  // Watching. The banner takes over once their court has actually been called —
  // which is exactly the match we announced, still on a court.
  const called = myMatch?.court != null && watch.notifiedMatchId === myMatch.id;

  return (
    <div
      className={`rounded-2xl shadow-sm border p-5 mb-6 ${
        called ? 'bg-accent-50 border-accent-300' : 'bg-white border-brand-100'
      }`}
    >
      {called ? (
        <>
          <p className="text-accent-900 font-extrabold text-2xl">
            You&rsquo;re up on Court {myMatch?.court}
          </p>
          <p className="text-accent-800 text-sm mt-0.5">{myEntryName} — head over now.</p>
        </>
      ) : (
        <>
          <p className="font-bold text-gray-900">
            {myMatch
              ? 'Waiting for a court'
              : knockedOut
              ? 'No more games'
              : 'Watching for your next game'}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {myMatch
              ? `${myEntryName} is on deck — we'll chime when a court frees up.`
              : knockedOut
              ? `${myEntryName} is out of the draw — thanks for playing! The bracket below keeps going.`
              : `Nothing on for ${myEntryName} yet. We'll chime as soon as a court is called.`}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={keepAwake}
            onChange={e => setKeepAwake(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-500"
          />
          Keep this screen on
        </label>
        <button
          type="button"
          onClick={stop}
          className="text-sm text-gray-500 underline hover:text-gray-700"
        >
          Stop watching
        </button>
      </div>

      {permission === 'denied' && (
        <p className="text-xs text-gray-400 mt-2">
          Notifications are blocked for this site, so the chime and this banner are what you&rsquo;ll
          get. Keep the page open.
        </p>
      )}
      {permission === 'unsupported' && (
        <p className="text-xs text-gray-400 mt-2">
          Your browser won&rsquo;t show notifications from a web page (iPhones don&rsquo;t, unless the
          page is added to the Home Screen), so keep this page open — it&rsquo;ll chime and buzz
          instead.
        </p>
      )}
    </div>
  );
}

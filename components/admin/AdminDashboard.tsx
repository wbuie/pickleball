'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SkillBadge, BasketballBadge } from '@/components/ui/Badge';
import { SKILL_LEVELS, BASKETBALL_SKILL_LEVELS } from '@/lib/types/app';
import type { AdminEmail, AppSettings, Profile } from '@/lib/types/app';

interface Props {
  settings: AppSettings;
  players: Profile[];
  adminEmails: AdminEmail[];
  currentUserEmail: string | null;
  currentUserId: string;
}

type RatingField = 'pickleball' | 'basketball';

export default function AdminDashboard({
  settings,
  players,
  adminEmails,
  currentUserEmail,
  currentUserId,
}: Props) {
  const router = useRouter();

  const [requireEmail, setRequireEmail] = useState(settings.require_email);
  const [savingSetting, setSavingSetting] = useState(false);

  const [name, setName] = useState('');
  const [skill, setSkill] = useState('3.0');
  const [bball, setBball] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // Admin allowlist.
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);

  // Inline rating editing — one player + one field (pickleball or basketball).
  const [editing, setEditing] = useState<{ id: string; field: RatingField } | null>(null);
  const [ratingDraft, setRatingDraft] = useState('3.0');
  const [savingRating, setSavingRating] = useState(false);

  const [error, setError] = useState('');

  const managedCount = players.filter(p => p.is_managed).length;

  // Emails that already have a profile (lowercased), to annotate the allowlist.
  const emailToProfile = new Map<string, Profile>();
  players.forEach(p => {
    if (p.email) emailToProfile.set(p.email.toLowerCase(), p);
  });

  const toggleEmail = async (value: boolean) => {
    setSavingSetting(true);
    setError('');
    setRequireEmail(value);

    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ require_email: value }),
    });

    if (!res.ok) {
      setRequireEmail(!value);
      const data = await res.json();
      setError(data.error || 'Failed to update setting');
    } else {
      router.refresh();
    }
    setSavingSetting(false);
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAddingPlayer(true);
    setError('');

    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: name.trim(),
        skill_level: skill,
        ...(bball ? { basketball_skill_level: bball } : {}),
      }),
    });

    if (res.ok) {
      setName('');
      setSkill('3.0');
      setBball('');
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to add player');
    }
    setAddingPlayer(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg('');
    setError('');

    try {
      const text = await file.text();
      const res = await fetch('/api/players/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json();

      if (res.ok) {
        const skipped = (data.errors as string[] | undefined)?.length ?? 0;
        setImportMsg(
          `Imported ${data.imported} player${data.imported === 1 ? '' : 's'}.` +
            (skipped ? ` ${skipped} row${skipped === 1 ? '' : 's'} skipped.` : '')
        );
        router.refresh();
      } else {
        setError(data.error || 'Import failed');
      }
    } catch {
      setError('Could not read the file');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = adminEmailInput.trim();
    if (!email) return;
    setAddingAdmin(true);
    setError('');
    const res = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setAdminEmailInput('');
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to add admin');
    }
    setAddingAdmin(false);
  };

  const handleRemoveAdmin = async (email: string) => {
    if (!confirm(`Remove admin access for ${email}?`)) return;
    setError('');
    const res = await fetch('/api/admin/admins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to remove admin');
    }
  };

  const handleToggleAdmin = async (id: string, makeAdmin: boolean) => {
    if (!makeAdmin && !confirm('Remove admin access from this person?')) return;
    setError('');
    const res = await fetch(`/api/players/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: makeAdmin }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update admin access');
    }
  };

  const startEdit = (p: Profile, field: RatingField) => {
    setError('');
    setEditing({ id: p.id, field });
    if (field === 'pickleball') {
      setRatingDraft((p.skill_level ?? 3.0).toFixed(1));
    } else {
      setRatingDraft(String(p.basketball_skill_level ?? 3));
    }
  };

  const handleSaveRating = async (id: string) => {
    if (!editing) return;
    setSavingRating(true);
    setError('');
    const payload =
      editing.field === 'pickleball'
        ? { skill_level: ratingDraft }
        : { basketball_skill_level: ratingDraft };
    const res = await fetch(`/api/players/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setEditing(null);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update rating');
    }
    setSavingRating(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this player? This cannot be undone.')) return;
    setError('');
    const res = await fetch(`/api/players/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to remove player');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">League Admin</h1>
      <p className="text-gray-500 text-sm mb-6">Settings, admins, and player roster</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Email requirement */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Registration</h2>
        <div className="flex items-start justify-between gap-4 mt-3">
          <div>
            <p className="font-medium text-gray-800 text-sm">Require an email to register</p>
            <p className="text-gray-500 text-xs mt-0.5 max-w-sm">
              When off, players can sign up with just a name (no login). You can
              still seed and bracket them like anyone else.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireEmail}
            disabled={savingSetting}
            onClick={() => toggleEmail(!requireEmail)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              requireEmail ? 'bg-brand-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                requireEmail ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Admins */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Admins</h2>
        <p className="text-gray-500 text-xs mb-4">
          Grant admin by email. If the person already has an account they&apos;re promoted right away;
          otherwise they become an admin automatically when they register.
        </p>

        <form onSubmit={handleAddAdmin} className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex-1 min-w-[14rem]">
            <label htmlFor="admin-email" className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              id="admin-email"
              type="email"
              value={adminEmailInput}
              onChange={e => setAdminEmailInput(e.target.value)}
              placeholder="coach@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={addingAdmin || !adminEmailInput.trim()}
            className="bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {addingAdmin ? 'Adding…' : 'Add admin'}
          </button>
        </form>

        {adminEmails.length === 0 ? (
          <p className="text-gray-400 text-sm italic">No admin emails yet</p>
        ) : (
          <div className="space-y-1">
            {adminEmails.map(a => {
              const profile = emailToProfile.get(a.email);
              const isYou = currentUserEmail?.toLowerCase() === a.email;
              return (
                <div key={a.email} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="flex-1 text-sm text-gray-800 truncate">
                    {a.email}
                    {isYou && <span className="ml-2 text-gray-400 text-xs">you</span>}
                  </span>
                  <span className="text-xs text-gray-400">
                    {profile ? 'Registered' : 'Pending — not registered yet'}
                  </span>
                  {isYou ? (
                    <span className="text-xs text-gray-300 px-2 py-1">—</span>
                  ) : (
                    <button
                      onClick={() => handleRemoveAdmin(a.email)}
                      className="text-red-600 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk import */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Import players from a spreadsheet</h2>
        <p className="text-gray-500 text-xs mb-4">
          Upload a <span className="font-medium">.csv</span> file (in Excel, choose{' '}
          <span className="font-medium">File → Save As → CSV</span>). Include a header row with a{' '}
          <code className="bg-gray-100 px-1 rounded">name</code> column; optional{' '}
          <code className="bg-gray-100 px-1 rounded">skill</code> (2.0–5.0),{' '}
          <code className="bg-gray-100 px-1 rounded">basketball</code> (1–5), and{' '}
          <code className="bg-gray-100 px-1 rounded">email</code> columns.
        </p>

        <label className="inline-flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">
          {importing ? 'Importing…' : '📄 Choose CSV file'}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleImport}
            disabled={importing}
            className="hidden"
          />
        </label>

        {importMsg && <p className="text-brand-700 text-sm mt-3">{importMsg}</p>}
      </div>

      {/* Add single player */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Add a player</h2>
        <form onSubmit={handleAddPlayer} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">🏓 Pickleball</label>
            <select
              value={skill}
              onChange={e => setSkill(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {SKILL_LEVELS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">🏀 Basketball</label>
            <select
              value={bball}
              onChange={e => setBball(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Unrated</option>
              {BASKETBALL_SKILL_LEVELS.map(l => (
                <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={addingPlayer || !name.trim()}
            className="bg-white border border-brand-300 text-brand-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50"
          >
            {addingPlayer ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>

      {/* Roster */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            Roster ({players.length})
          </h2>
          <span className="text-xs text-gray-400">{managedCount} added manually</span>
        </div>

        {players.length === 0 && (
          <p className="text-gray-400 text-sm italic">No players yet</p>
        )}

        <div className="space-y-1">
          {players.map(p => {
            const editingPickle = editing?.id === p.id && editing.field === 'pickleball';
            const editingBball = editing?.id === p.id && editing.field === 'basketball';
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-b border-gray-50 last:border-0">
                <span className="flex-1 min-w-[9rem] font-medium text-gray-800 text-sm">
                  {p.display_name}
                  {p.is_admin && (
                    <span className="ml-2 bg-accent-100 text-accent-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle">
                      ADMIN
                    </span>
                  )}
                  {p.is_managed && (
                    <span className="ml-2 text-gray-400 text-xs">roster only</span>
                  )}
                </span>

                {/* Pickleball rating */}
                {editingPickle ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" aria-hidden>🏓</span>
                    <select
                      aria-label={`Pickleball rating for ${p.display_name}`}
                      value={ratingDraft}
                      onChange={e => setRatingDraft(e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {SKILL_LEVELS.map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleSaveRating(p.id)}
                      disabled={savingRating}
                      className="text-xs font-medium text-white bg-brand-700 hover:bg-brand-600 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {savingRating ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      disabled={savingRating}
                      className="text-xs font-medium text-gray-500 hover:bg-gray-100 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(p, 'pickleball')}
                    title="Edit pickleball (DUPR) rating"
                    className="group inline-flex items-center gap-1 rounded transition-colors"
                  >
                    <span className="text-xs" aria-hidden>🏓</span>
                    <SkillBadge level={p.skill_level} />
                    <span className="text-[10px] text-gray-400 group-hover:text-brand-600">edit</span>
                  </button>
                )}

                {/* Basketball rating */}
                {editingBball ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" aria-hidden>🏀</span>
                    <select
                      aria-label={`Basketball rating for ${p.display_name}`}
                      value={ratingDraft}
                      onChange={e => setRatingDraft(e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Unrated</option>
                      {BASKETBALL_SKILL_LEVELS.map(l => (
                        <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleSaveRating(p.id)}
                      disabled={savingRating}
                      className="text-xs font-medium text-white bg-brand-700 hover:bg-brand-600 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {savingRating ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      disabled={savingRating}
                      className="text-xs font-medium text-gray-500 hover:bg-gray-100 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(p, 'basketball')}
                    title="Edit basketball rating"
                    className="group inline-flex items-center gap-1 rounded transition-colors"
                  >
                    <span className="text-xs" aria-hidden>🏀</span>
                    <BasketballBadge level={p.basketball_skill_level} showLabel />
                    <span className="text-[10px] text-gray-400 group-hover:text-brand-600">edit</span>
                  </button>
                )}

                {/* Admin access (login accounts only). You can't demote yourself. */}
                {!p.is_managed && p.id === currentUserId && (
                  <span className="text-gray-400 text-xs">you</span>
                )}
                {!p.is_managed && p.id !== currentUserId && (
                  <button
                    onClick={() => handleToggleAdmin(p.id, !p.is_admin)}
                    className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                      p.is_admin
                        ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                        : 'text-brand-700 hover:bg-brand-50'
                    }`}
                  >
                    {p.is_admin ? 'Remove admin' : 'Make admin'}
                  </button>
                )}
                {p.is_managed && (
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-red-600 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

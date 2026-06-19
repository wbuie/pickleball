'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SkillBadge } from '@/components/ui/Badge';
import { SKILL_LEVELS } from '@/lib/types/app';
import type { AppSettings, Profile } from '@/lib/types/app';

interface Props {
  settings: AppSettings;
  players: Profile[];
}

export default function AdminDashboard({ settings, players }: Props) {
  const router = useRouter();

  const [requireEmail, setRequireEmail] = useState(settings.require_email);
  const [savingSetting, setSavingSetting] = useState(false);

  const [name, setName] = useState('');
  const [skill, setSkill] = useState('3.0');
  const [addingPlayer, setAddingPlayer] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const [error, setError] = useState('');

  const managedCount = players.filter(p => p.is_managed).length;

  const toggleEmail = async (value: boolean) => {
    setSavingSetting(true);
    setError('');
    // Optimistic toggle.
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
      body: JSON.stringify({ display_name: name.trim(), skill_level: skill }),
    });

    if (res.ok) {
      setName('');
      setSkill('3.0');
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
      // Reset the input so the same file can be re-selected.
      e.target.value = '';
    }
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
      <p className="text-gray-500 text-sm mb-6">Settings and player roster</p>

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

      {/* Bulk import */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Import players from a spreadsheet</h2>
        <p className="text-gray-500 text-xs mb-4">
          Upload a <span className="font-medium">.csv</span> file (in Excel, choose{' '}
          <span className="font-medium">File → Save As → CSV</span>). Include a header row with a{' '}
          <code className="bg-gray-100 px-1 rounded">name</code> column; optional{' '}
          <code className="bg-gray-100 px-1 rounded">skill</code> (2.0–5.0) and{' '}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Skill</label>
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
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <span className="flex-1 font-medium text-gray-800 text-sm">
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
              <SkillBadge level={p.skill_level} />
              {p.is_managed && (
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-red-600 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

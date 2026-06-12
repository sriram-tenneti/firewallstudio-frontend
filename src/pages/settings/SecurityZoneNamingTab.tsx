import { useEffect, useState } from 'react';
import * as api from '@/lib/api';

interface SzRow {
  code: string;
  name: string;
  naming_mode?: string;
  description?: string;
}

export default function SecurityZoneNamingTab() {
  const [items, setItems] = useState<SzRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.getSecurityZonesWithMode();
      setItems(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const setMode = async (code: string, mode: 'app_scoped' | 'zone_scoped') => {
    setSavingCode(code);
    try {
      await api.setSecurityZoneNamingMode(code, mode);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Security Zone Naming Mode</h3>
        <p className="text-xs text-gray-500 max-w-2xl">
          <strong>app_scoped</strong> emits per-app egress groups{' '}
          <code className="font-mono">grp-&lt;App&gt;-&lt;NH&gt;-&lt;SZ&gt;</code> for dedicated zones (CCS, CDE, PAA, PSE, UC, Swift, 3PY).{' '}
          <strong>zone_scoped</strong> emits a single shared cluster group{' '}
          <code className="font-mono">grp-&lt;NH&gt;-&lt;SZ&gt;</code> for shared zones (STD, GEN, Shared, UGen, USTD) — collapses redundant per-app
          groups for shared compute clusters.
        </p>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}

      {loading ? (
        <div className="text-xs text-gray-400 italic">Loading…</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Description</th>
                <th className="text-left p-2">Naming Mode</th>
                <th className="text-left p-2">Resulting Group</th>
                <th className="text-right p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((sz) => {
                const mode = sz.naming_mode || 'app_scoped';
                const example = mode === 'zone_scoped'
                  ? `grp-<NH>-${sz.code}`
                  : `grp-<App>-<NH>-${sz.code}`;
                return (
                  <tr key={sz.code} className="border-t border-gray-100">
                    <td className="p-2 font-mono font-semibold">{sz.code}</td>
                    <td className="p-2">{sz.name}</td>
                    <td className="p-2 text-gray-600 max-w-[280px]">{sz.description || '—'}</td>
                    <td className="p-2">
                      <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border font-semibold ${
                        mode === 'zone_scoped'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      }`}>
                        {mode}
                      </span>
                    </td>
                    <td className="p-2 font-mono text-[10px] text-gray-700">{example}</td>
                    <td className="p-2 text-right">
                      <button
                        disabled={savingCode === sz.code}
                        onClick={() => void setMode(sz.code, mode === 'zone_scoped' ? 'app_scoped' : 'zone_scoped')}
                        className="text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50">
                        {savingCode === sz.code ? 'Saving…' : `Switch to ${mode === 'zone_scoped' ? 'app_scoped' : 'zone_scoped'}`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

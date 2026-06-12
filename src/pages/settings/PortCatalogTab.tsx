import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PortCatalogEntry } from '@/lib/api';
import * as api from '@/lib/api';

const PROTOCOLS = ['TCP', 'UDP', 'ICMP'] as const;
const DEFAULT_CATEGORIES = [
  'Web', 'Remote Access', 'File Transfer', 'DNS/Mail', 'Identity',
  'Database', 'Messaging', 'Observability', 'Mainframe/Legacy',
  'Clustering', 'Network Services', 'Custom',
];

const CATEGORY_ACCENT: Record<string, { bg: string; border: string; text: string }> = {
  Web: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
  'Remote Access': { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  'File Transfer': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  'DNS/Mail': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  Identity: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700' },
  Database: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
  Messaging: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  Observability: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
  'Mainframe/Legacy': { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700' },
  Clustering: { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700' },
  'Network Services': { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700' },
  Custom: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
};

const accent = (c: string) => CATEGORY_ACCENT[c] || CATEGORY_ACCENT.Custom;

interface FormState {
  editing: string | null;
  port_id: string;
  name: string;
  protocol: 'TCP' | 'UDP' | 'ICMP';
  port: string;
  aliases: string;
  category: string;
  description: string;
}

const EMPTY: FormState = {
  editing: null, port_id: '', name: '', protocol: 'TCP',
  port: '', aliases: '', category: 'Custom', description: '',
};

export default function PortCatalogTab() {
  const [ports, setPorts] = useState<PortCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listPorts();
      setPorts(list || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => {
    const s = new Set<string>(['All']);
    for (const p of ports) if (p.category) s.add(p.category);
    return Array.from(s);
  }, [ports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ports.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.port_id.toLowerCase().includes(q) ||
        String(p.port).includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.aliases || []).some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [ports, query, category]);

  const startCreate = () => {
    setForm({ ...EMPTY });
    setShowForm(true);
    setError(null);
  };

  const startEdit = (p: PortCatalogEntry) => {
    setForm({
      editing: p.port_id,
      port_id: p.port_id,
      name: p.name,
      protocol: (PROTOCOLS as readonly string[]).includes(p.protocol) ? (p.protocol as 'TCP' | 'UDP' | 'ICMP') : 'TCP',
      port: String(p.port ?? ''),
      aliases: (p.aliases || []).join(', '),
      category: p.category || 'Custom',
      description: p.description || '',
    });
    setShowForm(true);
    setError(null);
  };

  const cancel = () => { setForm(EMPTY); setShowForm(false); setError(null); };

  const save = async () => {
    setError(null);
    const payload: Partial<PortCatalogEntry> = {
      port_id: form.port_id.trim() || undefined,
      name: form.name.trim(),
      protocol: form.protocol,
      port: Number(form.port) || 0,
      aliases: form.aliases.split(',').map((s) => s.trim()).filter(Boolean),
      category: form.category,
      description: form.description,
    };
    if (!payload.name) { setError('Name is required'); return; }
    try {
      if (form.editing) {
        await api.updatePort(form.editing, payload);
      } else {
        await api.createPort(payload);
      }
      await load();
      cancel();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (p: PortCatalogEntry) => {
    if (!window.confirm(`Delete port "${p.name}"?`)) return;
    try {
      await api.deletePort(p.port_id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-sky-50 to-white p-4 flex items-center gap-4 shadow-sm">
        <div className="text-4xl">🔌</div>
        <div className="flex-1">
          <div className="text-lg font-bold text-indigo-900">Port Configuration Catalog</div>
          <div className="text-xs text-indigo-700">
            Well-known + custom ports surfaced in the Rule Builder's port picker. Add enterprise-specific ports (Oracle, MSSQL, MongoDB, DB2, Mainframe, Kafka, MQ, Splunk, …) and everything stays in sync.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center px-3 py-1 rounded-lg bg-white border border-indigo-200">
            <div className="text-[10px] uppercase text-indigo-700 font-semibold">Total</div>
            <div className="text-lg font-bold text-indigo-900">{ports.length}</div>
          </div>
          <button onClick={startCreate}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow">
            + Add Port
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name / number / alias / description…"
          className="flex-1 min-w-[240px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${category === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-indigo-300 bg-white p-4 shadow-md">
          <div className="text-sm font-semibold text-indigo-900 mb-3">
            {form.editing ? `Edit Port · ${form.editing}` : 'Add New Port'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Oracle TNS" className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Protocol</label>
              <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value as 'TCP' | 'UDP' | 'ICMP' })}
                className="w-full border rounded px-2 py-1.5 text-sm">
                {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Port</label>
              <input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })}
                placeholder="e.g. 1521" className="w-full border rounded px-2 py-1.5 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Port ID (optional)</label>
              <input value={form.port_id} onChange={(e) => setForm({ ...form, port_id: e.target.value })}
                placeholder="Auto if blank" disabled={!!form.editing}
                className="w-full border rounded px-2 py-1.5 text-sm font-mono disabled:bg-gray-100" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded px-2 py-1.5 text-sm">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Aliases (comma-separated)</label>
              <input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                placeholder="e.g. tns, oracle-listener" className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          {error && <div className="mt-2 text-xs text-rose-700">{error}</div>}
          <div className="mt-3 flex gap-2 justify-end">
            <button onClick={cancel} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">Cancel</button>
            <button onClick={() => void save()} className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700">
              {form.editing ? 'Save changes' : 'Create port'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-gray-400 text-center py-6">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map((p) => {
            const a = accent(p.category);
            return (
              <div key={p.port_id}
                className={`rounded-xl border ${a.border} ${a.bg} p-3 flex flex-col gap-2 hover:shadow-md transition-all`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white border ${a.border} ${a.text}`}>{p.protocol}</span>
                  <span className="text-lg font-bold text-gray-900 font-mono">{p.port === 0 ? '—' : p.port}</span>
                  <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${a.border} ${a.text} bg-white font-semibold`}>{p.category}</span>
                  <code className="text-[9px] text-gray-500 font-mono truncate">{p.port_id}</code>
                </div>
                {p.description && <div className="text-[11px] text-gray-600 leading-tight">{p.description}</div>}
                {p.aliases && p.aliases.length > 0 && (
                  <div className="text-[10px] text-gray-500">Aliases: {p.aliases.join(', ')}</div>
                )}
                <div className="flex gap-1 mt-auto">
                  <button onClick={() => startEdit(p)}
                    className="flex-1 text-[11px] px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50">Edit</button>
                  <button onClick={() => void remove(p)}
                    className="flex-1 text-[11px] px-2 py-1 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

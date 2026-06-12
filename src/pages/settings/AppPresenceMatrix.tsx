import { useEffect, useMemo, useState } from 'react';
import * as api from '../../lib/api';
import type { AppPresence, Environment, MemberSpec, PortBinding } from '../../types';
import type { PortCatalogEntry } from '../../lib/api';
import { PortBindingsEditor } from './SharedServicesTab';

interface Props {
  appDistributedId: string;
  appId: string;
  environment: Environment;
  onChange?: () => void;
}

/** Presence Matrix — shows all (DC × NH × SZ) presences for an app and lets
 *  users add/edit/delete them. Includes a bulk-paste IP classifier that
 *  auto-creates presences + derived egress/ingress groups. */
export function AppPresenceMatrix({
  appDistributedId,
  appId,
  environment,
  onChange,
}: Props) {
  const [presences, setPresences] = useState<AppPresence[]>([]);
  const [loading, setLoading] = useState(false);
  const [dcs, setDcs] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [neighbourhoods, setNeighbourhoods] = useState<
    Array<{ nh_id: string; name: string; security_zones?: Array<{ zone: string; dc?: string; cidr?: string }> }>
  >([]);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<AppPresence>>({
    app_distributed_id: appDistributedId,
    environment,
    has_ingress: false,
    dc_type: 'NGDC',
  });
  const [egressText, setEgressText] = useState('');
  const [ingressText, setIngressText] = useState('');
  const [ingressStdPortIds, setIngressStdPortIds] = useState<string[]>([]);
  const [ingressAdditionalPorts, setIngressAdditionalPorts] = useState<PortBinding[]>([]);
  const [portCatalog, setPortCatalog] = useState<PortCatalogEntry[]>([]);

  const [bulkText, setBulkText] = useState('');
  const [bulkDir, setBulkDir] = useState<'egress' | 'ingress'>('egress');
  const [bulkDcHint, setBulkDcHint] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    classified: number; unclassified: number; presences: number;
    notes: Array<{ value: string; dc: string; nh: string; sz: string }>;
    misses: Array<{ value: string; reason: string }>;
  } | null>(null);

  const load = async () => {
    if (!appDistributedId) return;
    setLoading(true);
    try {
      const [ps, dcList, nhs, ports] = await Promise.all([
        api.getAppPresences({ app: appDistributedId, environment }),
        api.getNGDCDatacenters().catch(() => []),
        api.getNeighbourhoods().catch(() => []),
        api.listPorts().catch(() => [] as PortCatalogEntry[]),
      ]);
      setPresences(ps || []);
      setPortCatalog(ports || []);
      setDcs(
        (dcList || []).map((d: { dc_id?: string; id?: string; name?: string; dc_name?: string; type?: string }) => ({
          id: String(d.dc_id ?? d.id ?? ''),
          name: String(d.dc_name ?? d.name ?? d.dc_id ?? d.id ?? ''),
          type: d.type,
        })),
      );
      setNeighbourhoods(
        (nhs || []).map((n: { nh_id?: string; name?: string; security_zones?: Array<{ zone: string; dc?: string; cidr?: string }> }) => ({
          nh_id: String(n.nh_id ?? ''),
          name: String(n.name ?? n.nh_id ?? ''),
          security_zones: n.security_zones || [],
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appDistributedId, environment]);

  const availableSzForDcNh = useMemo(() => {
    if (!form.nh_id || !form.dc_id) return [] as string[];
    const nh = neighbourhoods.find(n => n.nh_id === form.nh_id);
    if (!nh) return [];
    return Array.from(new Set((nh.security_zones || [])
      .filter(sz => !sz.dc || sz.dc === form.dc_id)
      .map(sz => sz.zone)));
  }, [neighbourhoods, form.nh_id, form.dc_id]);

  const parseMembers = (txt: string): MemberSpec[] => {
    return txt.split(/[\n,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(value => {
        const type: MemberSpec['type'] = value.includes('/')
          ? 'cidr'
          : value.includes('-')
          ? 'range'
          : 'ip';
        return { type, value };
      });
  };

  const saveForm = async () => {
    if (!form.dc_id || !form.nh_id || !form.sz_code) {
      alert('DC, NH and SZ are required');
      return;
    }
    const ingressPorts: PortBinding[] = form.has_ingress
      ? [
          ...ingressStdPortIds.map((pid) => ({ port_id: pid })),
          ...ingressAdditionalPorts.filter((b) => b.port && b.port > 0),
        ]
      : [];
    const payload: AppPresence = {
      app_distributed_id: appDistributedId,
      dc_id: form.dc_id,
      dc_type: form.dc_type || 'NGDC',
      environment,
      nh_id: form.nh_id,
      sz_code: form.sz_code,
      has_ingress: Boolean(form.has_ingress),
      egress_members: parseMembers(egressText),
      ingress_members: form.has_ingress ? parseMembers(ingressText) : [],
      ingress_ports: ingressPorts,
    };
    await api.upsertAppPresence(payload);
    setShowAdd(false);
    setForm({ app_distributed_id: appDistributedId, environment, has_ingress: false, dc_type: 'NGDC' });
    setEgressText('');
    setIngressText('');
    setIngressStdPortIds([]);
    setIngressAdditionalPorts([]);
    await load();
    onChange?.();
  };

  const deletePresence = async (p: AppPresence) => {
    if (!confirm(`Delete presence ${p.dc_id} / ${p.nh_id} / ${p.sz_code}?`)) return;
    await api.deleteAppPresence(
      p.app_distributed_id, p.dc_id, p.environment, p.nh_id, p.sz_code,
    );
    await load();
    onChange?.();
  };

  const runBulk = async () => {
    const members = parseMembers(bulkText);
    if (members.length === 0) {
      alert('Paste at least one IP/CIDR');
      return;
    }
    setBulkBusy(true);
    try {
      const res = await api.ingestAppMembers(appDistributedId, {
        environment,
        direction: bulkDir,
        members: members.map(m => ({
          kind: m.type,
          value: m.value,
          description: m.description,
        })),
        dc_hint: bulkDcHint || undefined,
        has_ingress: bulkDir === 'ingress',
      });
      setBulkResult({
        classified: res.classified.length,
        unclassified: res.unclassified.length,
        presences: res.presences.length,
        notes: res.classified.slice(0, 30).map(c => ({
          value: c.value, dc: c.dc, nh: c.nh, sz: c.sz,
        })),
        misses: res.unclassified.slice(0, 10).map(u => ({
          value: u.value, reason: u.reason,
        })),
      });
      setBulkText('');
      await load();
      onChange?.();
    } finally {
      setBulkBusy(false);
    }
  };

  const egressName = (p: AppPresence) =>
    `grp-${p.app_distributed_id}-${p.nh_id}-${p.sz_code}`;
  const ingressName = (p: AppPresence) =>
    p.has_ingress ? `grp-${p.app_distributed_id}-${p.nh_id}-${p.sz_code}-Ingress` : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-gray-800 tracking-tight">Presence Matrix</h4>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
            {appId} · {appDistributedId}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            {environment}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            {presences.length} presence{presences.length === 1 ? '' : 's'}
          </span>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-lg shadow-sm hover:shadow-md"
        >
          {showAdd ? 'Close' : '+ Add Presence'}
        </button>
      </div>

      {showAdd && (
        <div className="p-4 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50 border border-purple-200 rounded-xl space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">DC</label>
              <select
                className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-md bg-white"
                value={form.dc_id || ''}
                onChange={e => setForm({ ...form, dc_id: e.target.value })}
              >
                <option value="">-- Select DC --</option>
                {dcs.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">NH</label>
              <select
                className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-md bg-white"
                value={form.nh_id || ''}
                onChange={e => setForm({ ...form, nh_id: e.target.value, sz_code: '' })}
              >
                <option value="">-- Select NH --</option>
                {neighbourhoods.map(n => (
                  <option key={n.nh_id} value={n.nh_id}>{n.nh_id} — {n.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">SZ</label>
              <select
                className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-md bg-white"
                value={form.sz_code || ''}
                onChange={e => setForm({ ...form, sz_code: e.target.value })}
              >
                <option value="">-- Select SZ --</option>
                {availableSzForDcNh.map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.has_ingress)}
                  onChange={e => setForm({ ...form, has_ingress: e.target.checked })}
                />
                Has Ingress
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Egress IPs / CIDRs (one per line or comma-separated)
              </label>
              <textarea
                rows={2}
                className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-md bg-white font-mono"
                placeholder="10.1.1.10, 10.1.1.0/24, 10.1.1.30-10.1.1.40"
                value={egressText}
                onChange={e => setEgressText(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Ingress IPs / CIDRs {form.has_ingress ? '' : '(disabled)'}
              </label>
              <textarea
                rows={2}
                disabled={!form.has_ingress}
                className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-md bg-white font-mono disabled:opacity-40"
                placeholder="10.1.1.20, 10.1.1.21"
                value={ingressText}
                onChange={e => setIngressText(e.target.value)}
              />
            </div>
          </div>
          {form.has_ingress && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <PortBindingsEditor
                title="Ingress Standard Ports"
                subtitle="Pick from global Port Catalog. Surfaced as defaults in the Port Picker when this app is the destination."
                mode="library"
                catalog={portCatalog}
                standardPortIds={ingressStdPortIds}
                onChangeStandard={setIngressStdPortIds}
              />
              <PortBindingsEditor
                title="Ingress Additional Ports"
                subtitle="App-specific custom ports that don't belong in the catalog."
                mode="custom"
                catalog={portCatalog}
                additionalPorts={ingressAdditionalPorts}
                onChangeAdditional={setIngressAdditionalPorts}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={saveForm} className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-md hover:shadow-md">Save Presence</button>
          </div>
        </div>
      )}

      {/* Bulk paste IP → auto-classify */}
      <div className="p-4 bg-gradient-to-br from-sky-50 via-white to-indigo-50 border border-sky-200 rounded-xl space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-bold text-gray-800 tracking-tight">⚡ Bulk Classify IPs → Auto-create Presences</h4>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
            Longest-prefix SZ CIDR match
          </span>
        </div>
        <div className="grid grid-cols-[1fr,auto,auto,auto] gap-2 items-end">
          <textarea
            rows={2}
            className="w-full px-2 py-1.5 text-xs border border-sky-200 rounded-md bg-white font-mono"
            placeholder="Paste IPs / CIDRs / ranges — one per line or comma-separated"
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
          />
          <div>
            <label className="block text-[10px] font-semibold text-gray-600 mb-1">Direction</label>
            <select
              className="px-2 py-1.5 text-xs border border-sky-200 rounded-md bg-white"
              value={bulkDir}
              onChange={e => setBulkDir(e.target.value as 'egress' | 'ingress')}
            >
              <option value="egress">Egress</option>
              <option value="ingress">Ingress</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-600 mb-1">DC Hint (optional)</label>
            <select
              className="px-2 py-1.5 text-xs border border-sky-200 rounded-md bg-white"
              value={bulkDcHint}
              onChange={e => setBulkDcHint(e.target.value)}
            >
              <option value="">Auto</option>
              {dcs.map(d => (<option key={d.id} value={d.id}>{d.id}</option>))}
            </select>
          </div>
          <button
            onClick={runBulk}
            disabled={bulkBusy}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-indigo-600 rounded-md hover:shadow-md disabled:opacity-40"
          >
            {bulkBusy ? 'Classifying…' : 'Classify & Upsert'}
          </button>
        </div>
        {bulkResult && (
          <div className="text-xs text-gray-700 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">
                Classified: {bulkResult.classified}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-semibold">
                Unclassified: {bulkResult.unclassified}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">
                Presences touched: {bulkResult.presences}
              </span>
            </div>
            {bulkResult.notes.length > 0 && (
              <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] font-mono">
                {bulkResult.notes.map((n, i) => (
                  <div key={i} className="px-2 py-0.5 rounded bg-white border border-gray-200 truncate">
                    {n.value} → {n.dc}/{n.nh}/{n.sz}
                  </div>
                ))}
              </div>
            )}
            {bulkResult.misses.length > 0 && (
              <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] font-mono">
                {bulkResult.misses.map((n, i) => (
                  <div key={i} className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 truncate">
                    {n.value} — {n.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gradient-to-r from-purple-50 to-fuchsia-50 text-gray-700">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">DC</th>
              <th className="px-2 py-2 text-left font-semibold">NH</th>
              <th className="px-2 py-2 text-left font-semibold">SZ</th>
              <th className="px-2 py-2 text-left font-semibold">Egress Group</th>
              <th className="px-2 py-2 text-center font-semibold">Egress IPs</th>
              <th className="px-2 py-2 text-left font-semibold">Ingress Group</th>
              <th className="px-2 py-2 text-center font-semibold">Ingress IPs</th>
              <th className="px-2 py-2 text-left font-semibold">Ingress Ports</th>
              <th className="px-2 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && presences.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500">
                No presences yet — add one above or bulk-paste IPs to auto-create.
              </td></tr>
            )}
            {presences.map(p => (
              <tr key={`${p.dc_id}-${p.nh_id}-${p.sz_code}`} className="hover:bg-purple-50/40">
                <td className="px-2 py-1.5"><span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 font-semibold">{p.dc_id}</span></td>
                <td className="px-2 py-1.5"><span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 font-semibold">{p.nh_id}</span></td>
                <td className="px-2 py-1.5"><span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">{p.sz_code}</span></td>
                <td className="px-2 py-1.5 font-mono text-[11px] text-gray-700 truncate max-w-[220px]" title={egressName(p)}>{egressName(p)}</td>
                <td className="px-2 py-1.5 text-center font-semibold text-gray-800">{(p.egress_members || []).length}</td>
                <td className="px-2 py-1.5 font-mono text-[11px] text-gray-700 truncate max-w-[220px]" title={ingressName(p)}>
                  {p.has_ingress ? ingressName(p) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-2 py-1.5 text-center font-semibold text-gray-800">{p.has_ingress ? (p.ingress_members || []).length : '—'}</td>
                <td className="px-2 py-1.5">
                  {p.has_ingress && (p.ingress_ports || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(p.ingress_ports || []).slice(0, 4).map((b, i) => {
                        const hit = b.port_id ? portCatalog.find((c) => c.port_id === b.port_id) : null;
                        const label = hit
                          ? `${hit.protocol} ${hit.port}`
                          : b.port ? `${b.protocol || 'TCP'} ${b.port}` : b.port_id || '?';
                        const title = hit ? `${hit.name} · ${hit.protocol} ${hit.port}` : (b.label || label);
                        return (
                          <span key={i} title={title}
                            className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                            {label}
                          </span>
                        );
                      })}
                      {(p.ingress_ports || []).length > 4 && (
                        <span className="text-[10px] text-gray-500">+{(p.ingress_ports || []).length - 4}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={() => deletePresence(p)}
                    className="px-2 py-0.5 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

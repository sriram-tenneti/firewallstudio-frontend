import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Environment, ItsmConnector, PhysicalRuleExpansion, RuleRequestRecord } from '@/types';
import * as api from '@/lib/api';
import { useTeam } from '@/contexts/TeamContext';

interface RuleRequestsPanelProps {
  environment?: Environment | '';
  onChanged?: () => void;
  reloadKey?: number;
  highlightId?: string | null;
}

const STATUSES: (RuleRequestRecord['status'] | 'All')[] = ['All', 'Pending', 'Approved', 'Rejected', 'Deployed', 'Certified'];

export default function RuleRequestsPanel({ environment = '', onChanged, reloadKey = 0, highlightId = null }: RuleRequestsPanelProps) {
  const { team, isGodView } = useTeam();
  const [items, setItems] = useState<RuleRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportSelected = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await api.downloadRequestArtifactBulkBundle(Array.from(selected));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  // Auto-expand newly-submitted requests and scroll into view.
  useEffect(() => {
    if (!highlightId) return;
    setExpanded(highlightId);
    const t = window.setTimeout(() => {
      const el = document.getElementById(`rule-request-row-${highlightId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [highlightId, items.length]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listRuleRequests({
        environment: environment || undefined,
        status: statusFilter === 'All' ? undefined : statusFilter,
        team: isGodView ? undefined : team,
      });
      setItems(res);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, [environment, statusFilter, team, isGodView]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const act = async (id: string, to: RuleRequestRecord['status']) => {
    try {
      await api.setRuleRequestStatus(id, to, note || undefined);
      setNote('');
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    // Newest first so fresh submissions surface at the top.
    return [...items].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [items]);

  return (
    <div id="rule-requests-panel" className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Rule Requests</div>
          <div className="text-xs text-gray-500">Multi-DC fan-out requests. Approve/Reject/Certify entire requests or inspect per-DC physical rules.</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void exportSelected()} disabled={selected.size === 0 || bulkBusy}
            title="Pack JSON + XLSX + every vendor config for each selected request into a single zip — manual fallback while ITSM integration is being set up."
            className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
            {bulkBusy ? 'Exporting…' : `Export selected (${selected.size})`}
          </button>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="text-xs border rounded px-2 py-1">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => void load()} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Refresh</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 mb-2">{error}</div>}

      {loading ? (
        <div className="text-xs text-gray-400 p-4 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-gray-400 p-4 text-center italic">No rule requests match the current filter.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const open = expanded === r.request_id;
            const isHighlighted = highlightId === r.request_id;
            return (
              <div
                id={`rule-request-row-${r.request_id}`}
                key={r.request_id}
                className={`border rounded-lg transition-all ${isHighlighted ? 'border-emerald-400 ring-2 ring-emerald-200 shadow-md' : 'border-gray-200'}`}
              >
                <div className={`p-2.5 flex items-center gap-2 flex-wrap ${isHighlighted ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                  <input type="checkbox"
                    aria-label={`Select ${r.request_id} for export`}
                    checked={r.request_id ? selected.has(r.request_id) : false}
                    onChange={() => r.request_id && toggleSelected(r.request_id)}
                    className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer" />
                  <code className="text-[11px] font-mono text-gray-700">{r.request_id}</code>
                  <span className="text-[11px] font-semibold text-gray-900">{r.application_ref}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-[11px] font-semibold text-indigo-700">{r.destination_kind}:{r.destination_ref}</span>
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600">{r.environment}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600 font-mono">{r.ports}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusStyle(r.status)}`}>{r.status}</span>
                  {r.external_ticket_id && (
                    <a
                      href={r.external_ticket_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => { if (!r.external_ticket_url) e.preventDefault(); }}
                      title={`${r.external_system || 'ITSM'} · ${r.external_status || 'Submitted'}`}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 font-mono"
                    >
                      {r.external_ticket_id}{r.external_status ? ` · ${r.external_status}` : ''}
                    </a>
                  )}
                  <span className="ml-auto text-[10px] text-gray-500">{r.expansion?.length ?? 0} physical rule(s)</span>
                  <button onClick={() => setExpanded(open ? null : r.request_id)}
                    className="text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50">
                    {open ? 'Hide' : 'Inspect'}
                  </button>
                </div>
                {open && (
                  <div className="p-3 space-y-2">
                    {r.description && <div className="text-xs text-gray-700">{r.description}</div>}
                    <FanOutCompact rows={r.expansion || []} />
                    {r.request_id && r.status !== 'Rejected' && (
                      <ArtifactsAndItsmPanel record={r} onChanged={() => void load()} />
                    )}
                    <div className="flex items-center gap-2">
                      <input value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="Review note (optional)"
                        className="flex-1 text-xs border rounded px-2 py-1" />
                      {r.request_id && r.status === 'Pending' && (
                        <>
                          <button onClick={() => void act(r.request_id!, 'Approved')}
                            className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">Approve</button>
                          <button onClick={() => void act(r.request_id!, 'Rejected')}
                            className="text-xs px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700">Reject</button>
                        </>
                      )}
                      {r.request_id && r.status === 'Approved' && (
                        <button onClick={() => void act(r.request_id!, 'Deployed')}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Mark Deployed</button>
                      )}
                      {r.request_id && r.status === 'Deployed' && (
                        <button onClick={() => void act(r.request_id!, 'Certified')}
                          className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700">Certify</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ArtifactsAndItsmPanel({ record, onChanged }: { record: RuleRequestRecord; onChanged: () => void }) {
  const [connectors, setConnectors] = useState<ItsmConnector[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chosenConnector, setChosenConnector] = useState<string>('');
  const [perDcDcIds, setPerDcDcIds] = useState<string[] | null>(null);
  const [activeDc, setActiveDc] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cs = await api.listItsmConnectors();
        if (!cancelled) {
          setConnectors(cs);
          if (cs.length === 1) setChosenConnector(cs[0].connector_id || '');
        }
      } catch {
        if (!cancelled) setConnectors([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const requestId = record.request_id!;
  // Load the list of DCs this request actually touches so we can render
  // one tab per DC's device. A real firewall lives in exactly one DC,
  // so the deployable file must be DC-scoped — without a DC pinned the
  // download would mix members from multiple DCs into a single file
  // that has no valid deploy target.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await api.getRequestArtifactsPerDc(requestId);
        if (!cancelled) {
          const ids = resp.dc_ids || [];
          setPerDcDcIds(ids);
          if (ids.length > 0) {
            setActiveDc(prev => (prev && ids.includes(prev) ? prev : ids[0]));
          } else {
            setActiveDc('');
          }
        }
      } catch {
        if (!cancelled) setPerDcDcIds([]);
      }
    })();
    return () => { cancelled = true; };
  }, [requestId]);

  const dcScope = activeDc || null;
  const jsonHref = `${api.API_BASE}${api.requestArtifactJsonUrl(requestId, dcScope)}`;
  const xlsxHref = `${api.API_BASE}${api.requestArtifactXlsxUrl(requestId, dcScope)}`;
  const bundleHref = `${api.API_BASE}${api.requestArtifactBundleUrl(requestId, dcScope)}`;
  const allDcsBundleHref = `${api.API_BASE}${api.requestArtifactBundleUrl(requestId)}`;
  const vendors: Array<{ key: string; label: string; ext: string }> = [
    { key: 'panos', label: 'Palo Alto (PAN-OS)', ext: 'panos' },
    { key: 'fortinet', label: 'Fortinet', ext: 'fortinet' },
    { key: 'cisco', label: 'Cisco ASA', ext: 'cisco' },
    { key: 'checkpoint', label: 'Check Point', ext: 'checkpoint' },
  ];

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await api.submitRequestToItsm(requestId, chosenConnector || undefined);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setErr(null);
    try {
      await api.refreshExternalStatus(requestId);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const dcIds = perDcDcIds || [];
  const hasDcs = dcIds.length > 0;
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-700">Deployment Artifacts</span>
        {hasDcs && (
          <span className="text-[10px] text-indigo-700 italic">
            {dcIds.length === 1
              ? `1 DC touched · device file is scoped to ${dcIds[0]}`
              : `${dcIds.length} DCs touched · pick a DC tab below — each tab is a single-device deploy artifact`}
          </span>
        )}
      </div>
      {hasDcs && (
        <div className="flex flex-wrap items-center gap-1 border-b border-indigo-200 pb-1">
          {dcIds.map(dc => (
            <button
              key={dc}
              type="button"
              onClick={() => setActiveDc(dc)}
              className={`text-[11px] px-2 py-0.5 rounded-t border-b-2 ${
                activeDc === dc
                  ? 'border-indigo-600 bg-white text-indigo-900 font-semibold'
                  : 'border-transparent bg-indigo-100/60 text-indigo-700 hover:bg-indigo-100'
              }`}
              title={`Filter artifacts to ${dc}'s device — only that DC's IPs will appear in the compiled config`}
            >
              {dc}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <a href={bundleHref} target="_blank" rel="noreferrer"
          title={
            dcScope
              ? `Single zip scoped to ${dcScope} — JSON + XLSX + every vendor config for that DC's device only`
              : 'Single zip laid out as one folder per DC — each folder is a complete single-device deploy artifact'
          }
          className="text-[11px] px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold">
          {dcScope ? `Download (.zip) — ${dcScope}` : 'Download All DCs (.zip)'}
        </a>
        {dcScope && (
          <a href={allDcsBundleHref} target="_blank" rel="noreferrer"
            title="One zip with one folder per DC — useful when you need to ship every DC's device file at once"
            className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-white hover:bg-indigo-100 text-indigo-800">
            All DCs (.zip)
          </a>
        )}
        <a href={jsonHref} target="_blank" rel="noreferrer"
          className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-white hover:bg-indigo-100 text-indigo-800">JSON manifest</a>
        <a href={xlsxHref} target="_blank" rel="noreferrer"
          className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-white hover:bg-indigo-100 text-indigo-800">Excel (.xlsx)</a>
        {vendors.map(v => (
          <a key={v.key}
            href={`${api.API_BASE}${api.requestArtifactVendorUrl(requestId, v.ext, dcScope)}`}
            target="_blank" rel="noreferrer"
            className="text-[11px] px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700">{v.label}</a>
        ))}
      </div>
      <div className="text-[10px] text-gray-500 italic">
        {hasDcs && dcScope
          ? `Files above are filtered to ${dcScope}'s device only — group members reflect just ${dcScope}'s IPs, not other DCs.`
          : 'Available regardless of approval/ITSM status — attach to a CR manually, email to SNS, or feed into device pipelines while the automated ITSM connector is being wired up.'}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-indigo-100">
        <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-700">Submit to SNS / ITSM</span>
        {record.status === 'Pending' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
            Draft — submit unlocks after approval. Manual export above is always available.
          </span>
        )}
        {connectors && connectors.length > 0 ? (
          <select value={chosenConnector} onChange={(e) => setChosenConnector(e.target.value)}
            className="text-xs border rounded px-2 py-1">
            <option value="">Default connector</option>
            {connectors.map(c => (
              <option key={c.connector_id} value={c.connector_id}>
                {c.name || c.connector_id} · {c.kind}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[11px] text-gray-500 italic">
            {connectors === null ? 'Loading connectors…' : 'No ITSM connectors configured (Settings → ITSM Connectors)'}
          </span>
        )}
        <button onClick={() => void submit()}
          disabled={submitting || (connectors !== null && connectors.length === 0) || record.status === 'Pending' || record.status === 'Rejected'}
          className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300">
          {submitting ? 'Submitting…' : (record.external_ticket_id ? 'Re-submit' : 'Submit to SNS')}
        </button>
        {record.external_ticket_id && (
          <>
            <span className="text-[11px] text-gray-700">
              <strong>{record.external_system || 'ITSM'}:</strong>{' '}
              <a href={record.external_ticket_url || '#'} target="_blank" rel="noreferrer"
                onClick={(e) => { if (!record.external_ticket_url) e.preventDefault(); }}
                className="text-indigo-700 hover:underline font-mono">{record.external_ticket_id}</a>
              {record.external_status ? <span className="ml-1 text-cyan-700">({record.external_status})</span> : null}
            </span>
            <button onClick={() => void refresh()} disabled={refreshing}
              className="text-xs px-2 py-1 rounded border border-cyan-200 bg-white hover:bg-cyan-50 text-cyan-800 disabled:bg-gray-100">
              {refreshing ? 'Refreshing…' : 'Refresh status'}
            </button>
          </>
        )}
      </div>

      {err && <div className="text-[11px] text-rose-700">{err}</div>}
    </div>
  );
}

function statusStyle(s: RuleRequestRecord['status']): string {
  switch (s) {
    case 'Pending': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'Deployed': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Certified': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function FanOutCompact({ rows }: { rows: PhysicalRuleExpansion[] }) {
  if (rows.length === 0) return <div className="text-[11px] text-gray-400 italic">No physical rules.</div>;
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest font-bold text-indigo-700">Per-DC Logical Data Flow (LDF)</div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((r, i) => (
          <div key={i} className="p-2.5 rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/60 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200 font-semibold">{r.src_dc}{r.cross_dc ? ` → ${r.dst_dc}` : ''}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-white text-gray-700 border-gray-200 font-mono">{r.ports}</span>
              {r.cross_dc && <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 font-semibold">cross-DC</span>}
            </div>
            <div className="flex items-stretch gap-1.5">
              <div className="flex-1 min-w-0 p-1.5 bg-white border border-sky-200 rounded">
                <div className="text-[8px] uppercase font-bold text-sky-600">Source · {r.src_dc}</div>
                <div className="font-mono text-[10px] font-semibold text-sky-800 truncate">{r.src_group_ref}</div>
              </div>
              <div className="flex flex-col items-center justify-center px-0.5">
                <svg className="w-7 h-3 text-indigo-400" viewBox="0 0 40 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 8h32M28 3l6 5-6 5"/>
                </svg>
                <div className="text-[8px] font-bold text-indigo-600">{r.action}</div>
              </div>
              <div className="flex-1 min-w-0 p-1.5 bg-white border border-rose-200 rounded">
                <div className="text-[8px] uppercase font-bold text-rose-600">Dest · {r.dst_dc}</div>
                <div className="font-mono text-[10px] font-semibold text-rose-800 truncate">{r.dst_group_ref}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

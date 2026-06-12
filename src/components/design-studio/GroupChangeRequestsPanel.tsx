import { useEffect, useState, useMemo } from 'react';
import * as api from '@/lib/api';
import {
  type GroupChangeRequest,
  groupChangeArtifactBundleUrl,
  groupChangeArtifactJsonUrl,
  groupChangeArtifactXlsxUrl,
  groupChangeArtifactVendorUrl,
  downloadGroupChangeBulkBundle,
} from '@/lib/api';

const STATUS_PILL: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-800 border-amber-300',
  Approved: 'bg-blue-100 text-blue-800 border-blue-300',
  Rejected: 'bg-rose-100 text-rose-800 border-rose-300',
  Deployed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  // NOTE: groups intentionally stop at Deployed — certification is a
  // compliance attestation on running rules, not on groups. Mapping is
  // kept defensively in case historical group requests still carry it.
  Certified: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const OP_LABEL: Record<string, string> = {
  'create': 'Create group',
  'modify-add': 'Add members',
  'modify-remove': 'Remove members',
  'delete': 'Delete group',
};

interface Props {
  environment?: string;
  reloadKey?: number;
  onChanged?: () => void;
}

export default function GroupChangeRequestsPanel({
  environment = '', reloadKey = 0, onChanged,
}: Props) {
  const [requests, setRequests] = useState<GroupChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listGroupChangeRequests({ environment });
      setRequests(data);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [environment, reloadKey]);

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportSelected = async () => {
    if (selected.size === 0) return;
    try {
      await downloadGroupChangeBulkBundle(Array.from(selected));
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  };

  const handleSetStatus = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await api.setGroupChangeRequestStatus(id, status);
      await load();
      onChanged?.();
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmitItsm = async (id: string) => {
    setBusyId(id);
    try {
      await api.submitGroupChangeToItsm(id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const handleRefresh = async (id: string) => {
    setBusyId(id);
    try {
      await api.refreshGroupChangeExternalStatus(id);
      await load();
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => requests, [requests]);

  return (
    <div className="bg-white border rounded-lg shadow-sm">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">
            Group Change Requests
          </div>
          <div className="text-xs text-slate-500">
            Standalone group create / modify / delete requests. Each request runs
            through the same approval &amp; deployment lifecycle as rule requests.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={exportSelected}
              className="text-xs px-2 py-1 rounded border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              Export selected ({selected.size})
            </button>
          )}
          <button
            onClick={load}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>
      {error && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}
      {loading ? (
        <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No group change requests yet.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-2 py-2 w-6"></th>
              <th className="text-left px-2 py-2">Request</th>
              <th className="text-left px-2 py-2">Operation</th>
              <th className="text-left px-2 py-2">Group</th>
              <th className="text-left px-2 py-2">Members Δ</th>
              <th className="text-left px-2 py-2">Env</th>
              <th className="text-left px-2 py-2">Status</th>
              <th className="text-left px-2 py-2">External</th>
              <th className="text-left px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <>
                <tr key={r.request_id} className="border-b hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.request_id)}
                      onChange={() => toggleSelected(r.request_id)}
                    />
                  </td>
                  <td className="px-2 py-2 font-mono">{r.request_id}</td>
                  <td className="px-2 py-2">{OP_LABEL[r.op] ?? r.op}</td>
                  <td className="px-2 py-2 font-mono">{r.group_name}</td>
                  <td className="px-2 py-2">
                    {r.added_members.length > 0 && (
                      <span className="text-emerald-700">+{r.added_members.length}</span>
                    )}{' '}
                    {r.removed_members.length > 0 && (
                      <span className="text-rose-700">-{r.removed_members.length}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">{r.environment}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${STATUS_PILL[r.status] ?? 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {r.external_ticket_id ? (
                      <a
                        href={r.external_ticket_url ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {r.external_ticket_id}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    {r.external_status && (
                      <span className="ml-1 text-[10px] text-slate-500">
                        ({r.external_status})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => setExpandedId(expandedId === r.request_id ? null : r.request_id)}
                      className="text-blue-600 hover:underline mr-2"
                    >
                      {expandedId === r.request_id ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expandedId === r.request_id && (
                  <tr key={`${r.request_id}-detail`} className="bg-slate-50 border-b">
                    <td colSpan={9} className="p-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-700 mb-1">
                            Members
                          </div>
                          {r.added_members.length > 0 && (
                            <div className="text-[11px] text-emerald-700">
                              + {r.added_members.join(', ')}
                            </div>
                          )}
                          {r.removed_members.length > 0 && (
                            <div className="text-[11px] text-rose-700">
                              − {r.removed_members.join(', ')}
                            </div>
                          )}
                          {r.description && (
                            <div className="mt-2 text-[11px] text-slate-600">
                              <span className="font-semibold">Justification:</span> {r.description}
                            </div>
                          )}
                        </div>
                        <div>
                          {r.status !== 'Rejected' && (
                            <div className="text-[11px] font-semibold text-slate-700 mb-1">
                              Artifacts (downloadable for manual SNS handoff)
                            </div>
                          )}
                          {r.status !== 'Rejected' && (
                            <div className="flex flex-wrap gap-1.5">
                              <a href={groupChangeArtifactJsonUrl(r.request_id)} target="_blank" rel="noreferrer" className="px-2 py-0.5 text-[10px] border rounded bg-white hover:bg-slate-100">JSON</a>
                              <a href={groupChangeArtifactXlsxUrl(r.request_id)} target="_blank" rel="noreferrer" className="px-2 py-0.5 text-[10px] border rounded bg-white hover:bg-slate-100">XLSX</a>
                              {(['panos','fortinet','cisco','checkpoint'] as const).map(v => (
                                <a key={v} href={groupChangeArtifactVendorUrl(r.request_id, v)} target="_blank" rel="noreferrer" className="px-2 py-0.5 text-[10px] border rounded bg-white hover:bg-slate-100 font-mono">{v}</a>
                              ))}
                              <a href={groupChangeArtifactBundleUrl(r.request_id)} target="_blank" rel="noreferrer" className="px-2 py-0.5 text-[10px] border rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold">Bundle .zip</a>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {r.status === 'Pending' && (
                              <>
                                <button onClick={() => handleSetStatus(r.request_id, 'Approved')} disabled={busyId === r.request_id} className="px-2 py-0.5 text-[11px] border rounded bg-blue-50 hover:bg-blue-100 text-blue-700">Approve</button>
                                <button onClick={() => handleSetStatus(r.request_id, 'Rejected')} disabled={busyId === r.request_id} className="px-2 py-0.5 text-[11px] border rounded bg-rose-50 hover:bg-rose-100 text-rose-700">Reject</button>
                              </>
                            )}
                            {r.status === 'Approved' && (
                              <button onClick={() => handleSetStatus(r.request_id, 'Deployed')} disabled={busyId === r.request_id} className="px-2 py-0.5 text-[11px] border rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700">Mark Deployed</button>
                            )}
                            {r.status === 'Deployed' && (
                              <span className="px-2 py-0.5 text-[11px] border rounded bg-emerald-50 text-emerald-700 italic">Lifecycle complete (groups stop at Deployed)</span>
                            )}
                            {(r.status === 'Approved' || r.status === 'Deployed') && (
                              <button
                                onClick={() => handleSubmitItsm(r.request_id)}
                                disabled={busyId === r.request_id}
                                className="px-2 py-0.5 text-[11px] border rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                              >
                                Submit to SNS
                              </button>
                            )}
                            {r.external_ticket_id && (
                              <button
                                onClick={() => handleRefresh(r.request_id)}
                                disabled={busyId === r.request_id}
                                className="px-2 py-0.5 text-[11px] border rounded bg-white hover:bg-slate-100"
                              >
                                Refresh status
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

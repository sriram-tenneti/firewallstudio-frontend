import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import type { LifecycleEvent, LifecycleDashboard } from '@/types';

/* ── colour helpers ──────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-500',
  Submitted: 'bg-blue-500',
  'In Progress': 'bg-yellow-500',
  Approved: 'bg-emerald-500',
  Rejected: 'bg-red-500',
  Deployed: 'bg-indigo-500',
  Certified: 'bg-green-600',
  Expired: 'bg-orange-500',
  Decommissioning: 'bg-amber-600',
  Decommissioned: 'bg-gray-600',
  Deleted: 'bg-red-800',
};

const EVENT_ICONS: Record<string, string> = {
  created: '🆕', submitted: '📤', approved: '✅', rejected: '❌',
  deployed: '🚀', certified: '🏅', expired: '⏰', decommission_requested: '🗑️',
  decommissioned: '🔒', soft_deleted: '🗑️', restored: '♻️',
  modified: '✏️', migrated: '🔄', comment: '💬', bulk_action: '📋',
  recertified: '🔄', ownership_changed: '👤',
};

function StatusBadge({ status }: { status: string }) {
  const bg = STATUS_COLORS[status] || 'bg-slate-500';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${bg}`}>
      {status}
    </span>
  );
}

/* ── state machine diagram ───────────────────────────────── */
function StateMachineDiagram({ states, title }: { states: Record<string, string[]>; title: string }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <h4 className="text-sm font-semibold text-white mb-3">{title}</h4>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {Object.entries(states).map(([from, tos]) => (
          <div key={from} className="flex items-start gap-2 text-xs">
            <StatusBadge status={from} />
            {tos.length > 0 && (
              <>
                <span className="text-slate-500 mt-0.5">→</span>
                <div className="flex flex-wrap gap-1">
                  {tos.map((to) => <StatusBadge key={to} status={to} />)}
                </div>
              </>
            )}
            {tos.length === 0 && <span className="text-slate-500 mt-0.5 italic">terminal</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── timeline component ──────────────────────────────────── */
function TimelineEvent({ event }: { event: LifecycleEvent }) {
  const icon = EVENT_ICONS[event.event_type] || '📌';
  const ts = new Date(event.timestamp).toLocaleString();
  return (
    <div className="flex gap-3 py-2 border-b border-slate-700/30 last:border-0">
      <div className="text-lg flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-white capitalize">{event.event_type.replace(/_/g, ' ')}</span>
          {event.from_status && event.to_status && (
            <span className="text-xs text-slate-400">
              <StatusBadge status={event.from_status} /> → <StatusBadge status={event.to_status} />
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{event.details}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500">
          <span>Rule: {event.rule_id}</span>
          <span>Actor: {event.actor}</span>
          <span>{ts}</span>
        </div>
      </div>
    </div>
  );
}

/* ── distribution bar chart ──────────────────────────────── */
function StatusDistribution({ dist, total, title }: { dist: Record<string, number>; total: number; title: string }) {
  const sorted = Object.entries(dist).sort(([, a], [, b]) => b - a);
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <span className="text-xs text-slate-400">{total} total</span>
      </div>
      <div className="space-y-2">
        {sorted.map(([status, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const bg = STATUS_COLORS[status] || 'bg-slate-500';
          return (
            <div key={status}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-300">{status}</span>
                <span className="text-slate-400">{count} ({pct}%)</span>
              </div>
              <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-xs text-slate-500 italic">No rules</p>}
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────── */

type Tab = 'overview' | 'certification' | 'decommission' | 'timeline' | 'state-machine' | 'bulk';

export default function LifecycleDashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<LifecycleDashboard | null>(null);
  const [states, setStates] = useState<{ ngdc: Record<string, string[]>; legacy: Record<string, string[]> } | null>(null);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  // Bulk operation state
  const [bulkIds, setBulkIds] = useState('');
  const [bulkAction, setBulkAction] = useState<'certify' | 'decommission'>('certify');
  const [bulkReason, setBulkReason] = useState('');

  // Transition state
  const [transRuleId, setTransRuleId] = useState('');
  const [transNewStatus, setTransNewStatus] = useState('');
  const [transIsLegacy, setTransIsLegacy] = useState(false);
  const [transComments, setTransComments] = useState('');

  // Timeline lookup
  const [timelineRuleId, setTimelineRuleId] = useState('');
  const [timelineEvents, setTimelineEvents] = useState<LifecycleEvent[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashData, statesData, eventsData] = await Promise.all([
        api.getLifecycleDashboard(),
        api.getLifecycleStates(),
        api.getLifecycleEvents(undefined, undefined, 50),
      ]);
      setDashboard(dashData as unknown as LifecycleDashboard);
      setStates(statesData);
      setEvents(eventsData as unknown as LifecycleEvent[]);
    } catch (err) {
      console.error('Failed to load lifecycle dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 4000);
  };

  const handleTransition = async () => {
    if (!transRuleId || !transNewStatus) return;
    try {
      await api.transitionLifecycle(transRuleId, transNewStatus, 'user', 'lifecycle-dashboard', transComments, transIsLegacy);
      flash(`Transitioned ${transRuleId} → ${transNewStatus}`);
      setTransRuleId(''); setTransNewStatus(''); setTransComments('');
      loadDashboard();
    } catch (err) {
      flash(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const handleBulkAction = async () => {
    const ids = bulkIds.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    try {
      const result = bulkAction === 'certify'
        ? await api.bulkCertifyRules(ids) as Record<string, unknown>
        : await api.bulkDecommissionRules(ids, bulkReason) as Record<string, unknown>;
      flash(`Bulk ${bulkAction}: ${result.succeeded}/${result.total} succeeded`);
      setBulkIds(''); setBulkReason('');
      loadDashboard();
    } catch (err) {
      flash(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const handleAutoExpire = async () => {
    try {
      const result = await api.runAutoExpire() as Record<string, unknown>;
      flash(`Auto-expire: ${result.count} rules transitioned`);
      loadDashboard();
    } catch (err) {
      flash(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const handleTimelineLookup = async () => {
    if (!timelineRuleId) return;
    try {
      const data = await api.getLifecycleTimeline(timelineRuleId);
      setTimelineEvents(data as unknown as LifecycleEvent[]);
    } catch (err) {
      flash(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'certification', label: 'Certification' },
    { id: 'decommission', label: 'Decommission' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'state-machine', label: 'State Machine' },
    { id: 'bulk', label: 'Bulk Ops' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const ngdc = dashboard?.ngdc_rules ?? { total: 0, status_distribution: {} };
  const legacy = dashboard?.legacy_rules ?? { total: 0, status_distribution: {} };
  const cert = dashboard?.certification ?? { expiring_soon: 0, already_expired: 0, expiring_rules: [], expired_rules: [] };
  const decom = dashboard?.decommission_queue ?? [];
  const recentEvents = dashboard?.recent_events ?? events;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lifecycle Management</h1>
          <p className="text-sm text-slate-400 mt-1">Manage rule states, certification, decommission, and audit trail</p>
        </div>
        <button onClick={loadDashboard} className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
          Refresh
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-4 py-2 text-sm text-blue-300">
          {actionMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors ${
              tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="NGDC Rules" value={ngdc.total} sub={`${Object.keys(ngdc.status_distribution).length} statuses`} color="blue" />
            <SummaryCard label="Legacy Rules" value={legacy.total} sub={`${Object.keys(legacy.status_distribution).length} statuses`} color="emerald" />
            <SummaryCard label="Expiring Soon" value={cert.expiring_soon} sub="Next 30 days" color="amber" />
            <SummaryCard label="Already Expired" value={cert.already_expired} sub="Needs attention" color="red" />
          </div>

          {/* Status distributions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatusDistribution dist={ngdc.status_distribution} total={ngdc.total} title="NGDC Rule Status Distribution" />
            <StatusDistribution dist={legacy.status_distribution} total={legacy.total} title="Legacy Rule Status Distribution" />
          </div>

          {/* Transition form */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Transition Rule Status</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <input value={transRuleId} onChange={e => setTransRuleId(e.target.value)} placeholder="Rule ID" className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2" />
              <input value={transNewStatus} onChange={e => setTransNewStatus(e.target.value)} placeholder="New Status" className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2" />
              <input value={transComments} onChange={e => setTransComments(e.target.value)} placeholder="Comments" className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2" />
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={transIsLegacy} onChange={e => setTransIsLegacy(e.target.checked)} className="rounded" />
                Legacy rule
              </label>
              <button onClick={handleTransition} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-medium">
                Transition
              </button>
            </div>
          </div>

          {/* Recent events */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Recent Lifecycle Events</h4>
            <div className="max-h-80 overflow-y-auto">
              {(recentEvents as LifecycleEvent[]).length > 0
                ? (recentEvents as LifecycleEvent[]).slice(0, 20).map(evt => <TimelineEvent key={evt.id} event={evt} />)
                : <p className="text-xs text-slate-500 italic">No lifecycle events recorded yet. Transition a rule to generate events.</p>
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Certification Tab ─────────────────────────────── */}
      {tab === 'certification' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SummaryCard label="Expiring Soon" value={cert.expiring_soon} sub="Within 30 days" color="amber" />
            <SummaryCard label="Already Expired" value={cert.already_expired} sub="Past expiry date" color="red" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleAutoExpire} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded-lg font-medium">
              Run Auto-Expire
            </button>
          </div>

          {/* Expiring rules */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Rules Expiring Soon</h4>
            <div className="max-h-64 overflow-y-auto">
              {cert.expiring_rules.length > 0 ? (
                <table className="w-full text-xs text-left">
                  <thead><tr className="text-slate-400 border-b border-slate-700">
                    <th className="pb-2">Rule ID</th><th className="pb-2">Application</th><th className="pb-2">Expiry</th><th className="pb-2">Days Left</th>
                  </tr></thead>
                  <tbody>
                    {cert.expiring_rules.map(r => (
                      <tr key={r.rule_id} className="border-b border-slate-700/30 text-slate-300">
                        <td className="py-1.5 font-mono">{r.rule_id}</td>
                        <td>{r.application}</td>
                        <td>{new Date(r.expiry_date).toLocaleDateString()}</td>
                        <td><span className="text-amber-400">{r.days_until_expiry}d</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-xs text-slate-500 italic">No rules expiring soon</p>}
            </div>
          </div>

          {/* Expired rules */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Expired Rules</h4>
            <div className="max-h-64 overflow-y-auto">
              {cert.expired_rules.length > 0 ? (
                <table className="w-full text-xs text-left">
                  <thead><tr className="text-slate-400 border-b border-slate-700">
                    <th className="pb-2">Rule ID</th><th className="pb-2">Application</th><th className="pb-2">Expired On</th><th className="pb-2">Overdue</th>
                  </tr></thead>
                  <tbody>
                    {cert.expired_rules.map(r => (
                      <tr key={r.rule_id} className="border-b border-slate-700/30 text-slate-300">
                        <td className="py-1.5 font-mono">{r.rule_id}</td>
                        <td>{r.application}</td>
                        <td>{new Date(r.expiry_date).toLocaleDateString()}</td>
                        <td><span className="text-red-400">{r.days_overdue}d overdue</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-xs text-slate-500 italic">No expired rules</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Decommission Tab ──────────────────────────────── */}
      {tab === 'decommission' && (
        <div className="space-y-6">
          <SummaryCard label="Decommission Queue" value={decom.length} sub="Rules pending decommission" color="amber" />

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Decommission Queue</h4>
            <div className="max-h-80 overflow-y-auto">
              {decom.length > 0 ? (
                <table className="w-full text-xs text-left">
                  <thead><tr className="text-slate-400 border-b border-slate-700">
                    <th className="pb-2">Rule ID</th><th className="pb-2">Application</th><th className="pb-2">Requested</th><th className="pb-2">By</th><th className="pb-2">Store</th>
                  </tr></thead>
                  <tbody>
                    {decom.map(r => (
                      <tr key={r.rule_id} className="border-b border-slate-700/30 text-slate-300">
                        <td className="py-1.5 font-mono">{r.rule_id}</td>
                        <td>{r.application}</td>
                        <td>{r.requested_at ? new Date(r.requested_at).toLocaleDateString() : '-'}</td>
                        <td>{r.requested_by}</td>
                        <td><span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded">{r.store}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-xs text-slate-500 italic">No rules in decommission queue</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline Tab ──────────────────────────────────── */}
      {tab === 'timeline' && (
        <div className="space-y-6">
          {/* Lookup by rule ID */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Rule Timeline Lookup</h4>
            <div className="flex gap-3">
              <input value={timelineRuleId} onChange={e => setTimelineRuleId(e.target.value)} placeholder="Enter Rule ID" className="flex-1 bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2" />
              <button onClick={handleTimelineLookup} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-medium">
                Lookup
              </button>
            </div>
            {timelineEvents.length > 0 && (
              <div className="mt-4 max-h-80 overflow-y-auto">
                {timelineEvents.map(evt => <TimelineEvent key={evt.id} event={evt} />)}
              </div>
            )}
            {timelineRuleId && timelineEvents.length === 0 && (
              <p className="mt-3 text-xs text-slate-500 italic">No events found for this rule. Try transitioning it first.</p>
            )}
          </div>

          {/* All recent events */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">All Recent Events</h4>
            <div className="max-h-96 overflow-y-auto">
              {(recentEvents as LifecycleEvent[]).length > 0
                ? (recentEvents as LifecycleEvent[]).map(evt => <TimelineEvent key={evt.id} event={evt} />)
                : <p className="text-xs text-slate-500 italic">No lifecycle events recorded yet</p>
              }
            </div>
          </div>
        </div>
      )}

      {/* ── State Machine Tab ─────────────────────────────── */}
      {tab === 'state-machine' && states && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StateMachineDiagram states={states.ngdc} title="NGDC Rule State Machine" />
          <StateMachineDiagram states={states.legacy} title="Legacy Rule State Machine" />
        </div>
      )}

      {/* ── Bulk Ops Tab ──────────────────────────────────── */}
      {tab === 'bulk' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">Bulk Lifecycle Operation</h4>
            <div className="space-y-3">
              <div className="flex gap-3">
                <select value={bulkAction} onChange={e => setBulkAction(e.target.value as 'certify' | 'decommission')} className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2">
                  <option value="certify">Bulk Certify</option>
                  <option value="decommission">Bulk Decommission</option>
                </select>
                {bulkAction === 'decommission' && (
                  <input value={bulkReason} onChange={e => setBulkReason(e.target.value)} placeholder="Reason" className="flex-1 bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2" />
                )}
              </div>
              <textarea value={bulkIds} onChange={e => setBulkIds(e.target.value)} placeholder="Enter Rule IDs (comma or newline separated)" rows={4} className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 font-mono" />
              <button onClick={handleBulkAction} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg font-medium">
                Execute Bulk {bulkAction === 'certify' ? 'Certify' : 'Decommission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── helper: summary card ────────────────────────────────── */
function SummaryCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    red: 'border-red-500/30 bg-red-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.blue}`}>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm font-medium text-slate-300 mt-1">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

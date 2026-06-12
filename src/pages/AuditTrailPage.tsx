/**
 * Audit Trail Page — view all data mutations across the system.
 *
 * Every create/update/delete is captured with user, timestamp,
 * before/after snapshots.
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Shield, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { API_BASE } from '@/lib/api';

interface AuditEntry {
  app_distributed_id: string | null;
  collection: string;
  document_id: string;
  operation: string;
  user_id: string;
  user_email: string;
  user_team: string;
  timestamp: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  changed_fields: string[];
  module: string;
}

const OP_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
};

const ENVIRONMENTS = ['All', 'Production', 'Non-Production', 'Pre-Production'];

export function AuditTrailPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [_environment, setEnvironment] = useState('All');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (collection) params.set('collection', collection);
      const res = await fetch(`${API_BASE}/api/audit?${params}`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      console.error('Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = entries.filter(e => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.document_id.toLowerCase().includes(term) ||
      (e.app_distributed_id || '').toLowerCase().includes(term) ||
      e.user_email.toLowerCase().includes(term) ||
      e.collection.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-sm text-gray-500 mt-1">
            Complete history of all data changes — who changed what and when
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white border rounded-lg p-4 shadow-sm">
        <Filter className="w-4 h-4 text-gray-400" />

        <select
          value={_environment}
          onChange={e => setEnvironment(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        >
          {ENVIRONMENTS.map(env => (
            <option key={env} value={env}>{env}</option>
          ))}
        </select>

        <select
          value={collection}
          onChange={e => setCollection(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All Collections</option>
          <option value="rule_requests">Rule Requests</option>
          <option value="firewall_groups">Firewall Groups</option>
          <option value="ingress_groups">Ingress Groups</option>
          <option value="group_change_requests">Group Changes</option>
          <option value="applications">Applications</option>
          <option value="reviews">Reviews</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by document ID, app ID, or user..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full border rounded-md pl-9 pr-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Audit Entries */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">
            Audit Log ({filtered.length} entries)
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No audit entries found</div>
        ) : (
          <div className="divide-y">
            {filtered.map((entry, i) => (
              <div key={i}>
                <div
                  className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedEntry(expandedEntry === i ? null : i)}
                >
                  {expandedEntry === i ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}

                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${OP_COLORS[entry.operation] || 'bg-gray-100'}`}>
                    {entry.operation}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {entry.collection} / {entry.document_id}
                    </div>
                    {entry.changed_fields.length > 0 && (
                      <div className="text-xs text-gray-400">
                        Changed: {entry.changed_fields.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-500">{entry.user_email || entry.user_id}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Expanded: before/after snapshot */}
                {expandedEntry === i && (
                  <div className="px-8 py-3 bg-gray-50 border-t grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-600 mb-1">Before</h4>
                      <pre className="text-xs bg-white border rounded p-2 max-h-40 overflow-auto">
                        {entry.before_snapshot
                          ? JSON.stringify(entry.before_snapshot, null, 2)
                          : '(none — new document)'}
                      </pre>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-gray-600 mb-1">After</h4>
                      <pre className="text-xs bg-white border rounded p-2 max-h-40 overflow-auto">
                        {entry.after_snapshot
                          ? JSON.stringify(entry.after_snapshot, null, 2)
                          : '(none — deleted)'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditTrailPage;

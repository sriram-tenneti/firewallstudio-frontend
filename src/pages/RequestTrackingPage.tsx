/**
 * Request Tracking Page — dedicated tab for tracking all request status changes.
 *
 * Replaces the inline request history panel that was embedded in DesignStudioPage.
 * Supports filtering by:
 *   - Environment (Production, Non-Production, Pre-Production)
 *   - Request type (Rule Request, Group Change, Modification)
 *   - Status
 *   - App Distributed ID
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Clock, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { API_BASE } from '@/lib/api';

interface StatusTransition {
  request_id: string;
  app_distributed_id: string;
  request_type: string;
  from_status: string;
  to_status: string;
  transitioned_at: string;
  transitioned_by: string;
  module: string;
  comments: string;
}

interface RuleRequest {
  request_id: string;
  app_distributed_id: string;
  environment: string;
  status: string;
  source_kind: string;
  destination_kind: string;
  ports: string;
  description: string;
  owner: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Submitted: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Deployed: 'bg-purple-100 text-purple-700',
  Certified: 'bg-emerald-100 text-emerald-700',
  Expired: 'bg-orange-100 text-orange-700',
  Decommissioning: 'bg-rose-100 text-rose-700',
  Decommissioned: 'bg-gray-300 text-gray-600',
  Pending: 'bg-blue-100 text-blue-700',
};

const ENVIRONMENTS = ['All', 'Production', 'Non-Production', 'Pre-Production'];
const REQUEST_TYPES = ['All', 'rule_request', 'group_change'];

export function RequestTrackingPage() {
  const [requests, setRequests] = useState<RuleRequest[]>([]);
  const [history, setHistory] = useState<StatusTransition[]>([]);
  const [loading, setLoading] = useState(true);
  const [environment, setEnvironment] = useState('All');
  const [requestType, setRequestType] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [requestHistory, setRequestHistory] = useState<Record<string, StatusTransition[]>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const envQs = environment !== 'All' ? `&environment=${encodeURIComponent(environment)}` : '';

      const [reqRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/api/rules/requests?limit=200${envQs}`),
        fetch(`${API_BASE}/api/requests/history?limit=200`),
      ]);

      const reqData = await reqRes.json();
      const histData = await histRes.json();

      setRequests(Array.isArray(reqData) ? reqData : []);
      setHistory(Array.isArray(histData) ? histData : []);
    } catch {
      console.error('Failed to load request tracking data');
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadRequestHistory = async (requestId: string) => {
    if (requestHistory[requestId]) {
      setExpandedRequest(expandedRequest === requestId ? null : requestId);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/requests/history?request_id=${requestId}`);
      const data = await res.json();
      setRequestHistory(prev => ({ ...prev, [requestId]: Array.isArray(data) ? data : [] }));
      setExpandedRequest(requestId);
    } catch {
      console.error('Failed to load request history');
    }
  };

  // Filter requests
  const filtered = requests.filter(req => {
    if (environment !== 'All' && req.environment !== environment) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (
        !req.request_id.toLowerCase().includes(term) &&
        !req.app_distributed_id.toLowerCase().includes(term) &&
        !(req.description || '').toLowerCase().includes(term)
      ) return false;
    }
    return true;
  });

  // Status counts
  const statusCounts: Record<string, number> = {};
  filtered.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Request Tracking</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track all rule requests, group changes, and their status transitions
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} className="bg-white border rounded-lg p-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-gray-900">{count}</div>
            <div className={`text-xs px-2 py-0.5 rounded inline-block mt-1 ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
              {status}
            </div>
          </div>
        ))}
        <div className="bg-white border rounded-lg p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-blue-600">{filtered.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white border rounded-lg p-4 shadow-sm">
        <Filter className="w-4 h-4 text-gray-400" />

        {/* Environment Filter */}
        <select
          value={environment}
          onChange={e => setEnvironment(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
        >
          {ENVIRONMENTS.map(env => (
            <option key={env} value={env}>{env}</option>
          ))}
        </select>

        {/* Request Type Filter */}
        <select
          value={requestType}
          onChange={e => setRequestType(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
        >
          {REQUEST_TYPES.map(rt => (
            <option key={rt} value={rt}>
              {rt === 'All' ? 'All Types' : rt === 'rule_request' ? 'Rule Requests' : 'Group Changes'}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Request ID, App ID, or description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full border rounded-md pl-9 pr-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Recent Transitions */}
      {history.length > 0 && (
        <div className="bg-white border rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Recent Status Transitions
            </h3>
          </div>
          <div className="divide-y max-h-48 overflow-y-auto">
            {history.slice(0, 10).map((t, i) => (
              <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="font-mono text-xs text-gray-500 w-32 shrink-0">
                  {new Date(t.transitioned_at).toLocaleString()}
                </span>
                <span className="font-medium text-gray-700">{t.request_id}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[t.from_status] || 'bg-gray-100'}`}>
                  {t.from_status}
                </span>
                <span className="text-gray-400">→</span>
                <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[t.to_status] || 'bg-gray-100'}`}>
                  {t.to_status}
                </span>
                <span className="text-gray-400 text-xs ml-auto">{t.transitioned_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requests Table */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">
            Rule Requests ({filtered.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No requests found</div>
        ) : (
          <div className="divide-y">
            {filtered.map(req => (
              <div key={req.request_id}>
                {/* Request Row */}
                <div
                  className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => loadRequestHistory(req.request_id)}
                >
                  {expandedRequest === req.request_id ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-gray-900">{req.request_id}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[req.status] || 'bg-gray-100'}`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      App: {req.app_distributed_id} · {req.environment} · {req.ports}
                    </div>
                    {req.description && (
                      <div className="text-xs text-gray-400 truncate mt-0.5">{req.description}</div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-500">{req.owner}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(req.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Expanded Timeline */}
                {expandedRequest === req.request_id && requestHistory[req.request_id] && (
                  <div className="px-8 py-3 bg-gray-50 border-t">
                    <h4 className="text-xs font-semibold text-gray-600 mb-2">Status Timeline</h4>
                    {requestHistory[req.request_id].length === 0 ? (
                      <p className="text-xs text-gray-400">No transitions recorded yet</p>
                    ) : (
                      <div className="space-y-2">
                        {requestHistory[req.request_id].map((t, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs">
                            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                            <span className="text-gray-500 w-36 shrink-0">
                              {new Date(t.transitioned_at).toLocaleString()}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[t.from_status] || 'bg-gray-100'}`}>
                              {t.from_status}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[t.to_status] || 'bg-gray-100'}`}>
                              {t.to_status}
                            </span>
                            <span className="text-gray-400">{t.transitioned_by}</span>
                            {t.comments && (
                              <span className="text-gray-400 italic">"{t.comments}"</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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

export default RequestTrackingPage;

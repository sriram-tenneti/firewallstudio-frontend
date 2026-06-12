/**
 * Pass-Through Validation Page — live connectivity verification.
 *
 * Two-layer validation:
 *   1. Policy Check: Are there rules permitting this traffic?
 *   2. Live Probe: Can traffic actually pass through? (TCP, ICMP, HTTP, Firewall API)
 *
 * Modes:
 *   - Single: One source → one destination with port(s)
 *   - Bulk: CSV upload or paste multiple checks
 *
 * Entity types supported: IP, CIDR, Group, VM, OCP Pod, OCP Service, OCP Route, FQDN
 * Environment-scoped per organization requirement.
 */

import { useState, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldX, ShieldAlert,
  Play, Upload, Download, RefreshCw, AlertTriangle,
  Server, Cloud, Globe, Network, Monitor, Cpu,
  ChevronDown, ChevronRight, Info,
} from 'lucide-react';
import { API_BASE } from '@/lib/api';

// ---- Types ----

interface ProbeResult {
  method: string;
  target_ip: string;
  port: string;
  protocol: string;
  verdict: string;
  latency_ms: number | null;
  hops?: Array<{ hop: number; ip: string | null; latency_ms: number | null; timeout: boolean }>;
  details: string | null;
  error: string | null;
}

interface ValidationResult {
  index?: number;
  overall_verdict: 'PASS' | 'FAIL' | 'PARTIAL' | 'DRIFT' | 'UNKNOWN';
  policy_verdict: 'PERMIT' | 'DENY' | 'NO_RULE';
  live_verdict: 'REACHABLE' | 'UNREACHABLE' | 'TIMEOUT' | 'FILTERED' | 'SKIPPED';
  drift_detected: boolean;
  source: {
    input: string;
    type: string;
    resolved_ips: string[];
    matched_groups: string[];
    nh_id: string | null;
    sz_code: string | null;
    dc_id: string | null;
    environment: string | null;
    notes: string[];
  };
  destination: {
    input: string;
    type: string;
    resolved_ips: string[];
    matched_groups: string[];
    nh_id: string | null;
    sz_code: string | null;
    dc_id: string | null;
    environment: string | null;
    notes: string[];
  };
  ports_checked: string[];
  matching_rules: Array<{
    rule_id: string;
    src_group: string;
    dst_group: string;
    ports: string;
    action: string;
    dc_id: string;
    environment: string;
  }>;
  policy_checks: Array<{
    src_sz: string;
    dst_sz: string;
    action: string;
    condition: string | null;
  }>;
  live_probes: ProbeResult[];
  path_trace: string[];
  notes: string[];
}

interface BulkResult {
  total: number;
  summary: Record<string, number>;
  results: ValidationResult[];
}

// ---- Constants ----

const ENVIRONMENTS = ['Production', 'Non-Production', 'Pre-Production'];

const VERDICT_STYLES: Record<string, { bg: string; text: string; icon: typeof ShieldCheck }> = {
  PASS: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: ShieldCheck },
  FAIL: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: ShieldX },
  PARTIAL: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', icon: ShieldAlert },
  DRIFT: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', icon: AlertTriangle },
  UNKNOWN: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: Shield },
};

const ENTITY_ICONS: Record<string, typeof Server> = {
  ip: Globe,
  cidr: Network,
  group: Shield,
  vm: Monitor,
  ocp_pod: Cpu,
  ocp_service: Cloud,
  ocp_route: Globe,
  fqdn: Globe,
};

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  { value: 'ip', label: 'IP Address' },
  { value: 'cidr', label: 'CIDR (Subnet)' },
  { value: 'group', label: 'Firewall Group (grp-...)' },
  { value: 'vm', label: 'VM (vm-... / svr-...)' },
  { value: 'ocp_pod', label: 'OCP Pod (pod/namespace/name)' },
  { value: 'ocp_service', label: 'OCP Service (svc/namespace/name)' },
  { value: 'ocp_route', label: 'OCP Route (route/namespace/name)' },
  { value: 'fqdn', label: 'FQDN (hostname.domain.com)' },
];

// ---- Component ----

export default function PassThroughValidationPage() {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [environment, setEnvironment] = useState('Production');

  // Single mode state
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [ports, setPorts] = useState('tcp/443');
  const [sourceType, setSourceType] = useState('');
  const [destType, setDestType] = useState('');
  const [liveCheck, setLiveCheck] = useState(true);
  const [timeout, setTimeout] = useState(5);
  const [singleResult, setSingleResult] = useState<ValidationResult | null>(null);

  // Bulk mode state
  const [bulkText, setBulkText] = useState('');
  const [bulkResults, setBulkResults] = useState<BulkResult | null>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  // ---- Handlers ----

  const runSingleValidation = useCallback(async () => {
    if (!source || !destination || !ports) {
      setError('Source, Destination, and Port(s) are required');
      return;
    }
    setLoading(true);
    setError('');
    setSingleResult(null);

    try {
      const resp = await fetch(`${API_BASE}/api/validation/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          destination,
          ports: ports.split(/[\s,]+/).filter(Boolean),
          environment,
          source_type: sourceType || undefined,
          destination_type: destType || undefined,
          live_check: liveCheck,
          timeout,
        }),
      });
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const data = await resp.json();
      setSingleResult(data);
    } catch (e: any) {
      setError(e.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  }, [source, destination, ports, environment, sourceType, destType, liveCheck, timeout]);

  const runBulkValidation = useCallback(async () => {
    const lines = bulkText.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (lines.length === 0) {
      setError('Enter at least one check (source,destination,ports per line)');
      return;
    }

    const checks = lines.map(line => {
      const parts = line.split(',').map(s => s.trim());
      return {
        source: parts[0] || '',
        destination: parts[1] || '',
        ports: (parts[2] || 'tcp/443').split(/[\s]+/),
      };
    });

    setLoading(true);
    setError('');
    setBulkResults(null);

    try {
      const resp = await fetch(`${API_BASE}/api/validation/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checks,
          environment,
          live_check: liveCheck,
          timeout,
          max_concurrent: 10,
        }),
      });
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const data = await resp.json();
      setBulkResults(data);
    } catch (e: any) {
      setError(e.message || 'Bulk validation failed');
    } finally {
      setLoading(false);
    }
  }, [bulkText, environment, liveCheck, timeout]);

  const handleFileUpload = useCallback(async (file: File) => {
    const text = await file.text();
    setBulkText(text);
  }, []);

  const exportResults = useCallback(async () => {
    if (!bulkResults) return;
    try {
      const resp = await fetch(`${API_BASE}/api/validation/export?format=xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkResults.results),
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'validation_results.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    }
  }, [bulkResults]);

  // ---- Render ----

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            Pass-Through Validation
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verify connectivity between source and destination — policy check + live probe
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Environment selector */}
          <select
            value={environment}
            onChange={e => setEnvironment(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {ENVIRONMENTS.map(env => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'single'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Single Check
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'bulk'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Bulk Validation
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Single Mode */}
      {mode === 'single' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            {/* Source */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <input
                  type="text"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  placeholder="e.g., 10.20.30.10, grp-CRM-WEB-NH02-GEN, vm-web-01, svc/crm-prod/crm-api-svc"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Type</label>
                <select
                  value={sourceType}
                  onChange={e => setSourceType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {ENTITY_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Destination */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                <input
                  type="text"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="e.g., 10.50.60.10, grp-PAY-API-NH14-PAA, payment-api.internal.example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Type</label>
                <select
                  value={destType}
                  onChange={e => setDestType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {ENTITY_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ports + Options */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Port(s)</label>
                <input
                  type="text"
                  value={ports}
                  onChange={e => setPorts(e.target.value)}
                  placeholder="tcp/443, tcp/8443, udp/53 (space or comma separated)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timeout (sec)</label>
                <input
                  type="number"
                  value={timeout}
                  onChange={e => setTimeout(Number(e.target.value))}
                  min={1}
                  max={30}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liveCheck}
                    onChange={e => setLiveCheck(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  Live Probe
                </label>
              </div>
            </div>

            {/* Run Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={runSingleValidation}
                disabled={loading}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Validate
              </button>
            </div>
          </div>

          {/* Single Result */}
          {singleResult && <ValidationResultCard result={singleResult} />}
        </div>
      )}

      {/* Bulk Mode */}
      {mode === 'bulk' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Bulk Checks (CSV: source, destination, ports — one per line)
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liveCheck}
                    onChange={e => setLiveCheck(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  Live Probes
                </label>
                <label className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg cursor-pointer hover:bg-gray-200 flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={`# Format: source, destination, ports\n10.20.30.10, 10.50.60.10, tcp/443\ngrp-CRM-WEB-NH02-GEN, grp-PAY-API-NH14-PAA, tcp/443 tcp/8443\nvm-web-01, svc/payments-prod/payment-svc, tcp/8080\npod/crm-prod/crm-api, payment-api.internal.example.com, tcp/443`}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {bulkText.trim().split('\n').filter(l => l.trim() && !l.startsWith('#')).length} check(s)
              </span>
              <button
                onClick={runBulkValidation}
                disabled={loading}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Validate All
              </button>
            </div>
          </div>

          {/* Bulk Results */}
          {bulkResults && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <span className="text-sm text-gray-600">Total: <strong>{bulkResults.total}</strong></span>
                  {Object.entries(bulkResults.summary).map(([verdict, count]) => {
                    const style = VERDICT_STYLES[verdict] || VERDICT_STYLES.UNKNOWN;
                    return (
                      <span key={verdict} className={`px-2 py-1 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                        {verdict}: {count}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={exportResults}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export XLSX
                </button>
              </div>

              {/* Results Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Source</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Destination</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Ports</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Policy</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Live</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Overall</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Drift</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bulkResults.results.map((r, i) => {
                      const style = VERDICT_STYLES[r.overall_verdict] || VERDICT_STYLES.UNKNOWN;
                      const isExpanded = expandedResult === i;
                      return (
                        <>
                          <tr
                            key={i}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setExpandedResult(isExpanded ? null : i)}
                          >
                            <td className="px-4 py-2 text-gray-500">
                              <span className="flex items-center gap-1">
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                {(r.index ?? i) + 1}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{r.source?.input}</td>
                            <td className="px-4 py-2 font-mono text-xs">{r.destination?.input}</td>
                            <td className="px-4 py-2 font-mono text-xs">{r.ports_checked?.join(', ')}</td>
                            <td className="px-4 py-2 text-center">
                              <VerdictBadge verdict={r.policy_verdict} size="sm" />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <VerdictBadge verdict={r.live_verdict} size="sm" />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <VerdictBadge verdict={r.overall_verdict} size="sm" />
                            </td>
                            <td className="px-4 py-2 text-center">
                              {r.drift_detected && (
                                <AlertTriangle className="w-4 h-4 text-orange-500 mx-auto" />
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${i}-detail`}>
                              <td colSpan={8} className="px-4 py-3 bg-gray-50">
                                <ValidationResultCard result={r} compact />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="text-xs text-blue-800 space-y-1">
            <p className="font-medium">Supported Entity Formats:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-blue-700">
              <span><code>10.20.30.10</code> — IP</span>
              <span><code>10.0.0.0/24</code> — CIDR</span>
              <span><code>grp-CRM-WEB-NH02-GEN</code> — Group</span>
              <span><code>vm-web-01</code> — VM</span>
              <span><code>pod/crm-prod/pod-name</code> — OCP Pod</span>
              <span><code>svc/namespace/svc-name</code> — OCP Service</span>
              <span><code>route/namespace/route</code> — OCP Route</span>
              <span><code>api.example.com</code> — FQDN</span>
            </div>
            <p className="mt-2"><strong>Live Probes:</strong> TCP Socket, ICMP Ping, HTTP(S), Traceroute, Firewall API (Palo Alto/Checkpoint/Fortinet), OCP API — all agentless, no login needed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-Components ----

function VerdictBadge({ verdict, size = 'md' }: { verdict: string; size?: 'sm' | 'md' }) {
  const colors: Record<string, string> = {
    PASS: 'bg-green-100 text-green-700',
    PERMIT: 'bg-green-100 text-green-700',
    REACHABLE: 'bg-green-100 text-green-700',
    FAIL: 'bg-red-100 text-red-700',
    DENY: 'bg-red-100 text-red-700',
    UNREACHABLE: 'bg-red-100 text-red-700',
    PARTIAL: 'bg-yellow-100 text-yellow-700',
    NO_RULE: 'bg-gray-100 text-gray-600',
    DRIFT: 'bg-orange-100 text-orange-700',
    TIMEOUT: 'bg-orange-100 text-orange-700',
    FILTERED: 'bg-purple-100 text-purple-700',
    SKIPPED: 'bg-gray-100 text-gray-500',
    UNKNOWN: 'bg-gray-100 text-gray-500',
  };
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';
  return (
    <span className={`${padding} rounded font-medium ${colors[verdict] || colors.UNKNOWN}`}>
      {verdict}
    </span>
  );
}

function ValidationResultCard({ result, compact }: { result: ValidationResult; compact?: boolean }) {
  const [showTrace, setShowTrace] = useState(false);
  const [showProbes, setShowProbes] = useState(false);

  const style = VERDICT_STYLES[result.overall_verdict] || VERDICT_STYLES.UNKNOWN;
  const VerdictIcon = style.icon;

  return (
    <div className={`border rounded-xl ${style.bg} ${compact ? 'p-3' : 'p-5'} space-y-4`}>
      {/* Verdict Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <VerdictIcon className={`w-6 h-6 ${style.text}`} />
          <div>
            <span className={`text-lg font-bold ${style.text}`}>{result.overall_verdict}</span>
            {result.drift_detected && (
              <span className="ml-2 px-2 py-0.5 bg-orange-200 text-orange-800 text-xs rounded font-medium">
                DRIFT DETECTED
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span>Policy: <VerdictBadge verdict={result.policy_verdict} size="sm" /></span>
          <span>Live: <VerdictBadge verdict={result.live_verdict} size="sm" /></span>
        </div>
      </div>

      {/* Source → Destination Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EntitySummary label="Source" entity={result.source} />
        <EntitySummary label="Destination" entity={result.destination} />
      </div>

      {/* Matching Rules */}
      {result.matching_rules.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-600 mb-1">Matching Rules ({result.matching_rules.length})</h4>
          <div className="space-y-1">
            {result.matching_rules.slice(0, 5).map((rule, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-white/60 px-2 py-1 rounded">
                <span className={`px-1 rounded ${rule.action === 'permit' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                  {rule.action}
                </span>
                <span className="font-mono">{rule.src_group} → {rule.dst_group}</span>
                <span className="text-gray-500">[{rule.ports}]</span>
                <span className="text-gray-400 ml-auto">{rule.rule_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Probes */}
      {result.live_probes && result.live_probes.length > 0 && (
        <div>
          <button
            onClick={() => setShowProbes(!showProbes)}
            className="text-xs font-medium text-gray-600 flex items-center gap-1 hover:text-gray-900"
          >
            {showProbes ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Live Probes ({result.live_probes.length})
          </button>
          {showProbes && (
            <div className="mt-1 space-y-1">
              {result.live_probes.map((probe, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-white/60 px-2 py-1 rounded">
                  <VerdictBadge verdict={probe.verdict} size="sm" />
                  <span className="font-mono">{probe.target_ip}:{probe.port}</span>
                  <span className="text-gray-500">{probe.method}</span>
                  {probe.latency_ms && <span className="text-gray-400">{probe.latency_ms}ms</span>}
                  {probe.details && <span className="text-gray-500 truncate ml-auto max-w-[200px]">{probe.details}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Path Trace */}
      {result.path_trace && result.path_trace.length > 0 && (
        <div>
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="text-xs font-medium text-gray-600 flex items-center gap-1 hover:text-gray-900"
          >
            {showTrace ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Path Trace
          </button>
          {showTrace && (
            <pre className="mt-1 text-[10px] font-mono bg-white/60 p-2 rounded overflow-x-auto">
              {result.path_trace.join('\n')}
            </pre>
          )}
        </div>
      )}

      {/* Notes */}
      {result.notes && result.notes.length > 0 && (
        <div className="text-xs text-gray-600">
          {result.notes.map((note, i) => (
            <p key={i} className="flex items-start gap-1">
              <span className="text-gray-400">•</span> {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function EntitySummary({ label, entity }: { label: string; entity: ValidationResult['source'] }) {
  const Icon = ENTITY_ICONS[entity.type] || Globe;
  return (
    <div className="bg-white/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-[10px] bg-gray-200 text-gray-600 px-1 rounded">{entity.type}</span>
      </div>
      <p className="font-mono text-sm text-gray-900">{entity.input}</p>
      {entity.resolved_ips.length > 0 && (
        <p className="text-[10px] text-gray-500 mt-0.5">
          IPs: {entity.resolved_ips.slice(0, 3).join(', ')}
          {entity.resolved_ips.length > 3 && ` +${entity.resolved_ips.length - 3} more`}
        </p>
      )}
      {entity.matched_groups.length > 0 && (
        <p className="text-[10px] text-gray-500">
          Groups: {entity.matched_groups.slice(0, 2).join(', ')}
          {entity.matched_groups.length > 2 && ` +${entity.matched_groups.length - 2} more`}
        </p>
      )}
      {entity.sz_code && (
        <p className="text-[10px] text-gray-500">Zone: {entity.nh_id}/{entity.sz_code} @ {entity.dc_id}</p>
      )}
    </div>
  );
}

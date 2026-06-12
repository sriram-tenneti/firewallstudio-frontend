import { useState, useEffect } from 'react';
import { Modal } from '../shared/Modal';
import { StatusBadge } from '../shared/StatusBadge';
import { compileEgressIngress, getGroup } from '@/lib/api';
import { LDFFlowVisualization } from '../design-studio/LDFFlowVisualization';
import type { ReviewRequest, CompiledRule, FirewallGroup } from '@/types';

interface BoundaryDevice {
  device_id: string; device_name: string; nh: string; sz: string;
  role: string; direction: string; compiled: string;
}
interface EgressIngressResult {
  rule_id: string; vendor_format: string; boundaries: number;
  flow_rule: string; note: string;
  requires_egress: boolean; requires_ingress: boolean;
  devices: BoundaryDevice[];
  egress_compiled: string; ingress_compiled: string;
  source_zone: string; destination_zone: string;
  source_nh: string; destination_nh: string;
}

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  review: ReviewRequest | null;
  onApprove: (reviewId: string, notes: string) => void;
  onReject: (reviewId: string, notes: string) => void;
  onCompileRule?: (ruleId: string, vendor?: string) => Promise<CompiledRule>;
}

export function ApprovalModal({ isOpen, onClose, review, onApprove, onReject, onCompileRule }: ApprovalModalProps) {
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [compiledRule, setCompiledRule] = useState<CompiledRule | null>(null);
  const [compileVendor, setCompileVendor] = useState('generic');
  const [compiling, setCompiling] = useState(false);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [egressIngress, setEgressIngress] = useState<EgressIngressResult | null>(null);
  const [eiLoading, setEiLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, FirewallGroup>>({});
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Auto-load group members for source/dest groups
  useEffect(() => {
    if (!review || !isOpen) { setExpandedGroups({}); return; }
    const groupNames: string[] = [];
    const src = review.rule_summary?.source || '';
    const dst = review.rule_summary?.destination || '';
    for (const v of [src, dst]) {
      v.split(',').map(s => s.trim()).filter(s => s.startsWith('grp-') || s.startsWith('g-')).forEach(g => groupNames.push(g));
    }
    if (groupNames.length === 0) return;
    setLoadingGroups(true);
    Promise.allSettled(groupNames.map(n => getGroup(n)))
      .then(results => {
        const map: Record<string, FirewallGroup> = {};
        results.forEach((r, i) => { if (r.status === 'fulfilled') map[groupNames[i]] = r.value; });
        setExpandedGroups(map);
      })
      .finally(() => setLoadingGroups(false));
  }, [review, isOpen]);

  // Auto-load egress/ingress boundary analysis when modal opens
  useEffect(() => {
    if (!review || !isOpen) return;
    setEiLoading(true);
    compileEgressIngress(review.rule_id, compileVendor)
      .then(data => setEgressIngress(data as unknown as EgressIngressResult))
      .catch(() => setEgressIngress(null))
      .finally(() => setEiLoading(false));
  }, [review, isOpen, compileVendor]);

  const handleCompile = async () => {
    if (!review || !onCompileRule) return;
    setCompiling(true);
    try {
      const result = await onCompileRule(review.rule_id, compileVendor);
      setCompiledRule(result);
    } catch {
      setCompiledRule(null);
    }
    setCompiling(false);
  };

  if (!review) return null;

  const handleSubmit = () => {
    if (action === 'approve') {
      onApprove(review.id, notes);
    } else if (action === 'reject') {
      if (!notes.trim()) return;
      onReject(review.id, notes);
    }
    setNotes('');
    setAction(null);
    onClose();
  };

  // Key context fields always shown at top (minimal)
  const contextRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Rule ID', value: review.rule_id },
    { label: 'Request Type', value: review.request_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
    { label: 'Status', value: <StatusBadge key="s" status={review.status} /> },
    { label: 'Requestor', value: review.requestor },
  ];

  // Full details (collapsible) — comprehensive info for reviewer
  const rs = review.rule_summary as Record<string, unknown> | undefined;
  const fullRows: [string, string | React.ReactNode][] = [
    ['Review ID', review.id],
    ['Submitted', review.submitted_at ? new Date(review.submitted_at).toLocaleString() : 'N/A'],
    ['Application', review.rule_summary?.application || 'N/A'],
    ['Source', review.rule_summary?.source || 'N/A'],
    ['Destination', review.rule_summary?.destination || 'N/A'],
    ['Ports', review.rule_summary?.ports || 'N/A'],
    ['Environment', review.rule_summary?.environment || 'N/A'],
    ['Source Zone', String(rs?.source_zone || 'N/A')],
    ['Destination Zone', String(rs?.destination_zone || 'N/A')],
    ['Datacenter', String(rs?.datacenter || 'N/A')],
    ['Action', String(rs?.action || 'N/A')],
    ['Protocol', String(rs?.protocol || 'N/A')],
    ['Description', String(rs?.description || 'N/A')],
    ['Comments', review.comments || 'N/A'],
  ];

  // Format field keys: group:grp-name → "Group Members (grp-name)", others → title case
  const formatDeltaField = (field: string): string => {
    if (field.startsWith('group:')) return `Group Members (${field.slice(6)})`;
    return field.replace(/rule_/g, '').replace(/_/g, ' ');
  };

  const hasDelta = review.delta && (
    Object.keys(review.delta.added).length > 0 ||
    Object.keys(review.delta.removed).length > 0 ||
    Object.keys(review.delta.changed).length > 0
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Review: ${review.rule_id}`} size="xl">
      <div className="max-h-[80vh] overflow-y-auto pr-1 space-y-4">
      {/* Minimal Context — always visible */}
      <div className="grid grid-cols-4 gap-3">
          {contextRows.map((row) => (
            <div key={row.label} className="p-2 bg-gray-50 rounded">
              <span className="text-xs text-gray-500">{row.label}</span>
              <div className="text-sm font-medium text-gray-800">{row.value}</div>
            </div>
          ))}
      </div>

      {/* Group Policy Change indicator */}
      {review.request_type === 'group_policy_change' && (
        <div className="border border-purple-200 rounded-lg p-3 bg-purple-50">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-purple-100 text-purple-700">Group Policy Change</span>
            <span className="text-xs text-purple-800">
              Group was modified — affected rules require review, approval, and compile.
            </span>
          </div>
        </div>
      )}

      {/* Delta View — PRIMARY section for reviewers: only changed fields */}
      {hasDelta && review.delta ? (
        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">Changes for Review (Delta Only)</h3>
          <div className="space-y-3">
            {Object.keys(review.delta.added).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-green-700 mb-1">Added</h4>
                {Object.entries(review.delta.added).map(([field, values]) => (
                  <div key={field} className="ml-2">
                    <span className="text-xs text-gray-500">{formatDeltaField(field)}:</span>
                    {values.map((v, i) => (
                      <div key={i} className="text-xs text-green-700 font-mono ml-2">+ {v}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {Object.keys(review.delta.removed).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-700 mb-1">Removed</h4>
                {Object.entries(review.delta.removed).map(([field, values]) => (
                  <div key={field} className="ml-2">
                    <span className="text-xs text-gray-500">{formatDeltaField(field)}:</span>
                    {values.map((v, i) => (
                      <div key={i} className="text-xs text-red-700 font-mono ml-2">- {v}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {Object.keys(review.delta.changed).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-700 mb-1">Changed</h4>
                {Object.entries(review.delta.changed).map(([field, change]) => (
                  <div key={field} className="ml-2 text-xs">
                    <span className="text-gray-500">{formatDeltaField(field)}:</span>
                    <span className="text-red-600 line-through ml-1">{change.from}</span>
                    <span className="mx-1">&rarr;</span>
                    <span className="text-green-600">{change.to}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-green-200 rounded-lg p-4 bg-green-50">
          <h3 className="text-sm font-semibold text-green-800">New Rule — No Prior Version</h3>
          <p className="text-xs text-green-600 mt-1">This is a new rule submission. Full details available below.</p>
        </div>
      )}

      {/* Collapsible Full Rule Details */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setShowFullDetails(!showFullDetails)} className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors">
          <span className="text-xs font-semibold text-gray-600">Full Rule Details</span>
          <span className="text-xs text-gray-400">{showFullDetails ? '▲ Collapse' : '▼ Expand'}</span>
        </button>
        {showFullDetails && (
          <div className="divide-y divide-gray-100 px-4">
            {fullRows.map(([label, value]) => (
              <div key={label} className="flex py-2">
                <div className="w-32 text-xs font-medium text-gray-500 flex-shrink-0">{label}</div>
                <div className="text-xs text-gray-900 flex-1">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Group Members for Reviewer */}
      {(Object.keys(expandedGroups).length > 0 || loadingGroups) && (
        <div className="border border-emerald-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200">
            <h4 className="text-sm font-semibold text-emerald-800">Group Members (Expanded)</h4>
            <p className="text-[10px] text-emerald-600 mt-0.5">Full list of IPs/ranges inside each group referenced in this rule</p>
          </div>
          <div className="p-3 space-y-3">
            {loadingGroups ? (
              <p className="text-xs text-gray-500 italic">Loading group members...</p>
            ) : (
              Object.entries(expandedGroups).map(([name, group]) => (
                <div key={name} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-100 text-emerald-700">GROUP</span>
                      <span className="text-xs font-mono font-medium text-gray-800">{name}</span>
                      {group.nh && <span className="text-[10px] text-gray-500">NH: {group.nh}</span>}
                      {group.sz && <span className="text-[10px] text-gray-500">SZ: {group.sz}</span>}
                    </div>
                    <span className="text-[10px] text-gray-500">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="px-3 py-2 bg-gray-900">
                    {group.members.length > 0 ? group.members.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5">
                        <span className={`px-1 py-0.5 text-[8px] font-bold uppercase rounded ${
                          m.type === 'ip' ? 'bg-blue-100 text-blue-700' :
                          m.type === 'range' ? 'bg-orange-100 text-orange-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>{m.type}</span>
                        <span className="text-xs font-mono text-green-400">{m.value}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-gray-500 italic">No members</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Logical Data Flow Visualization */}
      {review.rule_id && (
        <LDFFlowVisualization ruleId={review.rule_id} vendor={compileVendor} boundaryData={egressIngress} />
      )}

      {/* Firewall Boundary Analysis */}
      <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">Firewall Boundary Analysis (Logical Data Flow)</h3>
        {eiLoading ? (
          <p className="text-xs text-amber-600 italic">Analyzing firewall boundaries...</p>
        ) : egressIngress ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                egressIngress.boundaries === 0 ? 'bg-green-100 text-green-800' :
                egressIngress.boundaries === 1 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {egressIngress.boundaries} Firewall {egressIngress.boundaries === 1 ? 'Boundary' : 'Boundaries'}
              </span>
              <span className="text-xs text-gray-500">Rule: {egressIngress.flow_rule}</span>
              {egressIngress.requires_egress && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Egress Required</span>}
              {egressIngress.requires_ingress && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Ingress Required</span>}
            </div>
            <p className="text-xs text-amber-700">{egressIngress.note}</p>
            {egressIngress.source_nh && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">Source NH:</span> <span className="font-medium">{egressIngress.source_nh}</span></div>
                <div><span className="text-gray-500">Dest NH:</span> <span className="font-medium">{egressIngress.destination_nh}</span></div>
                <div><span className="text-gray-500">Source SZ:</span> <span className="font-medium">{egressIngress.source_zone}</span></div>
                <div><span className="text-gray-500">Dest SZ:</span> <span className="font-medium">{egressIngress.destination_zone}</span></div>
              </div>
            )}
            {egressIngress.devices.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-amber-800">Device-Specific Compiled Rules</h4>
                {egressIngress.devices.map((dev, idx) => (
                  <div key={idx} className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          dev.direction === 'egress' ? 'bg-orange-500 text-white' :
                          dev.direction === 'ingress' ? 'bg-blue-500 text-white' :
                          'bg-purple-500 text-white'
                        }`}>{dev.direction.toUpperCase()}</span>
                        <span className="text-xs text-gray-300">{dev.device_name}</span>
                        <span className="text-xs text-gray-500">({dev.device_id})</span>
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(dev.compiled)} className="text-xs text-blue-400 hover:text-blue-300">Copy</button>
                    </div>
                    <div className="text-xs text-gray-400 mb-1">NH: {dev.nh} | SZ: {dev.sz} | Role: {dev.role}</div>
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{dev.compiled}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-amber-600 italic">No boundary analysis available for this rule.</p>
        )}
      </div>

      {/* Compile Rule - Prominent for Approvers */}
      <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-indigo-800">Compile to Device-Deployable Rule</h3>
          {onCompileRule && (
            <div className="flex items-center gap-2">
              <select
                value={compileVendor}
                onChange={e => setCompileVendor(e.target.value)}
                className="px-2 py-1 text-xs border border-indigo-300 rounded-md bg-white"
              >
                <option value="generic">Generic</option>
                <option value="palo_alto">Palo Alto</option>
                <option value="checkpoint">Check Point</option>
                <option value="fortigate">FortiGate</option>
              </select>
              <button
                onClick={handleCompile}
                disabled={compiling}
                className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
              >
                {compiling ? 'Compiling...' : 'Compile Rule'}
              </button>
            </div>
          )}
        </div>
        {compiledRule ? (
          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 font-medium">Format: {compiledRule.vendor_format}</span>
              <button
                onClick={() => navigator.clipboard.writeText(compiledRule.compiled_text)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Copy to Clipboard
              </button>
            </div>
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{compiledRule.compiled_text}</pre>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-500">Source Objects:</span> <span className="text-gray-300">{compiledRule.source_objects?.join(', ') || 'N/A'}</span></div>
              <div><span className="text-gray-500">Dest Objects:</span> <span className="text-gray-300">{compiledRule.destination_objects?.join(', ') || 'N/A'}</span></div>
              <div><span className="text-gray-500">Services:</span> <span className="text-gray-300">{compiledRule.services?.join(', ') || 'N/A'}</span></div>
              <div><span className="text-gray-500">Action:</span> <span className="text-gray-300">{compiledRule.action}</span></div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-indigo-600 italic">Select a vendor format and click &quot;Compile Rule&quot; to generate device-specific deployable output (Palo Alto, Check Point, FortiGate, or Generic).</p>
        )}
      </div>

      {review.comments && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <h4 className="text-xs font-semibold text-blue-700 mb-1">Requestor Comments</h4>
          <p className="text-sm text-blue-800">{review.comments}</p>
        </div>
      )}

      {review.status === 'Pending' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Review Notes</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-20 resize-none"
              placeholder={action === 'reject' ? 'Rejection reason is required...' : 'Optional notes for approval...'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setAction('reject'); }}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                action === 'reject' ? 'bg-red-600 text-white' : 'text-red-700 bg-red-50 border border-red-200 hover:bg-red-100'
              }`}
            >
              Reject
            </button>
            <button
              onClick={() => { setAction('approve'); }}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                action === 'approve' ? 'bg-green-600 text-white' : 'text-green-700 bg-green-50 border border-green-200 hover:bg-green-100'
              }`}
            >
              Approve
            </button>
          </div>

          {action && (
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => { setAction(null); setNotes(''); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={action === 'reject' && !notes.trim()}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                  action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Confirm {action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          )}
        </div>
      )}

      {review.status !== 'Pending' && (
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Close</button>
        </div>
      )}
      </div>
    </Modal>
  );
}

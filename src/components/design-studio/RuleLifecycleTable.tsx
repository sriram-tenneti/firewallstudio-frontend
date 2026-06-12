import { useState } from 'react';
import { Trash2, CheckCircle, AlertTriangle, Filter, ChevronDown, ChevronUp, History, Send, Save, Eye, Edit, ClipboardCheck } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { FirewallRule, Application } from '@/types';

interface RuleLifecycleTableProps {
  rules: FirewallRule[];
  applications: Application[];
  selectedAppFilter: string;
  onAppFilterChange: (appId: string) => void;
  onModify: (rule: FirewallRule) => void;
  onCertify: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
  onSubmit: (ruleId: string) => void;
  onViewHistory: (ruleId: string) => void;
  onSaveDraft: (ruleId: string) => void;
  onRequestReview?: (ruleId: string) => void;
}

export function RuleLifecycleTable({
  rules,
  applications,
  selectedAppFilter,
  onAppFilterChange,
  onModify,
  onCertify,
  onDelete,
  onSubmit,
  onViewHistory,
  onSaveDraft,
  onRequestReview,
}: RuleLifecycleTableProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const allSelected = rules.length > 0 && selectedIds.size === rules.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < rules.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rules.map(r => r.rule_id)));
    }
  };

  const toggleSelect = (ruleId: string) => {
    const next = new Set(selectedIds);
    if (next.has(ruleId)) {
      next.delete(ruleId);
    } else {
      next.add(ruleId);
    }
    setSelectedIds(next);
  };

  const selectedRules = rules.filter(r => selectedIds.has(r.rule_id));

  const handleBulkView = () => {
    if (selectedRules.length === 1) {
      setExpandedRowId(expandedRowId === selectedRules[0].rule_id ? null : selectedRules[0].rule_id);
    }
  };

  const handleBulkModify = () => {
    if (selectedRules.length === 1) {
      onModify(selectedRules[0]);
    }
  };

  const handleBulkCertify = () => {
    selectedRules.forEach(r => onCertify(r.rule_id));
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    selectedIds.forEach(id => onDelete(id));
    setShowDeleteConfirm(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Collapsible Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Rule Lifecycle Management</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {rules.length} rule{rules.length !== 1 ? 's' : ''}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <>
          {/* App Filter + Bulk Action Toolbar */}
          <div className="flex items-center justify-between gap-3 border-t border-b border-slate-100 px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1">
                <Filter className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-blue-700">App Distributed ID:</span>
                <select
                  value={selectedAppFilter}
                  onChange={(e) => { onAppFilterChange(e.target.value); setSelectedIds(new Set()); }}
                  className="rounded border-0 bg-transparent text-xs font-semibold text-blue-800 focus:ring-0 py-0 pr-6 pl-1"
                >
                  <option value="">All Applications</option>
                  {applications.map((app) => (
                    <option key={app.id} value={app.app_id}>
                      {app.app_distributed_id || app.app_id}
                    </option>
                  ))}
                </select>
              </div>
              {selectedIds.size > 0 && (
                <span className="text-xs font-semibold text-indigo-600">
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            {/* Bulk Actions - shown when rules are selected */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleBulkView}
                  disabled={selectedIds.size !== 1}
                  className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={selectedIds.size !== 1 ? 'Select exactly 1 rule to view' : 'View details'}
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
                <button
                  onClick={handleBulkModify}
                  disabled={selectedIds.size !== 1}
                  className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title={selectedIds.size !== 1 ? 'Select exactly 1 rule to modify' : 'Modify rule'}
                >
                  <Edit className="h-3.5 w-3.5" /> Modify
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.size})
                </button>
                <button
                  onClick={handleBulkCertify}
                  className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" /> Certify ({selectedIds.size})
                </button>
              </div>
            )}
          </div>

          {/* Bulk Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="flex items-center justify-between bg-red-50 border-b border-red-200 px-4 py-2">
              <span className="text-xs font-medium text-red-700">
                Confirm deletion of {selectedIds.size} rule(s)? This cannot be undone.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={confirmBulkDelete}
                  className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-md bg-white border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Table with Checkboxes */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-100 bg-slate-50/95">
                  <th className="px-3 py-2.5 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Rule ID</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">App</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Source</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Destination</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Compliance</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                      {selectedAppFilter ? `No rules found for "${selectedAppFilter}"` : 'No rules found. Create a new rule above.'}
                    </td>
                  </tr>
                )}
                {rules.map((rule) => {
                  const isSelected = selectedIds.has(rule.rule_id);
                  const isExpanded = expandedRowId === rule.rule_id;
                  return (
                    <tbody key={rule.id || rule.rule_id}>
                      <tr
                        onClick={() => toggleSelect(rule.rule_id)}
                        className={`group border-b border-slate-50 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(rule.rule_id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-sm font-semibold text-slate-700">{rule.rule_id}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-700">
                            {rule.application || '\u2014'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs text-blue-700 font-medium truncate max-w-36">
                              {rule.source.group_name || rule.source.ip_address || rule.source.cidr || rule.source.source_type}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="rounded bg-orange-50 border border-orange-200 px-1.5 py-0.5 text-xs text-orange-700 font-medium truncate max-w-36">
                              {rule.destination.name}
                            </span>
                            <span className="text-xs text-slate-400">{rule.destination.ports}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {rule.compliance?.naming_valid && rule.compliance?.group_to_group ? (
                            <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 w-fit">
                              <CheckCircle className="h-3 w-3" /> Compliant
                            </span>
                          ) : rule.compliance?.requires_exception ? (
                            <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 w-fit">
                              <AlertTriangle className="h-3 w-3" /> Exception
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 w-fit">
                              <AlertTriangle className="h-3 w-3" /> Non-Compliant
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={rule.status} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{rule.expiry || '\u2014'}</td>
                      </tr>

                      {/* Expanded detail panel - full width row below */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="px-4 py-3 bg-slate-50/80 border-b border-slate-100">
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div><span className="font-medium text-slate-500">Environment:</span> <span className="text-slate-700">{rule.environment || '\u2014'}</span></div>
                                <div><span className="font-medium text-slate-500">Datacenter:</span> <span className="text-slate-700">{rule.datacenter || '\u2014'}</span></div>
                                <div><span className="font-medium text-slate-500">Owner:</span> <span className="text-slate-700">{rule.owner || '\u2014'}</span></div>
                                <div><span className="font-medium text-slate-500">Created:</span> <span className="text-slate-700">{rule.created_at ? new Date(rule.created_at).toLocaleDateString() : '\u2014'}</span></div>
                                <div><span className="font-medium text-slate-500">Source Zone:</span> <span className="text-slate-700">{rule.source.security_zone || '\u2014'}</span></div>
                                <div><span className="font-medium text-slate-500">Dest Zone:</span> <span className="text-slate-700">{rule.destination.security_zone || '\u2014'}</span></div>
                                {rule.certified_at && (
                                  <div className="col-span-3"><span className="font-medium text-slate-500">Certified:</span> <span className="text-slate-700">{new Date(rule.certified_at).toLocaleDateString()} by {rule.certified_by}</span></div>
                                )}
                              </div>
                              <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
                                <button
                                  onClick={() => onViewHistory(rule.rule_id)}
                                  className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                  <History className="h-3 w-3" /> History
                                </button>
                                {rule.status === 'Draft' && (
                                  <>
                                    <button
                                      onClick={() => onSaveDraft(rule.rule_id)}
                                      className="flex items-center gap-1 rounded-md bg-slate-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
                                    >
                                      <Save className="h-3 w-3" /> Save Draft
                                    </button>
                                    <button
                                      onClick={() => onSubmit(rule.rule_id)}
                                      className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                                    >
                                      <Send className="h-3 w-3" /> Submit for Review
                                    </button>
                                  </>
                                )}
                                {rule.status === 'Pending Review' && onRequestReview && (
                                  <button
                                    onClick={() => onRequestReview(rule.rule_id)}
                                    className="flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                                  >
                                    <Eye className="h-3 w-3" /> Request Review
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

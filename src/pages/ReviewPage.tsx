import { useState, useEffect, useCallback } from 'react';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Tabs } from '@/components/shared/Tabs';
import { Notification } from '@/components/shared/Notification';
import { ApprovalModal } from '@/components/review/ApprovalModal';
import { useModal } from '@/hooks/useModal';
import { useNotification } from '@/hooks/useNotification';
import { getReviewRequests, approveReview, rejectReview, compileRule, getRuleModifications, approveRuleModification, rejectRuleModification, approvePolicyChange, rejectPolicyChange, listRuleRequests, listGroupChangeRequests, setRuleRequestStatus, setGroupChangeRequestStatus } from '@/lib/api';
import type { GroupChangeRequest } from '@/lib/api';
import type { ReviewRequest, RuleModification, RuleRequestRecord } from '@/types';
import type { Column } from '@/components/shared/DataTable';

/** Convert a RuleModification into a ReviewRequest shape so both appear in the same table. */
function modToReview(m: RuleModification): ReviewRequest {
  return {
    id: m.id,
    rule_id: m.rule_id,
    rule_name: m.rule_id,
    request_type: 'modify_rule',
    requestor: 'sns_user',
    reviewer: m.reviewer,
    status: m.status as ReviewRequest['status'],
    submitted_at: m.created_at,
    reviewed_at: m.reviewed_at,
    comments: m.comments,
    review_notes: m.review_notes,
    modification_id: m.id,
    delta: m.delta,
    rule_summary: {
      application: m.original?.app_name || m.original?.app_id || 'N/A',
      source: m.original?.rule_source || 'N/A',
      destination: m.original?.rule_destination || 'N/A',
      ports: m.original?.rule_service || 'N/A',
      environment: m.original?.environment || '',
    },
    subqueue: 'modification',
  };
}

// Rule-request status -> Review status. Approved/Deployed/Certified all
// land under "Approved" in the Review tab so the queue stays focused on
// "what still needs human attention" while still being inspectable in
// the Approved tab. Rejected stays Rejected.
const RR_STATUS_TO_REVIEW: Record<string, ReviewRequest['status']> = {
  'Pending Review': 'Pending',
  'Pending': 'Pending',
  'Approved': 'Approved',
  'Deployed': 'Approved',
  'Certified': 'Approved',
  'Rejected': 'Rejected',
};

/** Convert a backend RuleRequest into a ReviewRequest row so the
 * Review & Approval tab shows it inline with legacy reviews. The
 * `id` is prefixed `RR-` so handleApprove/handleReject can route
 * the transition back to /api/rules/requests/{id}/status. */
function ruleRequestToReview(r: RuleRequestRecord): ReviewRequest {
  const reqId = String(r.request_id || '').trim();
  // Derive per-(src_dc,dst_dc) fan-out so the Review queue exposes
  // how many DC-scoped physical rows ride under one logical submit.
  // Same-pair duplicates are deduped so the badge count matches what
  // a reviewer sees in the rule-request detail panel.
  const pairs: string[] = [];
  const seen = new Set<string>();
  for (const row of (r.expansion || [])) {
    const src = String(row?.src_dc || '').trim();
    const dst = String(row?.dst_dc || '').trim();
    if (!src || !dst) continue;
    const key = `${src}\u2192${dst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(key);
  }
  return {
    id: `RR-${reqId}`,
    rule_id: reqId,
    rule_name: reqId,
    request_type: 'new_rule',
    requestor: r.owner || r.owner_team || 'app_user',
    reviewer: '',
    status: RR_STATUS_TO_REVIEW[r.status] || 'Pending',
    submitted_at: (r as unknown as { created_at?: string }).created_at || '',
    reviewed_at: null,
    comments: '',
    review_notes: null,
    rule_summary: {
      application: r.application_ref || '',
      source: r.source_ref || r.source_kind || '',
      destination: r.destination_ref || r.destination_kind || '',
      ports: r.ports || '',
      environment: r.environment || '',
    },
    module: 'design-studio',
    subqueue: 'rule_request',
    dc_fanout_count: pairs.length,
    dc_pairs: pairs,
  };
}

/** Convert a Group Change Request into a ReviewRequest row so the
 * Review tab reflects the group lifecycle (which stops at Deployed
 * — Certified is mapped to Approved for display only). */
function groupRequestToReview(g: GroupChangeRequest): ReviewRequest {
  // Group ops collapse onto the existing ReviewRequest.request_type
  // union: create + member changes → 'group_member_change';
  // delete → 'group_policy_change'. Keeps the Review queue typed
  // without expanding the shared union just for studio plumbing.
  const reqType: ReviewRequest['request_type'] = g.op === 'delete'
    ? 'group_policy_change'
    : 'group_member_change';
  // Group instances are now per-(name, dc_id, environment); surface
  // the DC scope in the queue so reviewers don't conflate the
  // per-DC instances of the same logical group.
  const dcId = String((g as unknown as { dc_id?: string }).dc_id || '').trim();
  return {
    id: `GR-${g.request_id}`,
    rule_id: g.group_name,
    rule_name: g.group_name,
    request_type: reqType,
    requestor: g.owner || g.owner_team || 'app_user',
    reviewer: '',
    status: RR_STATUS_TO_REVIEW[g.status] || 'Pending',
    submitted_at: g.created_at,
    reviewed_at: null,
    comments: g.description || '',
    review_notes: null,
    rule_summary: {
      application: g.group_name.split('-')[1] || 'N/A',
      source: g.added_members.join(', ') || '—',
      destination: g.removed_members.join(', ') || '—',
      ports: '',
      environment: g.environment || '',
    },
    module: 'design-studio',
    subqueue: 'group_change',
    dc_fanout_count: dcId ? 1 : 0,
    dc_pairs: dcId ? [dcId] : [],
  };
}

// Map route context to backend module values
const CONTEXT_TO_MODULE: Record<string, string> = {
  'firewall-studio': 'design-studio',
  'ngdc-standardization': 'migration-studio',
  'firewall-management': 'firewall-management',
  'design-studio': 'design-studio',
  'migration-studio': 'migration-studio',
  'org-admin': 'org-admin',
};

export default function ReviewPage(props: { context?: string }) {
  const moduleContext = props.context ? (CONTEXT_TO_MODULE[props.context] || props.context) : '';
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnv, setSelectedEnv] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>(moduleContext);
  const [activeTab, setActiveTab] = useState('Pending');
  const [selectedSubqueue, setSelectedSubqueue] = useState<string>('');
  const approvalModal = useModal<ReviewRequest>();
  const { notification, showNotification } = useNotification();

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      // Pull every queue that drives the rule + group lifecycle so the
      // Review & Approval tab is the canonical "what needs human
      // attention" view. Without this it drifted out of sync with
      // Studio's RuleRequestsPanel + GroupChangeRequestsPanel because
      // those wrote to different collections.
      const [reviewData, modData, ruleRequests, groupRequests] = await Promise.all([
        getReviewRequests(),
        getRuleModifications(),
        listRuleRequests().catch(() => [] as RuleRequestRecord[]),
        listGroupChangeRequests().catch(() => [] as GroupChangeRequest[]),
      ]);
      const modReviews = modData.map(modToReview);
      const existingModIds = new Set(reviewData.filter(r => r.modification_id).map(r => r.modification_id));
      const uniqueModReviews = modReviews.filter(mr => !existingModIds.has(mr.modification_id));
      const rrReviews = (ruleRequests || []).map(ruleRequestToReview);
      const grReviews = (groupRequests || []).map(groupRequestToReview);
      // Tag pre-existing review records with `subqueue: 'review'` so
      // every row in the queue carries a queue-of-origin and the
      // breakdown count cards reconcile to the table total.
      const tagged = reviewData.map(r => r.subqueue ? r : { ...r, subqueue: 'review' as const });
      setReviews([...tagged, ...uniqueModReviews, ...rrReviews, ...grReviews]);
    } catch {
      showNotification('Failed to load reviews', 'error');
    }
    setLoading(false);
  }, [showNotification]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const envFilteredReviews = reviews.filter(r => {
    if (selectedEnv && r.rule_summary?.environment !== selectedEnv) return false;
    // Module-level filtering: each module sees only its own reviews
    if (selectedModule) {
      const mod = r.module || (r as unknown as Record<string, string>).module || '';
      // Strict: if module is set on the review, it must match; if not set, exclude from filtered views
      if (mod !== selectedModule) return false;
    }
    if (selectedSubqueue && (r.subqueue || 'review') !== selectedSubqueue) return false;
    return true;
  });

  const filteredReviews = envFilteredReviews.filter(r => {
    if (activeTab === 'All') return true;
    return r.status === activeTab;
  });

  const counts = {
    All: envFilteredReviews.length,
    Pending: envFilteredReviews.filter(r => r.status === 'Pending').length,
    Approved: envFilteredReviews.filter(r => r.status === 'Approved').length,
    Rejected: envFilteredReviews.filter(r => r.status === 'Rejected').length,
  };

  // Per-queue breakdown: every row in the table has a `subqueue` tag
  // (rule_request / group_change / modification / review). The
  // breakdown card reconciles to the table's All count so reviewers
  // can see at a glance how the workload is split across queues.
  const subCounts = {
    rule_request: envFilteredReviews.filter(r => (r.subqueue || 'review') === 'rule_request').length,
    group_change: envFilteredReviews.filter(r => (r.subqueue || 'review') === 'group_change').length,
    modification: envFilteredReviews.filter(r => (r.subqueue || 'review') === 'modification').length,
    review: envFilteredReviews.filter(r => (r.subqueue || 'review') === 'review').length,
  };
  // Total fan-out — how many DC-scoped physical rows ride under the
  // currently-filtered rule requests. Surfaces the "1 logical submit
  // = N DC requests" architecture in a single number.
  const fanoutTotal = envFilteredReviews.reduce(
    (acc, r) => acc + (typeof r.dc_fanout_count === 'number' ? r.dc_fanout_count : 0),
    0,
  );

  const handleApprove = async (reviewId: string, notes: string) => {
    try {
      const isModification = reviewId.startsWith('MOD-');
      const isRuleRequest = reviewId.startsWith('RR-');
      const isGroupRequest = reviewId.startsWith('GR-');
      const review = reviews.find(r => r.id === reviewId);
      const isPolicyChange = review?.request_type?.startsWith('policy_');
      if (isRuleRequest) {
        // Route directly to the canonical rule-request lifecycle so
        // Studio's RuleRequestsPanel sees the same Approved status.
        await setRuleRequestStatus(reviewId.slice(3), 'Approved', notes);
        showNotification('Rule request approved', 'success');
      } else if (isGroupRequest) {
        await setGroupChangeRequestStatus(reviewId.slice(3), 'Approved', notes);
        showNotification('Group change request approved', 'success');
      } else if (isModification) {
        await approveRuleModification(reviewId, notes);
        showNotification('Rule modification approved successfully', 'success');
      } else if (isPolicyChange && review?.policy_change_id) {
        await approvePolicyChange(String(review.policy_change_id), notes);
        showNotification('Policy change approved and applied', 'success');
      } else {
        await approveReview(reviewId, notes);
        showNotification('Review approved successfully', 'success');
      }
      loadReviews();
    } catch {
      showNotification('Failed to approve', 'error');
    }
  };

  const handleReject = async (reviewId: string, notes: string) => {
    try {
      const isModification = reviewId.startsWith('MOD-');
      const isRuleRequest = reviewId.startsWith('RR-');
      const isGroupRequest = reviewId.startsWith('GR-');
      const review = reviews.find(r => r.id === reviewId);
      const isPolicyChange = review?.request_type?.startsWith('policy_');
      if (isRuleRequest) {
        await setRuleRequestStatus(reviewId.slice(3), 'Rejected', notes);
        showNotification('Rule request rejected', 'warning');
      } else if (isGroupRequest) {
        await setGroupChangeRequestStatus(reviewId.slice(3), 'Rejected', notes);
        showNotification('Group change request rejected', 'warning');
      } else if (isModification) {
        await rejectRuleModification(reviewId, notes);
        showNotification('Rule modification rejected', 'warning');
      } else if (isPolicyChange && review?.policy_change_id) {
        await rejectPolicyChange(String(review.policy_change_id), notes);
        showNotification('Policy change rejected', 'warning');
      } else {
        await rejectReview(reviewId, notes);
        showNotification('Review rejected', 'warning');
      }
      loadReviews();
    } catch {
      showNotification('Failed to reject', 'error');
    }
  };

  const exportableTypes = new Set(['new_rule', 'modify_rule', 'delete_rule']);

  const handleExportRequest = (review: ReviewRequest) => {
    const headers = ['Request ID', 'Rule ID', 'Request Type', 'Application', 'Source', 'Destination', 'Ports', 'Environment', 'Status', 'Requestor', 'Submitted At', 'Reviewer', 'Comments'];
    const row = [
      review.id, review.rule_id, review.request_type.replace(/_/g, ' '),
      review.rule_summary?.application || '', review.rule_summary?.source || '',
      review.rule_summary?.destination || '', review.rule_summary?.ports || '',
      review.rule_summary?.environment || '', review.status, review.requestor,
      review.submitted_at || '', review.reviewer || '', review.comments || '',
    ];
    if (review.delta) {
      headers.push('Added', 'Removed', 'Changed');
      row.push(
        Object.entries(review.delta.added).map(([k, v]) => `${k.startsWith('group:') ? `Group Members (${k.slice(6)})` : k}: ${v.join(', ')}`).join('; '),
        Object.entries(review.delta.removed).map(([k, v]) => `${k.startsWith('group:') ? `Group Members (${k.slice(6)})` : k}: ${v.join(', ')}`).join('; '),
        Object.entries(review.delta.changed).map(([k, v]) => `${k.startsWith('group:') ? `Group Members (${k.slice(6)})` : k}: ${v.from} -> ${v.to}`).join('; '),
      );
    }
    const csvContent = [headers, row].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `request-${review.request_type}-${review.rule_id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Request exported successfully', 'success');
  };

  const columns: Column<ReviewRequest>[] = [
    { key: 'rule_id', header: 'Rule ID', sortable: true, width: '120px' },
    {
      key: 'request_type', header: 'Type', sortable: true, width: '120px',
      render: (_, row) => (
        <span className={`text-xs capitalize px-1.5 py-0.5 rounded ${
          row.request_type === 'new_rule' ? 'bg-green-50 text-green-700' :
          row.request_type === 'modify_rule' ? 'bg-amber-50 text-amber-700' :
          row.request_type === 'delete_rule' ? 'bg-red-50 text-red-700' :
          row.request_type === 'group_policy_change' ? 'bg-purple-50 text-purple-700' :
          row.request_type === 'group_created' ? 'bg-violet-50 text-violet-700' :
          row.request_type === 'group_member_change' ? 'bg-fuchsia-50 text-fuchsia-700' :
          row.request_type === 'policy_add' ? 'bg-teal-50 text-teal-700' :
          row.request_type === 'policy_modify' ? 'bg-indigo-50 text-indigo-700' :
          row.request_type === 'policy_delete' ? 'bg-rose-50 text-rose-700' :
          'bg-gray-50 text-gray-700'
        }`}>{row.request_type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'rule_summary', header: 'Application', sortable: false, width: '120px',
      render: (_, row) => <span className="text-xs">{row.rule_summary?.application || 'N/A'}</span>,
    },
    {
      key: 'rule_summary.source', header: 'Source', sortable: false, width: '150px',
      render: (_, row) => <span className="font-mono text-xs">{row.rule_summary?.source || 'N/A'}</span>,
    },
    {
      key: 'rule_summary.destination', header: 'Destination', sortable: false, width: '150px',
      render: (_, row) => <span className="font-mono text-xs">{row.rule_summary?.destination || 'N/A'}</span>,
    },
    {
      key: 'dc_fanout_count', header: 'DCs', sortable: true, width: '90px',
      render: (_, row) => {
        const n = typeof row.dc_fanout_count === 'number' ? row.dc_fanout_count : 0;
        if (!n) return <span className="text-[11px] text-gray-400">—</span>;
        const tip = (row.dc_pairs || []).join(' · ') || `${n} DC${n === 1 ? '' : 's'}`;
        const cls = row.subqueue === 'rule_request'
          ? 'bg-blue-50 text-blue-700 border border-blue-200'
          : row.subqueue === 'group_change'
            ? 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200'
            : 'bg-gray-50 text-gray-700 border border-gray-200';
        return (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${cls}`} title={tip}>
            {n} {row.subqueue === 'rule_request' ? 'DC' : 'DC'}{n === 1 ? '' : 's'}
          </span>
        );
      },
    },
    {
      key: 'status', header: 'Status', sortable: true, width: '110px',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'submitted_at', header: 'Submitted', sortable: true, width: '150px',
      render: (_, row) => row.submitted_at ? new Date(row.submitted_at).toLocaleString() : 'N/A',
    },
    {
      key: 'reviewer', header: 'Reviewer', sortable: true, width: '100px',
      render: (_, row) => row.reviewer || 'Unassigned',
    },
    {
      key: '_actions', header: 'Actions', sortable: false, width: '140px',
      render: (_, row) => (
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => approvalModal.open(row)}
            className={`px-2 py-1 text-xs font-medium rounded ${
              row.status === 'Pending'
                ? 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            {row.status === 'Pending' ? 'Review' : 'View'}
          </button>
          {exportableTypes.has(row.request_type) && (
            <button
              onClick={() => handleExportRequest(row)}
              className="px-2 py-1 text-xs font-medium text-teal-700 bg-teal-50 rounded hover:bg-teal-100"
            >
              Export
            </button>
          )}
        </div>
      ),
    },
  ];

  const tabs = [
    { id: 'All', label: 'All', count: counts.All },
    { id: 'Pending', label: 'Pending', count: counts.Pending },
    { id: 'Approved', label: 'Approved', count: counts.Approved },
    { id: 'Rejected', label: 'Rejected', count: counts.Rejected },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {notification && <Notification message={notification.message} type={notification.type} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review & Approval</h1>
          <p className="text-sm text-gray-500 mt-1">Review migration and firewall rule requests. Export new/modify/remove requests from the table below.</p>
        </div>
        <div className="flex items-center gap-3">
          {!moduleContext && (
            <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              value={selectedModule} onChange={e => setSelectedModule(e.target.value)}>
              <option value="">All Modules</option>
              <option value="firewall-management">Firewall Management</option>
              <option value="design-studio">Design Studio</option>
              <option value="migration-studio">Migration Studio</option>
              <option value="org-admin">Policy Matrix (Org Admin)</option>
            </select>
          )}
          <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            value={selectedEnv} onChange={e => setSelectedEnv(e.target.value)}>
            <option value="">All Environments</option>
            <option value="Production">Production</option>
            <option value="Non-Production">Non-Production</option>
            <option value="Pre-Production">Pre-Production</option>
          </select>
          <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            value={selectedSubqueue}
            onChange={e => setSelectedSubqueue(e.target.value)}
            title="Filter by source queue (Rule Requests / Group Changes / Modifications / Other Reviews)">
            <option value="">All Queues</option>
            <option value="rule_request">Rule Requests ({subCounts.rule_request})</option>
            <option value="group_change">Group Changes ({subCounts.group_change})</option>
            <option value="modification">Modifications ({subCounts.modification})</option>
            <option value="review">Other Reviews ({subCounts.review})</option>
          </select>
          <span className="text-xs text-gray-500">Export is available for Add / Modify / Remove requests</span>
        </div>
      </div>

      {/* Per-queue breakdown — every count card reconciles to the
          table total so reviewers can verify "we are seeing every
          rule request + group change + modification + plain review".
          The Fan-out card surfaces how many DC-scoped physical rows
          ride under the currently-filtered rule requests. */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Rule Requests', value: subCounts.rule_request, color: 'bg-blue-50 text-blue-800 border border-blue-200', sub: 'rule_request' },
          { label: 'Group Changes', value: subCounts.group_change, color: 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200', sub: 'group_change' },
          { label: 'Modifications', value: subCounts.modification, color: 'bg-amber-50 text-amber-800 border border-amber-200', sub: 'modification' },
          { label: 'Other Reviews', value: subCounts.review, color: 'bg-gray-50 text-gray-800 border border-gray-200', sub: 'review' },
          { label: 'DC Fan-out (rows)', value: fanoutTotal, color: 'bg-emerald-50 text-emerald-800 border border-emerald-200', sub: '' },
        ].map(card => (
          <button
            key={card.label}
            type="button"
            onClick={() => card.sub && setSelectedSubqueue(selectedSubqueue === card.sub ? '' : card.sub)}
            className={`text-left p-3 rounded-lg ${card.color} ${card.sub ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'} ${card.sub && selectedSubqueue === card.sub ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
            title={card.sub ? `Click to filter by ${card.label}` : 'Total per-DC physical rows across the currently-filtered rule requests'}
          >
            <div className="text-xl font-bold">{card.value}</div>
            <div className="text-[11px] font-medium mt-0.5 leading-tight">{card.label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Reviews', value: counts.All, color: 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-800' },
          { label: 'Pending', value: counts.Pending, color: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800' },
          { label: 'Approved', value: counts.Approved, color: 'bg-gradient-to-br from-green-100 to-green-200 text-green-800' },
          { label: 'Rejected', value: counts.Rejected, color: 'bg-gradient-to-br from-red-100 to-red-200 text-red-800' },
        ].map(card => (
          <div key={card.label} className={`p-4 rounded-lg ${card.color}`}>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm font-medium mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-lg shadow-sm">
        <div className="px-4 pt-4">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <DataTable
              data={filteredReviews}
              columns={columns}
              keyField="id"
              searchPlaceholder="Search by rule ID, app, source, destination, requestor..."
              searchFields={['id', 'rule_id', 'rule_name', 'request_type', 'requestor', 'reviewer', 'comments']}
              onRowClick={(row) => approvalModal.open(row)}
              emptyMessage="No review requests found. Select rules for migration in the Migration to NGDC page and submit for review."
              defaultPageSize={25}
            />
          )}
        </div>
      </div>

      <ApprovalModal
        isOpen={approvalModal.isOpen}
        onClose={approvalModal.close}
        review={approvalModal.data}
        onApprove={handleApprove}
        onReject={handleReject}
        onCompileRule={compileRule}
      />
    </div>
  );
}

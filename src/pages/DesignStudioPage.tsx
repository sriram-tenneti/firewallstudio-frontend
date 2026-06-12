import { useState, useEffect, useCallback } from 'react';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Tabs } from '@/components/shared/Tabs';
import { Notification } from '@/components/shared/Notification';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { RuleDetailModal } from '@/components/design-studio/RuleDetailModal';
import { RuleCompilerView } from '@/components/design-studio/RuleCompilerView';
import { GroupManagerModal } from '@/components/design-studio/GroupManagerModal';
import { RuleModifyModal } from '@/components/design-studio/RuleModifyModal';
import type { RuleModification } from '@/components/design-studio/RuleModifyModal';
import RuleRequestBuilder from '@/components/design-studio/RuleRequestBuilder';
import RuleRequestsPanel from '@/components/design-studio/RuleRequestsPanel';
import GroupChangeRequestBuilder from '@/components/design-studio/GroupChangeRequestBuilder';
import GroupChangeRequestsPanel from '@/components/design-studio/GroupChangeRequestsPanel';
import { useModal } from '@/hooks/useModal';
import { useNotification } from '@/hooks/useNotification';
import type { FirewallRule, Application } from '@/types';
import type { Column } from '@/components/shared/DataTable';
import { createStudioRuleModification } from '@/lib/api';
import * as api from '@/lib/api';
import { useTeam } from '@/contexts/TeamContext';

export function DesignStudioPage() {
  const { team, isGodView } = useTeam();
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [selectedEnv, setSelectedEnv] = useState<string>('');
  const [activeTab, setActiveTab] = useState('All');
  const [viewMode, setViewMode] = useState<'table' | 'multi_dc'>('table');
  const [requestsReloadKey, setRequestsReloadKey] = useState(0);
  const [highlightRequestId, setHighlightRequestId] = useState<string | null>(null);
  // Wizard mode: while the user is actively building a new rule request,
  // the previous-requests listing is hidden so the wizard view stays
  // focused (no double-context: "I'm creating a rule" vs. "here are old
  // rules"). Toggled via the "+ New Rule Request" button below.
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const detailModal = useModal<FirewallRule>();
  const modifyModal = useModal<FirewallRule>();
  const compilerModal = useModal<string>();
  const groupModal = useModal();
  const deleteConfirm = useModal<string>();
  const { notification, showNotification } = useNotification();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const hideSeed = api.isHideSeedEnabled();
      const [rulesData, appsData] = await Promise.all([
        hideSeed
          ? api.getRealRules().then(rawArr => rawArr.map(r => api.transformRule(r as never)))
          : api.getRules(),
        api.getApplications(isGodView ? undefined : { team }),
      ]);
      setRules(rulesData);
      setApplications(appsData);
    } catch {
      showNotification('Failed to load data', 'error');
    }
    setLoading(false);
  }, [showNotification, team, isGodView]);

  useEffect(() => { loadData(); }, [loadData]);

  // Resolve selected app_distributed_id (e.g. "AD-1001") to app_id (e.g. "CRM")
  // so the filter works against rules that store app_id in `application`
  const resolvedAppId = (() => {
    if (!selectedApp) return '';
    const app = applications.find(a => (a.app_distributed_id || a.app_id) === selectedApp);
    return app ? app.app_id : selectedApp;
  })();

  const matchesApp = (r: FirewallRule) => {
    if (!selectedApp) return true;
    const rAppDist = (r as unknown as Record<string, string>).app_distributed_id || '';
    return r.application === selectedApp || r.application === resolvedAppId || rAppDist === selectedApp;
  };

  const filteredRules = rules.filter(r => {
    if (r.status === 'Deleted') return false;
    if (selectedApp && !matchesApp(r)) return false;
    if (selectedEnv && r.environment !== selectedEnv) return false;
    if (activeTab === 'All') return true;
    return r.status === activeTab;
  });
  const statusCounts = {
    All: rules.filter(r => r.status !== 'Deleted' && matchesApp(r) && (!selectedEnv || r.environment === selectedEnv)).length,
    Draft: rules.filter(r => r.status === 'Draft' && matchesApp(r) && (!selectedEnv || r.environment === selectedEnv)).length,
    'Pending Review': rules.filter(r => r.status === 'Pending Review' && matchesApp(r) && (!selectedEnv || r.environment === selectedEnv)).length,
    Approved: rules.filter(r => r.status === 'Approved' && matchesApp(r) && (!selectedEnv || r.environment === selectedEnv)).length,
    Deployed: rules.filter(r => r.status === 'Deployed' && matchesApp(r) && (!selectedEnv || r.environment === selectedEnv)).length,
    Certified: rules.filter(r => r.status === 'Certified' && matchesApp(r) && (!selectedEnv || r.environment === selectedEnv)).length,
  };

  const handleModify = async (ruleId: string, changes: RuleModification) => {
    try {
      const srcValue = changes.source_entries.map(e => e.value).join(',');
      const dstValue = changes.destination_entries.map(e => e.value).join(',');
      // Update the rule itself
      await api.updateRule(ruleId, {
        source: { source_type: 'Group', ip_address: null, cidr: null, group_name: srcValue, ports: changes.ports, neighbourhood: null, security_zone: '' },
        destination: { name: dstValue, security_zone: '', dest_ip: null, ports: changes.ports, is_predefined: false },
      });
      // Create a modification record with delta so it appears in Review
      const hasDelta = Object.keys(changes.delta.added).length > 0 ||
                       Object.keys(changes.delta.removed).length > 0 ||
                       Object.keys(changes.delta.changed).length > 0;
      if (hasDelta) {
        await createStudioRuleModification(
          ruleId,
          { source: srcValue, destination: dstValue, ports: changes.ports, protocol: changes.protocol, action: changes.action },
          changes.delta,
          'Studio rule modification'
        );
      }
      showNotification('Rule modified successfully' + (hasDelta ? ' — submitted for review' : ''), 'success');
      loadData();
    } catch {
      showNotification('Failed to modify rule', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.data) return;
    try {
      await api.deleteRule(deleteConfirm.data);
      showNotification('Rule deleted', 'success');
      deleteConfirm.close();
      loadData();
    } catch {
      showNotification('Failed to delete rule', 'error');
    }
  };

  const handleSubmitReview = async (ruleId: string) => {
    try {
      await api.submitForReview(ruleId, 'Submitted for SNS review');
      showNotification('Rule submitted for review', 'success');
      detailModal.close();
      loadData();
    } catch {
      showNotification('Failed to submit for review', 'error');
    }
  };

  const handleCertify = async (ruleId: string) => {
    try {
      await api.certifyRule(ruleId);
      showNotification('Rule certified', 'success');
      loadData();
    } catch {
      showNotification('Failed to certify rule', 'error');
    }
  };

  const handleApproveRule = async (ruleId: string) => {
    try {
      await api.transitionRuleStatus(ruleId, 'Approved', 'studio', 'reviewer');
      showNotification(`Rule ${ruleId} approved`, 'success');
      detailModal.close();
      loadData();
    } catch {
      showNotification('Failed to approve rule', 'error');
    }
  };

  const handleDeployRule = async (ruleId: string) => {
    try {
      await api.transitionRuleStatus(ruleId, 'Deployed', 'studio', 'reviewer');
      showNotification(`Rule ${ruleId} deployed`, 'success');
      detailModal.close();
      loadData();
    } catch {
      showNotification('Failed to deploy rule', 'error');
    }
  };

  const handleRejectRule = async (ruleId: string) => {
    try {
      await api.transitionRuleStatus(ruleId, 'Rejected', 'studio', 'reviewer');
      showNotification(`Rule ${ruleId} rejected`, 'success');
      detailModal.close();
      loadData();
    } catch {
      showNotification('Failed to reject rule', 'error');
    }
  };

  const _handleSubmitChange = async (ruleId: string) => {
    try {
      // Placeholder: In production this calls ServiceNow API to create CHG
      const placeholderCHG = `CHG${String(Date.now()).slice(-7)}`;
      showNotification(`Change ${placeholderCHG} submitted for rule ${ruleId}. Rule will be deployed upon CHG closure.`, 'success');
      loadData();
    } catch {
      showNotification('Failed to submit change request', 'error');
    }
  };
  void _handleSubmitChange;



  function getSourceDisplay(rule: FirewallRule): string {
    if (typeof rule.source === 'string') return rule.source;
    if (rule.source && typeof rule.source === 'object') {
      const s = rule.source as unknown as Record<string, string>;
      return s.group_name || s.ip_address || s.cidr || '';
    }
    return '';
  }

  function getDestDisplay(rule: FirewallRule): string {
    if (typeof rule.destination === 'string') return rule.destination;
    if (rule.destination && typeof rule.destination === 'object') {
      const d = rule.destination as unknown as Record<string, string>;
      return d.name || d.dest_ip || '';
    }
    return '';
  }

  const columns: Column<FirewallRule>[] = [
    { key: 'rule_id', header: 'Rule ID', sortable: true, width: '100px' },
    { key: 'application', header: 'App ID', sortable: true, width: '90px' },
    {
      key: 'source', header: 'Source', sortable: false, width: '180px',
      render: (_, row) => <span className="font-mono text-xs truncate block">{getSourceDisplay(row)}</span>,
    },
    {
      key: 'destination', header: 'Destination', sortable: false, width: '180px',
      render: (_, row) => <span className="font-mono text-xs truncate block">{getDestDisplay(row)}</span>,
    },
    { key: 'environment', header: 'Environment', sortable: true, width: '110px' },
    {
      key: 'policy_result', header: 'Policy', sortable: true, width: '120px',
      render: (_, row) => row.policy_result ? <StatusBadge status={row.policy_result} /> : <span className="text-gray-400 text-xs">N/A</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true, width: '120px',
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: '_actions', header: 'Actions', sortable: false, width: '360px',
      render: (_, row) => {
        const st = row.status;
        const canEdit = st === 'Draft';
        const canSubmit = st === 'Draft';
        const canApprove = st === 'Pending Review';
        const canReject = st === 'Pending Review';
        const canDeploy = st === 'Approved';
        const canModify = st === 'Deployed' || st === 'Certified';
        const canCompile = st === 'Deployed' || st === 'Certified' || st === 'Approved';
        const canCertify = st === 'Deployed';
        return (
          <div className="flex gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
            <button onClick={() => detailModal.open(row)} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100">View</button>
            {canEdit && (
              <button onClick={() => modifyModal.open(row)} className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded hover:bg-amber-100">Edit</button>
            )}
            {canSubmit && (
              <button onClick={() => handleSubmitReview(row.rule_id)} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100">Submit</button>
            )}
            {canApprove && (
              <button onClick={() => handleApproveRule(row.rule_id)} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100">Approve</button>
            )}
            {canReject && (
              <button onClick={() => handleRejectRule(row.rule_id)} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100">Reject</button>
            )}
            {canDeploy && (
              <button onClick={() => handleDeployRule(row.rule_id)} className="px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 rounded hover:bg-sky-100">Deploy</button>
            )}
            {canModify && (
              <button onClick={() => modifyModal.open(row)} className="px-2 py-1 text-xs font-medium text-teal-700 bg-teal-50 rounded hover:bg-teal-100">Modify</button>
            )}
            {canCertify && (
              <button onClick={() => handleCertify(row.rule_id)} className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded hover:bg-purple-100">Certify</button>
            )}
            {canCompile && (
              <button onClick={() => compilerModal.open(row.rule_id)} className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100">Compile</button>
            )}
            {canEdit && (
              <button onClick={() => deleteConfirm.open(row.rule_id)} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100">Del</button>
            )}
          </div>
        );
      },
    },
  ];

  const tabs = [
    { id: 'All', label: 'All', count: statusCounts.All },
    { id: 'Draft', label: 'Draft', count: statusCounts.Draft },
    { id: 'Pending Review', label: 'Pending Review', count: statusCounts['Pending Review'] },
    { id: 'Approved', label: 'Approved', count: statusCounts.Approved },
    { id: 'Deployed', label: 'Deployed', count: statusCounts.Deployed },
    { id: 'Certified', label: 'Certified', count: statusCounts.Certified },
  ];

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {notification && <Notification message={notification.message} type={notification.type} />}

      {api.isHideSeedEnabled() && (
        <div className="mb-4 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-700">REAL DATA MODE</span>
          <span className="text-xs text-indigo-500">Seed/test data is hidden. Showing only real imported and user-created data. Change in Settings &gt; Data Management.</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Firewall Studio</h1>
          <p className="text-sm text-gray-500 mt-1">Create, manage, and compile firewall rules with NGDC compliance</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            value={selectedApp}
            onChange={e => setSelectedApp(e.target.value)}
          >
            <option value="">All Applications</option>
            {applications.map(app => (
              <option key={app.app_distributed_id || app.app_id} value={app.app_distributed_id || app.app_id}>{app.app_distributed_id || app.app_id}</option>
            ))}
          </select>
          <select
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            value={selectedEnv}
            onChange={e => setSelectedEnv(e.target.value)}
          >
            <option value="">All Environments</option>
            <option value="Production">Production</option>
            <option value="Non-Production">Non-Production</option>
            <option value="Pre-Production">Pre-Production</option>
          </select>
          <button onClick={() => groupModal.open()} className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100">
            App Groups
          </button>
          <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
            <button onClick={() => setViewMode('table')} className={`px-3 py-2 text-sm font-medium ${viewMode === 'table' ? 'bg-rose-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Rules</button>
            <button onClick={() => setViewMode('multi_dc')} className={`px-3 py-2 text-sm font-medium border-l border-gray-300 ${viewMode === 'multi_dc' ? 'bg-rose-600 text-white' : 'bg-white text-rose-600 hover:bg-rose-50'}`}>+ New Rule</button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total', value: statusCounts.All, color: 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-800' },
          { label: 'Draft', value: statusCounts.Draft, color: 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800' },
          { label: 'Pending', value: statusCounts['Pending Review'], color: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800' },
          { label: 'Approved', value: statusCounts.Approved, color: 'bg-gradient-to-br from-green-100 to-green-200 text-green-800' },
          { label: 'Deployed', value: statusCounts.Deployed, color: 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-800' },
          { label: 'Certified', value: statusCounts.Certified, color: 'bg-gradient-to-br from-purple-100 to-purple-200 text-purple-800' },
        ].map(card => (
          <div key={card.label} className={`p-3 rounded-lg shadow-sm ${card.color}`}>
            <div className="text-xl font-bold">{card.value}</div>
            <div className="text-xs font-medium mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {viewMode === 'multi_dc' ? (
        <div className="bg-white border rounded-lg shadow-sm p-4">
          <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-rose-800">
                {isWizardOpen ? 'New Rule · Multi-DC Request' : 'Rule Requests'}
              </div>
              <div className="text-xs text-rose-600">
                {isWizardOpen
                  ? 'One logical request → deterministic per-DC PhysicalRule fan-out auto-derived from App Management.'
                  : 'Approved → Deployed → Certified pipeline. Click below to start a new request.'}
              </div>
            </div>
            <button
              onClick={() => setIsWizardOpen(o => !o)}
              className={`px-3 py-1.5 text-xs rounded font-medium ${
                isWizardOpen
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-rose-600 text-white hover:bg-rose-700'
              }`}
            >
              {isWizardOpen ? 'Cancel · Back to list' : '+ New Rule Request'}
            </button>
          </div>
          {isWizardOpen ? (
            <RuleRequestBuilder
              applications={applications}
              onSubmitted={(id) => {
                loadData();
                setRequestsReloadKey(k => k + 1);
                if (id) setHighlightRequestId(id);
                setIsWizardOpen(false);
              }}
            />
          ) : (
            <div>
              <RuleRequestsPanel
                environment={(selectedEnv as '' | 'Production' | 'Non-Production' | 'Pre-Production')}
                reloadKey={requestsReloadKey}
                highlightId={highlightRequestId}
                onChanged={() => { loadData(); setRequestsReloadKey(k => k + 1); }}
              />
            </div>
          )}
          <div className="mt-6 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="text-sm font-semibold text-purple-800">Group Change Requests</div>
            <div className="text-xs text-purple-600">Standalone group create / modify / delete. Lifecycle: Pending → Approved → Deployed → Certified. Until Deployed, the group is portal-only and any rule that references it is blocked from being marked Deployed.</div>
          </div>
          <div className="mt-3">
            <GroupChangeRequestBuilder
              environment={selectedEnv}
              onSubmitted={() => setRequestsReloadKey(k => k + 1)}
            />
          </div>
          <div className="mt-3">
            <GroupChangeRequestsPanel
              environment={selectedEnv}
              reloadKey={requestsReloadKey}
              onChanged={() => { loadData(); setRequestsReloadKey(k => k + 1); }}
            />
          </div>
        </div>
      ) : (
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
              data={filteredRules}
              columns={columns}
              keyField="rule_id"
              searchPlaceholder="Search by IP, group, app, rule ID..."
              searchFields={['rule_id', 'application', 'environment', 'source', 'destination']}
              onRowClick={(row) => detailModal.open(row)}
              emptyMessage="No firewall rules found"
              defaultPageSize={50}
            />
          )}
        </div>
      </div>
      )}

      {/* Modals */}

      <RuleDetailModal
        isOpen={detailModal.isOpen}
        onClose={detailModal.close}
        rule={detailModal.data}
        onEdit={() => { if (detailModal.data) { const row = detailModal.data; detailModal.close(); modifyModal.open(row); } }}
        onCompile={() => { if (detailModal.data) { detailModal.close(); compilerModal.open(detailModal.data.rule_id); } }}
        onSubmitReview={() => { if (detailModal.data) { handleSubmitReview(detailModal.data.rule_id); } }}
        onApprove={() => { if (detailModal.data) { handleApproveRule(detailModal.data.rule_id); } }}
        onReject={() => { if (detailModal.data) { handleRejectRule(detailModal.data.rule_id); } }}
        onDeploy={() => { if (detailModal.data) { handleDeployRule(detailModal.data.rule_id); } }}
        onCertify={() => { if (detailModal.data) { handleCertify(detailModal.data.rule_id); detailModal.close(); } }}
      />

      <RuleModifyModal isOpen={modifyModal.isOpen} onClose={modifyModal.close} rule={modifyModal.data} onSave={handleModify} />
      <RuleCompilerView isOpen={compilerModal.isOpen} onClose={compilerModal.close} ruleId={compilerModal.data} />
      <GroupManagerModal isOpen={groupModal.isOpen} onClose={groupModal.close} appId={selectedApp || undefined} applications={applications.map(a => ({ app_id: a.app_id, app_distributed_id: a.app_distributed_id, name: a.name }))} environment={selectedEnv || undefined} readOnly />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={deleteConfirm.close}
        onConfirm={handleDelete}
        title="Delete Rule"
        message={`Are you sure you want to delete rule ${deleteConfirm.data}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />

    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { Tabs } from '@/components/shared/Tabs';
import { Notification } from '@/components/shared/Notification';
import { Modal } from '@/components/shared/Modal';
import { useNotification } from '@/hooks/useNotification';
import { useModal } from '@/hooks/useModal';
import type { ADUserGroup, ADUser, ADConfig, Application, AppDCMapping, NhSecurityZone } from '@/types';
import * as api from '@/lib/api';
import SharedServicesTab from './settings/SharedServicesTab';
import PortCatalogTab from './settings/PortCatalogTab';
import { AppPresenceMatrix } from './settings/AppPresenceMatrix';
import PresencePerDcEditor, { type PresenceRow, withRowUids } from '@/components/shared/PresencePerDcEditor';
import ItsmConnectorsTab from './settings/ItsmConnectorsTab';
import BirthrightRulesTab from './settings/BirthrightRulesTab';
import SecurityZoneNamingTab from './settings/SecurityZoneNamingTab';

const INITIAL_GROUPS: ADUserGroup[] = [
  { id: 'g1', group_name: 'FW-Admins', access_type: 'Admin', description: 'Full administrative access to all features', member_count: 5, applications: ['*'] },
  { id: 'g2', group_name: 'FW-Approvers', access_type: 'Approver', description: 'Can review and approve/reject rule requests', member_count: 12, applications: ['*'] },
  { id: 'g3', group_name: 'FW-Operators', access_type: 'Operator', description: 'Can create and modify firewall rules', member_count: 25, applications: ['APP01', 'APP02', 'APP03'] },
  { id: 'g4', group_name: 'FW-Viewers', access_type: 'Viewer', description: 'Read-only access to view rules and reports', member_count: 50, applications: ['*'] },
  { id: 'g5', group_name: 'FW-Auditors', access_type: 'Auditor', description: 'Audit access with full read and export capabilities', member_count: 8, applications: ['*'] },
];

const INITIAL_USERS: ADUser[] = [
  { id: 'u1', username: 'admin.user', display_name: 'Admin User', email: 'admin@corp.local', groups: ['FW-Admins'], access_type: 'Admin', last_login: '2025-01-20T08:00:00Z', is_active: true },
  { id: 'u2', username: 'john.approver', display_name: 'John Approver', email: 'john.a@corp.local', groups: ['FW-Approvers'], access_type: 'Approver', last_login: '2025-01-19T14:30:00Z', is_active: true },
  { id: 'u3', username: 'jane.operator', display_name: 'Jane Operator', email: 'jane.o@corp.local', groups: ['FW-Operators'], access_type: 'Operator', last_login: '2025-01-20T09:15:00Z', is_active: true },
  { id: 'u4', username: 'bob.viewer', display_name: 'Bob Viewer', email: 'bob.v@corp.local', groups: ['FW-Viewers'], access_type: 'Viewer', last_login: '2025-01-18T16:00:00Z', is_active: true },
  { id: 'u5', username: 'audit.user', display_name: 'Audit User', email: 'audit@corp.local', groups: ['FW-Auditors'], access_type: 'Auditor', last_login: null, is_active: false },
];

const ACCESS_COLORS: Record<string, string> = {
  Admin: 'bg-red-100 text-red-700 border-red-200',
  Approver: 'bg-purple-100 text-purple-700 border-purple-200',
  Operator: 'bg-blue-100 text-blue-700 border-blue-200',
  Viewer: 'bg-gray-100 text-gray-700 border-gray-200',
  Auditor: 'bg-amber-100 text-amber-700 border-amber-200',
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('app_management');
  const [groups, setGroups] = useState<ADUserGroup[]>(INITIAL_GROUPS);
  const [users, setUsers] = useState<ADUser[]>(INITIAL_USERS);
  const [adConfig, setAdConfig] = useState<ADConfig>({
    server_url: 'ldaps://ad.corp.local:636',
    base_dn: 'DC=corp,DC=local',
    bind_user: 'svc_firewall@corp.local',
    search_filter: '(&(objectClass=user)(memberOf=CN=FW-*))',
    group_mapping: { 'FW-Admins': 'Admin', 'FW-Approvers': 'Approver', 'FW-Operators': 'Operator', 'FW-Viewers': 'Viewer', 'FW-Auditors': 'Auditor' },
    sync_interval_minutes: 30,
    is_connected: false,
    last_sync: null,
  });
  const { notification, showNotification, clearNotification } = useNotification();
  const groupModal = useModal<ADUserGroup>();
  const [editGroup, setEditGroup] = useState<Partial<ADUserGroup>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [policyMatrix, setPolicyMatrix] = useState<Record<string, unknown>[]>([]);
  const [namingStandards, setNamingStandards] = useState<Record<string, unknown>>({});

  // App-DC Mappings state
  const [appDCMappings, setAppDCMappings] = useState<AppDCMapping[]>([]);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [newMappingForm, setNewMappingForm] = useState<Partial<AppDCMapping>>({ app_id: '', component: 'APP', dc: 'ALPHA_NGDC', nh: '', sz: '', cidr: '', status: 'Active', notes: '' });
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editMappingForm, setEditMappingForm] = useState<Partial<AppDCMapping>>({});

  // Policy matrix environment filter
  const [policyEnvFilter, setPolicyEnvFilter] = useState<string>('all');
  const [prodMatrix, setProdMatrix] = useState<Record<string, unknown>[]>([]);
  const [nonprodMatrix, setNonprodMatrix] = useState<Record<string, unknown>[]>([]);
  const [preprodMatrix, setPreprodMatrix] = useState<Record<string, unknown>[]>([]);
  const [loadingRef, setLoadingRef] = useState(false);

  // Firewall Devices state
  const [fwDevices, setFwDevices] = useState<Record<string, unknown>[]>([]);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editDeviceForm, setEditDeviceForm] = useState<Record<string, unknown>>({});
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceForm, setNewDeviceForm] = useState<Record<string, unknown>>({ device_id: '', name: '', vendor: 'palo_alto', dc: 'ALPHA_NGDC', nh: '', sz: '', type: 'segmentation', status: 'Active', mgmt_ip: '', capabilities: '' });
  const [deviceFilter, setDeviceFilter] = useState({ dc: '', type: '', vendor: '' });

  // Firewall Device Patterns state (generic naming patterns)
  const [fwPatterns, setFwPatterns] = useState<Record<string, unknown>[]>([]);
  const [dcVendorMap, setDcVendorMap] = useState<Record<string, Record<string, string>>>({});
  const [fwViewMode, setFwViewMode] = useState<'patterns' | 'devices'>('patterns');

  // NH/SZ/DC Management state
  const [neighbourhoods, setNeighbourhoods] = useState<Record<string, unknown>[]>([]);
  const [securityZones, setSecurityZones] = useState<Record<string, unknown>[]>([]);
  const [ngdcDatacenters, setNgdcDatacenters] = useState<Record<string, unknown>[]>([]);
  const [editingNhId, setEditingNhId] = useState<string | null>(null);
  const [editNhForm, setEditNhForm] = useState<Record<string, unknown>>({});
  const [showAddNh, setShowAddNh] = useState(false);
  const [newNhForm, setNewNhForm] = useState<Record<string, unknown>>({ nh_id: '', name: '', environment: 'Production', cidr: '', description: '' });
  const [editingSzCode, setEditingSzCode] = useState<string | null>(null);
  const [editSzForm, setEditSzForm] = useState<Record<string, unknown>>({});
  const [showAddSz, setShowAddSz] = useState(false);
  const [newSzForm, setNewSzForm] = useState<Record<string, unknown>>({ code: '', name: '', risk_level: 'Low', pci_scope: false, fabric: 'Production', vrf_prefix: '', cidr: '', description: '' });
  const [editingDcId, setEditingDcId] = useState<string | null>(null);
  const [editDcForm, setEditDcForm] = useState<Record<string, unknown>>({});
  const [showAddDc, setShowAddDc] = useState(false);
  const [newDcForm, setNewDcForm] = useState<Record<string, unknown>>({ dc_id: '', name: '', region: '', status: 'Active', cidr: '', description: '', dc_type: 'NGDC' });
  const [legacyDatacenters, setLegacyDatacenters] = useState<Record<string, unknown>[]>([]);
  const [nhEnvFilter, setNhEnvFilter] = useState<string>('all');

  // SZ-level CIDR map (loaded from backend)
  const [szCidrMap, setSzCidrMap] = useState<NhSecurityZone[]>([]);
  const [expandedNhSzId, setExpandedNhSzId] = useState<string | null>(null);

  // Per-SZ CIDR bindings editing state (DC-specific)
  const [expandedSzBindings, setExpandedSzBindings] = useState<string | null>(null);
  const [newSzBindingForm, setNewSzBindingForm] = useState<{ dc: string; nh: string; cidr: string; vrf_id: string }>({ dc: '', nh: '', cidr: '', vrf_id: '' });
  const [editingSzBindingKey, setEditingSzBindingKey] = useState<string | null>(null);
  const [editSzBindingCidr, setEditSzBindingCidr] = useState<string>('');
  const [editSzBindingVrf, setEditSzBindingVrf] = useState<string>('');

  // Data Mode state (seed vs live)
  const [dataMode, setDataModeState] = useState<string>('seed');
  const [switchingMode, setSwitchingMode] = useState(false);
  const [resettingSeed, setResettingSeed] = useState(false);

  // Hide Seed Data toggle (persisted in localStorage)
  const [hideSeedData, setHideSeedData] = useState(() => localStorage.getItem('nfs_hide_seed') === 'true');

  // Data Management state
  const [userDataSummary, setUserDataSummary] = useState<{migration_data:Record<string,number>;studio_rules_count:number;legacy_rules_count:number;firewall_rules_count:number;reviews_count:number;groups_count:number;modifications_count:number;data_directory:string}|null>(null);
  const [clearingMigration, setClearingMigration] = useState(false);
  const [clearingStudio, setClearingStudio] = useState(false);
  const [clearingLegacy, setClearingLegacy] = useState(false);
  const [clearingReviews, setClearingReviews] = useState(false);
  const [clearingFwRules, setClearingFwRules] = useState(false);
  const [clearingGroups, setClearingGroups] = useState(false);
  const [clearingMods, setClearingMods] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  // Per-app / per-environment data summary
  const [appDataSummary, setAppDataSummary] = useState<{app_id:string;legacy:number;firewall:number;reviews:number;studio:number;total:number}[]>([]);
  const [envDataSummary, setEnvDataSummary] = useState<{environment:string;legacy:number;firewall:number;reviews:number;studio:number;total:number}[]>([]);
  const [dmView, setDmView] = useState<'overview' | 'by-app' | 'by-env'>('overview');
  const [clearingAppId, setClearingAppId] = useState<string | null>(null);
  const [clearingEnvId, setClearingEnvId] = useState<string | null>(null);
  const [dmEnvironment, setDmEnvironment] = useState<string>('');

  // Edit states for App Management
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editAppForm, setEditAppForm] = useState<Partial<Application>>({});
  const [editAppPresences, setEditAppPresences] = useState<PresenceRow[]>([]);
  const [showAddApp, setShowAddApp] = useState(false);
  const [newAppForm, setNewAppForm] = useState<Partial<Application>>({ app_id: '', app_distributed_id: '', name: '', nh: '', sz: '', owner: '', snow_sysid: '' });
  const [newAppPresences, setNewAppPresences] = useState<PresenceRow[]>([]);

  // Inline component editor in All Applications table
  const [_expandedAppId, _setExpandedAppId] = useState<string | null>(null);
  const [_inlineAddMapping, setInlineAddMapping] = useState(false);
  const [inlineNewMapping, setInlineNewMapping] = useState<Partial<AppDCMapping>>({ component: 'APP', dc: 'ALPHA_NGDC', nh: '', sz: '', cidr: '', status: 'Active', notes: '' });
  const [inlineEditMappingId, setInlineEditMappingId] = useState<string | null>(null);
  const [inlineEditForm, _setInlineEditForm] = useState<Partial<AppDCMapping>>({});

  // New app component mappings (for Add New Application form)
  const [_newAppMappings, _setNewAppMappings] = useState<Partial<AppDCMapping>[]>([]);
  const [_newAppMappingForm, _setNewAppMappingForm] = useState<Partial<AppDCMapping>>({ component: 'APP', dc: 'ALPHA_NGDC', nh: '', sz: '', cidr: '', status: 'Active', notes: '' });
  const [importingApps, setImportingApps] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number; total: number; overrides: { app_distributed_id: string; app_id: string }[] } | null>(null);
  void importResult; void _expandedAppId; void _setExpandedAppId; void _inlineAddMapping; void _setInlineEditForm;
  void _newAppMappings; void _newAppMappingForm; void _setNewAppMappingForm;

  // Edit states for Policy Matrix
  const [editingPolicyIdx, setEditingPolicyIdx] = useState<number | null>(null);
  const [editPolicyForm, setEditPolicyForm] = useState<Record<string, unknown>>({});
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [newPolicyForm, setNewPolicyForm] = useState<Record<string, unknown>>({ source_zone: '', source_nh: 'Any', dest_zone: '', dest_nh: 'Any', action: 'Permit', environment: 'All', note: '' });

  // Edit states for Naming Standards
  const [editingNaming, setEditingNaming] = useState(false);
  const [editNamingForm, setEditNamingForm] = useState<Record<string, string>>({
    group_prefix: 'grp-', server_prefix: 'svr-', range_prefix: 'rng-',
    group_pattern: '{APP}-{NH}-{SZ}-{SUBTYPE}', server_pattern: '{IP_ADDRESS}', range_pattern: '{APP}-{NH}-{SZ}-{DESC}',
  });

  // Edit states for Users
  const userModal = useModal<ADUser>();
  const [editUser, setEditUser] = useState<Partial<ADUser>>({});

  const loadDataMode = useCallback(async () => {
    try {
      const res = await api.getDataMode();
      setDataModeState(res.mode);
    } catch { /* ignore */ }
  }, []);

  const handleSwitchDataMode = async (mode: string) => {
    setSwitchingMode(true);
    try {
      const res = await api.setDataMode(mode);
      setDataModeState(res.mode);
      showNotification(`Switched to ${mode === 'live' ? 'Live Data' : 'Seed/Test Data'} mode`, 'success');
      loadRefData();
    } catch {
      showNotification('Failed to switch data mode', 'error');
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleResetSeed = async () => {
    if (!confirm('Reset seed/test data to defaults? This will NOT affect your live data.')) return;
    setResettingSeed(true);
    try {
      await api.resetSeedData();
      showNotification('Seed data reset successfully', 'success');
      if (dataMode === 'seed') loadRefData();
    } catch {
      showNotification('Failed to reset seed data', 'error');
    } finally {
      setResettingSeed(false);
    }
  };

  const loadRefData = useCallback(async () => {
    setLoadingRef(true);
    try {
      const [appsData, policyData, namingData, devicesData, dcMappings, prodMtx, nprodMtx, pprodMtx, fwPatternsData, nhData, szData, dcData, szCidrData, legacyDcData] = await Promise.all([
        api.getApplications(),
        api.getAllPolicyMatrices(),
        api.getNamingStandards(),
        api.getFirewallDevices(),
        api.getAppDCMappings(),
        api.getNgdcProdMatrix(),
        api.getNonprodMatrix(),
        api.getPreprodMatrix(),
        api.getFirewallDevicePatterns().catch(() => ({ patterns: [], dc_vendor_map: {} })),
        api.getNeighbourhoods(),
        api.getSecurityZones(),
        api.getNGDCDatacenters(),
        api.getSzCidrMap().catch(() => []),
        api.getLegacyDatacenters().catch(() => []),
      ]);
      setApplications(appsData);
      setPolicyMatrix(policyData.combined || []);
      setNamingStandards(namingData as unknown as Record<string, unknown>);
      setFwDevices(devicesData);
      setAppDCMappings(dcMappings as unknown as AppDCMapping[]);
      setProdMatrix(prodMtx);
      setNonprodMatrix(nprodMtx);
      setPreprodMatrix(pprodMtx);
      setFwPatterns(fwPatternsData.patterns || []);
      setDcVendorMap(fwPatternsData.dc_vendor_map || {});
      setNeighbourhoods(nhData as unknown as Record<string, unknown>[]);
      setSecurityZones(szData as unknown as Record<string, unknown>[]);
      setNgdcDatacenters(dcData as unknown as Record<string, unknown>[]);
      setSzCidrMap(szCidrData);
      setLegacyDatacenters((legacyDcData || []) as Record<string, unknown>[]);
    } catch {
      showNotification('Failed to load reference data', 'error');
    }
    setLoadingRef(false);
  }, [showNotification]);

  useEffect(() => { loadRefData(); }, [loadRefData]);

  const handleTestConnection = () => {
    showNotification('Testing AD connection...', 'info');
    setTimeout(() => {
      setAdConfig(prev => ({ ...prev, is_connected: true, last_sync: new Date().toISOString() }));
      showNotification('AD connection successful! Synced 100 users.', 'success');
    }, 2000);
  };

  const handleSaveConfig = () => { showNotification('AD configuration saved', 'success'); };

  const handleSaveGroup = () => {
    if (editGroup.id) {
      setGroups(prev => prev.map(g => g.id === editGroup.id ? { ...g, ...editGroup } as ADUserGroup : g));
    } else {
      const newGroup: ADUserGroup = {
        id: `g${Date.now()}`, group_name: editGroup.group_name || '',
        access_type: (editGroup.access_type || 'Viewer') as ADUserGroup['access_type'],
        description: editGroup.description || '', member_count: 0, applications: editGroup.applications || [],
      };
      setGroups(prev => [...prev, newGroup]);
    }
    groupModal.close();
    showNotification('Group saved', 'success');
  };

  const handleDeleteGroup = (id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
    showNotification('Group deleted', 'success');
  };

  /** Derive ``tiers`` (unique NH/SZ pairs across NGDC presences) and
   *  ``heritage_tiers`` (unique Heritage DCs) from the per-DC editor rows
   *  so the backend auto-fan / prune still operates on a consistent
   *  declarative state. */
  const derivePayloadFromPresences = (rows: PresenceRow[]): {
    tiers: { nh_id: string; sz_code: string; has_ingress?: boolean }[];
    heritage_tiers: { dc_id: string; has_ingress?: boolean }[];
    presences: Omit<PresenceRow, 'uid'>[];
  } => {
    const tierMap = new Map<string, { nh_id: string; sz_code: string; has_ingress?: boolean }>();
    const heritageMap = new Map<string, { dc_id: string; has_ingress?: boolean }>();
    for (const r of rows) {
      if (r.is_heritage) {
        if (!r.dc_id) continue;
        const cur = heritageMap.get(r.dc_id);
        heritageMap.set(r.dc_id, {
          dc_id: r.dc_id,
          has_ingress: Boolean(cur?.has_ingress) || Boolean(r.has_ingress),
        });
      } else {
        // NGDC rows: persist whatever the user typed, including
        // partially-empty (DC, NH, SZ) tuples so the editor doesn't
        // silently drop a half-filled row on save. Tier auto-fan only
        // operates on rows that are complete on (NH, SZ).
        if (r.nh_id && r.sz_code) {
          const k = `${r.nh_id}|${r.sz_code}`;
          const cur = tierMap.get(k);
          tierMap.set(k, {
            nh_id: r.nh_id,
            sz_code: r.sz_code,
            has_ingress: Boolean(cur?.has_ingress) || Boolean(r.has_ingress),
          });
        }
      }
    }
    // Strip the client-only ``uid`` so the backend payload stays clean.
    const sanitised = rows.map((r) => {
      const copy: PresenceRow = { ...r };
      delete (copy as { uid?: string }).uid;
      return copy;
    });
    return {
      tiers: Array.from(tierMap.values()),
      heritage_tiers: Array.from(heritageMap.values()),
      presences: sanitised,
    };
  };

  const handleSaveApp = async () => {
    if (!editingAppId) return;
    try {
      const derived = derivePayloadFromPresences(editAppPresences);
      const payload = { ...editAppForm, ...derived } as Record<string, unknown>;
      await api.updateApplication(editingAppId, payload);
      showNotification('Application updated', 'success');
      setEditingAppId(null);
      loadRefData();
    } catch {
      showNotification('Failed to update application', 'error');
    }
  };

  const handleAddApp = async () => {
    try {
      const derived = derivePayloadFromPresences(newAppPresences);
      const payload = { ...newAppForm, ...derived } as Record<string, unknown>;
      await api.createApplication(payload);
      showNotification('Application added', 'success');
      setShowAddApp(false);
      setNewAppForm({ app_id: '', app_distributed_id: '', name: '', nh: '', sz: '', owner: '', snow_sysid: '' });
      setNewAppPresences([]);
      loadRefData();
    } catch {
      showNotification('Failed to add application', 'error');
    }
  };

  /** Load AppPresence rows for the given app and shape them into editor
   *  rows. Heritage rows are detected via ``dc_type``. */
  const loadAppPresences = async (appId: string) => {
    try {
      const res = await api.getAppPresences({ app: appId });
      const rows: PresenceRow[] = (res || []).map((p) => {
        const raw = p as unknown as Record<string, unknown>;
        const isHeritage =
          raw.dc_type === 'Legacy' ||
          String((raw.dc_type as string | undefined) ?? '').toLowerCase() === 'heritage' ||
          raw.is_heritage === true;
        const ngdcSourceDcs = Array.isArray(raw.ngdc_source_dcs)
          ? (raw.ngdc_source_dcs as unknown[]).map((x) => String(x))
          : [];
        return {
          dc_id: p.dc_id,
          nh_id: p.nh_id || '',
          sz_code: p.sz_code || '',
          has_ingress: Boolean(p.has_ingress),
          is_heritage: isHeritage,
          egress_members: (p.egress_members || []).map((m) => ({ ...m })),
          ingress_members: (p.ingress_members || []).map((m) => ({ ...m })),
          environment: p.environment,
          ngdc_source_dcs: ngdcSourceDcs,
        };
      });
      setEditAppPresences(withRowUids(rows));
    } catch {
      setEditAppPresences([]);
    }
  };

  // Auto-load per-DC presences whenever an app is selected so the
  // read-only view mode can show every (DC, NH, SZ) row's egress +
  // ingress IPs without the user having to click Edit first.
  useEffect(() => {
    if (!selectedApp) {
      setEditAppPresences([]);
      return;
    }
    const appObj = applications.find((a) => a.app_id === selectedApp);
    const distId = String(appObj?.app_distributed_id || selectedApp);
    void loadAppPresences(distId);
    // We deliberately depend only on the app_id selection \u2014 the editor
    // is the source of truth once the user enters edit mode, and we
    // don't want list refreshes to clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedApp]);

  const handleDeleteApp = async (appId: string) => {
    try {
      await api.deleteApplication(appId);
      showNotification('Application deleted', 'success');
      if (selectedApp === appId) setSelectedApp('');
      loadRefData();
    } catch {
      showNotification('Failed to delete application', 'error');
    }
  };

  const handleSavePolicy = async () => {
    try {
      await api.updateNamingStandards({
        ...namingStandards,
        policy_matrix: policyMatrix.map((p, i) => i === editingPolicyIdx ? editPolicyForm : p),
      });
      showNotification('Policy entry updated', 'success');
      setEditingPolicyIdx(null);
      loadRefData();
    } catch {
      showNotification('Failed to update policy', 'error');
    }
  };

  const handleAddPolicy = async () => {
    try {
      await api.createPolicyEntry(newPolicyForm);
      showNotification('Policy entry added', 'success');
      setShowAddPolicy(false);
      setNewPolicyForm({ source_zone: '', source_nh: 'Any', dest_zone: '', dest_nh: 'Any', action: 'Permit', environment: 'All', note: '' });
      loadRefData();
    } catch {
      showNotification('Failed to add policy entry', 'error');
    }
  };

  const handleDeletePolicy = async (idx: number) => {
    try {
      const e = policyMatrix[idx];
      await api.deletePolicyEntry(String(e.source_zone || e.src_zone || ''), String(e.dest_zone || e.dst_zone || ''));
      showNotification('Policy entry deleted', 'success');
      loadRefData();
    } catch {
      showNotification('Failed to delete policy entry', 'error');
    }
  };

  const handleSaveNaming = async () => {
    try {
      await api.updateNamingStandards({ ...namingStandards, prefixes: editNamingForm });
      showNotification('Naming standards saved', 'success');
      setEditingNaming(false);
      loadRefData();
    } catch {
      showNotification('Failed to save naming standards', 'error');
    }
  };

  const handleSaveUser = () => {
    if (editUser.id) {
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...editUser } as ADUser : u));
    } else {
      const nu: ADUser = {
        id: `u${Date.now()}`, username: editUser.username || '',
        display_name: editUser.display_name || '', email: editUser.email || '',
        groups: editUser.groups || [],
        access_type: (editUser.access_type || 'Viewer') as ADUser['access_type'],
        last_login: null, is_active: true,
      };
      setUsers(prev => [...prev, nu]);
    }
    userModal.close();
    showNotification('User saved', 'success');
  };

  const handleDeleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    showNotification('User deleted', 'success');
  };

  const selectedAppData = applications.find(a => a.app_id === selectedApp);
  const inp = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

  // App DC Mapping helpers
  const selectedAppMappings = appDCMappings.filter(m => m.app_id === selectedApp);

  // Client-side CIDR resolution from szCidrMap (mirrors backend _resolve_sz_cidr_sync)
  const clientResolveCidr = useCallback((dc: string, nh: string, sz: string): string => {
    if (!nh || !sz) return '';
    // Exact (DC, NH, SZ) match
    const exact = szCidrMap.find(e => e.nh === nh && e.sz === sz && e.dc === dc);
    if (exact) return exact.cidr;
    // Fallback: match without DC
    const fallback = szCidrMap.find(e => e.nh === nh && e.sz === sz && !e.dc);
    return fallback ? fallback.cidr : '';
  }, [szCidrMap]);

  const handleAddMapping = async () => {
    try {
      // Include app_distributed_id so Studio/Migration can match by distributed ID
      const appObj = applications.find(a => a.app_id === selectedApp);
      const data = { ...newMappingForm, app_id: selectedApp || newMappingForm.app_id, app_distributed_id: appObj?.app_distributed_id || selectedApp || newMappingForm.app_id };
      await api.createAppDCMapping(data as Record<string, unknown>);
      setShowAddMapping(false);
      setNewMappingForm({ app_id: '', component: 'APP', dc: 'ALPHA_NGDC', nh: '', sz: '', cidr: '', status: 'Active', notes: '' });
      loadRefData();
      showNotification('Component mapping added', 'success');
    } catch { showNotification('Failed to add mapping', 'error'); }
  };

  // Inline mapping handlers for All Applications table
  void setInlineAddMapping; void inlineNewMapping; void setInlineEditMappingId; void inlineEditForm;
  const _handleInlineAddMapping = async (appId: string) => {
    try {
      // Include app_distributed_id so Studio/Migration can match by distributed ID
      const appObj = applications.find(a => a.app_id === appId);
      const data = { ...inlineNewMapping, app_id: appId, app_distributed_id: appObj?.app_distributed_id || appId };
      await api.createAppDCMapping(data as Record<string, unknown>);
      setInlineAddMapping(false);
      setInlineNewMapping({ component: 'APP', dc: 'ALPHA_NGDC', nh: '', sz: '', cidr: '', status: 'Active', notes: '' });
      loadRefData();
      showNotification('Component mapping added', 'success');
    } catch { showNotification('Failed to add mapping', 'error'); }
  };

  void _handleInlineAddMapping;
  const _handleInlineSaveMapping = async () => {
    if (!inlineEditMappingId) return;
    try {
      await api.updateAppDCMapping(inlineEditMappingId, inlineEditForm as Record<string, unknown>);
      setInlineEditMappingId(null);
      loadRefData();
      showNotification('Mapping updated', 'success');
    } catch { showNotification('Failed to update mapping', 'error'); }
  };

  void _handleInlineSaveMapping;
  const _handleInlineDeleteMapping = async (id: string) => {
    try {
      await api.deleteAppDCMapping(id);
      loadRefData();
      showNotification('Mapping deleted', 'success');
    } catch { showNotification('Failed to delete mapping', 'error'); }
  };

  void _handleInlineDeleteMapping;
  const handleSaveMapping = async () => {
    if (!editingMappingId) return;
    try {
      await api.updateAppDCMapping(editingMappingId, editMappingForm as Record<string, unknown>);
      setEditingMappingId(null);
      loadRefData();
      showNotification('Mapping updated', 'success');
    } catch { showNotification('Failed to update mapping', 'error'); }
  };

  const handleDeleteMapping = async (id: string) => {
    try {
      await api.deleteAppDCMapping(id);
      loadRefData();
      showNotification('Mapping deleted', 'success');
    } catch { showNotification('Failed to delete mapping', 'error'); }
  };

  // Policy matrix filtered by environment
  const filteredPolicyMatrix = policyEnvFilter === 'all' ? policyMatrix
    : policyEnvFilter === 'production' ? prodMatrix
    : policyEnvFilter === 'non_production' ? nonprodMatrix
    : policyEnvFilter === 'pre_production' ? preprodMatrix
    : policyMatrix;

  const handleSaveDevice = async () => {
    if (!editingDeviceId) return;
    try {
      await api.updateFirewallDevice(editingDeviceId, editDeviceForm);
      setEditingDeviceId(null);
      loadRefData();
      showNotification('Device updated', 'success');
    } catch { showNotification('Failed to update device', 'error'); }
  };

  const handleAddDevice = async () => {
    try {
      const capsStr = (newDeviceForm.capabilities as string) || '';
      const caps = capsStr ? capsStr.split(',').map((c: string) => c.trim()) : [];
      await api.createFirewallDevice({ ...newDeviceForm, capabilities: caps });
      setShowAddDevice(false);
      setNewDeviceForm({ device_id: '', name: '', vendor: 'palo_alto', dc: 'ALPHA_NGDC', nh: '', sz: '', type: 'segmentation', status: 'Active', mgmt_ip: '', capabilities: '' });
      loadRefData();
      showNotification('Device added', 'success');
    } catch { showNotification('Failed to add device', 'error'); }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm(`Delete device ${deviceId}?`)) return;
    try {
      await api.deleteFirewallDevice(deviceId);
      loadRefData();
      showNotification('Device deleted', 'success');
    } catch { showNotification('Failed to delete device', 'error'); }
  };

  const filteredDevices = fwDevices.filter(d => {
    if (deviceFilter.dc && d.dc !== deviceFilter.dc) return false;
    if (deviceFilter.type && d.type !== deviceFilter.type) return false;
    if (deviceFilter.vendor && d.vendor !== deviceFilter.vendor) return false;
    return true;
  });

  useEffect(() => { loadDataMode(); }, [loadDataMode]);

  // App NGDC Mappings state (moved from DataImportPage)
  const [ngdcImportedApps, setNgdcImportedApps] = useState<{app_id:string;app_name:string;app_distributed_id:string;rule_count:number;has_mapping:boolean;components:Record<string,unknown>[]}[]>([]);
  const [ngdcAppFilter, setNgdcAppFilter] = useState<'all'|'unmapped'|'mapped'>('all');
  const [ngdcExpandedAppId, setNgdcExpandedAppId] = useState<string|null>(null);
  const [ngdcAddingForApp, setNgdcAddingForApp] = useState<string|null>(null);
  const [ngdcComponentForm, setNgdcComponentForm] = useState({component:'APP',dc:'ALPHA_NGDC',nh:'',sz:'',cidr:'',notes:''});
  const [ngdcSaving, setNgdcSaving] = useState(false);
  const [ngdcLoaded, setNgdcLoaded] = useState(false);
  // Suppress unused-var warnings — these are used in NGDC mappings UI sections
  void ngdcImportedApps; void ngdcAppFilter; void setNgdcAppFilter;
  void ngdcExpandedAppId; void setNgdcExpandedAppId;
  void ngdcAddingForApp; void ngdcSaving; void ngdcLoaded;

  const loadNgdcApps = useCallback(async () => {
    try {
      const apps = await api.getImportedApps();
      setNgdcImportedApps(apps);
      setNgdcLoaded(true);
    } catch { /* ignore */ }
  }, []);

  const _handleNgdcAddComponent = async (appId: string) => {
    setNgdcSaving(true);
    try {
      const ngdcApp = ngdcImportedApps.find(a => a.app_id === appId);
      await api.createAppDCMapping({ app_id: appId, app_distributed_id: ngdcApp?.app_distributed_id || appId, ...ngdcComponentForm, status: 'Active' });
      setNgdcComponentForm({component:'APP',dc:'ALPHA_NGDC',nh:'',sz:'',cidr:'',notes:''});
      setNgdcAddingForApp(null);
      loadNgdcApps();
      showNotification('Component added', 'success');
    } catch { showNotification('Failed to add component', 'error'); }
    setNgdcSaving(false);
  };
  void _handleNgdcAddComponent;

  const _handleNgdcDeleteComponent = async (mappingId: string) => {
    try {
      await api.deleteAppDCMapping(mappingId);
      loadNgdcApps();
      showNotification('Component deleted', 'success');
    } catch { showNotification('Failed to delete', 'error'); }
  };
  void _handleNgdcDeleteComponent;

  const loadUserDataSummary = useCallback(async () => {
    try {
      const summary = await api.getUserDataSummary();
      setUserDataSummary(summary as typeof userDataSummary);
    } catch { /* ignore */ }
  }, []);

  const handleClearMigrationData = async () => {
    if (!confirm('Clear all migration data? This removes migration history, mappings, reviews, and migrated rules from the separate JSON. Seed data is NOT affected.')) return;
    setClearingMigration(true);
    try {
      await api.clearMigrationData();
      showNotification('Migration data cleared', 'success');
      loadUserDataSummary();
    } catch { showNotification('Failed to clear migration data', 'error'); }
    setClearingMigration(false);
  };

  const handleClearStudioRules = async () => {
    if (!confirm('Clear all studio rules from separate JSON? This removes rules created/approved in Firewall Studio. Seed data is NOT affected.')) return;
    setClearingStudio(true);
    try {
      await api.clearStudioRules();
      showNotification('Studio rules cleared', 'success');
      loadUserDataSummary();
    } catch { showNotification('Failed to clear studio rules', 'error'); }
    setClearingStudio(false);
  };

  const handleToggleHideSeed = async (hide: boolean) => {
    setHideSeedData(hide);
    localStorage.setItem('nfs_hide_seed', hide ? 'true' : 'false');
    try { await api.setHideSeed(hide); } catch { /* localStorage is primary */ }
    showNotification(hide ? 'Seed data hidden — showing only real/imported data' : 'Seed data visible — showing all data', 'success');
  };

  const handleClearLegacy = async () => {
    if (!confirm('Clear ALL imported legacy rules? This cannot be undone.')) return;
    setClearingLegacy(true);
    try { await api.clearLegacyRulesForce(); showNotification('Legacy rules cleared', 'success'); loadUserDataSummary(); } catch { showNotification('Failed to clear legacy rules', 'error'); }
    setClearingLegacy(false);
  };

  const handleClearReviews = async () => {
    if (!confirm('Clear ALL reviews? This cannot be undone.')) return;
    setClearingReviews(true);
    try { await api.clearReviews(); showNotification('Reviews cleared', 'success'); loadUserDataSummary(); } catch { showNotification('Failed to clear reviews', 'error'); }
    setClearingReviews(false);
  };

  const handleClearFwRules = async () => {
    if (!confirm('Clear ALL firewall rules (from firewall_rules.json)? This cannot be undone.')) return;
    setClearingFwRules(true);
    try { await api.clearFirewallRules(); showNotification('Firewall rules cleared', 'success'); loadUserDataSummary(); } catch { showNotification('Failed to clear firewall rules', 'error'); }
    setClearingFwRules(false);
  };

  const handleClearGroups = async () => {
    if (!confirm('Clear ALL groups? This cannot be undone.')) return;
    setClearingGroups(true);
    try { await api.clearGroups(); showNotification('Groups cleared', 'success'); loadUserDataSummary(); } catch { showNotification('Failed to clear groups', 'error'); }
    setClearingGroups(false);
  };

  const handleClearMods = async () => {
    if (!confirm('Clear ALL rule modifications? This cannot be undone.')) return;
    setClearingMods(true);
    try { await api.clearModifications(); showNotification('Modifications cleared', 'success'); loadUserDataSummary(); } catch { showNotification('Failed to clear modifications', 'error'); }
    setClearingMods(false);
  };

  const loadAppDataSummary = async () => {
    try { const data = await api.getDataSummaryByApp(); setAppDataSummary(data); } catch { showNotification('Failed to load app summary', 'error'); }
  };

  const loadEnvDataSummary = async () => {
    try { const data = await api.getDataSummaryByEnv(); setEnvDataSummary(data); } catch { showNotification('Failed to load env summary', 'error'); }
  };

  const handleClearByApp = async (appId: string) => {
    if (!confirm(`Clear ALL data for application "${appId}"? This removes legacy rules, firewall rules, reviews, studio rules, and migration data for this app.`)) return;
    setClearingAppId(appId);
    try {
      const res = await api.clearDataByApp(appId);
      const total = Object.values(res.counts).reduce((a: number, b: number) => a + b, 0);
      showNotification(`Cleared ${total} records for ${appId}`, 'success');
      loadAppDataSummary();
      loadUserDataSummary();
    } catch { showNotification(`Failed to clear data for ${appId}`, 'error'); }
    setClearingAppId(null);
  };

  const handleClearByEnv = async (env: string) => {
    if (!confirm(`Clear ALL data for environment "${env}"? This removes legacy rules, firewall rules, reviews, and studio rules for this environment.`)) return;
    setClearingEnvId(env);
    try {
      const res = await api.clearDataByEnv(env);
      const total = Object.values(res.counts).reduce((a: number, b: number) => a + b, 0);
      showNotification(`Cleared ${total} records for ${env}`, 'success');
      loadEnvDataSummary();
      loadUserDataSummary();
    } catch { showNotification(`Failed to clear data for ${env}`, 'error'); }
    setClearingEnvId(null);
  };

  const handleClearAll = async () => {
    if (!confirm('⚠️ CLEAN ALL DATA — This will clear ALL imported data across the entire portal:\n\n• Legacy Rules\n• Migration Data\n• Studio Rules\n• Reviews\n• Firewall Rules\n• Modifications\n\nSeed reference data (NHs, SZs, Policy Matrix, etc.) is NOT affected.\n\nContinue?')) return;
    setClearingAll(true);
    try {
      const res = await api.clearAllUserData();
      const total = Object.values(res.counts).reduce((a: number, b: number) => a + b, 0);
      showNotification(`All data cleared (${total} records removed)`, 'success');
      loadUserDataSummary();
    } catch { showNotification('Failed to clear all data', 'error'); }
    setClearingAll(false);
  };

  // ── NH CRUD handlers ──
  const handleSaveNh = async (nhId: string) => {
    try {
      await api.updateNeighbourhood(nhId, editNhForm);
      setNeighbourhoods(prev => prev.map(n => String(n.nh_id || n.id) === nhId ? { ...n, ...editNhForm } : n));
      setEditingNhId(null);
      showNotification('Neighbourhood updated', 'success');
    } catch { showNotification('Failed to update neighbourhood', 'error'); }
  };
  const handleAddNh = async () => {
    try {
      const created = await api.createNeighbourhood(newNhForm);
      setNeighbourhoods(prev => [...prev, created]);
      setShowAddNh(false);
      setNewNhForm({ nh_id: '', name: '', environment: 'Production', cidr: '', description: '' });
      showNotification('Neighbourhood added', 'success');
    } catch { showNotification('Failed to add neighbourhood', 'error'); }
  };
  const handleDeleteNh = async (nhId: string) => {
    if (!confirm(`Delete neighbourhood ${nhId}?`)) return;
    try {
      await api.deleteNeighbourhood(nhId);
      setNeighbourhoods(prev => prev.filter(n => String(n.nh_id || n.id) !== nhId));
      showNotification('Neighbourhood deleted', 'success');
    } catch { showNotification('Failed to delete neighbourhood', 'error'); }
  };

  // ── SZ CRUD handlers ──
  const handleSaveSz = async (code: string) => {
    try {
      await api.updateSecurityZone(code, editSzForm);
      setSecurityZones(prev => prev.map(s => String(s.code) === code ? { ...s, ...editSzForm } : s));
      setEditingSzCode(null);
      showNotification('Security Zone updated', 'success');
    } catch { showNotification('Failed to update security zone', 'error'); }
  };
  const handleAddSz = async () => {
    try {
      const created = await api.createSecurityZone(newSzForm);
      setSecurityZones(prev => [...prev, created]);
      setShowAddSz(false);
      setNewSzForm({ code: '', name: '', risk_level: 'Low', pci_scope: false, fabric: 'Production', vrf_prefix: '', cidr: '', description: '' });
      showNotification('Security Zone added', 'success');
    } catch { showNotification('Failed to add security zone', 'error'); }
  };
  const handleDeleteSz = async (code: string) => {
    if (!confirm(`Delete security zone ${code}?`)) return;
    try {
      await api.deleteSecurityZone(code);
      setSecurityZones(prev => prev.filter(s => String(s.code) !== code));
      showNotification('Security Zone deleted', 'success');
    } catch { showNotification('Failed to delete security zone', 'error'); }
  };

  // ── SZ CIDR Binding CRUD (DC-specific) ──
  const reloadSzCidrMap = async () => {
    try {
      const data = await api.getSzCidrMap();
      setSzCidrMap(data);
    } catch { /* soft fail */ }
  };
  const handleAddSzBinding = async (sz: string) => {
    const { dc, nh, cidr, vrf_id } = newSzBindingForm;
    if (!nh || !cidr) { showNotification('NH and CIDR are required', 'error'); return; }
    try {
      await api.upsertSzCidrBinding({ nh, sz, dc: dc || '', cidr, vrf_id });
      setNewSzBindingForm({ dc: '', nh: '', cidr: '', vrf_id: '' });
      await reloadSzCidrMap();
      showNotification(`Binding added: ${nh} · ${sz} · ${dc || 'any-DC'} → ${cidr}`, 'success');
    } catch (e) { showNotification(`Failed to add binding: ${(e as Error).message}`, 'error'); }
  };
  const handleSaveSzBindingEdit = async (nh: string, sz: string, dc: string, oldCidr: string) => {
    if (!editSzBindingCidr) { showNotification('CIDR is required', 'error'); return; }
    try {
      await api.upsertSzCidrBinding({
        nh, sz, dc,
        cidr: editSzBindingCidr,
        old_cidr: oldCidr,
        vrf_id: editSzBindingVrf,
      });
      setEditingSzBindingKey(null);
      setEditSzBindingCidr('');
      setEditSzBindingVrf('');
      await reloadSzCidrMap();
      showNotification(`Binding updated: ${nh} · ${sz} · ${dc || 'any-DC'}`, 'success');
    } catch (e) { showNotification(`Failed to update binding: ${(e as Error).message}`, 'error'); }
  };
  const handleDeleteSzBinding = async (nh: string, sz: string, dc: string, cidr: string = '') => {
    const cidrLabel = cidr ? ` · ${cidr}` : '';
    if (!confirm(`Delete CIDR binding ${nh} · ${sz}${dc ? ' · ' + dc : ''}${cidrLabel}?`)) return;
    try {
      await api.deleteSzCidrBinding(nh, sz, dc || '', cidr);
      await reloadSzCidrMap();
      showNotification('Binding deleted', 'success');
    } catch (e) { showNotification(`Failed to delete binding: ${(e as Error).message}`, 'error'); }
  };

  // ── DC CRUD handlers ──
  const handleSaveDc = async (dcId: string) => {
    try {
      await api.updateNGDCDatacenter(dcId, editDcForm);
      setNgdcDatacenters(prev => prev.map(d => String(d.dc_id || d.code) === dcId ? { ...d, ...editDcForm } : d));
      setEditingDcId(null);
      showNotification('Data Center updated', 'success');
    } catch { showNotification('Failed to update data center', 'error'); }
  };
  const handleAddDc = async () => {
    try {
      const dcType = (newDcForm.dc_type as string) || 'NGDC';
      const createFn = dcType === 'Legacy' ? api.createLegacyDatacenter : api.createNGDCDatacenter;
      const created = await createFn({ ...newDcForm, dc_type: dcType });
      if (dcType === 'Legacy') {
        setLegacyDatacenters(prev => [...prev, created]);
      } else {
        setNgdcDatacenters(prev => [...prev, created]);
      }
      setShowAddDc(false);
      setNewDcForm({ dc_id: '', name: '', region: '', status: 'Active', cidr: '', description: '', dc_type: 'NGDC' });
      showNotification('Data Center added', 'success');
    } catch { showNotification('Failed to add data center', 'error'); }
  };
  const handleDeleteDc = async (dcId: string, dcType?: string) => {
    if (!confirm(`Delete data center ${dcId}?`)) return;
    try {
      if (dcType === 'Legacy') {
        await api.deleteLegacyDatacenter(dcId);
        setLegacyDatacenters(prev => prev.filter(d => String(d.dc_id || d.code) !== dcId));
      } else {
        await api.deleteNGDCDatacenter(dcId);
        setNgdcDatacenters(prev => prev.filter(d => String(d.dc_id || d.code) !== dcId));
      }
      showNotification('Data Center deleted', 'success');
    } catch { showNotification('Failed to delete data center', 'error'); }
  };

  // Combined list of all DCs (NGDC + Legacy) for use in dropdowns
  const allDatacenters = [...ngdcDatacenters.map(d => ({ ...d, dc_type: 'NGDC' })), ...legacyDatacenters.map(d => ({ ...d, dc_type: 'Legacy' }))];
  void allDatacenters;

  const filteredNhs = nhEnvFilter === 'all' ? neighbourhoods : neighbourhoods.filter(n => String(n.environment || '').toLowerCase().includes(nhEnvFilter.toLowerCase()));

  const tabs = [
    { id: 'data_mode', label: 'Data Mode' },
    { id: 'data_management', label: 'Data Management' },
    { id: 'neighbourhoods', label: 'Neighbourhoods' },
    { id: 'security_zones', label: 'Security Zones' },
    { id: 'datacenters', label: 'Data Centers' },
    { id: 'app_management', label: 'App Management' },
    { id: 'shared_services', label: 'Shared Services' },
    { id: 'port_catalog', label: 'Port Configuration' },
    { id: 'policy_matrix', label: 'Policy Matrix' },
    { id: 'naming_standards', label: 'Naming Standards' },
    { id: 'fw_devices', label: 'Firewall Devices' },
    { id: 'sz_naming', label: 'SZ Naming Mode' },
    { id: 'birthright', label: 'Birthright Rules' },
    { id: 'itsm', label: 'ITSM Connectors' },
    { id: 'ad_groups', label: 'User Groups' },
    { id: 'ad_users', label: 'Users' },
    { id: 'ad_config', label: 'AD Configuration' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {notification && <Notification message={notification.message} type={notification.type} onClose={clearNotification} />}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin &amp; Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Application management, policy matrix, naming standards, AD integration</p>
      </div>
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {(activeTab === 'ad_groups' || activeTab === 'ad_users') && (
        <div className="mt-4">
          <input type="text" placeholder={activeTab === 'ad_groups' ? 'Search groups...' : 'Search users...'}
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white" />
        </div>
      )}

      <div className="mt-6">
        {/* ── Data Mode Tab ── */}
        {activeTab === 'data_mode' && (
          <div className="space-y-6">
            <div className="p-6 bg-white border border-gray-200 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Data Mode</h2>
              <p className="text-sm text-gray-500 mb-6">Switch between seed/test data and live/real data. Seed data is for testing and development. Live data stores your actual imported rules and configurations separately.</p>

              <div className="grid grid-cols-2 gap-6">
                {/* Seed Mode Card */}
                <div className={`p-5 rounded-lg border-2 cursor-pointer transition-all ${
                  dataMode === 'seed'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/50'
                }`} onClick={() => !switchingMode && handleSwitchDataMode('seed')}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-4 h-4 rounded-full border-2 ${dataMode === 'seed' ? 'border-amber-500 bg-amber-500' : 'border-gray-300'}`}>
                      {dataMode === 'seed' && <div className="w-full h-full rounded-full bg-white scale-[0.4]" />}
                    </div>
                    <h3 className="text-sm font-bold text-gray-900">Seed / Test Data</h3>
                    {dataMode === 'seed' && <span className="px-2 py-0.5 text-xs rounded-full bg-amber-200 text-amber-800 font-medium">Active</span>}
                  </div>
                  <p className="text-xs text-gray-600">Pre-loaded sample data for testing and development. All seed data can be reset to defaults at any time without affecting live data.</p>
                </div>

                {/* Live Mode Card */}
                <div className={`p-5 rounded-lg border-2 cursor-pointer transition-all ${
                  dataMode === 'live'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
                }`} onClick={() => !switchingMode && handleSwitchDataMode('live')}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-4 h-4 rounded-full border-2 ${dataMode === 'live' ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                      {dataMode === 'live' && <div className="w-full h-full rounded-full bg-white scale-[0.4]" />}
                    </div>
                    <h3 className="text-sm font-bold text-gray-900">Live / Real Data</h3>
                    {dataMode === 'live' && <span className="px-2 py-0.5 text-xs rounded-full bg-green-200 text-green-800 font-medium">Active</span>}
                  </div>
                  <p className="text-xs text-gray-600">Your real imported data. Rules imported via Firewall Management, NGDC mappings, and all configurations are stored separately from seed data.</p>
                </div>
              </div>

              {switchingMode && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
                  Switching data mode...
                </div>
              )}
            </div>

            {/* Seed Data Management */}
            <div className="p-6 bg-white border border-gray-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Seed Data Management</h3>
              <p className="text-xs text-gray-500 mb-4">Reset seed/test data back to factory defaults. This will NOT affect your live data.</p>
              <button onClick={handleResetSeed} disabled={resettingSeed}
                className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50">
                {resettingSeed ? 'Resetting...' : 'Reset Seed Data to Defaults'}
              </button>
            </div>

            {/* Current Mode Info */}
            <div className={`p-4 rounded-lg border ${
              dataMode === 'live'
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <p className="text-sm">
                <strong>Current Mode:</strong>{' '}
                <span className={dataMode === 'live' ? 'text-green-700' : 'text-amber-700'}>
                  {dataMode === 'live' ? 'Live / Real Data' : 'Seed / Test Data'}
                </span>
                {' '}&mdash; All data reads and writes across the portal are using the <strong>{dataMode}</strong> data store.
              </p>
            </div>
          </div>
        )}

        {/* ── Data Management Tab ── */}
        {activeTab === 'data_management' && (
          <div className="space-y-6">
            {/* Hide Seed Data Toggle */}
            <div className="p-6 bg-white border border-gray-200 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Hide Seed Data</h2>
              <p className="text-xs text-gray-500 mb-4">When enabled, seed/test data is hidden across the entire portal. Only real/imported data will be shown in Firewall Management, Migration Studio, Firewall Studio, and all other pages.</p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleToggleHideSeed(!hideSeedData)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${hideSeedData ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hideSeedData ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className={`text-sm font-medium ${hideSeedData ? 'text-indigo-700' : 'text-gray-500'}`}>
                  {hideSeedData ? 'Seed data hidden — showing only real data' : 'Seed data visible — showing all data'}
                </span>
              </div>
            </div>

            {/* One-Click Clean All */}
            <div className="p-6 bg-red-50 border-2 border-red-300 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-red-800">Clean All Imported Data</h2>
                  <p className="text-xs text-red-600 mt-1">One-click reset: clears ALL imported/user data (legacy rules, migration data, studio rules, reviews, firewall rules, modifications). Seed reference data (NHs, SZs, Policy Matrix, etc.) is NOT affected.</p>
                </div>
                <button onClick={handleClearAll} disabled={clearingAll}
                  className="px-6 py-3 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
                  {clearingAll ? 'Cleaning...' : 'Clean All & Reset'}
                </button>
              </div>
            </div>

            {/* Data Summary & Individual Cleanup */}
            <div className="p-6 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Data Summary &amp; Individual Cleanup</h2>
                  <p className="text-xs text-gray-500 mt-1">View record counts and clear individual data stores. Use this during testing to selectively reset specific areas.</p>
                </div>
                <button onClick={loadUserDataSummary} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                  {userDataSummary ? 'Refresh Counts' : 'Load Summary'}
                </button>
              </div>

              {userDataSummary && (
                <div className="space-y-3">
                  {/* Legacy Rules */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-800">Legacy Imported Rules</h3>
                      <p className="text-xs text-amber-600 mt-0.5">Records: <strong>{userDataSummary.legacy_rules_count}</strong> &mdash; Rules imported from Excel/CSV/JSON in Firewall Management</p>
                    </div>
                    <button onClick={handleClearLegacy} disabled={clearingLegacy}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {clearingLegacy ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>

                  {/* Migration Data */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-blue-800">Migration Data <span className="font-mono text-xs text-blue-500">(migration_data.json)</span></h3>
                      <div className="mt-0.5 flex gap-4 text-xs text-blue-600">
                        <span>History: <strong>{userDataSummary.migration_data.migration_history || 0}</strong></span>
                        <span>Mappings: <strong>{userDataSummary.migration_data.migration_mappings || 0}</strong></span>
                        <span>Reviews: <strong>{userDataSummary.migration_data.migration_reviews || 0}</strong></span>
                        <span>Migrated: <strong>{userDataSummary.migration_data.migrated_rules || 0}</strong></span>
                      </div>
                    </div>
                    <button onClick={handleClearMigrationData} disabled={clearingMigration}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {clearingMigration ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>

                  {/* Studio Rules */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-emerald-800">Studio Rules <span className="font-mono text-xs text-emerald-500">(studio_rules.json)</span></h3>
                      <p className="text-xs text-emerald-600 mt-0.5">Records: <strong>{userDataSummary.studio_rules_count}</strong> &mdash; New rules, approved rules, migrated rules</p>
                    </div>
                    <button onClick={handleClearStudioRules} disabled={clearingStudio}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {clearingStudio ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>

                  {/* Firewall Rules */}
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-purple-800">Firewall Rules <span className="font-mono text-xs text-purple-500">(firewall_rules.json)</span></h3>
                      <p className="text-xs text-purple-600 mt-0.5">Records: <strong>{userDataSummary.firewall_rules_count}</strong> &mdash; All rules in Firewall Studio (seed + created)</p>
                    </div>
                    <button onClick={handleClearFwRules} disabled={clearingFwRules}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {clearingFwRules ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>

                  {/* Reviews */}
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-orange-800">Reviews &amp; Approvals</h3>
                      <p className="text-xs text-orange-600 mt-0.5">Records: <strong>{userDataSummary.reviews_count}</strong> &mdash; All review requests (pending, approved, rejected)</p>
                    </div>
                    <button onClick={handleClearReviews} disabled={clearingReviews}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {clearingReviews ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>

                  {/* Groups */}
                  <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-cyan-800">Groups</h3>
                      <p className="text-xs text-cyan-600 mt-0.5">Records: <strong>{userDataSummary.groups_count}</strong> &mdash; All firewall groups (seed + user-created)</p>
                    </div>
                    <button onClick={handleClearGroups} disabled={clearingGroups}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {clearingGroups ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>

                  {/* Modifications */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Rule Modifications</h3>
                      <p className="text-xs text-gray-600 mt-0.5">Records: <strong>{userDataSummary.modifications_count}</strong> &mdash; All rule modification requests with deltas</p>
                    </div>
                    <button onClick={handleClearMods} disabled={clearingMods}
                      className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {clearingMods ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>

                  {/* Data Directory */}
                  <div className="text-xs text-gray-400 mt-2">
                    Data directory: <code className="bg-gray-100 px-1 rounded">{userDataSummary.data_directory}</code>
                  </div>
                </div>
              )}

              {!userDataSummary && (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500">Click &quot;Load Summary&quot; to view record counts and manage data stores.</p>
                </div>
              )}
            </div>

            {/* Per-App / Per-Environment Cleanup */}
            <div className="p-6 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Targeted Cleanup (by App / Environment)</h2>
                  <p className="text-xs text-gray-500 mt-1">Selectively clear data for a specific application or environment without affecting other data.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setDmView('by-app'); loadAppDataSummary(); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${dmView === 'by-app' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    By Application
                  </button>
                  <button onClick={() => { setDmView('by-env'); loadEnvDataSummary(); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${dmView === 'by-env' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    By Environment
                  </button>
                </div>
              </div>

              {/* Environment filter for app view */}
              {dmView === 'by-app' && (
                <div className="mb-3 flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600">Filter Environment:</label>
                  <select value={dmEnvironment} onChange={e => setDmEnvironment(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white">
                    <option value="">All Environments</option>
                    {['Production', 'Non-Production', 'Pre-Production'].map(env => <option key={env} value={env}>{env}</option>)}
                  </select>
                </div>
              )}

              {dmView === 'by-app' && appDataSummary.length > 0 && (
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Application</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Legacy</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">FW Rules</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Reviews</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Studio</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {appDataSummary.map(row => (
                        <tr key={row.app_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{row.app_id}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.legacy}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.firewall}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.reviews}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.studio}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800">{row.total}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => handleClearByApp(row.app_id)} disabled={clearingAppId === row.app_id}
                              className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50">
                              {clearingAppId === row.app_id ? '...' : 'Clear'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {dmView === 'by-app' && appDataSummary.length === 0 && (
                <div className="text-center py-6 text-sm text-gray-500">Click &quot;By Application&quot; to load per-app data breakdown.</div>
              )}

              {dmView === 'by-env' && envDataSummary.length > 0 && (
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Environment</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Legacy</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">FW Rules</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Reviews</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Studio</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {envDataSummary.map(row => (
                        <tr key={row.environment} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{row.environment}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.legacy}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.firewall}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.reviews}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{row.studio}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800">{row.total}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => handleClearByEnv(row.environment)} disabled={clearingEnvId === row.environment}
                              className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50">
                              {clearingEnvId === row.environment ? '...' : 'Clear'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {dmView === 'by-env' && envDataSummary.length === 0 && (
                <div className="text-center py-6 text-sm text-gray-500">Click &quot;By Environment&quot; to load per-environment data breakdown.</div>
              )}

              {dmView === 'overview' && (
                <div className="text-center py-6 text-sm text-gray-500">Select &quot;By Application&quot; or &quot;By Environment&quot; to view targeted cleanup options.</div>
              )}
            </div>
          </div>
        )}

        {/* ── Neighbourhoods Tab ── */}
        {activeTab === 'neighbourhoods' && (
          <div className="space-y-4">
            {/* Hero header */}
            <div className="p-5 bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-100 rounded-2xl shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Neighbourhoods</h2>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xl">Logical groupings of hosts, subnets, and zones. CIDRs resolve at the SZ level per (DC, NH, SZ) — expand any NH row to see the breakdown.</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {(['Production','Pre-Production','Non-Production'] as const).map(env => {
                        const n = neighbourhoods.filter(nh => String(nh.environment || '') === env).length;
                        const color = env === 'Production' ? 'bg-red-50 text-red-700 border-red-200' :
                                      env === 'Pre-Production' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                      'bg-emerald-50 text-emerald-700 border-emerald-200';
                        return (
                          <span key={env} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>
                            {env}: {n}
                          </span>
                        );
                      })}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">Total: {neighbourhoods.length}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select className="px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-indigo-400" value={nhEnvFilter} onChange={e => setNhEnvFilter(e.target.value)}>
                    <option value="all">All Environments</option>
                    <option value="Production">Production</option>
                    <option value="Pre-Production">Pre-Production</option>
                    <option value="Non-Production">Non-Production</option>
                  </select>
                  <button onClick={() => setShowAddNh(true)} className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg hover:shadow-lg transition-all shadow-md">+ Add NH</button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">

              {showAddNh && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <h3 className="text-sm font-semibold text-blue-800">Add New Neighbourhood</h3>
                  <div className="grid grid-cols-4 gap-2">
                    <input className={inp} placeholder="NH ID (e.g. NH01)" value={String(newNhForm.nh_id || '')} onChange={e => setNewNhForm({ ...newNhForm, nh_id: e.target.value })} />
                    <input className={inp} placeholder="Name" value={String(newNhForm.name || '')} onChange={e => setNewNhForm({ ...newNhForm, name: e.target.value })} />
                    <select className={inp} value={String(newNhForm.environment || 'Production')} onChange={e => setNewNhForm({ ...newNhForm, environment: e.target.value })}>
                      <option value="Production">Production</option>
                      <option value="Pre-Production">Pre-Production</option>
                      <option value="Non-Production">Non-Production</option>
                    </select>
                    <input className={inp} placeholder="Description" value={String(newNhForm.description || '')} onChange={e => setNewNhForm({ ...newNhForm, description: e.target.value })} />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleAddNh} className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Save</button>
                    <button onClick={() => setShowAddNh(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">NH ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Environment</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SZ CIDR Entries</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredNhs.map((nh, idx) => {
                      const nhId = String(nh.nh_id || nh.id || idx);
                      const isEditing = editingNhId === nhId;
                      const isExpSz = expandedNhSzId === nhId;
                      const nhSzEntries = szCidrMap.filter(e => e.nh === nhId);
                      const nhDcs = [...new Set(nhSzEntries.map(e => e.dc))].sort();
                      return (
                        <React.Fragment key={nhId}>
                        <tr className={isExpSz ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 font-mono text-xs font-medium text-indigo-700">
                            <button onClick={() => setExpandedNhSzId(isExpSz ? null : nhId)} className="inline-flex items-center gap-1 hover:underline cursor-pointer" title={isExpSz ? 'Collapse SZ CIDR breakdown' : 'Expand SZ CIDR breakdown'}>
                              <span className="text-[10px]">{isExpSz ? '\u25BC' : '\u25B6'}</span> {nhId}
                            </button>
                          </td>
                          <td className="px-3 py-2">{isEditing ? <input className={inp} value={String(editNhForm.name || '')} onChange={e => setEditNhForm({ ...editNhForm, name: e.target.value })} /> : String(nh.name || '')}</td>
                          <td className="px-3 py-2">{isEditing ? (
                            <select className={inp} value={String(editNhForm.environment || '')} onChange={e => setEditNhForm({ ...editNhForm, environment: e.target.value })}>
                              <option value="Production">Production</option><option value="Pre-Production">Pre-Production</option><option value="Non-Production">Non-Production</option>
                            </select>
                          ) : <span className={`px-2 py-0.5 text-xs rounded-full ${String(nh.environment) === 'Production' ? 'bg-green-100 text-green-800' : String(nh.environment) === 'Pre-Production' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>{String(nh.environment || 'N/A')}</span>}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            <span className="text-gray-500">{nhSzEntries.length > 0 ? `${nhSzEntries.length} SZ entries` : '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">{isEditing ? <input className={inp} value={String(editNhForm.description || '')} onChange={e => setEditNhForm({ ...editNhForm, description: e.target.value })} /> : String(nh.description || '—')}</td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleSaveNh(nhId)} className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700">Save</button>
                                <button onClick={() => setEditingNhId(null)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingNhId(nhId); setEditNhForm({ name: nh.name, environment: nh.environment, description: nh.description }); }} className="px-2 py-1 text-xs text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50">Edit</button>
                                <button onClick={() => handleDeleteNh(nhId)} className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50">Delete</button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {/* SZ-level CIDR breakdown per DC */}
                        {isExpSz && nhSzEntries.length > 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-3 bg-indigo-50/50 border-t border-indigo-100">
                              <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-indigo-800">SZ-Level CIDR Breakdown for {nhId} ({nhSzEntries.length} entries across {nhDcs.length} DC{nhDcs.length !== 1 ? 's' : ''})</h4>
                                {nhDcs.map(dc => {
                                  const dcEntries = nhSzEntries.filter(e => e.dc === dc);
                                  return (
                                    <div key={dc} className="ml-2">
                                      <div className="text-[11px] font-semibold text-gray-700 mb-1 flex items-center gap-1">
                                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700">{dc || 'Default'}</span>
                                        <span className="text-gray-400">({dcEntries.length} zone{dcEntries.length !== 1 ? 's' : ''})</span>
                                      </div>
                                      <table className="w-full text-[11px] ml-2">
                                        <thead><tr className="text-gray-500">
                                          <th className="px-2 py-0.5 text-left font-medium w-20">SZ</th>
                                          <th className="px-2 py-0.5 text-left font-medium w-32">VRF ID</th>
                                          <th className="px-2 py-0.5 text-left font-medium w-40">CIDR</th>
                                          <th className="px-2 py-0.5 text-left font-medium">Description</th>
                                        </tr></thead>
                                        <tbody>
                                          {dcEntries.map((e, i) => (
                                            <tr key={i} className="hover:bg-indigo-100/30">
                                              <td className="px-2 py-0.5 font-mono font-medium text-indigo-700">{e.sz}</td>
                                              <td className="px-2 py-0.5 font-mono text-gray-600">{e.vrf_id || '-'}</td>
                                              <td className="px-2 py-0.5 font-mono font-medium text-gray-800">{e.cidr}</td>
                                              <td className="px-2 py-0.5 text-gray-500">{e.description || '-'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                        {isExpSz && nhSzEntries.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-2 bg-gray-50 text-xs text-gray-400 italic">No SZ-level CIDR entries found for {nhId}.</td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                    {filteredNhs.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">No neighbourhoods found. {nhEnvFilter !== 'all' ? 'Try a different filter.' : 'Click "+ Add NH" to create one.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-gray-400">Total: {filteredNhs.length} neighbourhood{filteredNhs.length !== 1 ? 's' : ''}{nhEnvFilter !== 'all' ? ` (filtered from ${neighbourhoods.length})` : ''}</div>
            </div>
          </div>
        )}

        {/* ── Security Zones Tab ── */}
        {activeTab === 'security_zones' && (
          <div className="space-y-4">
            {/* Hero header */}
            <div className="p-5 bg-gradient-to-br from-emerald-50 via-white to-teal-50 border border-emerald-100 rounded-2xl shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z"/></svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Security Zones</h2>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xl">Risk-classified network segments. CIDR shown below is aggregated across all (DC, NH) bindings for each zone.</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {['Critical','High','Medium','Low'].map(r => {
                        const n = securityZones.filter(sz => String(sz.risk_level) === r).length;
                        const color = r === 'Critical' ? 'bg-red-100 text-red-700 border-red-200' :
                                      r === 'High' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                      r === 'Medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                      'bg-green-100 text-green-700 border-green-200';
                        return (
                          <span key={r} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>
                            {r}: {n}
                          </span>
                        );
                      })}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">Total: {securityZones.length}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowAddSz(true)} className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg hover:shadow-lg transition-all shadow-md">+ Add Security Zone</button>
              </div>
            </div>

            <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
              {showAddSz && (
                <div className="mb-4 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-2">
                  <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                    Add New Security Zone
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    <input className={inp} placeholder="Code (e.g. STD)" value={String(newSzForm.code || '')} onChange={e => setNewSzForm({ ...newSzForm, code: e.target.value })} />
                    <input className={inp} placeholder="Name (e.g. Standard)" value={String(newSzForm.name || '')} onChange={e => setNewSzForm({ ...newSzForm, name: e.target.value })} />
                    <select className={inp} value={String(newSzForm.risk_level || 'Low')} onChange={e => setNewSzForm({ ...newSzForm, risk_level: e.target.value })}>
                      <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option>
                    </select>
                    <select className={inp} value={String(newSzForm.fabric || 'Production')} onChange={e => setNewSzForm({ ...newSzForm, fabric: e.target.value })}>
                      <option value="Production">Production</option><option value="Pre-Production">Pre-Production</option><option value="Non-Production">Non-Production</option><option value="All">All</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inp} placeholder="VRF Prefix (e.g. VRF-STD)" value={String(newSzForm.vrf_prefix || '')} onChange={e => setNewSzForm({ ...newSzForm, vrf_prefix: e.target.value })} />
                    <input className={inp} placeholder="Description" value={String(newSzForm.description || '')} onChange={e => setNewSzForm({ ...newSzForm, description: e.target.value })} />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleAddSz} className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700">Save</button>
                    <button onClick={() => setShowAddSz(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Code</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Name</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Risk</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">CIDR Bindings (DC · NH)</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Fabric</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">VRF Prefix</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {securityZones.map((sz, idx) => {
                      const code = String(sz.code || idx);
                      const isEditing = editingSzCode === code;
                      const szBindings = szCidrMap.filter(e => e.sz === code);
                      const szCidrs = [...new Set(szBindings.filter(e => !!e.cidr).map(e => e.cidr))];
                      const isBindingsOpen = expandedSzBindings === code;
                      const riskBg = String(sz.risk_level) === 'Critical' ? 'from-rose-300 to-red-400' :
                                     String(sz.risk_level) === 'High' ? 'from-amber-300 to-orange-400' :
                                     String(sz.risk_level) === 'Medium' ? 'from-yellow-300 to-amber-400' :
                                     'from-emerald-300 to-teal-400';
                      return (
                        <React.Fragment key={code}>
                        <tr className="hover:bg-emerald-50/40 transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-8 rounded-full bg-gradient-to-b ${riskBg} flex-shrink-0`}></span>
                              <span className="font-mono text-xs font-bold text-emerald-700 tracking-wide">{code}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-800 font-medium">{isEditing ? <input className={inp} value={String(editSzForm.name || '')} onChange={e => setEditSzForm({ ...editSzForm, name: e.target.value })} /> : String(sz.name || '')}</td>
                          <td className="px-3 py-2">{isEditing ? (
                            <select className={inp} value={String(editSzForm.risk_level || '')} onChange={e => setEditSzForm({ ...editSzForm, risk_level: e.target.value })}>
                              <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option>
                            </select>
                          ) : <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${String(sz.risk_level) === 'Critical' ? 'bg-rose-50 text-rose-700 border border-rose-200' : String(sz.risk_level) === 'High' ? 'bg-amber-50 text-amber-700 border border-amber-200' : String(sz.risk_level) === 'Medium' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{String(sz.risk_level || 'Low')}</span>}</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => {
                                const next = isBindingsOpen ? null : code;
                                setExpandedSzBindings(next);
                                if (next) setNewSzBindingForm({ dc: '', nh: '', cidr: '', vrf_id: '' });
                              }}
                              className="group inline-flex items-center gap-1.5 text-left rounded px-1.5 py-1 hover:bg-emerald-50 transition"
                              title={isBindingsOpen ? 'Hide bindings' : 'Manage bindings'}
                            >
                              <svg className={`w-3 h-3 text-emerald-600 transition-transform ${isBindingsOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                              {szCidrs.length === 0 ? (
                                <span className="text-[11px] text-gray-400 italic group-hover:text-emerald-600">No bindings · add</span>
                              ) : (
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {szCidrs.slice(0, 3).map(c => (
                                    <span key={c} className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3"/></svg>
                                      {c}
                                    </span>
                                  ))}
                                  {szCidrs.length > 3 && (
                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-semibold">+{szCidrs.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-xs">{isEditing ? (
                            <select className={inp} value={String(editSzForm.fabric || '')} onChange={e => setEditSzForm({ ...editSzForm, fabric: e.target.value })}>
                              <option value="Production">Production</option><option value="Pre-Production">Pre-Production</option><option value="Non-Production">Non-Production</option><option value="All">All</option>
                            </select>
                          ) : <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">{String(sz.fabric || '—')}</span>}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-600">{isEditing ? <input className={inp} value={String(editSzForm.vrf_prefix || '')} onChange={e => setEditSzForm({ ...editSzForm, vrf_prefix: e.target.value })} /> : String(sz.vrf_prefix || '—')}</td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleSaveSz(code)} className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700">Save</button>
                                <button onClick={() => setEditingSzCode(null)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingSzCode(code); setEditSzForm({ name: sz.name, risk_level: sz.risk_level, pci_scope: sz.pci_scope, fabric: sz.fabric, vrf_prefix: sz.vrf_prefix, description: sz.description }); }} className="px-2 py-1 text-xs text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-50 font-medium">Edit</button>
                                <button onClick={() => handleDeleteSz(code)} className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 font-medium">Delete</button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isBindingsOpen && (
                          <tr>
                            <td colSpan={7} className="px-0 py-0">
                              <div className="mx-3 my-2 p-3 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/70 border border-emerald-100 rounded-xl">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-200 to-teal-300 text-emerald-800 flex items-center justify-center text-xs font-bold shadow-sm">
                                      {code}
                                    </div>
                                    <div>
                                      <div className="text-xs font-bold text-emerald-800">CIDR Bindings for {code}</div>
                                      <div className="text-[10px] text-gray-500">Per (DC, NH) — DC-specific takes precedence; empty DC = any-DC fallback.</div>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    {szBindings.length} binding{szBindings.length === 1 ? '' : 's'}
                                  </span>
                                </div>

                                {szBindings.length > 0 && (
                                  <div className="overflow-x-auto rounded-lg border border-emerald-100 bg-white/90 mb-2">
                                    <table className="w-full text-xs">
                                      <thead className="bg-emerald-50/80">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left text-[9px] font-bold text-emerald-800 uppercase tracking-wider w-36">DC</th>
                                          <th className="px-2 py-1.5 text-left text-[9px] font-bold text-emerald-800 uppercase tracking-wider w-28">NH</th>
                                          <th className="px-2 py-1.5 text-left text-[9px] font-bold text-emerald-800 uppercase tracking-wider">CIDR</th>
                                          <th className="px-2 py-1.5 text-left text-[9px] font-bold text-emerald-800 uppercase tracking-wider w-32">VRF</th>
                                          <th className="px-2 py-1.5 text-right text-[9px] font-bold text-emerald-800 uppercase tracking-wider w-32">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-emerald-50">
                                        {szBindings.map((b) => {
                                          const bkey = `${b.nh}|${code}|${b.dc || ''}|${b.cidr || ''}`;
                                          const isEdit = editingSzBindingKey === bkey;
                                          return (
                                            <tr key={bkey} className="hover:bg-emerald-50/40">
                                              <td className="px-2 py-1 font-mono text-[11px] text-orange-700 font-semibold">
                                                {b.dc ? b.dc.replace('_NGDC','') : <span className="italic text-gray-400">any-DC</span>}
                                              </td>
                                              <td className="px-2 py-1 font-mono text-[11px] text-indigo-700 font-semibold">{b.nh}</td>
                                              <td className="px-2 py-1">
                                                {isEdit ? (
                                                  <input
                                                    className={inp + ' font-mono text-[11px]'}
                                                    placeholder="10.10.0.0/16"
                                                    value={editSzBindingCidr}
                                                    onChange={e => setEditSzBindingCidr(e.target.value)}
                                                  />
                                                ) : (
                                                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3"/></svg>
                                                    {b.cidr || <span className="italic text-gray-400">empty</span>}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-2 py-1">
                                                {isEdit ? (
                                                  <input
                                                    className={inp + ' font-mono text-[10px]'}
                                                    placeholder="VRF e.g. NH02-PAA"
                                                    value={editSzBindingVrf}
                                                    onChange={e => setEditSzBindingVrf(e.target.value)}
                                                  />
                                                ) : (
                                                  <span className="font-mono text-[10px] text-gray-600">{b.vrf_id || '—'}</span>
                                                )}
                                              </td>
                                              <td className="px-2 py-1 text-right">
                                                {isEdit ? (
                                                  <div className="inline-flex gap-1">
                                                    <button onClick={() => handleSaveSzBindingEdit(b.nh, code, b.dc || '', b.cidr || '')} className="px-2 py-0.5 text-[11px] text-white bg-emerald-600 rounded hover:bg-emerald-700">Save</button>
                                                    <button onClick={() => { setEditingSzBindingKey(null); setEditSzBindingCidr(''); setEditSzBindingVrf(''); }} className="px-2 py-0.5 text-[11px] text-gray-600 border border-gray-200 rounded hover:bg-gray-50">Cancel</button>
                                                  </div>
                                                ) : (
                                                  <div className="inline-flex gap-1">
                                                    <button onClick={() => { setEditingSzBindingKey(bkey); setEditSzBindingCidr(b.cidr || ''); setEditSzBindingVrf(b.vrf_id || ''); }} className="px-2 py-0.5 text-[11px] text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-50 font-medium">Edit</button>
                                                    <button onClick={() => handleDeleteSzBinding(b.nh, code, b.dc || '', b.cidr || '')} className="px-2 py-0.5 text-[11px] text-rose-700 border border-rose-200 rounded hover:bg-rose-50 font-medium">Delete</button>
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {/* Add new binding */}
                                <div className="p-2 rounded-lg bg-white border border-dashed border-emerald-200">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">+ Add CIDR binding</div>
                                  <div className="grid grid-cols-12 gap-2">
                                    <select
                                      className={`${inp} col-span-3 text-xs`}
                                      value={newSzBindingForm.dc}
                                      onChange={e => setNewSzBindingForm({ ...newSzBindingForm, dc: e.target.value })}
                                    >
                                      <option value="">any-DC (fallback)</option>
                                      {ngdcDatacenters.map((d, i) => {
                                        const dcId = String(d.dc_id || d.code || i);
                                        return <option key={dcId} value={dcId}>{dcId}</option>;
                                      })}
                                    </select>
                                    <select
                                      className={`${inp} col-span-3 text-xs`}
                                      value={newSzBindingForm.nh}
                                      onChange={e => setNewSzBindingForm({ ...newSzBindingForm, nh: e.target.value })}
                                    >
                                      <option value="">Select NH…</option>
                                      {neighbourhoods.map((n, i) => {
                                        const id = String((n as Record<string, unknown>).nh_id || (n as Record<string, unknown>).id || i);
                                        return <option key={id} value={id}>{id}</option>;
                                      })}
                                    </select>
                                    <input
                                      className={`${inp} col-span-3 font-mono text-xs`}
                                      placeholder="CIDR (e.g. 10.20.0.0/16)"
                                      value={newSzBindingForm.cidr}
                                      onChange={e => setNewSzBindingForm({ ...newSzBindingForm, cidr: e.target.value })}
                                    />
                                    <input
                                      className={`${inp} col-span-2 font-mono text-xs`}
                                      placeholder="VRF (optional)"
                                      value={newSzBindingForm.vrf_id}
                                      onChange={e => setNewSzBindingForm({ ...newSzBindingForm, vrf_id: e.target.value })}
                                    />
                                    <button
                                      onClick={() => handleAddSzBinding(code)}
                                      className="col-span-1 px-2 py-1 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded hover:shadow-md transition"
                                    >
                                      Add
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                    {securityZones.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-500">No security zones. Click <span className="font-semibold text-emerald-700">+ Add Security Zone</span> to create one.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Data Centers Tab ── */}
        {activeTab === 'datacenters' && (
          <div className="space-y-4">
            {/* Hero header */}
            <div className="p-5 bg-gradient-to-br from-orange-50 via-white to-amber-50 border border-orange-100 rounded-2xl shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 7l1.5 10a2 2 0 002 2h9a2 2 0 002-2L20 7M4 7l2-3h12l2 3M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/></svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Data Centers</h2>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xl">NGDC and Legacy data centers. All rules, groups, and presences are scoped by DC.</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-100 text-green-700 border-green-200">NGDC: {ngdcDatacenters.length}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-orange-100 text-orange-700 border-orange-200">Legacy: {legacyDatacenters.length}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">Total: {ngdcDatacenters.length + legacyDatacenters.length}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowAddDc(true)} className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-amber-600 rounded-lg hover:shadow-lg transition-all shadow-md">+ Add Data Center</button>
              </div>
            </div>

            <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">

              {showAddDc && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <h3 className="text-sm font-semibold text-blue-800">Add New Data Center</h3>
                  <div className="grid grid-cols-5 gap-2">
                    <select className={inp} value={String(newDcForm.dc_type || 'NGDC')} onChange={e => setNewDcForm({ ...newDcForm, dc_type: e.target.value })}>
                      <option value="NGDC">NGDC</option><option value="Legacy">Legacy</option>
                    </select>
                    <input className={inp} placeholder="DC ID / Code" value={String(newDcForm.dc_id || '')} onChange={e => setNewDcForm({ ...newDcForm, dc_id: e.target.value })} />
                    <input className={inp} placeholder="Name" value={String(newDcForm.name || '')} onChange={e => setNewDcForm({ ...newDcForm, name: e.target.value })} />
                    <input className={inp} placeholder="Region" value={String(newDcForm.region || '')} onChange={e => setNewDcForm({ ...newDcForm, region: e.target.value })} />
                    <select className={inp} value={String(newDcForm.status || 'Active')} onChange={e => setNewDcForm({ ...newDcForm, status: e.target.value })}>
                      <option value="Active">Active</option><option value="Planned">Planned</option><option value="Decommissioned">Decommissioned</option><option value="Migrating">Migrating</option>
                    </select>
                  </div>
                  <input className={`${inp} w-full`} placeholder="Description" value={String(newDcForm.description || '')} onChange={e => setNewDcForm({ ...newDcForm, description: e.target.value })} />
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleAddDc} className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Save</button>
                    <button onClick={() => setShowAddDc(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">DC ID / Code</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {[...ngdcDatacenters.map(d => ({ ...d, _dc_type: 'NGDC' as string })), ...legacyDatacenters.map(d => ({ ...d, _dc_type: 'Legacy' as string }))].map((dc: Record<string, unknown>, idx) => {
                      const dcId = String(dc.dc_id || dc.code || idx);
                      const dcType = String(dc._dc_type || dc.dc_type || 'NGDC');
                      const isEditing = editingDcId === dcId;
                      return (
                        <tr key={`${dcType}-${dcId}`} className="hover:bg-gray-50">
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-bold rounded ${dcType === 'NGDC' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{dcType}</span></td>
                          <td className="px-3 py-2 font-mono text-xs font-medium text-indigo-700">{isEditing ? <input className={inp} value={String(editDcForm.dc_id || '')} onChange={e => setEditDcForm({ ...editDcForm, dc_id: e.target.value })} /> : dcId}</td>
                          <td className="px-3 py-2">{isEditing ? <input className={inp} value={String(editDcForm.name || '')} onChange={e => setEditDcForm({ ...editDcForm, name: e.target.value })} /> : String((dc as Record<string, unknown>).name || '')}</td>
                          <td className="px-3 py-2 text-xs">{isEditing ? <input className={inp} value={String(editDcForm.region || '')} onChange={e => setEditDcForm({ ...editDcForm, region: e.target.value })} /> : String((dc as Record<string, unknown>).region || '—')}</td>
                          <td className="px-3 py-2">{isEditing ? (
                            <select className={inp} value={String(editDcForm.status || 'Active')} onChange={e => setEditDcForm({ ...editDcForm, status: e.target.value })}>
                              <option value="Active">Active</option><option value="Planned">Planned</option><option value="Decommissioned">Decommissioned</option><option value="Migrating">Migrating</option>
                            </select>
                          ) : <span className={`px-2 py-0.5 text-xs rounded-full ${String((dc as Record<string, unknown>).status) === 'Active' ? 'bg-green-100 text-green-800' : String((dc as Record<string, unknown>).status) === 'Planned' ? 'bg-blue-100 text-blue-800' : String((dc as Record<string, unknown>).status) === 'Migrating' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>{String((dc as Record<string, unknown>).status || 'Active')}</span>}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{isEditing ? <input className={inp} value={String(editDcForm.description || '')} onChange={e => setEditDcForm({ ...editDcForm, description: e.target.value })} /> : String((dc as Record<string, unknown>).description || '—')}</td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleSaveDc(dcId)} className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700">Save</button>
                                <button onClick={() => setEditingDcId(null)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingDcId(dcId); setEditDcForm({ dc_id: (dc as Record<string, unknown>).dc_id as string || (dc as Record<string, unknown>).code as string, name: (dc as Record<string, unknown>).name as string, region: (dc as Record<string, unknown>).region as string, status: (dc as Record<string, unknown>).status as string, description: (dc as Record<string, unknown>).description as string, dc_type: dcType }); }} className="px-2 py-1 text-xs text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50">Edit</button>
                                <button onClick={() => handleDeleteDc(dcId, dcType)} className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50">Delete</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {ngdcDatacenters.length === 0 && legacyDatacenters.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">No data centers found. Click &quot;+ Add DC&quot; to create one.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-gray-400">Total: {ngdcDatacenters.length} NGDC + {legacyDatacenters.length} Legacy = {ngdcDatacenters.length + legacyDatacenters.length} data center{ngdcDatacenters.length + legacyDatacenters.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        )}

        {/* ── Shared Services Tab ── */}
        {activeTab === 'port_catalog' && (
          <PortCatalogTab />
        )}

        {activeTab === 'shared_services' && (
          <SharedServicesTab />
        )}

        {activeTab === 'sz_naming' && (
          <SecurityZoneNamingTab />
        )}

        {activeTab === 'birthright' && (
          <BirthrightRulesTab />
        )}

        {activeTab === 'itsm' && (
          <ItsmConnectorsTab />
        )}

        {/* ── App Management Tab ── */}
        {activeTab === 'app_management' && (
          <div className="space-y-6">
            {/* Hero header */}
            <div className="p-5 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50 border border-purple-100 rounded-2xl shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">App Management</h2>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xl">Register applications with per-DC presences, egress/ingress configuration, and ServiceNow linkage.</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-purple-100 text-purple-700 border-purple-200">Apps: {applications.length}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200">With Ingress: {applications.filter(a => a.has_ingress).length}</span>
                      {selectedApp && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200">Filtered: {selectedApp}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <label className="px-4 py-2 text-sm font-semibold text-purple-700 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 cursor-pointer shadow-sm transition-all">
                    {importingApps ? 'Importing…' : '⬆ Import Apps'}
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={importingApps} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImportingApps(true);
                      try {
                        const result = await api.importAppManagement(file);
                        setImportResult(result);
                        showNotification(`Import: ${result.added} added, ${result.updated} updated, ${result.skipped} unchanged`, 'success');
                        loadRefData();
                      } catch { showNotification('Import failed', 'error'); }
                      setImportingApps(false);
                      e.target.value = '';
                    }} />
                  </label>
                  <button onClick={async () => {
                    if (!confirm('Clear ALL imported app data? Seed apps will remain.')) return;
                    try {
                      await api.clearAppManagement();
                      showNotification('All imported apps cleared', 'success');
                      loadRefData();
                    } catch { showNotification('Clear failed', 'error'); }
                  }} className="px-4 py-2 text-sm font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 shadow-sm transition-all">Clear Apps</button>
                  <button onClick={() => setShowAddApp(true)}
                    className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-lg hover:shadow-lg transition-all shadow-md">+ Add Application</button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700">Focus on:</label>
                <select className="flex-1 max-w-md px-3 py-2 text-sm border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 bg-white shadow-sm"
                  value={selectedApp} onChange={e => setSelectedApp(e.target.value)}>
                  <option value="">-- All Applications --</option>
                  {applications.map(app => {
                    const id = app.app_distributed_id || app.app_id;
                    const friendly = (app.app_name || '').trim();
                    // Render `id — friendly` only when both halves are
                    // non-empty so an empty app_name no longer leaves
                    // a dangling em-dash like ``CRM_PROD —``.
                    const label = friendly ? `${id} — ${friendly}` : id;
                    return <option key={app.app_id} value={app.app_id}>{label}</option>;
                  })}
                </select>
              </div>
            </div>

            {showAddApp && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <h3 className="text-sm font-semibold text-blue-800">Add New Application</h3>
                <div className="grid grid-cols-4 gap-3">
                  <input className={inp} placeholder="App ID" value={newAppForm.app_id || ''} onChange={e => setNewAppForm({ ...newAppForm, app_id: e.target.value })} />
                  <input className={inp} placeholder="App Distributed Id" value={newAppForm.app_distributed_id || ''} onChange={e => setNewAppForm({ ...newAppForm, app_distributed_id: e.target.value })} />
                  <input className={inp} placeholder="App Name" value={newAppForm.name || ''} onChange={e => setNewAppForm({ ...newAppForm, name: e.target.value })} />
                  <input className={inp} placeholder="Owner" value={newAppForm.owner || ''} onChange={e => setNewAppForm({ ...newAppForm, owner: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className={inp} placeholder="SNow SysID" value={newAppForm.snow_sysid || ''} onChange={e => setNewAppForm({ ...newAppForm, snow_sysid: e.target.value })} />
                </div>
                {/* Omnipresent / Primary DC — Primary DC is now optional;
                    every NGDC app lives in all 4 DCs and the per-DC presence
                    editor below is the source of truth for materialised
                    groups. ``primary_dc`` is retained only as a hint for the
                    rule builder's default source DC. */}
                <div className="border border-indigo-200 rounded-lg p-3 bg-white/60 space-y-2">
                  <h4 className="text-xs font-semibold text-indigo-800">Omnipresent Deployment <span className="font-normal text-gray-500">— every NGDC app lives in all 4 DCs; this is just a hint for the rule builder's default source DC</span></h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">Primary DC <span className="text-gray-400 font-normal">(optional)</span></label>
                      <select className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md"
                        value={String(newAppForm.primary_dc || '')}
                        onChange={e => setNewAppForm({ ...newAppForm, primary_dc: e.target.value })}>
                        <option value="">— unset (auto from presences) —</option>
                        {ngdcDatacenters.map(dc => {
                          const code = String(dc.dc_id || dc.code || '');
                          return <option key={code} value={code}>{code}</option>;
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">Deployment Mode</label>
                      <select className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md"
                        value={newAppForm.deployment_mode || 'all_ngdc'}
                        onChange={e => setNewAppForm({ ...newAppForm, deployment_mode: e.target.value as Application['deployment_mode'] })}>
                        <option value="all_ngdc">All NGDC (auto-fan presences)</option>
                        <option value="all_ngdc_with_exceptions">All NGDC (with exceptions)</option>
                        <option value="selective">Selective (manual presences)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-1">Owner Team</label>
                      <input className={inp} placeholder="e.g. Eta, Platform, SNS"
                        value={newAppForm.owner_team || ''}
                        onChange={e => setNewAppForm({ ...newAppForm, owner_team: e.target.value })} />
                    </div>
                  </div>
                </div>
                <PresencePerDcEditor
                  rows={newAppPresences}
                  onChange={setNewAppPresences}
                  ngdcDcs={ngdcDatacenters.map(dc => ({ code: String(dc.dc_id || dc.code || '') })).filter(d => d.code)}
                  title="Per-DC Presences"
                  subtitle="One row per (DC, NH, SZ) for NGDC, or per Heritage DC. Egress + ingress IPs/CIDRs declared here flow into the matching grp-<APP>-… groups + fan into rules at submit time."
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowAddApp(false); _setNewAppMappings([]); }} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  <button onClick={handleAddApp} disabled={!newAppForm.app_id || !newAppForm.name}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-40">Save</button>
                </div>
              </div>
            )}

            {selectedAppData && (
              <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Application Details</h3>
                  <div className="flex gap-2">
                    {editingAppId === selectedApp ? (<>
                      <button onClick={() => setEditingAppId(null)} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                      <button onClick={handleSaveApp} className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700">Save</button>
                    </>) : (<>
                      <button onClick={() => {
                        setEditingAppId(selectedApp);
                        setEditAppForm(selectedAppData);
                        const distId = String(selectedAppData.app_distributed_id || selectedAppData.app_id || selectedApp);
                        loadAppPresences(distId);
                      }}
                        className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100">Edit</button>
                      <button onClick={() => handleDeleteApp(selectedApp)}
                        className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100">Delete</button>
                    </>)}
                  </div>
                </div>
                {editingAppId === selectedApp ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">App ID</label>
                        <p className="text-sm font-semibold text-gray-800">{selectedAppData.app_id}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">App Distributed Id</label>
                        <input className={inp} value={String(editAppForm.app_distributed_id ?? '')} onChange={e => setEditAppForm({ ...editAppForm, app_distributed_id: e.target.value })} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">App Name</label>
                        <input className={inp} value={editAppForm.name || ''} onChange={e => setEditAppForm({ ...editAppForm, name: e.target.value })} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
                        <input className={inp} value={editAppForm.owner || ''} onChange={e => setEditAppForm({ ...editAppForm, owner: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">SNow SysID</label>
                        <input className={inp} value={editAppForm.snow_sysid || ''} onChange={e => setEditAppForm({ ...editAppForm, snow_sysid: e.target.value })} /></div>
                    </div>
                    {/* Filter values — Neighborhoods / SZs / DCs are the
                        comma-separated classification fields used by every
                        listing filter across the portal. They're normally
                        derived from per-DC presences but operators need
                        the override path so apps without presence rows
                        (or undergoing renames) can still be filtered. */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Neighborhoods <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                        <input className={inp}
                          placeholder="e.g. Core Banking, Wholesale Banking"
                          value={editAppForm.neighborhoods ?? ''}
                          onChange={e => setEditAppForm({ ...editAppForm, neighborhoods: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">SZs <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                        <input className={inp}
                          placeholder="e.g. CCS, PAA, GEN"
                          value={editAppForm.szs ?? ''}
                          onChange={e => setEditAppForm({ ...editAppForm, szs: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">DCs <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                        <input className={inp}
                          placeholder="e.g. ALPHA_NGDC, BETA_NGDC"
                          value={editAppForm.dcs ?? ''}
                          onChange={e => setEditAppForm({ ...editAppForm, dcs: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 pt-2 border-t border-gray-200">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Primary DC <span className="text-gray-400 font-normal">(optional)</span></label>
                        <select className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md"
                          value={String(editAppForm.primary_dc || '')}
                          onChange={e => setEditAppForm({ ...editAppForm, primary_dc: e.target.value })}>
                          <option value="">— unset (auto from presences) —</option>
                          {ngdcDatacenters.map(dc => {
                            const code = String(dc.dc_id || dc.code || '');
                            return <option key={code} value={code}>{code}</option>;
                          })}
                        </select></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Deployment Mode</label>
                        <select className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md"
                          value={editAppForm.deployment_mode || 'all_ngdc'}
                          onChange={e => setEditAppForm({ ...editAppForm, deployment_mode: e.target.value as Application['deployment_mode'] })}>
                          <option value="all_ngdc">All NGDC (auto-fan)</option>
                          <option value="all_ngdc_with_exceptions">All NGDC (with exceptions)</option>
                          <option value="selective">Selective</option>
                        </select></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Owner Team</label>
                        <input className={inp} placeholder="e.g. Eta, Platform, SNS"
                          value={editAppForm.owner_team || ''}
                          onChange={e => setEditAppForm({ ...editAppForm, owner_team: e.target.value })} /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Excluded DCs</label>
                        <input className={inp} placeholder="comma-separated, e.g. DELTA_NGDC"
                          value={Array.isArray(editAppForm.excluded_dcs) ? editAppForm.excluded_dcs.join(',') : ''}
                          onChange={e => setEditAppForm({ ...editAppForm, excluded_dcs: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></div>
                    </div>
                    <PresencePerDcEditor
                      rows={editAppPresences}
                      onChange={setEditAppPresences}
                      ngdcDcs={ngdcDatacenters.map(dc => ({ code: String(dc.dc_id || dc.code || '') })).filter(d => d.code)}
                      title="Per-DC Presences"
                      subtitle="One row per (DC, NH, SZ) for NGDC, or per Heritage DC. Egress + ingress chips here flow into the matching grp-<APP>-… groups + are picked up by the rule builder."
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">App ID</label><p className="text-sm font-semibold text-gray-800">{selectedAppData.app_id}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">App Distributed Id</label><p className="text-sm font-mono text-gray-800">{selectedAppData.app_distributed_id || 'N/A'}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">App Name</label><p className="text-sm text-gray-800">{selectedAppData.name}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Owner</label><p className="text-sm text-gray-800">{selectedAppData.owner || 'N/A'}</p></div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Neighborhoods</label><p className="text-sm font-mono text-gray-800">{selectedAppData.neighborhoods || 'N/A'}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">SZs</label><p className="text-sm font-mono text-gray-800">{selectedAppData.szs || 'N/A'}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">DCs</label><p className="text-sm font-mono text-gray-800">{selectedAppData.dcs || 'N/A'}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">SNow SysID</label><p className="text-sm font-mono text-gray-800">{selectedAppData.snow_sysid || 'N/A'}</p></div>
                    </div>
                    {/* Per-DC presences (read-only) — every (DC, NH, SZ)
                        row this app declares plus its DC-local egress +
                        ingress IPs. Heritage rows render in amber, NGDC in
                        emerald. The same data is editable via the Edit
                        button above (Per-DC Presence Editor). */}
                    <div className="pt-2 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-semibold text-gray-700">Per-DC Presences ({editAppPresences.length})</h4>
                        <span className="text-[10px] text-gray-500 italic">Each row = one DC's group instance. Egress/Ingress IPs shown are only what deploys to that DC's device.</span>
                      </div>
                      {editAppPresences.length === 0 ? (
                        <div className="text-[11px] italic text-gray-500 px-2 py-2">No per-DC presences declared. Click <b>Edit</b> above to add presences using the Per-DC Presence Editor.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border border-gray-200 rounded">
                            <thead className="bg-gray-50 text-[11px] text-gray-600">
                              <tr>
                                <th className="text-left font-medium px-2 py-1">Scope</th>
                                <th className="text-left font-medium px-2 py-1">DC</th>
                                <th className="text-left font-medium px-2 py-1">NH</th>
                                <th className="text-left font-medium px-2 py-1">SZ</th>
                                <th className="text-left font-medium px-2 py-1">Ingress?</th>
                                <th className="text-left font-medium px-2 py-1">Egress IPs / CIDRs</th>
                                <th className="text-left font-medium px-2 py-1">Ingress VIPs / IPs</th>
                                <th className="text-left font-medium px-2 py-1">Source NGDC DCs</th>
                              </tr>
                            </thead>
                            <tbody>
                              {editAppPresences.map((r) => {
                                const heritage = !!r.is_heritage;
                                const renderChips = (chips: typeof r.egress_members) =>
                                  !chips || chips.length === 0
                                    ? <span className="text-[10px] italic text-rose-600">— no members for this DC —</span>
                                    : (
                                      <div className="flex flex-wrap gap-1">
                                        {chips.map((c, i) => (
                                          <span key={`${c.value}-${i}`} className="px-1.5 py-0.5 text-[10px] rounded bg-white border border-gray-200 font-mono text-gray-700">{c.value}</span>
                                        ))}
                                      </div>
                                    );
                                return (
                                  <tr key={r.uid || `${r.dc_id}|${r.nh_id}|${r.sz_code}|${heritage ? 'H' : 'N'}`}
                                    className={`border-t border-gray-100 align-top ${heritage ? 'bg-amber-50/50' : 'bg-white'}`}>
                                    <td className="px-2 py-1">
                                      <span className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${heritage ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                        {heritage ? 'Heritage' : 'NGDC'}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 font-mono">{r.dc_id || <span className="text-rose-600">—</span>}</td>
                                    <td className="px-2 py-1 font-mono">{heritage ? '—' : (r.nh_id || <span className="text-rose-600">—</span>)}</td>
                                    <td className="px-2 py-1 font-mono">{heritage ? '—' : (r.sz_code || <span className="text-rose-600">—</span>)}</td>
                                    <td className="px-2 py-1">
                                      {r.has_ingress
                                        ? <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 text-purple-700 font-semibold">Yes</span>
                                        : <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-500">No</span>}
                                    </td>
                                    <td className="px-2 py-1">{renderChips(r.egress_members)}</td>
                                    <td className="px-2 py-1">
                                      {r.has_ingress
                                        ? renderChips(r.ingress_members)
                                        : <span className="text-[10px] italic text-gray-400">— ingress disabled —</span>}
                                    </td>
                                    <td className="px-2 py-1">
                                      {heritage ? (
                                        (r.ngdc_source_dcs || []).length === 0
                                          ? <span className="text-[10px] italic text-amber-700">— all NGDC DCs (no explicit mapping) —</span>
                                          : (
                                            <div className="flex flex-wrap gap-1">
                                              {(r.ngdc_source_dcs || []).map((dc) => (
                                                <span key={dc} className="px-1.5 py-0.5 text-[10px] rounded bg-white border border-amber-200 font-mono text-amber-800">{dc}</span>
                                              ))}
                                            </div>
                                          )
                                      ) : <span className="text-[10px] text-gray-400">—</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    {/* Legacy single-DC summary fields kept for back-compat with
                        older imports; per-DC rows above are the source of truth. */}
                    <div className="grid grid-cols-4 gap-4 pt-2 border-t border-gray-200">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Legacy Egress IP <span className="text-gray-400 font-normal">(import-only)</span></label><p className="text-sm font-mono text-gray-800">{selectedAppData.egress_ip || 'N/A'}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Has Ingress</label><p className="text-sm">{selectedAppData.has_ingress ? <span className="px-2 py-0.5 text-xs font-bold rounded bg-purple-100 text-purple-700">Yes</span> : <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-500">No</span>}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Legacy Ingress IPs <span className="text-gray-400 font-normal">(import-only)</span></label><p className="text-sm font-mono text-gray-800">{selectedAppData.ingress_ips || 'N/A'}</p></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Ingress Components</label><p className="text-sm font-mono text-gray-800">{selectedAppData.ingress_components || 'N/A'}</p></div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Presence Matrix — per-(DC, NH, SZ) with auto-derived egress/ingress groups */}
            {selectedAppData && (
              <div className="p-5 bg-white border border-purple-100 rounded-2xl shadow-sm">
                <AppPresenceMatrix
                  appDistributedId={String(selectedAppData.app_distributed_id || selectedAppData.app_id)}
                  appId={String(selectedAppData.app_id)}
                  environment="Production"
                  onChange={() => loadRefData()}
                />
              </div>
            )}

            {/* DC/NH/SZ Mappings for selected app (simplified - no component) */}
            {selectedApp && (
              <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">DC / NH / SZ Mappings ({selectedAppMappings.length})</h3>
                  <button onClick={() => { setShowAddMapping(true); setNewMappingForm({ ...newMappingForm, app_id: selectedApp }); }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700">+ Add Mapping</button>
                </div>
                {showAddMapping && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                    <div className="grid grid-cols-6 gap-2">
                      <select className="px-2 py-1 text-xs border rounded" value={newMappingForm.dc || ''} onChange={e => { const dc = e.target.value; const resolved = clientResolveCidr(dc, newMappingForm.nh || '', newMappingForm.sz || ''); setNewMappingForm({ ...newMappingForm, dc, cidr: resolved || newMappingForm.cidr || '' }); }}>
                        <option value="">-- Select DC --</option>
                        {ngdcDatacenters.map(d => { const id = String(d.dc_id || d.code); return <option key={id} value={id}>{id} (NGDC)</option>; })}
                        {legacyDatacenters.map(d => { const id = String(d.dc_id || d.code); return <option key={id} value={id}>{id} (Legacy)</option>; })}
                      </select>
                      <input className="px-2 py-1 text-xs border rounded" placeholder="NH (e.g. NH02)" value={newMappingForm.nh || ''} onChange={e => { const nh = e.target.value; const resolved = clientResolveCidr(newMappingForm.dc || '', nh, newMappingForm.sz || ''); setNewMappingForm({ ...newMappingForm, nh, cidr: resolved || newMappingForm.cidr || '' }); }} />
                      <input className="px-2 py-1 text-xs border rounded" placeholder="SZ (e.g. CCS)" value={newMappingForm.sz || ''} onChange={e => { const sz = e.target.value; const resolved = clientResolveCidr(newMappingForm.dc || '', newMappingForm.nh || '', sz); setNewMappingForm({ ...newMappingForm, sz, cidr: resolved || newMappingForm.cidr || '' }); }} />
                      <div className="relative">
                        <input className="px-2 py-1 text-xs border rounded font-mono w-full" placeholder="CIDR (auto-resolved)" value={newMappingForm.cidr || ''} onChange={e => setNewMappingForm({ ...newMappingForm, cidr: e.target.value })} />
                        {newMappingForm.cidr && clientResolveCidr(newMappingForm.dc || '', newMappingForm.nh || '', newMappingForm.sz || '') === newMappingForm.cidr && (
                          <span className="absolute -top-1.5 right-1 text-[8px] text-green-600 bg-white px-0.5">auto</span>
                        )}
                      </div>
                      <input className="px-2 py-1 text-xs border rounded" placeholder="Notes" value={newMappingForm.notes || ''} onChange={e => setNewMappingForm({ ...newMappingForm, notes: e.target.value })} />
                      <div className="flex gap-1">
                        <button onClick={() => setShowAddMapping(false)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-100">Cancel</button>
                        <button onClick={handleAddMapping} className="px-2 py-1 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700">Add</button>
                      </div>
                    </div>
                  </div>
                )}
                {selectedAppMappings.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">DC Location</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">DC</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">NH</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SZ</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">CIDR</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedAppMappings.map(m => {
                          const mid = m.id || `${m.app_id}-${m.dc}-${m.nh}`;
                          if (editingMappingId === mid) {
                            return (
                              <tr key={mid} className="bg-blue-50">
                                <td className="px-3 py-1"><select className="w-full px-1 py-1 text-xs border rounded" value={(editMappingForm as Record<string,string>).dc_location || 'NGDC'} onChange={e => setEditMappingForm({ ...editMappingForm, dc_location: e.target.value } as typeof editMappingForm)}>
                                  <option value="NGDC">NGDC</option><option value="Legacy">Legacy</option>
                                </select></td>
                                <td className="px-3 py-1"><select className="w-full px-1 py-1 text-xs border rounded" value={editMappingForm.dc || ''} onChange={e => setEditMappingForm({ ...editMappingForm, dc: e.target.value })}>
                                  {ngdcDatacenters.map(d => { const id = String(d.dc_id || d.code); return <option key={id} value={id}>{id}</option>; })}
                                  {legacyDatacenters.map(d => { const id = String(d.dc_id || d.code); return <option key={id} value={id}>{id}</option>; })}
                                </select></td>
                                <td className="px-3 py-1"><input className="w-full px-1 py-1 text-xs border rounded" placeholder="NH02" value={editMappingForm.nh || ''} onChange={e => setEditMappingForm({ ...editMappingForm, nh: e.target.value })} /></td>
                                <td className="px-3 py-1"><input className="w-full px-1 py-1 text-xs border rounded" placeholder="CCS" value={editMappingForm.sz || ''} onChange={e => setEditMappingForm({ ...editMappingForm, sz: e.target.value })} /></td>
                                <td className="px-3 py-1"><input className="w-full px-1 py-1 text-xs border rounded font-mono" value={editMappingForm.cidr || ''} onChange={e => setEditMappingForm({ ...editMappingForm, cidr: e.target.value })} /></td>
                                <td className="px-3 py-1"><select className="w-full px-1 py-1 text-xs border rounded" value={editMappingForm.status || 'Active'} onChange={e => setEditMappingForm({ ...editMappingForm, status: e.target.value as AppDCMapping['status'] })}>
                                  <option value="Active">Active</option><option value="Inactive">Inactive</option>
                                </select></td>
                                <td className="px-3 py-1"><input className="w-full px-1 py-1 text-xs border rounded" value={editMappingForm.notes || ''} onChange={e => setEditMappingForm({ ...editMappingForm, notes: e.target.value })} /></td>
                                <td className="px-3 py-1"><div className="flex gap-1">
                                  <button onClick={() => setEditingMappingId(null)} className="px-2 py-0.5 text-xs text-gray-600 border rounded hover:bg-gray-100">Cancel</button>
                                  <button onClick={handleSaveMapping} className="px-2 py-0.5 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700">Save</button>
                                </div></td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={mid} className="hover:bg-gray-50">
                              <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-bold rounded ${(m as unknown as Record<string,string>).dc_location === 'NGDC' ? 'bg-green-100 text-green-700' : (m as unknown as Record<string,string>).dc_location === 'Legacy' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{(m as unknown as Record<string,string>).dc_location || 'N/A'}</span></td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-700">{m.dc || (m as unknown as Record<string,string>).legacy_dc || '-'}</td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-700">{m.nh || '-'}</td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-700">{m.sz || '-'}</td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-600">{m.cidr || (m as unknown as Record<string,string>).legacy_cidr || '-'}</td>
                              <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${m.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{m.status}</span></td>
                              <td className="px-3 py-2 text-xs text-gray-500 max-w-[150px] truncate">{m.notes || ''}</td>
                              <td className="px-3 py-2"><div className="flex gap-1">
                                <button onClick={() => { setEditingMappingId(mid); setEditMappingForm({ ...m }); }} className="px-2 py-0.5 text-xs text-blue-700 bg-blue-50 rounded hover:bg-blue-100">Edit</button>
                                <button onClick={() => handleDeleteMapping(mid)} className="px-2 py-0.5 text-xs text-red-700 bg-red-50 rounded hover:bg-red-100">Del</button>
                              </div></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No DC/NH/SZ mappings yet. Click &quot;+ Add Mapping&quot; to define placement.</p>
                )}
              </div>
            )}

            {!selectedApp && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-800">All Applications ({applications.length})</h3>
                </div>
                {loadingRef ? (<div className="p-8 text-center text-gray-400">Loading...</div>) : (
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0"><tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">App ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">App Distributed Id</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">App Name</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Has Ingress</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Egress IP</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Neighborhoods</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SZs</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">DCs</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SNow SysID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {applications.map(app => {
                          const isEditing = editingAppId === app.app_id;
                          return (
                          <tr key={app.app_id} className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                            <td className="px-3 py-2 font-mono text-xs font-semibold text-blue-700">{app.app_id}</td>
                            <td className="px-3 py-2">{isEditing ? <input className={inp} value={editAppForm.app_distributed_id ?? ''} onChange={e => setEditAppForm({ ...editAppForm, app_distributed_id: e.target.value })} /> : <span className="font-mono text-xs text-gray-700">{app.app_distributed_id || '-'}</span>}</td>
                            <td className="px-3 py-2">{isEditing ? <input className={inp} value={editAppForm.name || ''} onChange={e => setEditAppForm({ ...editAppForm, name: e.target.value })} /> : <span className="text-xs text-gray-800">{app.name}</span>}</td>
                            <td className="px-3 py-2">
                              {isEditing ? (
                                <select className="w-full px-2 py-1 text-xs border rounded" value={editAppForm.has_ingress ? 'yes' : 'no'} onChange={e => setEditAppForm({ ...editAppForm, has_ingress: e.target.value === 'yes' })}>
                                  <option value="no">No</option><option value="yes">Yes</option>
                                </select>
                              ) : (
                                app.has_ingress ? <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-100 text-purple-700">Yes</span> : <span className="px-2 py-0.5 text-[10px] rounded bg-gray-100 text-gray-500">No</span>
                              )}
                            </td>
                            <td className="px-3 py-2">{isEditing ? <input className={inp} value={editAppForm.egress_ip || ''} onChange={e => setEditAppForm({ ...editAppForm, egress_ip: e.target.value })} /> : <span className="font-mono text-xs text-gray-600">{app.egress_ip || '-'}</span>}</td>
                            <td className="px-3 py-2">{isEditing ? <input className={inp} value={editAppForm.neighborhoods || ''} onChange={e => setEditAppForm({ ...editAppForm, neighborhoods: e.target.value })} /> : <span className="font-mono text-xs text-gray-600">{app.neighborhoods || app.nh || '-'}</span>}</td>
                            <td className="px-3 py-2">{isEditing ? <input className={inp} value={editAppForm.szs || ''} onChange={e => setEditAppForm({ ...editAppForm, szs: e.target.value })} /> : <span className="font-mono text-xs text-gray-600">{app.szs || app.sz || '-'}</span>}</td>
                            <td className="px-3 py-2">{isEditing ? <input className={inp} value={editAppForm.dcs || ''} onChange={e => setEditAppForm({ ...editAppForm, dcs: e.target.value })} /> : <span className="font-mono text-xs text-gray-600">{app.dcs || '-'}</span>}</td>
                            <td className="px-3 py-2">{isEditing ? <input className={inp} value={editAppForm.snow_sysid || ''} onChange={e => setEditAppForm({ ...editAppForm, snow_sysid: e.target.value })} /> : <span className="font-mono text-xs text-gray-500">{app.snow_sysid || '-'}</span>}</td>
                            <td className="px-3 py-2">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <button onClick={() => { handleSaveApp(); setEditingAppId(null); }}
                                    className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700">Save</button>
                                  <button onClick={() => setEditingAppId(null)}
                                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                                </div>
                              ) : (
                                <div className="flex gap-1">
                                  <button onClick={() => { setEditingAppId(app.app_id); setEditAppForm(app); }}
                                    className="px-2 py-1 text-xs text-blue-700 bg-blue-50 rounded hover:bg-blue-100">Edit</button>
                                  <button onClick={() => handleDeleteApp(app.app_id)}
                                    className="px-2 py-1 text-xs text-red-700 bg-red-50 rounded hover:bg-red-100">Delete</button>
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Policy Matrix Tab (Generic Pattern-Based Rules) ── */}
        {activeTab === 'policy_matrix' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-semibold text-gray-800">Policy Matrix &mdash; Generic Pattern Rules ({filteredPolicyMatrix.length} entries)</h3>
                <select className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500"
                  value={policyEnvFilter} onChange={e => setPolicyEnvFilter(e.target.value)}>
                  <option value="all">All Environments (Combined)</option>
                  <option value="production">Production</option>
                  <option value="non_production">Non-Production</option>
                  <option value="pre_production">Pre-Production</option>
                </select>
              </div>
              <button onClick={() => setShowAddPolicy(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">+ Add Pattern Rule</button>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
              <strong>Pattern Rules:</strong> These rules use generic patterns (e.g. &quot;Same&quot;, &quot;Different&quot;, &quot;Any&quot;, &quot;Open&quot;, &quot;Segmented&quot;) instead of listing every individual zone combination.
              The backend resolves these patterns at runtime against actual source/destination DC, NH, and SZ values.
            </div>

            {showAddPolicy && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <h3 className="text-sm font-semibold text-blue-800">Add Pattern Rule</h3>
                <div className="grid grid-cols-7 gap-2">
                  <input className={inp} placeholder="Source Zone Pattern" value={String(newPolicyForm.source_zone || '')} onChange={e => setNewPolicyForm({ ...newPolicyForm, source_zone: e.target.value })} />
                  <input className={inp} placeholder="Source NH Pattern" value={String(newPolicyForm.source_nh || '')} onChange={e => setNewPolicyForm({ ...newPolicyForm, source_nh: e.target.value })} />
                  <input className={inp} placeholder="Dest Zone Pattern" value={String(newPolicyForm.dest_zone || '')} onChange={e => setNewPolicyForm({ ...newPolicyForm, dest_zone: e.target.value })} />
                  <input className={inp} placeholder="Dest NH Pattern" value={String(newPolicyForm.dest_nh || '')} onChange={e => setNewPolicyForm({ ...newPolicyForm, dest_nh: e.target.value })} />
                  <select className={inp} value={String(newPolicyForm.action || '')} onChange={e => setNewPolicyForm({ ...newPolicyForm, action: e.target.value })}>
                    <option value="Permit">Permit</option><option value="Block">Block</option><option value="Conditional">Conditional</option>
                  </select>
                  <input className={inp} placeholder="Environment" value={String(newPolicyForm.environment || '')} onChange={e => setNewPolicyForm({ ...newPolicyForm, environment: e.target.value })} />
                  <input className={inp} placeholder="Note" value={String(newPolicyForm.note || '')} onChange={e => setNewPolicyForm({ ...newPolicyForm, note: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowAddPolicy(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  <button onClick={handleAddPolicy} className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Save</button>
                </div>
              </div>
            )}

            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">ID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Source Zone</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Source NH</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Source DC</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Dest Zone</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Dest NH</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Dest DC</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">FW Traversal</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reason</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPolicyMatrix.map((entry, idx) => {
                      const isEditing = editingPolicyIdx === idx;
                      const actionStr = String((isEditing ? editPolicyForm.action : entry.action) || entry.rule || '').toLowerCase();
                      const isPermit = actionStr.includes('permit') || actionStr.includes('allow');
                      const isBlock = actionStr.includes('block') || actionStr.includes('deny');

                      const patternBadge = (val: string) => {
                        const v = val.toLowerCase();
                        if (v === 'same') return 'bg-blue-100 text-blue-700';
                        if (v === 'different' || v === 'cross') return 'bg-orange-100 text-orange-700';
                        if (v === 'any') return 'bg-gray-100 text-gray-700';
                        if (v === 'open') return 'bg-green-100 text-green-700';
                        if (v === 'segmented') return 'bg-purple-100 text-purple-700';
                        return 'bg-gray-50 text-gray-600';
                      };

                      if (isEditing) {
                        return (
                          <tr key={idx} className="bg-blue-50">
                            <td className="px-3 py-2 text-xs text-gray-400">{String(entry.id || idx + 1)}</td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.source_zone || editPolicyForm.src_zone || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, source_zone: e.target.value, src_zone: e.target.value })} /></td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.source_nh || editPolicyForm.src_nh || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, source_nh: e.target.value, src_nh: e.target.value })} /></td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.source_dc || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, source_dc: e.target.value })} /></td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.dest_zone || editPolicyForm.dst_zone || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, dest_zone: e.target.value, dst_zone: e.target.value })} /></td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.dest_nh || editPolicyForm.dst_nh || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, dest_nh: e.target.value, dst_nh: e.target.value })} /></td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.dest_dc || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, dest_dc: e.target.value })} /></td>
                            <td className="px-3 py-2">
                              <select className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.action || editPolicyForm.rule || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, action: e.target.value, rule: e.target.value })}>
                                <option value="Permit">Permit</option><option value="Block">Block</option><option value="Conditional">Conditional</option>
                              </select>
                            </td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.firewall_traversal || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, firewall_traversal: e.target.value })} /></td>
                            <td className="px-3 py-2"><input className="w-full px-2 py-1 text-xs border rounded" value={String(editPolicyForm.reason || editPolicyForm.note || '')} onChange={e => setEditPolicyForm({ ...editPolicyForm, reason: e.target.value, note: e.target.value })} /></td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => setEditingPolicyIdx(null)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-100">Cancel</button>
                                <button onClick={handleSavePolicy} className="px-2 py-1 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700">Save</button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs font-mono text-gray-400">{String(entry.id || idx + 1)}</td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${patternBadge(String(entry.source_zone || entry.src_zone || 'Any'))}`}>{String(entry.source_zone || entry.src_zone || 'Any')}</span></td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${patternBadge(String(entry.source_nh || entry.src_nh || 'Any'))}`}>{String(entry.source_nh || entry.src_nh || 'Any')}</span></td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${patternBadge(String(entry.source_dc || 'Any'))}`}>{String(entry.source_dc || 'Any')}</span></td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${patternBadge(String(entry.dest_zone || entry.dst_zone || 'Any'))}`}>{String(entry.dest_zone || entry.dst_zone || 'Any')}</span></td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${patternBadge(String(entry.dest_nh || entry.dst_nh || 'Any'))}`}>{String(entry.dest_nh || entry.dst_nh || 'Any')}</span></td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${patternBadge(String(entry.dest_dc || 'Any'))}`}>{String(entry.dest_dc || 'Any')}</span></td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${isPermit ? 'bg-green-100 text-green-700' : isBlock ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                              {String(entry.action || entry.rule || 'N/A')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">{String(entry.firewall_traversal || 'N/A')}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate">{String(entry.reason || entry.note || entry.notes || '')}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => { setEditingPolicyIdx(idx); setEditPolicyForm({ ...entry }); }}
                                className="px-2 py-1 text-xs text-blue-700 bg-blue-50 rounded hover:bg-blue-100">Edit</button>
                              <button onClick={() => handleDeletePolicy(idx)}
                                className="px-2 py-1 text-xs text-red-700 bg-red-50 rounded hover:bg-red-100">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Naming Standards Tab ── */}
        {activeTab === 'naming_standards' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Naming Convention Standards</h3>
              {editingNaming ? (
                <div className="flex gap-2">
                  <button onClick={() => setEditingNaming(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  <button onClick={handleSaveNaming} className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Save</button>
                </div>
              ) : (
                <button onClick={() => setEditingNaming(true)}
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">Edit Standards</button>
              )}
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-medium text-blue-600 mb-1">Group Prefix</p>
                    {editingNaming
                      ? <input className={inp + ' font-mono'} value={editNamingForm.group_prefix} onChange={e => setEditNamingForm({ ...editNamingForm, group_prefix: e.target.value })} />
                      : <p className="text-sm font-mono font-bold text-blue-800">{editNamingForm.group_prefix || 'grp-'}</p>}
                    <p className="text-xs text-blue-600 mt-1">
                      {editingNaming
                        ? <input className="w-full px-2 py-1 text-xs border rounded" value={editNamingForm.group_pattern} onChange={e => setEditNamingForm({ ...editNamingForm, group_pattern: e.target.value })} />
                        : <span className="font-mono">{'grp-{APP}-{NH}-{SZ}-{SUBTYPE}'}</span>}
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs font-medium text-green-600 mb-1">Server Prefix</p>
                    {editingNaming
                      ? <input className={inp + ' font-mono'} value={editNamingForm.server_prefix} onChange={e => setEditNamingForm({ ...editNamingForm, server_prefix: e.target.value })} />
                      : <p className="text-sm font-mono font-bold text-green-800">{editNamingForm.server_prefix || 'svr-'}</p>}
                    <p className="text-xs text-green-600 mt-1">
                      {editingNaming
                        ? <input className="w-full px-2 py-1 text-xs border rounded" value={editNamingForm.server_pattern} onChange={e => setEditNamingForm({ ...editNamingForm, server_pattern: e.target.value })} />
                        : <span className="font-mono">{'svr-{IP_ADDRESS}'}</span>}
                    </p>
                  </div>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-xs font-medium text-orange-600 mb-1">Range Prefix</p>
                    {editingNaming
                      ? <input className={inp + ' font-mono'} value={editNamingForm.range_prefix} onChange={e => setEditNamingForm({ ...editNamingForm, range_prefix: e.target.value })} />
                      : <p className="text-sm font-mono font-bold text-orange-800">{editNamingForm.range_prefix || 'rng-'}</p>}
                    <p className="text-xs text-orange-600 mt-1">
                      {editingNaming
                        ? <input className="w-full px-2 py-1 text-xs border rounded" value={editNamingForm.range_pattern} onChange={e => setEditNamingForm({ ...editNamingForm, range_pattern: e.target.value })} />
                        : <span className="font-mono">{'rng-xx.xx.xx.xx-xx'}</span>}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-xs font-medium text-purple-600 mb-1">Subnet Prefix</p>
                    <p className="text-sm font-mono font-bold text-purple-800">net-</p>
                    <p className="text-xs text-purple-600 mt-1">
                      <span className="font-mono">{'net-xx.xx.xx.xx/xx'}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase">Subtypes</h4>
                  <div className="flex flex-wrap gap-2">
                    {['APP', 'DB', 'WEB', 'API', 'MQ', 'BAT', 'SVC', 'LB', 'MON', 'NET'].map(st => (
                      <span key={st} className="px-3 py-1 text-xs font-mono font-medium bg-gray-100 text-gray-700 rounded-full border border-gray-200">{st}</span>
                    ))}
                  </div>
                  <h4 className="text-xs font-semibold text-gray-600 uppercase mt-4">Security Zones</h4>
                  <div className="flex flex-wrap gap-2">
                    {['CDE', 'GEN', 'DMZ', 'MGT', 'RES', 'EXT', 'PAA', 'CPA', 'CCS', '3PY'].map(sz => (
                      <span key={sz} className="px-3 py-1 text-xs font-mono font-medium bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">{sz}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Firewall Devices Tab (Patterns + Devices) ── */}
        {activeTab === 'fw_devices' && (
          <div className="space-y-4">
            {/* View Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                <button onClick={() => setFwViewMode('patterns')} className={`px-4 py-2 text-sm font-medium ${fwViewMode === 'patterns' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Naming Patterns</button>
                <button onClick={() => setFwViewMode('devices')} className={`px-4 py-2 text-sm font-medium ${fwViewMode === 'devices' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Individual Devices</button>
              </div>
              {fwViewMode === 'devices' && (
                <button onClick={() => setShowAddDevice(!showAddDevice)}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">+ Add Device</button>
              )}
            </div>

            {/* Patterns View */}
            {fwViewMode === 'patterns' && (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
                  <strong>Naming Patterns:</strong> Firewall devices follow generic naming conventions. The backend resolves the actual device name at runtime based on DC, NH, SZ, and vendor.
                </div>

                {/* Naming Patterns Table */}
                <div className="p-4 bg-white border border-gray-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Device Naming Patterns</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Pattern</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Example</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {fwPatterns.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2"><span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">{String(p.type || p.device_type || '')}</span></td>
                            <td className="px-3 py-2 font-mono text-indigo-700 text-xs">{String(p.pattern || p.naming_pattern || '')}</td>
                            <td className="px-3 py-2 font-mono text-gray-600 text-xs">{String(p.example || '')}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">{String(p.description || '')}</td>
                          </tr>
                        ))}
                        {fwPatterns.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400 text-xs">No patterns loaded. Check backend /api/reference/firewall-device-patterns endpoint.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DC Vendor Map */}
                {Object.keys(dcVendorMap).length > 0 && (
                  <div className="p-4 bg-white border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">DC &rarr; Vendor Mapping</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(dcVendorMap).map(([dc, vendors]) => (
                        <div key={dc} className="border border-gray-200 rounded-lg p-3">
                          <div className="text-sm font-bold text-gray-800 mb-2">{dc}</div>
                          <div className="space-y-1">
                            {Object.entries(vendors).map(([role, vendor]) => (
                              <div key={role} className="flex justify-between text-xs">
                                <span className="text-gray-500">{role}:</span>
                                <span className={`px-1.5 py-0.5 rounded font-medium ${
                                  vendor === 'palo_alto' ? 'bg-blue-100 text-blue-700' :
                                  vendor === 'checkpoint' ? 'bg-purple-100 text-purple-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>{vendor === 'palo_alto' ? 'Palo Alto' : vendor === 'checkpoint' ? 'Check Point' : vendor}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Devices View (Individual Devices) */}
            {fwViewMode === 'devices' && (
              <>
                {/* Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <select className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white" value={deviceFilter.dc} onChange={e => setDeviceFilter(f => ({ ...f, dc: e.target.value }))}>
                    <option value="">All DCs</option>
                    <option value="ALPHA_NGDC">ALPHA_NGDC</option>
                    <option value="BETA_NGDC">BETA_NGDC</option>
                    <option value="GAMMA_NGDC">GAMMA_NGDC</option>
                  </select>
                  <select className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white" value={deviceFilter.type} onChange={e => setDeviceFilter(f => ({ ...f, type: e.target.value }))}>
                    <option value="">All Types</option>
                    <option value="perimeter">Perimeter</option>
                    <option value="segmentation">Segmentation</option>
                    <option value="dmz">DMZ</option>
                    <option value="paa">PAA</option>
                  </select>
                  <select className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white" value={deviceFilter.vendor} onChange={e => setDeviceFilter(f => ({ ...f, vendor: e.target.value }))}>
                    <option value="">All Vendors</option>
                    <option value="palo_alto">Palo Alto</option>
                    <option value="checkpoint">Check Point</option>
                    <option value="fortigate">FortiGate</option>
                  </select>
                  <span className="text-xs text-gray-500 ml-auto">{filteredDevices.length} devices</span>
                </div>

                {/* Add Device Form */}
                {showAddDevice && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
                    <h4 className="text-sm font-semibold text-indigo-800">Add New Firewall Device</h4>
                    <div className="grid grid-cols-4 gap-3">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Device ID</label>
                        <input type="text" className={inp} value={newDeviceForm.device_id as string} onChange={e => setNewDeviceForm(f => ({ ...f, device_id: e.target.value }))} placeholder="fw-PA-NH01-CPA" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" className={inp} value={newDeviceForm.name as string} onChange={e => setNewDeviceForm(f => ({ ...f, name: e.target.value }))} placeholder="Palo Alto NH01 CPA" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
                        <select className={inp} value={newDeviceForm.vendor as string} onChange={e => setNewDeviceForm(f => ({ ...f, vendor: e.target.value }))}>
                                                  <option value="palo_alto">Palo Alto</option><option value="checkpoint">Check Point</option><option value="fortigate">FortiGate</option>
                                                </select></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">DC</label>
                        <select className={inp} value={newDeviceForm.dc as string} onChange={e => setNewDeviceForm(f => ({ ...f, dc: e.target.value }))}>
                          {ngdcDatacenters.map(d => { const id = String(d.dc_id || d.code); return <option key={id} value={id}>{id} (NGDC)</option>; })}
                          {legacyDatacenters.map(d => { const id = String(d.dc_id || d.code); return <option key={id} value={id}>{id} (Legacy)</option>; })}
                        </select></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">NH</label>
                        <input type="text" className={inp} value={newDeviceForm.nh as string} onChange={e => setNewDeviceForm(f => ({ ...f, nh: e.target.value }))} placeholder="NH01" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">SZ</label>
                        <input type="text" className={inp} value={newDeviceForm.sz as string} onChange={e => setNewDeviceForm(f => ({ ...f, sz: e.target.value }))} placeholder="CPA" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                        <select className={inp} value={newDeviceForm.type as string} onChange={e => setNewDeviceForm(f => ({ ...f, type: e.target.value }))}>
                          <option value="perimeter">Perimeter</option><option value="segmentation">Segmentation</option><option value="dmz">DMZ</option><option value="paa">PAA</option>
                        </select></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Mgmt IP</label>
                        <input type="text" className={inp} value={newDeviceForm.mgmt_ip as string} onChange={e => setNewDeviceForm(f => ({ ...f, mgmt_ip: e.target.value }))} placeholder="10.x.x.x" /></div>
                    </div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Capabilities (comma-separated)</label>
                      <input type="text" className={inp} value={newDeviceForm.capabilities as string} onChange={e => setNewDeviceForm(f => ({ ...f, capabilities: e.target.value }))} placeholder="L7 inspection, URL filtering" /></div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddDevice(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                      <button onClick={handleAddDevice} className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Add Device</button>
                    </div>
                  </div>
                )}

                {/* Devices Table */}
                {loadingRef ? (
                  <p className="text-sm text-gray-400 animate-pulse">Loading devices...</p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Device ID</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Name</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Vendor</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">DC</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">NH</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">SZ</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Type</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Mgmt IP</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {filteredDevices.map(dev => {
                          const devId = dev.device_id as string;
                          const isEditing = editingDeviceId === devId;
                          return (
                            <tr key={devId} className={isEditing ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-2 font-mono font-medium text-gray-800">{devId}</td>
                              <td className="px-3 py-2">{isEditing
                                ? <input type="text" className="px-2 py-1 text-xs border rounded w-full" value={(editDeviceForm.name as string) || ''} onChange={e => setEditDeviceForm(f => ({ ...f, name: e.target.value }))} />
                                : (dev.name as string)}</td>
                              <td className="px-3 py-2">{isEditing
                                ? <select className="px-2 py-1 text-xs border rounded" value={(editDeviceForm.vendor as string) || ''} onChange={e => setEditDeviceForm(f => ({ ...f, vendor: e.target.value }))}>
                                                  <option value="palo_alto">Palo Alto</option><option value="checkpoint">Check Point</option><option value="fortigate">FortiGate</option>
                                                </select>
                                : <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    dev.vendor === 'palo_alto' ? 'bg-blue-100 text-blue-700' :
                                    dev.vendor === 'checkpoint' ? 'bg-purple-100 text-purple-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>{dev.vendor === 'palo_alto' ? 'Palo Alto' : dev.vendor === 'checkpoint' ? 'Check Point' : dev.vendor === 'fortigate' ? 'FortiGate' : String(dev.vendor)}</span>}</td>
                              <td className="px-3 py-2">{dev.dc as string}</td>
                              <td className="px-3 py-2">{isEditing
                                ? <input type="text" className="px-2 py-1 text-xs border rounded w-16" value={(editDeviceForm.nh as string) || ''} onChange={e => setEditDeviceForm(f => ({ ...f, nh: e.target.value }))} />
                                : (dev.nh as string || '-')}</td>
                              <td className="px-3 py-2">{isEditing
                                ? <input type="text" className="px-2 py-1 text-xs border rounded w-16" value={(editDeviceForm.sz as string) || ''} onChange={e => setEditDeviceForm(f => ({ ...f, sz: e.target.value }))} />
                                : (dev.sz as string || '-')}</td>
                              <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                dev.type === 'perimeter' ? 'bg-red-100 text-red-700' :
                                dev.type === 'segmentation' ? 'bg-green-100 text-green-700' :
                                dev.type === 'dmz' ? 'bg-orange-100 text-orange-700' :
                                'bg-cyan-100 text-cyan-700'
                              }`}>{dev.type as string}</span></td>
                              <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                dev.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>{dev.status as string}</span></td>
                              <td className="px-3 py-2 font-mono text-gray-500">{isEditing
                                ? <input type="text" className="px-2 py-1 text-xs border rounded w-24" value={(editDeviceForm.mgmt_ip as string) || ''} onChange={e => setEditDeviceForm(f => ({ ...f, mgmt_ip: e.target.value }))} />
                                : (dev.mgmt_ip as string || '-')}</td>
                              <td className="px-3 py-2">
                                {isEditing ? (
                                  <div className="flex gap-1">
                                    <button onClick={handleSaveDevice} className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700">Save</button>
                                    <button onClick={() => setEditingDeviceId(null)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50">Cancel</button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <button onClick={() => { setEditingDeviceId(devId); setEditDeviceForm({ ...dev }); }} className="px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded">Edit</button>
                                    <button onClick={() => handleDeleteDevice(devId)} className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded">Delete</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── User Groups Tab ── */}
        {activeTab === 'ad_groups' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setEditGroup({}); groupModal.open(null as unknown as ADUserGroup); }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">+ Add Group</button>
            </div>
            <div className="space-y-3">
              {groups.filter(g => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return g.group_name.toLowerCase().includes(q) || g.access_type.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
              }).map(group => (
                <div key={group.id} className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`px-3 py-1 text-xs font-semibold rounded-full border ${ACCESS_COLORS[group.access_type]}`}>{group.access_type}</div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-800">{group.group_name}</h3>
                        <p className="text-xs text-gray-500">{group.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-800">{group.member_count}</p>
                        <p className="text-xs text-gray-500">members</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-600">{group.applications.includes('*') ? 'All Apps' : group.applications.join(', ')}</p>
                      </div>
                      <button onClick={() => { setEditGroup(group); groupModal.open(group); }}
                        className="px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded">Edit</button>
                      <button onClick={() => handleDeleteGroup(group.id)}
                        className="px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Users Tab ── */}
        {activeTab === 'ad_users' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setEditUser({}); userModal.open(null as unknown as ADUser); }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">+ Add User</button>
            </div>
            <div className="space-y-3">
              {users.filter(u => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
              }).map(user => (
                <div key={user.id} className="p-4 bg-white border border-gray-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.display_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{user.display_name}</p>
                      <p className="text-xs text-gray-500">{user.email} | {user.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${ACCESS_COLORS[user.access_type]}`}>{user.access_type}</span>
                    <span className="text-xs text-gray-500">{user.groups.join(', ')}</span>
                    <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-xs text-gray-400">{user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</span>
                    <button onClick={() => { setEditUser(user); userModal.open(user); }}
                      className="px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded">Edit</button>
                    <button onClick={() => handleDeleteUser(user.id)}
                      className="px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AD Configuration Tab ── */}
        {activeTab === 'ad_config' && (
          <div className="max-w-2xl space-y-6">
            <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Connection Status</h3>
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${adConfig.is_connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {adConfig.is_connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {adConfig.last_sync && <p className="text-xs text-gray-500">Last sync: {new Date(adConfig.last_sync).toLocaleString()}</p>}
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">LDAP Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Server URL</label>
                  <input type="text" className={inp} value={adConfig.server_url} onChange={e => setAdConfig({ ...adConfig, server_url: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Base DN</label>
                  <input type="text" className={inp} value={adConfig.base_dn} onChange={e => setAdConfig({ ...adConfig, base_dn: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Bind User</label>
                  <input type="text" className={inp} value={adConfig.bind_user} onChange={e => setAdConfig({ ...adConfig, bind_user: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Sync Interval (min)</label>
                  <input type="number" className={inp} value={adConfig.sync_interval_minutes} onChange={e => setAdConfig({ ...adConfig, sync_interval_minutes: Number(e.target.value) })} /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Search Filter</label>
                <input type="text" className={inp + ' font-mono'} value={adConfig.search_filter} onChange={e => setAdConfig({ ...adConfig, search_filter: e.target.value })} /></div>
            </div>
            <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Group-to-Role Mapping</h3>
              {Object.entries(adConfig.group_mapping).map(([adGroup, role]) => (
                <div key={adGroup} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-700 font-mono">{adGroup}</span>
                  <span className="text-gray-400">&rarr;</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${ACCESS_COLORS[role]}`}>{role}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={handleTestConnection}
                className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100">Test Connection</button>
              <button onClick={handleSaveConfig}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Save Configuration</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Group Modal ── */}
      <Modal isOpen={groupModal.isOpen} onClose={groupModal.close} title={editGroup.id ? 'Edit Group' : 'Add Group'} size="md">
        <div className="space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Group Name</label>
            <input type="text" className={inp} value={editGroup.group_name || ''} onChange={e => setEditGroup({ ...editGroup, group_name: e.target.value })} placeholder="FW-GroupName" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Access Type</label>
            <select className={inp} value={editGroup.access_type || 'Viewer'} onChange={e => setEditGroup({ ...editGroup, access_type: e.target.value as ADUserGroup['access_type'] })}>
              <option value="Admin">Admin</option><option value="Approver">Approver</option><option value="Operator">Operator</option><option value="Viewer">Viewer</option><option value="Auditor">Auditor</option>
            </select></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea className={inp} rows={2} value={editGroup.description || ''} onChange={e => setEditGroup({ ...editGroup, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <button onClick={groupModal.close} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveGroup} className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Save</button>
          </div>
        </div>
      </Modal>

      {/* ── User Modal ── */}
      <Modal isOpen={userModal.isOpen} onClose={userModal.close} title={editUser.id ? 'Edit User' : 'Add User'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
              <input type="text" className={inp} value={editUser.username || ''} onChange={e => setEditUser({ ...editUser, username: e.target.value })} placeholder="john.doe" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
              <input type="text" className={inp} value={editUser.display_name || ''} onChange={e => setEditUser({ ...editUser, display_name: e.target.value })} placeholder="John Doe" /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className={inp} value={editUser.email || ''} onChange={e => setEditUser({ ...editUser, email: e.target.value })} placeholder="john@corp.local" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Access Type</label>
            <select className={inp} value={editUser.access_type || 'Viewer'} onChange={e => setEditUser({ ...editUser, access_type: e.target.value as ADUser['access_type'] })}>
              <option value="Admin">Admin</option><option value="Approver">Approver</option><option value="Operator">Operator</option><option value="Viewer">Viewer</option><option value="Auditor">Auditor</option>
            </select></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Groups (comma-separated)</label>
            <input type="text" className={inp} value={(editUser.groups || []).join(', ')} onChange={e => setEditUser({ ...editUser, groups: e.target.value.split(',').map(g => g.trim()).filter(Boolean) })} placeholder="FW-Admins, FW-Operators" /></div>
          {editUser.id && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-700">Active</label>
              <input type="checkbox" checked={editUser.is_active ?? true} onChange={e => setEditUser({ ...editUser, is_active: e.target.checked })} className="rounded border-gray-300 text-indigo-600" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={userModal.close} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveUser} className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

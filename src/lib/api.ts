import type {
  FirewallRule,
  LegacyRule,
  CompiledRule,
  ReviewRequest,
  MigrationDetails,
  MigrationMapping,
  MigrationRuleLifecycle,
  NGDCDataCenter,
  SecurityZone,
  PredefinedDestination,
  PolicyValidationResult,
  CHGRequest,
  RuleHistoryEntry,
  SourceConfig,
  DestinationConfig,
  NeighbourhoodRegistry,
  Application,
  NamingStandardsInfo,
  FirewallGroup,
  GroupMember,
  MigrationHistoryEntry,
  RuleModification,
  NGDCRecommendation,
  BirthrightValidation,
  NhSecurityZone,
} from '@/types';
import { isLegacyGroupName } from '@/lib/nestingParser';

// In production, the Express BFF serves the React app at the same origin.
// In development, the BFF runs on :3000 and Vite proxies /bff to it.
export const API_BASE = import.meta.env.VITE_API_URL || '/bff';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Transform flat backend rule data to structured frontend FirewallRule
interface RawBackendRule {
  rule_id: string;
  source: string;
  source_zone: string;
  destination: string;
  destination_zone: string;
  port: string;
  protocol: string;
  action: string;
  description: string;
  application: string;
  status: string;
  is_group_to_group: boolean;
  environment: string;
  datacenter: string;
  created_at: string;
  updated_at: string;
  certified_date: string | null;
  expiry_date: string | null;
}

function parseSourceConfig(src: string, srcZone: string, port: string): SourceConfig {
  const isGroup = src.startsWith('grp-') || isLegacyGroupName(src);
  const isServer = src.startsWith('svr-') || src.startsWith('gsvr-');
  const isRange = src.startsWith('rng-');
  const isCidr = /\/\d+$/.test(src);

  if (isGroup || isServer || isRange) {
    return {
      source_type: isGroup ? 'Group' : isRange ? 'Range' : 'Server',
      ip_address: null,
      cidr: null,
      group_name: src,
      ports: port,
      neighbourhood: null,
      security_zone: srcZone,
    };
  } else if (isCidr) {
    return {
      source_type: 'Subnet',
      ip_address: null,
      cidr: src,
      group_name: null,
      ports: port,
      neighbourhood: null,
      security_zone: srcZone,
    };
  } else {
    return {
      source_type: 'Single IP',
      ip_address: src,
      cidr: null,
      group_name: null,
      ports: port,
      neighbourhood: null,
      security_zone: srcZone,
    };
  }
}

function parseDestConfig(dst: string, dstZone: string, port: string): DestinationConfig {
  return {
    name: dst,
    security_zone: dstZone,
    dest_ip: /^\d/.test(dst) ? dst : null,
    ports: port,
    is_predefined: dst.startsWith('grp-') || isLegacyGroupName(dst),
  };
}

export function transformRule(raw: RawBackendRule): FirewallRule {
  const src = raw.source;
  const isNamingValid = src.startsWith('grp-') || src.startsWith('svr-') || src.startsWith('rng-') || isLegacyGroupName(src);
  const dstNamingValid = raw.destination.startsWith('grp-') || raw.destination.startsWith('svr-') || raw.destination.startsWith('rng-') || isLegacyGroupName(raw.destination);
  // A rule is group-to-group when BOTH endpoints are groups (grp- or legacy g-/grp-). Derive client-side so seed/fan-out rules render correctly even if backend flag is unset.
  const srcIsGroup = src.startsWith('grp-') || isLegacyGroupName(src);
  const dstIsGroup = raw.destination.startsWith('grp-') || isLegacyGroupName(raw.destination);
  const derivedG2G = srcIsGroup && dstIsGroup;
  const effectiveG2G = Boolean(raw.is_group_to_group) || derivedG2G;
  return {
    id: raw.rule_id,
    rule_id: raw.rule_id,
    application: raw.application,
    environment: raw.environment,
    datacenter: raw.datacenter,
    source: parseSourceConfig(raw.source, raw.source_zone, raw.port),
    destination: parseDestConfig(raw.destination, raw.destination_zone, raw.port),
    policy_result: 'Permitted',
    status: raw.status as FirewallRule['status'],
    compliance: {
      naming_valid: isNamingValid && dstNamingValid,
      group_to_group: effectiveG2G,
      requires_exception: !effectiveG2G,
    },
    expiry: raw.expiry_date,
    owner: 'System',
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    certified_at: raw.certified_date,
    certified_by: raw.certified_date ? 'System' : null,
  };
}

// Firewall Rules
export const getRules = async (application?: string, status?: string): Promise<FirewallRule[]> => {
  const params = new URLSearchParams();
  if (application) params.set('application', application);
  if (status) params.set('status', status);
  const qs = params.toString();
  const rawRules = await fetchJSON<RawBackendRule[]>(`/api/rules${qs ? `?${qs}` : ''}`);
  return rawRules.map(transformRule);
};

export const getRule = (ruleId: string) => fetchJSON<FirewallRule>(`/api/rules/${ruleId}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createRule = (data: Record<string, any>) =>
  fetchJSON<FirewallRule>('/api/rules', { method: 'POST', body: JSON.stringify(data) });

export const updateRule = (ruleId: string, data: Partial<{
  source: SourceConfig;
  destination: DestinationConfig;
  owner: string;
  application: string;
  environment: string;
  datacenter: string;
  description: string;
  source_nh: string;
  destination_nh: string;
  dst_application: string;
}>) =>
  fetchJSON<FirewallRule>(`/api/rules/${ruleId}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteRule = (ruleId: string) =>
  fetchJSON<{ message: string }>(`/api/rules/${ruleId}`, { method: 'DELETE' });

export const certifyRule = (ruleId: string, user = 'Jon') =>
  fetchJSON<FirewallRule>(`/api/rules/${ruleId}/certify?user=${user}`, { method: 'POST' });

export const submitRule = (ruleId: string) =>
  fetchJSON<Record<string, unknown>>(`/api/rules/${ruleId}/submit`, { method: 'POST' });

export const getRuleHistory = (ruleId: string) =>
  fetchJSON<RuleHistoryEntry[]>(`/api/rules/${ruleId}/history`);

export const saveDraft = (ruleId: string, data: { source: SourceConfig; destination: DestinationConfig }) =>
  fetchJSON<Record<string, unknown>>(`/api/rules/${ruleId}`, {
    method: 'PUT',
    body: JSON.stringify({
      source: data.source.group_name || data.source.cidr || data.source.ip_address || '',
      source_zone: data.source.security_zone || '',
      destination: data.destination.name || '',
      destination_zone: data.destination.security_zone || '',
      port: data.source.ports || data.destination.ports || '',
    }),
  });

// Migrations
export const getMigrations = () => fetchJSON<MigrationDetails[]>('/api/migrations');

export const getMigration = (id: string) => fetchJSON<MigrationDetails>(`/api/migrations/${id}`);

export const createMigration = (data: {
  application: string;
  source_legacy_dc: string;
  target_ngdc: string;
  map_to_standard_groups: boolean;
  map_to_subnet_cidr: boolean;
}) =>
  fetchJSON<MigrationDetails>('/api/migrations', { method: 'POST', body: JSON.stringify(data) });

export const getMigrationMappings = (id: string) =>
  fetchJSON<MigrationMapping[]>(`/api/migrations/${id}/mappings`);

export const getMigrationRuleLifecycle = (id: string) =>
  fetchJSON<MigrationRuleLifecycle[]>(`/api/migrations/${id}/rule-lifecycle`);

export const validateMigration = (id: string) =>
  fetchJSON<{ validation_passed: boolean; message: string; auto_mapped: number; conflicts: number }>(`/api/migrations/${id}/validate`, { method: 'POST' });

export const submitMigration = (id: string) =>
  fetchJSON<{ migration: MigrationDetails; chg: CHGRequest }>(`/api/migrations/${id}/submit`, { method: 'POST' });

// Reference Data
export const getNGDCDatacenters = () => fetchJSON<NGDCDataCenter[]>('/api/reference/ngdc-datacenters');
export const getSecurityZones = () => fetchJSON<SecurityZone[]>('/api/reference/security-zones');
export const getPredefinedDestinations = () => fetchJSON<PredefinedDestination[]>('/api/reference/predefined-destinations');
export const getNeighbourhoods = () => fetchJSON<NeighbourhoodRegistry[]>('/api/reference/neighbourhoods');
export const getLegacyDatacenters = () => fetchJSON<{ name: string; code: string }[]>('/api/reference/legacy-datacenters');
export const getApplications = (params?: { team?: string }) => {
  const qs = new URLSearchParams();
  if (params?.team) qs.set('team', params.team);
  const s = qs.toString();
  return fetchJSON<Application[]>(`/api/reference/applications${s ? `?${s}` : ''}`);
};
export const getEnvironments = () => fetchJSON<string[]>('/api/reference/environments');
export const getCHGRequests = () => fetchJSON<CHGRequest[]>('/api/reference/chg-requests');

// Naming Standards
export const getNamingStandards = () => fetchJSON<NamingStandardsInfo>('/api/reference/naming-standards');

export const validateNaming = (name: string) =>
  fetchJSON<{ valid: boolean; error?: string; parsed?: Record<string, string> }>(
    '/api/reference/naming-standards/validate',
    { method: 'POST', body: JSON.stringify({ name }) }
  );

export const generateName = (data: {
  type: 'group' | 'server' | 'subnet';
  app_id: string;
  nh: string;
  sz: string;
  subtype?: string;
  server_name?: string;
  descriptor?: string;
}) =>
  fetchJSON<{ name: string }>(
    '/api/reference/naming-standards/generate',
    { method: 'POST', body: JSON.stringify(data) }
  );

export const suggestStandardName = (legacy_name: string, app_id: string, nh: string, sz: string) =>
  fetchJSON<{ suggested_name: string; confidence: string }>(
    '/api/reference/naming-standards/suggest',
    { method: 'POST', body: JSON.stringify({ legacy_name, app_id, nh, sz }) }
  );

export const determineSecurityZone = (data: {
  paa_zone: boolean;
  exposure: string;
  pci_pan: boolean;
  pci_track_data: boolean;
  pci_cvv_pin: boolean;
  deployment_type: string;
  critical_payment: boolean;
  data_classification: string;
  criticality_rating: number;
  environment: string;
}) =>
  fetchJSON<{ zone: string; zone_name: string; reasoning: string[] }>(
    '/api/reference/naming-standards/determine-zone',
    { method: 'POST', body: JSON.stringify(data) }
  );

// Policy Validation
export const validatePolicy = (data: {
  source: SourceConfig;
  destination: DestinationConfig;
  application: string;
  environment: string;
}) =>
  fetchJSON<PolicyValidationResult>('/api/policy/validate', { method: 'POST', body: JSON.stringify(data) });

// Org Config
export const getOrgConfig = () => fetchJSON<Record<string, unknown>>('/api/reference/org-config');
export const updateOrgConfig = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/org-config', { method: 'PUT', body: JSON.stringify(data) });

// Policy Matrix
export const getPolicyMatrix = () => fetchJSON<Record<string, unknown>[]>('/api/reference/policy-matrix');
export const createPolicyEntry = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/policy-matrix', { method: 'POST', body: JSON.stringify(data) });
export const updatePolicyEntry = (sourceZone: string, destZone: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/policy-matrix/${sourceZone}/${destZone}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePolicyEntry = (sourceZone: string, destZone: string) =>
  fetchJSON<{ message: string }>(`/api/reference/policy-matrix/${sourceZone}/${destZone}`, { method: 'DELETE' });

// Policy Change Review Workflow
export const getPolicyChanges = (status?: string) => {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJSON<Record<string, unknown>[]>(`/api/reference/policy-changes${qs}`);
};
export const submitPolicyChange = (data: {
  change_type: 'add' | 'modify' | 'delete';
  policy_data: Record<string, unknown>;
  original_data?: Record<string, unknown>;
  comments?: string;
  linked_rule_id?: string;
}) =>
  fetchJSON<Record<string, unknown>>('/api/reference/policy-changes', { method: 'POST', body: JSON.stringify(data) });
export const approvePolicyChange = (changeId: string, notes?: string) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/policy-changes/${changeId}/approve`, { method: 'POST', body: JSON.stringify({ notes: notes || '' }) });
export const rejectPolicyChange = (changeId: string, notes: string) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/policy-changes/${changeId}/reject`, { method: 'POST', body: JSON.stringify({ notes }) });

// CRUD: Neighbourhoods
export const createNeighbourhood = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/neighbourhoods', { method: 'POST', body: JSON.stringify(data) });
export const updateNeighbourhood = (nhId: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/neighbourhoods/${nhId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNeighbourhood = (nhId: string) =>
  fetchJSON<{ message: string }>(`/api/reference/neighbourhoods/${nhId}`, { method: 'DELETE' });

// CRUD: Security Zones
export const createSecurityZone = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/security-zones', { method: 'POST', body: JSON.stringify(data) });
export const updateSecurityZone = (code: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/security-zones/${code}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSecurityZone = (code: string) =>
  fetchJSON<{ message: string }>(`/api/reference/security-zones/${code}`, { method: 'DELETE' });

// CRUD: Applications
export const createApplication = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/applications', { method: 'POST', body: JSON.stringify(data) });
export const updateApplication = (appId: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/applications/${appId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteApplication = (appId: string) =>
  fetchJSON<{ message: string }>(`/api/reference/applications/${appId}`, { method: 'DELETE' });

// CRUD: Datacenters
export const createNGDCDatacenter = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/ngdc-datacenters', { method: 'POST', body: JSON.stringify(data) });
export const updateNGDCDatacenter = (code: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/ngdc-datacenters/${code}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNGDCDatacenter = (code: string) =>
  fetchJSON<{ message: string }>(`/api/reference/ngdc-datacenters/${code}`, { method: 'DELETE' });

export const createLegacyDatacenter = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/legacy-datacenters', { method: 'POST', body: JSON.stringify(data) });
export const updateLegacyDatacenter = (code: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/legacy-datacenters/${code}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLegacyDatacenter = (code: string) =>
  fetchJSON<{ message: string }>(`/api/reference/legacy-datacenters/${code}`, { method: 'DELETE' });

// CRUD: Predefined Destinations
export const createPredefinedDestination = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/predefined-destinations', { method: 'POST', body: JSON.stringify(data) });
export const updatePredefinedDestination = (name: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/predefined-destinations/${name}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePredefinedDestination = (name: string) =>
  fetchJSON<{ message: string }>(`/api/reference/predefined-destinations/${name}`, { method: 'DELETE' });

// CRUD: Environments
export const createEnvironment = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/environments', { method: 'POST', body: JSON.stringify(data) });
export const deleteEnvironment = (code: string) =>
  fetchJSON<{ message: string }>(`/api/reference/environments/${code}`, { method: 'DELETE' });

// Naming Standards CRUD
export const updateNamingStandards = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/naming-standards', { method: 'PUT', body: JSON.stringify(data) });

// Groups CRUD
//
// Group identity is logically (name, dc_id, environment): each NGDC DC
// materialises its own copy of a logical group with DC-local egress IPs
// only. Pass dc_id to scope reads/writes to a specific DC's instance —
// that is the right path for the per-DC device-deploy model. Without
// dc_id, list/read returns all DC instances; write/delete falls back
// to the first match (legacy compatibility).
export const getGroups = (
  appId?: string, dcId?: string, environment?: string,
) => {
  const params = new URLSearchParams();
  if (appId) params.set('app_id', appId);
  if (dcId) params.set('dc_id', dcId);
  if (environment) params.set('environment', environment);
  const qs = params.toString();
  return fetchJSON<FirewallGroup[]>(`/api/reference/groups${qs ? `?${qs}` : ''}`);
};
export const getGroup = (name: string, dcId?: string) => {
  const qs = dcId ? `?dc_id=${encodeURIComponent(dcId)}` : '';
  return fetchJSON<FirewallGroup>(`/api/reference/groups/${name}${qs}`);
};
export const getGroupInstances = (name: string) =>
  fetchJSON<FirewallGroup[]>(`/api/reference/groups-by-name/${name}/instances`);
export const createGroup = (data: Record<string, unknown>) =>
  fetchJSON<FirewallGroup>('/api/reference/groups', { method: 'POST', body: JSON.stringify(data) });
export const updateGroup = (
  name: string, data: Record<string, unknown>, dcId?: string,
) => {
  const qs = dcId ? `?dc_id=${encodeURIComponent(dcId)}` : '';
  return fetchJSON<FirewallGroup>(`/api/reference/groups/${name}${qs}`,
    { method: 'PUT', body: JSON.stringify(data) });
};
export const deleteGroup = (name: string, dcId?: string) => {
  const qs = dcId ? `?dc_id=${encodeURIComponent(dcId)}` : '';
  return fetchJSON<{ message: string }>(`/api/reference/groups/${name}${qs}`,
    { method: 'DELETE' });
};
export const addGroupMember = (
  groupName: string, member: GroupMember, dcId?: string,
) => {
  const qs = dcId ? `?dc_id=${encodeURIComponent(dcId)}` : '';
  return fetchJSON<FirewallGroup>(
    `/api/reference/groups/${groupName}/members${qs}`,
    { method: 'POST', body: JSON.stringify(member) });
};
export const removeGroupMember = (
  groupName: string, memberValue: string, dcId?: string,
) => {
  const qs = dcId ? `?dc_id=${encodeURIComponent(dcId)}` : '';
  return fetchJSON<FirewallGroup>(
    `/api/reference/groups/${groupName}/members/${memberValue}${qs}`,
    { method: 'DELETE' });
};

// Legacy Rules (for Migration Studio & Firewall Management)
export const getLegacyRules = (appId?: string, excludeMigrated?: boolean, environment?: string, migrationOnly?: boolean) => {
  const params = new URLSearchParams();
  if (appId) params.set('app_id', appId);
  if (excludeMigrated) params.set('exclude_migrated', 'true');
  if (environment) params.set('environment', environment);
  if (migrationOnly) params.set('migration_only', 'true');
  const qs = params.toString();
  return fetchJSON<LegacyRule[]>(`/api/reference/legacy-rules${qs ? `?${qs}` : ''}`);
};
export const getLegacyRule = (ruleId: string) =>
  fetchJSON<LegacyRule>(`/api/reference/legacy-rules/${ruleId}`);
export const updateLegacyRule = (ruleId: string, data: Partial<LegacyRule>) =>
  fetchJSON<LegacyRule>(`/api/reference/legacy-rules/${ruleId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLegacyRule = (ruleId: string) =>
  fetchJSON<{ message: string }>(`/api/reference/legacy-rules/${ruleId}`, { method: 'DELETE' });

export const clearAllLegacyRules = () =>
  fetchJSON<{ message: string; deleted: number }>('/api/reference/legacy-rules/clear-all', { method: 'DELETE' });

export const bulkUpdateLegacyRuleAppId = (
  ruleIds: string[],
  appDistributedId: string,
  appName?: string,
  extraFields?: Record<string, string>,
) =>
  fetchJSON<{ updated: number; app_distributed_id: string; app_found: boolean; fields_copied: string[] }>('/api/reference/legacy-rules/bulk-update-app-id', {
    method: 'POST',
    body: JSON.stringify({
      rule_ids: ruleIds,
      app_distributed_id: appDistributedId,
      app_name: appName || '',
      extra_fields: extraFields || undefined,
    }),
  });

// JSON import for legacy rules
export const importLegacyRulesJSON = async (file: File): Promise<{ added: number; duplicates: number; total: number }> => {
  const formData = new FormData();
  formData.append('file', file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  try {
    const res = await fetch(`${API_BASE}/api/reference/legacy-rules/import-json`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.detail || `Import failed: ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
};

// Export legacy rules as Excel (.xlsx)
export const exportLegacyRulesToExcel = (appId?: string) => {
  const params = new URLSearchParams();
  if (appId) params.set('app_id', appId);
  const qs = params.toString();
  window.open(`${API_BASE}/api/reference/legacy-rules/export-excel${qs ? `?${qs}` : ''}`, '_blank');
};

// Excel import for legacy rules (supports large files up to 50K+ rows)
export const importLegacyRulesExcel = async (file: File, environment?: string): Promise<Record<string, unknown>> => {
  const formData = new FormData();
  formData.append('file', file);
  if (environment) formData.append('environment', environment);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout for large files
  try {
    const res = await fetch(`${API_BASE}/api/reference/legacy-rules/import`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.detail || `Import failed: ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
};

// Migration operations
export const migrateRulesToNGDC = (ruleIds: string[]) =>
  fetchJSON<{ migrated: number; rules: LegacyRule[] }>('/api/reference/legacy-rules/migrate', { method: 'POST', body: JSON.stringify({ rule_ids: ruleIds }) });
export const submitLegacyRulesForReview = (ruleIds: string[], comments?: string) =>
  fetchJSON<{ submitted: number; reviews: ReviewRequest[] }>('/api/reference/legacy-rules/submit-for-review', { method: 'POST', body: JSON.stringify({ rule_ids: ruleIds, comments }) });
export const getMigratedRules = () =>
  fetchJSON<LegacyRule[]>('/api/reference/legacy-rules/migrated');
export const getMigrationHistory = () =>
  fetchJSON<MigrationHistoryEntry[]>('/api/reference/migration-history');

// Rule Compiler
export const compileRule = (ruleId: string, vendor: string = 'generic') =>
  fetchJSON<CompiledRule>(`/api/rules/${ruleId}/compile?vendor=${vendor}`, { method: 'POST' });

// ----------------------------------------------------------------
// Per-DC Compilation + Deployed Snapshots
// ----------------------------------------------------------------
// A device (firewall) belongs to one DC, so the artifacts shipped
// to it must be scoped to that DC: only rules whose src_dc OR dst_dc
// matches the device's DC, and only the DC-local instance of every
// referenced group. A "deployed snapshot" per (dc_id, environment)
// drives initial-vs-incremental compile output: the very first
// compile (no snapshot) emits everything; subsequent compiles emit
// delta operations only.
// ----------------------------------------------------------------

export interface PerDcRuleChange {
  op: 'add' | 'update' | 'remove';
  rule_id: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface PerDcGroupChange {
  op: 'create' | 'modify' | 'delete';
  group_key: string;
  added_members?: string[];
  removed_members?: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface PerDcManifest {
  dc_id: string;
  environment: string;
  vendor: string;
  mode: 'initial' | 'incremental';
  snapshot_present: boolean;
  snapshot_at?: string;
  snapshot_id?: string;
  rule_changes: PerDcRuleChange[];
  group_changes: PerDcGroupChange[];
  summary: {
    rules_total: number;
    groups_total: number;
    rule_changes: number;
    group_changes: number;
  };
  device_config: string;
  full_rules: Record<string, Record<string, unknown>>;
  full_groups: Record<string, Record<string, unknown>>;
}

export const compilePerDc = (
  payload: { dc_id: string; environment?: string; vendor?: string; mode?: 'auto' | 'initial' | 'incremental' },
) => fetchJSON<PerDcManifest>('/api/compile/per-dc', {
  method: 'POST', body: JSON.stringify(payload),
});

export const compilePerDcAll = (
  payload: { environment?: string; vendor?: string; mode?: 'auto' | 'initial' | 'incremental' },
) => fetchJSON<{ environment: string; vendor: string; mode: string; manifests: Record<string, PerDcManifest>; dc_ids: string[] }>(
  '/api/compile/per-dc/all', { method: 'POST', body: JSON.stringify(payload) },
);

export interface DeployedSnapshotSummary {
  key: string;
  dc_id: string;
  environment: string;
  snapshot_at?: string;
  snapshot_id?: string;
  rules: number;
  groups: number;
}

export const listDeployedSnapshots = () =>
  fetchJSON<DeployedSnapshotSummary[]>('/api/compile/snapshots');

export const getDeployedSnapshot = (dcId: string, environment = 'Production') =>
  fetchJSON<{ exists: boolean; dc_id: string; environment: string; snapshot_at?: string; snapshot_id?: string; rules?: Record<string, unknown>; groups?: Record<string, unknown> }>(
    `/api/compile/snapshots/${encodeURIComponent(dcId)}?environment=${encodeURIComponent(environment)}`,
  );

export const captureDeployedSnapshot = (
  dcId: string, payload: { environment?: string; deployed_by?: string } = {},
) => fetchJSON<Record<string, unknown>>(
  `/api/compile/snapshots/${encodeURIComponent(dcId)}/capture`,
  { method: 'POST', body: JSON.stringify(payload) },
);

// ----------------------------------------------------------------
// Migration apply (per-DC + auto-GCR pipeline)
// ----------------------------------------------------------------

export const applyLegacyTransition = (rule: Record<string, unknown>, reviewer = 'migration') =>
  fetchJSON<{ legacy_rule_id: string; transition: Record<string, unknown>; staged_rule_requests: Record<string, unknown>[]; staged_count: number }>(
    '/api/migration/apply',
    { method: 'POST', body: JSON.stringify({ rule, reviewer }) },
  );

export const applyLegacyTransitionsBulk = (
  rules: Record<string, unknown>[], reviewer = 'migration',
) => fetchJSON<{ total: number; applied: number; results: Record<string, unknown>[] }>(
  '/api/migration/apply-bulk',
  { method: 'POST', body: JSON.stringify({ rules, reviewer }) },
);

// Legacy Rule Compiler
export const compileLegacyRule = (ruleId: string, vendor: string = 'generic') =>
  fetchJSON<CompiledRule>(`/api/reference/legacy-rules/${ruleId}/compile?vendor=${vendor}`, { method: 'POST' });

// Rule Modification with Delta Tracking
export const createRuleModification = (ruleId: string, modifications: Record<string, string>, comments: string = '') =>
  fetchJSON<RuleModification>(`/api/reference/legacy-rules/${ruleId}/modify`, {
    method: 'POST', body: JSON.stringify({ modifications, comments })
  });

// Studio Rule Modification with frontend-computed delta (includes group member changes)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createStudioRuleModification = (ruleId: string, modifications: Record<string, string>, delta: { added: Record<string, string[]>; removed: Record<string, string[]>; changed: Record<string, { from: string; to: string }> }, comments: string = '') =>
  fetchJSON<RuleModification>(`/api/reference/rules/${ruleId}/modify`, {
    method: 'POST', body: JSON.stringify({ modifications, delta, comments })
  });

// Group policy change — find affected rules and submit for review
export const getAffectedRules = (groupName: string) =>
  fetchJSON<{ group: string; affected_rules: number; rules: Record<string, unknown>[] }>(`/api/reference/groups/${encodeURIComponent(groupName)}/affected-rules`);

export const submitGroupPolicyChanges = (groupName: string, changeType: string, changeDetails: string, memberDelta?: Record<string, unknown>) =>
  fetchJSON<{ group: string; change_type: string; affected_rules: number; reviews_created: { review_id: string; rule_id: string; mod_id: string }[] }>(`/api/reference/groups/${encodeURIComponent(groupName)}/submit-policy-changes`, {
    method: 'POST', body: JSON.stringify({ change_type: changeType, change_details: changeDetails, member_delta: memberDelta })
  });

export const getRuleModifications = (ruleId?: string) => {
  const params = new URLSearchParams();
  if (ruleId) params.set('rule_id', ruleId);
  const qs = params.toString();
  return fetchJSON<RuleModification[]>(`/api/reference/rule-modifications${qs ? `?${qs}` : ''}`);
};

export const approveRuleModification = (modId: string, notes: string = '') =>
  fetchJSON<RuleModification>(`/api/reference/rule-modifications/${modId}/approve`, {
    method: 'POST', body: JSON.stringify({ notes })
  });

export const rejectRuleModification = (modId: string, notes: string) =>
  fetchJSON<RuleModification>(`/api/reference/rule-modifications/${modId}/reject`, {
    method: 'POST', body: JSON.stringify({ notes })
  });

// NGDC Recommendations
export const getNGDCRecommendations = (ruleId: string) =>
  fetchJSON<NGDCRecommendation>(`/api/reference/legacy-rules/${ruleId}/ngdc-recommendations`);

// Birthright Validation
export const validateBirthright = (data: Record<string, unknown>) =>
  fetchJSON<BirthrightValidation>('/api/reference/birthright/validate', {
    method: 'POST', body: JSON.stringify(data)
  });

export const getBirthrightMatrix = () =>
  fetchJSON<Record<string, unknown[]>>('/api/reference/birthright/matrix');

export const updateBirthrightMatrix = (matrixType: string, entries: unknown[]) =>
  fetchJSON<unknown[]>(`/api/reference/birthright/matrix/${matrixType}`, {
    method: 'PUT', body: JSON.stringify({ entries })
  });

export const addBirthrightEntry = (matrixType: string, entry: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/birthright/matrix/${matrixType}`, {
    method: 'POST', body: JSON.stringify(entry)
  });

// Review & Approval
export const getReviewRequests = (status?: string) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return fetchJSON<ReviewRequest[]>(`/api/reviews${qs ? `?${qs}` : ''}`);
};
export const submitForReview = (ruleId: string, comments: string = '', module: string = 'design-studio') =>
  fetchJSON<ReviewRequest>('/api/reviews', { method: 'POST', body: JSON.stringify({ rule_id: ruleId, comments, module }) });
export const approveReview = (reviewId: string, notes: string = '') =>
  fetchJSON<ReviewRequest>(`/api/reviews/${reviewId}/approve`, { method: 'POST', body: JSON.stringify({ notes }) });
export const rejectReview = (reviewId: string, notes: string) =>
  fetchJSON<ReviewRequest>(`/api/reviews/${reviewId}/reject`, { method: 'POST', body: JSON.stringify({ notes }) });

// Rule Lifecycle
export const transitionRuleStatus = (ruleId: string, newStatus: string, module: string = 'studio', reviewer: string = 'system') =>
  fetchJSON<FirewallRule>(`/api/rules/${ruleId}/lifecycle-transition`, {
    method: 'POST', body: JSON.stringify({ new_status: newStatus, module, reviewer })
  });
export const getValidTransitions = (ruleId: string) =>
  fetchJSON<{ rule_id: string; current_status: string; valid_transitions: string[] }>(`/api/rules/${ruleId}/valid-transitions`);
export const getLifecycleSummary = () =>
  fetchJSON<Record<string, unknown>>('/api/rules/lifecycle/summary');

// NGDC Organization Mappings
export const getNGDCMappings = () => fetchJSON<Record<string, unknown>[]>('/api/reference/ngdc-mappings');
export const createNGDCMapping = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/ngdc-mappings', { method: 'POST', body: JSON.stringify(data) });
export const updateNGDCMapping = (id: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/ngdc-mappings/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNGDCMapping = (id: string) =>
  fetchJSON<{ message: string }>(`/api/reference/ngdc-mappings/${id}`, { method: 'DELETE' });
export const importNGDCMappingsExcel = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/reference/ngdc-mappings/import`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};
export const bulkSaveNGDCMappings = (mappings: Record<string, unknown>[]) =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/ngdc-mappings/bulk', { method: 'POST', body: JSON.stringify({ mappings }) });

// Group Provisioning to Firewall Device
export const provisionGroups = (appId: string, deviceType = 'palo_alto') =>
  fetchJSON<Record<string, unknown>>(`/api/reference/groups/provision/${appId}`, { method: 'POST', body: JSON.stringify({ device_type: deviceType }) });
export const getProvisioningHistory = (appId?: string) => {
  const params = new URLSearchParams();
  if (appId) params.set('app_id', appId);
  const qs = params.toString();
  return fetchJSON<Record<string, unknown>[]>(`/api/reference/provisioning-history${qs ? `?${qs}` : ''}`);
};

// Enhanced Compile with Group Expansion
export const compileRuleExpanded = (ruleId: string, vendor = 'generic', expandGroups = true) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/rules/${ruleId}/compile-expanded`, {
    method: 'POST', body: JSON.stringify({ vendor, expand_groups: expandGroups })
  });

// Data Mode (Seed vs Live)
export const getDataMode = () => fetchJSON<{ mode: string }>('/api/reference/data-mode');
export const setDataMode = (mode: string) =>
  fetchJSON<{ mode: string }>('/api/reference/data-mode', { method: 'POST', body: JSON.stringify({ mode }) });
export const resetSeedData = () =>
  fetchJSON<{ message: string; current_mode: string }>('/api/reference/data-mode/reset-seed', { method: 'POST' });

// SZ-level CIDR Resolution
export const getSzCidrMap = () => fetchJSON<NhSecurityZone[]>('/api/reference/sz-cidr-map');
export const resolveSzCidr = (dc: string, nh: string, sz: string) => {
  const params = new URLSearchParams({ dc, nh, sz });
  return fetchJSON<{ dc: string; nh: string; sz: string; cidr: string }>(`/api/reference/resolve-sz-cidr?${params}`);
};
export const getNhSecurityZones = (nhId: string, dc?: string) => {
  const params = new URLSearchParams();
  if (dc) params.set('dc', dc);
  const qs = params.toString();
  return fetchJSON<Record<string, unknown>[]>(`/api/reference/nh-security-zones/${nhId}${qs ? `?${qs}` : ''}`);
};

// SZ-level CIDR binding CRUD (DC-specific)
export const upsertSzCidrBinding = (payload: {
  nh: string; sz: string; dc: string; cidr: string;
  vrf_id?: string; description?: string;
  /** When supplied, the existing row keyed by (nh, sz, dc, old_cidr)
   *  is *renamed* to ``cidr`` instead of a new row being created. */
  old_cidr?: string;
}) =>
  fetchJSON<NhSecurityZone>('/api/reference/sz-cidr-bindings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const deleteSzCidrBinding = (nh: string, sz: string, dc: string, cidr: string = '') => {
  const params = new URLSearchParams({ nh, sz, dc });
  if (cidr) params.set('cidr', cidr);
  return fetchJSON<{ message: string }>(`/api/reference/sz-cidr-bindings?${params}`, { method: 'DELETE' });
};

// Auto-populate NH/SZ/DC filtered by environment + app
export const getFilteredNhSzDc = (environment: string, appId?: string) => {
  const params = new URLSearchParams({ environment });
  if (appId) params.append('app_id', appId);
  return fetchJSON<{
    neighbourhoods: NeighbourhoodRegistry[];
    security_zones: SecurityZone[];
    datacenters: NGDCDataCenter[];
  }>(`/api/reference/filtered-nh-sz-dc?${params}`);
};

// Clear all imported app data
export const clearAppManagement = () =>
  fetchJSON<{ message: string }>('/api/reference/applications/clear', { method: 'POST' });

// App Management delta-based import
export const importAppManagement = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/reference/applications/import`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<{ added: number; updated: number; skipped: number; total: number; overrides: { app_distributed_id: string; app_id: string }[] }>;
};

// Imported Apps from Legacy Rules (with mapping status)
export const getImportedApps = () =>
  fetchJSON<{ app_id: string; app_name: string; app_distributed_id: string; rule_count: number; has_mapping: boolean; components: Record<string, unknown>[] }[]>(
    '/api/reference/legacy-rules/imported-apps'
  );

// App-to-DC/NH/SZ Organization Mappings
export const getAppDCMappings = () => fetchJSON<Record<string, unknown>[]>('/api/reference/app-dc-mappings');
export const getAppDCMapping = (appId: string) => fetchJSON<Record<string, unknown>>(`/api/reference/app-dc-mappings/${appId}`);
export const createAppDCMapping = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/app-dc-mappings', { method: 'POST', body: JSON.stringify(data) });
export const updateAppDCMapping = (id: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/app-dc-mappings/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAppDCMapping = (id: string) =>
  fetchJSON<{ message: string }>(`/api/reference/app-dc-mappings/${id}`, { method: 'DELETE' });
export const importAppDCMappingsExcel = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/reference/app-dc-mappings/import`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};

// NGDC Compliance Check
export const checkNGDCCompliance = (ruleIds: string[]) =>
  fetchJSON<{ compliant: boolean; issues: string[]; rule_id: string }[]>(
    '/api/reference/legacy-rules/check-compliance',
    { method: 'POST', body: JSON.stringify({ rule_ids: ruleIds }) }
  );

// Duplicate Detection
export const checkDuplicates = (source: string, destination: string, service: string, excludeId = '') =>
  fetchJSON<{ duplicates: { id: string; type: string; app_id: string; source: string; destination: string; service: string }[]; count: number }>(
    '/api/reference/check-duplicates',
    { method: 'POST', body: JSON.stringify({ source, destination, service, exclude_id: excludeId }) }
  );

// Import Rules to NGDC Standardization from Network Firewall Request
export const importRulesToNGDC = (appIds: string[], environment?: string) =>
  fetchJSON<{ imported: number; rules: LegacyRule[] }>(
    '/api/reference/legacy-rules/import-to-ngdc',
    { method: 'POST', body: JSON.stringify({ app_ids: appIds, environment }) }
  );

// Auto-Import Compliant Rules to Firewall Studio
export const autoImportCompliantToStudio = () =>
  fetchJSON<{ imported: number; skipped_non_compliant: number; already_imported: number; total_studio_rules: number }>(
    '/api/reference/legacy-rules/auto-import-to-studio',
    { method: 'POST' }
  );

// Get Expanded Rule (groups expanded to IPs/ranges)
export const getExpandedRule = (ruleId: string) =>
  fetchJSON<LegacyRule>(`/api/reference/legacy-rules/${ruleId}/expanded`);

// Create Migration Group
export const createMigrationGroup = (data: { name: string; app_id: string; members: { type: string; value: string }[]; nh?: string; sz?: string }) =>
  fetchJSON<Record<string, unknown>>('/api/reference/migration-groups', { method: 'POST', body: JSON.stringify(data) });

// IP Mappings (Legacy DC <-> NGDC one-to-one)
export const getIPMappings = (legacyDc?: string, appId?: string) => {
  const params = new URLSearchParams();
  if (legacyDc) params.set('legacy_dc', legacyDc);
  if (appId) params.set('app_id', appId);
  const qs = params.toString();
  return fetchJSON<Record<string, unknown>[]>(`/api/reference/ip-mappings${qs ? `?${qs}` : ''}`);
};
export const createIPMapping = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/ip-mappings', { method: 'POST', body: JSON.stringify(data) });
export const updateIPMapping = (id: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/ip-mappings/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteIPMapping = (id: string) =>
  fetchJSON<{ message: string }>(`/api/reference/ip-mappings/${id}`, { method: 'DELETE' });
export const lookupIPMapping = (legacyIp: string, legacyDc?: string) =>
  fetchJSON<{ found: boolean; mapping?: Record<string, unknown>; message?: string }>(
    '/api/reference/ip-mappings/lookup',
    { method: 'POST', body: JSON.stringify({ legacy_ip: legacyIp, legacy_dc: legacyDc || '' }) }
  );

// Firewall Boundary Analysis
export const getFirewallBoundaries = (srcNh: string, srcSz: string, dstNh: string, dstSz: string) => {
  const sp = new URLSearchParams({ src_nh: srcNh, src_sz: srcSz, dst_nh: dstNh, dst_sz: dstSz });
  return fetchJSON<{
    boundaries: number; flow_rule: string; note: string;
    requires_egress: boolean; requires_ingress: boolean;
    devices: { role: string; direction: string; device_id: string; device_name: string; nh: string; sz: string }[];
  }>(`/api/reference/firewall-boundaries?${sp.toString()}`);
};

export const getLogicalFlowRules = () =>
  fetchJSON<{ rules: Record<string, unknown>[]; segmented_zones: string[] }>('/api/reference/logical-flow-rules');

// Egress/Ingress Compilation (with boundary analysis)
export const compileEgressIngress = (ruleId: string, vendor = 'generic') =>
  fetchJSON<Record<string, unknown>>(`/api/reference/compile/egress-ingress/${ruleId}?vendor=${vendor}`, { method: 'POST' });

// Resolved Policy Matrix
export const getResolvedPolicyMatrix = (params?: {
  src_dc?: string; src_nh?: string; src_sz?: string;
  dst_dc?: string; dst_nh?: string; dst_sz?: string;
  environment?: string;
}) => {
  const sp = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
  }
  const qs = sp.toString();
  return fetchJSON<Record<string, unknown>[]>(`/api/reference/policy-matrix/resolved${qs ? `?${qs}` : ''}`);
};

// Pre-Prod Policy Matrix
export const getPreprodMatrix = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/policy-matrix/preprod');

// All Policy Matrices (heritage, ngdc_prod, nonprod, combined)
export const getAllPolicyMatrices = () =>
  fetchJSON<{ heritage_dc: Record<string, unknown>[]; ngdc_prod: Record<string, unknown>[]; nonprod: Record<string, unknown>[]; combined: Record<string, unknown>[] }>('/api/reference/policy-matrix/all');

// App Environment Assignments
export const getAppEnvAssignments = (appId?: string) => {
  const params = new URLSearchParams();
  if (appId) params.set('app_id', appId);
  const qs = params.toString();
  return fetchJSON<Record<string, unknown>[]>(`/api/reference/app-env-assignments${qs ? `?${qs}` : ''}`);
};
export const updateAppEnvAssignment = (appId: string, environment: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/app-env-assignments/${appId}/${environment}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAppEnvAssignment = (appId: string, environment: string) =>
  fetchJSON<{ message: string }>(`/api/reference/app-env-assignments/${appId}/${environment}`, { method: 'DELETE' });

// Firewall Device Patterns (generic naming patterns + DC vendor map)
export const getFirewallDevicePatterns = () =>
  fetchJSON<{ patterns: Record<string, unknown>[]; dc_vendor_map: Record<string, Record<string, string>> }>('/api/reference/firewall-device-patterns');

// Firewall Devices
export const getFirewallDevices = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/firewall-devices');
export const getFirewallDevice = (deviceId: string) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/firewall-devices/${deviceId}`);
export const createFirewallDevice = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/firewall-devices', { method: 'POST', body: JSON.stringify(data) });
export const updateFirewallDevice = (deviceId: string, data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>(`/api/reference/firewall-devices/${deviceId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteFirewallDevice = (deviceId: string) =>
  fetchJSON<{ message: string }>(`/api/reference/firewall-devices/${deviceId}`, { method: 'DELETE' });

// IP Mappings Import (with CIDR validation)
export const importIPMappings = (mappings: Record<string, unknown>[], appId?: string) =>
  fetchJSON<{ added: number; validated: number; invalid: number; validation_errors: string[]; total: number }>('/api/reference/ip-mappings/import', {
    method: 'POST', body: JSON.stringify({ mappings, app_id: appId }),
  });

// Auto-Group Creation from IP Mappings (CIDR-validated)
export const validateAndCreateGroups = (appId?: string) =>
  fetchJSON<{ revalidated: number; groups_created: number; groups_updated: number; total_groups: number; groups: Record<string, unknown>[] }>(
    '/api/reference/ip-mappings/validate-and-create-groups',
    { method: 'POST', body: JSON.stringify(appId ? { app_id: appId } : {}) }
  );

// Get auto-generated groups from IP mapping validation
export const getAutoGeneratedGroups = (appId?: string) => {
  const params = new URLSearchParams();
  if (appId) params.set('app_id', appId);
  const qs = params.toString();
  return fetchJSON<Record<string, unknown>[]>(`/api/reference/ip-mappings/auto-groups${qs ? `?${qs}` : ''}`);
};

// Bulk Save App-DC Mappings
export const bulkSaveAppDCMappings = (mappings: Record<string, unknown>[]) =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/app-dc-mappings/bulk', {
    method: 'POST', body: JSON.stringify({ mappings }),
  });

// ---- Partial Migration Architecture ----

export interface AppMigrationSummary {
  app_id: string;
  app_distributed_id: string;
  total_components: number;
  ngdc_count: number;
  legacy_count: number;
  pct_migrated: number;
  migration_scenario: 'Full NGDC' | 'Full Legacy' | 'Partial';
  components: {
    component: string;
    dc_location: 'NGDC' | 'Legacy';
    dc: string;
    nh: string;
    sz: string;
    legacy_dc: string;
    legacy_cidr: string;
    cidr: string;
    status: string;
    notes: string;
  }[];
}

export interface RuleEndpointClassification {
  source_dc_location: string;
  destination_dc_location: string;
  scenario: string;
  is_cross_dc: boolean;
  heritage_direction: string;
  requires_heritage_matrix: boolean;
}

export interface AppLifecycleStatus {
  app_id: string;
  status: string;
  pct_migrated: number;
  scenario: string;
  transitions: string[];
  total_components: number;
  ngdc_count: number;
  legacy_count: number;
}

export const getAppMigrationSummary = () =>
  fetchJSON<AppMigrationSummary[]>('/api/reference/app-migration-summary');

export const getAppMigrationStatus = (appId: string) =>
  fetchJSON<AppMigrationSummary>(`/api/reference/app-migration-summary/${appId}`);

export const classifyRuleEndpoints = (data: Record<string, unknown>) =>
  fetchJSON<RuleEndpointClassification>('/api/reference/classify-rule-endpoints', {
    method: 'POST', body: JSON.stringify(data),
  });

export const validateBirthrightCrossDC = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/validate-birthright-cross-dc', {
    method: 'POST', body: JSON.stringify(data),
  });

export const determineCrossDCBoundaries = (data: Record<string, unknown>) =>
  fetchJSON<Record<string, unknown>>('/api/reference/determine-cross-dc-boundaries', {
    method: 'POST', body: JSON.stringify(data),
  });

export const compileHybridRule = (ruleId: string, vendor = 'generic') =>
  fetchJSON<Record<string, unknown>>('/api/reference/compile-hybrid-rule', {
    method: 'POST', body: JSON.stringify({ rule_id: ruleId, vendor }),
  });

export const getAppLifecycleStatus = (appId: string) =>
  fetchJSON<AppLifecycleStatus>(`/api/reference/app-lifecycle-status/${appId}`);

export const transitionAppMigration = (appId: string, newStatus: string) =>
  fetchJSON<Record<string, unknown>>('/api/reference/app-lifecycle-transition', {
    method: 'POST', body: JSON.stringify({ app_id: appId, new_status: newStatus }),
  });

export const getHybridGroupNames = (appId: string) =>
  fetchJSON<{ app_id: string; scenario: string; groups: Record<string, unknown>[] }>(
    `/api/reference/hybrid-group-names/${appId}`
  );

// Standalone JSON Seed Export
export const exportSeedJSON = () =>
  fetchJSON<{
    neighbourhoods: Record<string, unknown>[];
    security_zones: Record<string, unknown>[];
    datacenters: Record<string, unknown>[];
    policy_matrix: { production: Record<string, unknown>[]; non_production: Record<string, unknown>[]; pre_production: Record<string, unknown>[] };
    app_dc_mappings: Record<string, unknown>[];
    applications: Record<string, unknown>[];
    firewall_devices: Record<string, unknown>[];
  }>('/api/reference/export/seed-json');

// NGDC Prod Matrix
export const getNgdcProdMatrix = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/policy-matrix/ngdc-prod');

// NonProd Matrix
export const getNonprodMatrix = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/policy-matrix/nonprod');

// ---- Separate JSON Storage (user-data/) — Migration Data & Studio Rules ----

export const getUserDataSummary = () =>
  fetchJSON<{ migration_data: Record<string, number>; studio_rules_count: number; data_directory: string }>('/api/reference/user-data/summary');

export const getMigrationData = () =>
  fetchJSON<{ migration_history: Record<string, unknown>[]; migration_mappings: Record<string, unknown>[]; migration_reviews: Record<string, unknown>[]; migrated_rules: Record<string, unknown>[] }>('/api/reference/user-data/migration');

export const clearMigrationData = () =>
  fetchJSON<{ status: string; cleared_counts: Record<string, number> }>('/api/reference/user-data/migration', { method: 'DELETE' });

export const getStudioRules = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/user-data/studio-rules');

export const clearStudioRules = () =>
  fetchJSON<{ status: string; count: number }>('/api/reference/user-data/studio-rules', { method: 'DELETE' });

export const deleteStudioRule = (ruleId: string) =>
  fetchJSON<{ status: string; rule_id: string }>(`/api/reference/user-data/studio-rules/${ruleId}`, { method: 'DELETE' });

// ---- Cleanup Endpoints (individual + one-click reset) ----

export const clearAllUserData = () =>
  fetchJSON<{ status: string; counts: Record<string, number> }>('/api/reference/user-data/all', { method: 'DELETE' });

export const clearReviews = () =>
  fetchJSON<{ status: string; count: number }>('/api/reference/user-data/reviews', { method: 'DELETE' });

export const clearGroups = () =>
  fetchJSON<{ status: string; count: number }>('/api/reference/user-data/groups', { method: 'DELETE' });

export const clearFirewallRules = () =>
  fetchJSON<{ status: string; count: number }>('/api/reference/user-data/firewall-rules', { method: 'DELETE' });

export const clearModifications = () =>
  fetchJSON<{ status: string; count: number }>('/api/reference/user-data/modifications', { method: 'DELETE' });

export const clearLegacyRulesForce = () =>
  fetchJSON<{ status: string; count: number }>('/api/reference/user-data/legacy-rules', { method: 'DELETE' });

export const clearDataByApp = (appId: string) =>
  fetchJSON<{ status: string; app_id: string; counts: Record<string, number> }>(`/api/reference/user-data/by-app/${encodeURIComponent(appId)}`, { method: 'DELETE' });

export const clearDataByEnv = (environment: string) =>
  fetchJSON<{ status: string; environment: string; counts: Record<string, number> }>(`/api/reference/user-data/by-env/${encodeURIComponent(environment)}`, { method: 'DELETE' });

export const getDataSummaryByApp = () =>
  fetchJSON<{ app_id: string; legacy: number; firewall: number; reviews: number; studio: number; total: number }[]>('/api/reference/user-data/summary/by-app');

export const getDataSummaryByEnv = () =>
  fetchJSON<{ environment: string; legacy: number; firewall: number; reviews: number; studio: number; total: number }[]>('/api/reference/user-data/summary/by-env');

// ---- Hide Seed Data Toggle ----

export const getHideSeed = () =>
  fetchJSON<{ hide_seed: boolean }>('/api/reference/hide-seed');

export const setHideSeed = (hide: boolean) =>
  fetchJSON<{ hide_seed: boolean }>('/api/reference/hide-seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hide }) });

export const getRealRules = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/rules/real');

export const getRealGroups = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/groups/real');

export const getRealReviews = () =>
  fetchJSON<Record<string, unknown>[]>('/api/reference/reviews/real');

/** Helper: check localStorage for hide-seed preference */
export const isHideSeedEnabled = (): boolean =>
  typeof window !== 'undefined' && localStorage.getItem('nfs_hide_seed') === 'true';

// ---- Lifecycle Management ----

export const getLifecycleDashboard = () =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/dashboard');

export const getLifecycleStates = () =>
  fetchJSON<{ ngdc: Record<string, string[]>; legacy: Record<string, string[]> }>('/api/lifecycle/states');

export const getLifecycleTransitions = (ruleId: string, isLegacy = false) =>
  fetchJSON<{ rule_id: string; current_status: string; valid_transitions: string[] }>(
    `/api/lifecycle/transitions/${ruleId}?is_legacy=${isLegacy}`
  );

export const transitionLifecycle = (ruleId: string, newStatus: string, actor = 'system', module = 'studio', comments = '', isLegacy = false) =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/transition', {
    method: 'POST',
    body: JSON.stringify({ rule_id: ruleId, new_status: newStatus, actor, module, comments, is_legacy: isLegacy }),
  });

export const softDeleteRule = (ruleId: string, reason = '', isLegacy = false, actor = 'system') =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/soft-delete', {
    method: 'POST',
    body: JSON.stringify({ rule_id: ruleId, reason, is_legacy: isLegacy, actor }),
  });

export const restoreDeletedRule = (ruleId: string, isLegacy = false, actor = 'system') =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/restore', {
    method: 'POST',
    body: JSON.stringify({ rule_id: ruleId, is_legacy: isLegacy, actor }),
  });

export const checkCertificationExpiry = (daysAhead = 30) =>
  fetchJSON<Record<string, unknown>>(`/api/lifecycle/certification/check?days_ahead=${daysAhead}`);

export const runAutoExpire = () =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/certification/auto-expire', { method: 'POST' });

export const bulkCertifyRules = (ruleIds: string[], actor = 'system') =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/certification/bulk-certify', {
    method: 'POST',
    body: JSON.stringify({ rule_ids: ruleIds, actor }),
  });

export const bulkDecommissionRules = (ruleIds: string[], reason = '', actor = 'system') =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/decommission/bulk', {
    method: 'POST',
    body: JSON.stringify({ rule_ids: ruleIds, reason, actor }),
  });

export const getLifecycleEvents = (ruleId?: string, eventType?: string, limit = 100) => {
  const params = new URLSearchParams();
  if (ruleId) params.set('rule_id', ruleId);
  if (eventType) params.set('event_type', eventType);
  params.set('limit', String(limit));
  return fetchJSON<Record<string, unknown>[]>(`/api/lifecycle/events?${params}`);
};

export const getLifecycleTimeline = (ruleId: string) =>
  fetchJSON<Record<string, unknown>[]>(`/api/lifecycle/timeline/${ruleId}`);

export const createLifecycleEvent = (ruleId: string, eventType: string, details = '', actor = 'system') =>
  fetchJSON<Record<string, unknown>>('/api/lifecycle/events', {
    method: 'POST',
    body: JSON.stringify({ rule_id: ruleId, event_type: eventType, details, actor }),
  });


// ============================================================
// Revamp: Shared Services, Presences, Multi-DC Fan-out
// ============================================================
import type {
  SharedService,
  SharedServicePresence,
  AppPresence,
  RuleRequestRecord,
  RuleExpansionPreview,
  Environment,
  DestinationEntityKind,
  MemberSpec,
  ClassifyResult,
  OccupantsResponse,
  IngestMembersResult,
} from '../types';

export const getSharedServices = (params?: {
  environment?: Environment;
  category?: string;
  q?: string;
  team?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.environment) qs.set('environment', params.environment);
  if (params?.category) qs.set('category', params.category);
  if (params?.q) qs.set('q', params.q);
  if (params?.team) qs.set('team', params.team);
  const s = qs.toString();
  return fetchJSON<SharedService[]>(
    `/api/reference/shared-services${s ? `?${s}` : ''}`,
  );
};

export const getSharedService = (serviceId: string) =>
  fetchJSON<SharedService>(`/api/reference/shared-services/${serviceId}`);

export const createSharedService = (data: Partial<SharedService>) =>
  fetchJSON<SharedService>('/api/reference/shared-services', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateSharedService = (
  serviceId: string,
  data: Partial<SharedService>,
) =>
  fetchJSON<SharedService>(`/api/reference/shared-services/${serviceId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteSharedService = (serviceId: string) =>
  fetchJSON<{ status: string }>(
    `/api/reference/shared-services/${serviceId}`,
    { method: 'DELETE' },
  );

export const getSharedServicePresences = (
  serviceId: string,
  params?: { environment?: Environment; dc_id?: string },
) => {
  const qs = new URLSearchParams();
  if (params?.environment) qs.set('environment', params.environment);
  if (params?.dc_id) qs.set('dc_id', params.dc_id);
  const s = qs.toString();
  return fetchJSON<SharedServicePresence[]>(
    `/api/reference/shared-services/${serviceId}/presences${s ? `?${s}` : ''}`,
  );
};

export const upsertSharedServicePresence = (
  serviceId: string,
  presence: Partial<SharedServicePresence> & {
    dc_id: string;
    environment: Environment;
    nh_id: string;
    sz_code: string;
    members: MemberSpec[];
  },
) =>
  fetchJSON<SharedServicePresence>(
    `/api/reference/shared-services/${serviceId}/presences`,
    { method: 'POST', body: JSON.stringify(presence) },
  );

export const deleteSharedServicePresence = (
  serviceId: string,
  dcId: string,
  environment: Environment,
  nhId: string,
  szCode: string,
) => {
  const qs = new URLSearchParams({
    dc_id: dcId,
    environment,
    nh_id: nhId,
    sz_code: szCode,
  });
  return fetchJSON<{ status: string }>(
    `/api/reference/shared-services/${serviceId}/presences?${qs}`,
    { method: 'DELETE' },
  );
};

export const getAppPresences = (params?: {
  app?: string;
  environment?: Environment;
  dc_id?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.app) qs.set('app', params.app);
  if (params?.environment) qs.set('environment', params.environment);
  if (params?.dc_id) qs.set('dc_id', params.dc_id);
  const s = qs.toString();
  return fetchJSON<AppPresence[]>(
    `/api/reference/app-presences${s ? `?${s}` : ''}`,
  );
};

export const upsertAppPresence = (presence: AppPresence) =>
  fetchJSON<AppPresence>('/api/reference/app-presences', {
    method: 'POST',
    body: JSON.stringify(presence),
  });

export const deleteAppPresence = (
  appDistributedId: string,
  dcId: string,
  environment: Environment,
  nhId: string,
  szCode: string,
) => {
  const qs = new URLSearchParams({
    app_distributed_id: appDistributedId,
    dc_id: dcId,
    environment,
    nh_id: nhId,
    sz_code: szCode,
  });
  return fetchJSON<{ status: string }>(
    `/api/reference/app-presences?${qs}`,
    { method: 'DELETE' },
  );
};

// ---- Bidirectional IP ↔ (DC, NH, SZ) classifier / occupants ----

export const classifyIp = (ip: string, dcHint?: string) =>
  fetchJSON<ClassifyResult>('/api/reference/classify-ip', {
    method: 'POST',
    body: JSON.stringify({ ip, dc_hint: dcHint || '' }),
  });

export const classifyIps = (ips: string[], dcHint?: string) =>
  fetchJSON<ClassifyResult[]>('/api/reference/classify-ips', {
    method: 'POST',
    body: JSON.stringify({ ips, dc_hint: dcHint || '' }),
  });

export const getOccupants = (params: {
  dc?: string;
  nh?: string;
  sz?: string;
  environment?: Environment | '';
}) => {
  const qs = new URLSearchParams();
  if (params.dc) qs.set('dc', params.dc);
  if (params.nh) qs.set('nh', params.nh);
  if (params.sz) qs.set('sz', params.sz);
  if (params.environment) qs.set('environment', params.environment);
  const s = qs.toString();
  return fetchJSON<OccupantsResponse>(
    `/api/reference/occupants${s ? `?${s}` : ''}`,
  );
};

export const ingestAppMembers = (
  appDistributedId: string,
  payload: {
    environment: Environment;
    direction: 'egress' | 'ingress';
    members: Array<{ kind: string; value: string; description?: string }>;
    dc_hint?: string;
    has_ingress?: boolean;
  },
) =>
  fetchJSON<IngestMembersResult>(
    `/api/reference/applications/${encodeURIComponent(appDistributedId)}/ingest-members`,
    { method: 'POST', body: JSON.stringify(payload) },
  );

export interface PresenceKey {
  dc_id: string;
  nh_id: string;
  sz_code: string;
}

export interface RuleRequestInput {
  /** Source entity kind. Defaults to 'app' on the backend for back-compat. */
  source_kind?: 'app' | 'shared_service';
  /** Source ref — app_distributed_id when source_kind='app',
   *  service_id when source_kind='shared_service'. */
  source_ref?: string;
  /** Legacy alias for app sources. Populated automatically when
   *  source_kind='app'. */
  application_ref?: string;
  destination_kind: DestinationEntityKind;
  destination_ref?: string | null;
  environment: Environment;
  ports: string;
  action?: 'ACCEPT' | 'DROP';
  description?: string;
  src_members_override?: MemberSpec[];
  dst_members_override?: MemberSpec[];
  requested_dcs?: string[];
  /** Per-presence scoping for the source app. When provided, only these
   *  (DC, NH, SZ) presences participate in fan-out. Leave empty to use
   *  all of the app's presences. */
  source_presences?: PresenceKey[];
  /** Per-presence scoping for the destination (app_ingress or shared
   *  service). Same semantics as source_presences. */
  destination_presences?: PresenceKey[];
  /** Power-user toggle: opt out of primary-DC scoping and fan out across
   *  all source/destination DCs (legacy intersect-all behaviour). */
  include_cross_dc?: boolean;
  /** Power-user override: explicitly target a destination DC (DR cutover
   *  scenarios). Supersedes the destination's primary_dc. */
  destination_dc_override?: string;
  owner?: string;
  owner_team?: string;
}

export const previewRuleExpansion = (payload: RuleRequestInput) =>
  fetchJSON<RuleExpansionPreview>('/api/rules/preview-expansion', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listRuleRequests = (params?: {
  environment?: Environment;
  status?: string;
  team?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.environment) qs.set('environment', params.environment);
  if (params?.status) qs.set('status', params.status);
  if (params?.team) qs.set('team', params.team);
  const s = qs.toString();
  return fetchJSON<RuleRequestRecord[]>(
    `/api/rules/requests${s ? `?${s}` : ''}`,
  );
};

export const createRuleRequest = (payload: RuleRequestInput) =>
  fetchJSON<RuleRequestRecord>('/api/rules/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getRuleRequest = (requestId: string) =>
  fetchJSON<RuleRequestRecord>(`/api/rules/requests/${requestId}`);

export const setRuleRequestStatus = (requestId: string, status: string, note?: string) =>
  fetchJSON<RuleRequestRecord>(`/api/rules/requests/${requestId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, note }),
  });

// ---- Port / Service Catalog ----

export interface PortCatalogEntry {
  port_id: string;
  name: string;
  protocol: 'TCP' | 'UDP' | 'ICMP' | string;
  port: number;
  aliases?: string[];
  category: string;
  description?: string;
}

export const listPorts = () =>
  fetchJSON<PortCatalogEntry[]>(`/api/reference/ports`);

export const createPort = (data: Partial<PortCatalogEntry>) =>
  fetchJSON<PortCatalogEntry>(`/api/reference/ports`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updatePort = (portId: string, data: Partial<PortCatalogEntry>) =>
  fetchJSON<PortCatalogEntry>(
    `/api/reference/ports/${encodeURIComponent(portId)}`,
    { method: 'PUT', body: JSON.stringify(data) },
  );

export const deletePort = (portId: string) =>
  fetchJSON<{ deleted: boolean; port_id: string }>(
    `/api/reference/ports/${encodeURIComponent(portId)}`,
    { method: 'DELETE' },
  );

// ============================================================
// Phase A — Validation, Artifacts, ITSM, Migration
// ============================================================
import type {
  BirthrightRule as _BirthrightRule,
  ItsmConnector as _ItsmConnector,
  DeploymentArtifactsBundle as _DeploymentArtifactsBundle,
  DedupResult as _DedupResult,
  BirthrightResult as _BirthrightResult,
} from '@/types';
export type BirthrightRule = _BirthrightRule;
export type ItsmConnector = _ItsmConnector;
export type DeploymentArtifactsBundle = _DeploymentArtifactsBundle;
export type DedupResult = _DedupResult;
export type BirthrightResult = _BirthrightResult;

export const validateRule = (payload: Record<string, unknown>) =>
  fetchJSON<{
    dedup: DedupResult;
    birthright: BirthrightResult;
    block_submit: boolean;
    physical_rules?: unknown[];
    warnings?: string[];
  } & RuleExpansionPreview>('/api/rules/validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listBirthrightRules = () =>
  fetchJSON<BirthrightRule[]>('/api/birthright-rules');

export const upsertBirthrightRule = (data: BirthrightRule) =>
  fetchJSON<BirthrightRule>('/api/birthright-rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteBirthrightRule = (id: string) =>
  fetchJSON<{ status: string }>(
    `/api/birthright-rules/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );

export const setSecurityZoneNamingMode = (
  code: string,
  naming_mode: 'app_scoped' | 'zone_scoped',
) =>
  fetchJSON<{ code: string; naming_mode: string }>(
    `/api/reference/security-zones/${encodeURIComponent(code)}/naming-mode`,
    { method: 'PUT', body: JSON.stringify({ naming_mode }) },
  );

export const getSecurityZonesWithMode = () =>
  fetchJSON<Array<{ code: string; name: string; naming_mode?: string; description?: string }>>(
    '/api/reference/security-zones-with-mode',
  );

// Per-DC artifacts: a single firewall device lives in exactly one DC,
// so the deployable artifact must be filtered to that DC. Every helper
// accepts an optional ``dc_id`` that scopes the underlying manifest +
// vendor configs to a single device target. Without it, the legacy
// "all DCs in one file" shape is returned (kept for back-compat) but
// the response carries a banner steering operators to per-DC.
const _withDc = (path: string, dc_id?: string | null) => {
  if (!dc_id) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}dc_id=${encodeURIComponent(dc_id)}`;
};

export const getRequestArtifacts = (request_id: string, dc_id?: string | null) =>
  fetchJSON<DeploymentArtifactsBundle>(
    _withDc(
      `/api/rules/requests/${encodeURIComponent(request_id)}/artifacts`,
      dc_id,
    ),
  );

export type PerDcArtifactBundle = {
  dc_id: string;
  environment?: string | null;
  manifest: DeploymentArtifactsBundle['manifest'];
  xlsx_sheets: DeploymentArtifactsBundle['xlsx_sheets'];
  vendor_configs: DeploymentArtifactsBundle['vendor_configs'];
  vendor_configs_json?: DeploymentArtifactsBundle['vendor_configs_json'];
};

export type PerDcArtifactsResponse = {
  request_id: string;
  dc_ids: string[];
  dcs: PerDcArtifactBundle[];
};

export const getRequestArtifactsPerDc = (request_id: string) =>
  fetchJSON<PerDcArtifactsResponse>(
    `/api/rules/requests/${encodeURIComponent(request_id)}/artifacts/per-dc`,
  );

export const requestArtifactJsonUrl = (request_id: string, dc_id?: string | null) =>
  _withDc(
    `/api/rules/requests/${encodeURIComponent(request_id)}/artifacts/manifest.json`,
    dc_id,
  );

export const requestArtifactXlsxUrl = (request_id: string, dc_id?: string | null) =>
  _withDc(
    `/api/rules/requests/${encodeURIComponent(request_id)}/artifacts/manifest.xlsx`,
    dc_id,
  );

export const requestArtifactVendorUrl = (
  request_id: string,
  vendor: string,
  dc_id?: string | null,
) =>
  _withDc(
    `/api/rules/requests/${encodeURIComponent(request_id)}/artifacts/device.${encodeURIComponent(vendor)}`,
    dc_id,
  );

export const requestArtifactBundleUrl = (request_id: string, dc_id?: string | null) =>
  _withDc(
    `/api/rules/requests/${encodeURIComponent(request_id)}/artifacts/bundle.zip`,
    dc_id,
  );

export const downloadRequestArtifactBulkBundle = async (request_ids: string[]) => {
  const res = await fetch('/api/rules/requests/artifacts/bulk-bundle.zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_ids }),
  });
  if (!res.ok) throw new Error(`Bulk export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rule-requests-bulk-export.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const listItsmConnectors = () =>
  fetchJSON<ItsmConnector[]>('/api/itsm/connectors');

export const upsertItsmConnector = (data: ItsmConnector) =>
  fetchJSON<ItsmConnector>('/api/itsm/connectors', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteItsmConnector = (id: string) =>
  fetchJSON<{ status: string }>(
    `/api/itsm/connectors/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );

export const submitRequestToItsm = (
  request_id: string,
  connector_id?: string,
) =>
  fetchJSON<{
    request_id: string;
    connector_id: string;
    kind: string;
    endpoint_url: string;
    rendered_payload: Record<string, unknown>;
    external_ticket_id: string;
    external_ticket_url: string;
    external_status: string;
  }>(`/api/rules/requests/${encodeURIComponent(request_id)}/submit-itsm`, {
    method: 'POST',
    body: JSON.stringify(connector_id ? { connector_id } : {}),
  });

export const refreshExternalStatus = (request_id: string) =>
  fetchJSON<{
    request_id: string;
    external_ticket_id: string;
    external_status: string;
    external_last_synced_at: string;
  }>(
    `/api/rules/requests/${encodeURIComponent(request_id)}/refresh-external-status`,
    { method: 'POST', body: '{}' },
  );

export const normalizeLegacyRule = (rule: Record<string, unknown>) =>
  fetchJSON<{
    origin_legacy_rule_id: string;
    verdict: string;
    block: boolean;
    physical_rule: Record<string, unknown> | null;
    dedup_match: Record<string, unknown> | null;
    warnings: string[];
  }>('/api/migration/normalize', {
    method: 'POST',
    body: JSON.stringify(rule),
  });

export const normalizeLegacyRulesBulk = (rules: Array<Record<string, unknown>>) =>
  fetchJSON<{
    counters: {
      total: number;
      standardized: number;
      merged_existing: number;
      overlap_flagged: number;
      unclassifiable: number;
    };
    decisions: Array<{
      origin_legacy_rule_id: string;
      verdict: string;
      block: boolean;
      physical_rule: Record<string, unknown> | null;
      dedup_match: Record<string, unknown> | null;
      warnings: string[];
    }>;
  }>('/api/migration/normalize-bulk', {
    method: 'POST',
    body: JSON.stringify({ rules }),
  });

// Migration Studio: enriched legacy -> classified -> proposed NGDC transition view.
export type LegacyAtomKind = 'ip' | 'cidr' | 'range' | 'group' | 'fqdn' | 'empty';
export interface LegacyClassifiedSide {
  kind: LegacyAtomKind | string;
  value: string;
  dc: string;
  nh: string;
  sz: string;
  app: string;
  app_distributed_id: string;
  service_id: string;
  presence_kind: 'egress' | 'ingress' | 'shared_service' | 'group' | 'unknown' | string;
  matched: boolean;
  reason: string;
}
export interface LegacyProposedFanoutRow {
  src_dc: string;
  dst_dc: string;
  src_group: string;
  dst_group: string;
  src_vrf: string;
  dst_vrf: string;
  ports: string;
  action: string;
  environment: string;
  src_is_heritage?: boolean;
  dst_is_heritage?: boolean;
  dc_to_dc_path?: string;
  egress_ip_dependency?: string[];
  ingress_ip_dependency?: string[];
  // Snapshot-aware compile mode: 'initial' when no deployed
  // snapshot exists yet for that DC; 'incremental' once a baseline
  // exists. Drives the per-DC compile preview and the auto-staged
  // group change requests' mode at apply time.
  src_snapshot_present?: boolean;
  dst_snapshot_present?: boolean;
  src_compile_mode?: 'initial' | 'incremental';
  dst_compile_mode?: 'initial' | 'incremental';
}
export interface LegacyProposed {
  src_group: string;
  dst_group: string;
  src_vrf: string;
  dst_vrf: string;
  src_dc: string;
  dst_dc: string;
  ports: string;
  action: string;
  environment: string;
  app_management_changes: Array<Record<string, unknown>>;
  group_changes: Array<Record<string, unknown>>;
  physical_rule: Record<string, unknown>;
  /** Multi-DC fan-out preview: every classified legacy rule materialises
   * as N proposed RuleRequests, one per (src_dc, dst_dc) pair.
   * NGDC<->NGDC pairs same-DC by default. NGDC<->Heritage follows the
   * Heritage presence's `ngdc_source_dcs[]` mapping. */
  fanout?: LegacyProposedFanoutRow[];
  fanout_count?: number;
}
export interface LegacyTransition {
  origin_legacy_rule_id: string;
  original: {
    source: string;
    destination: string;
    protocol: string;
    ports: string;
    action: string;
    environment: string;
  };
  classified: {
    source: LegacyClassifiedSide;
    destination: LegacyClassifiedSide;
  };
  proposed: LegacyProposed;
  verdict: 'new' | 'merge' | 'conflict' | 'overlap' | 'unclassifiable' | string;
  dedup_match: Record<string, unknown> | null;
  warnings: string[];
}
export const buildLegacyTransitionsBulk = (rules: Array<Record<string, unknown>>) =>
  fetchJSON<{
    counters: {
      total: number;
      new: number;
      merge: number;
      conflict: number;
      overlap: number;
      unclassifiable: number;
      needs_app_attachment: number;
    };
    transitions: LegacyTransition[];
  }>('/api/migration/transitions-bulk', {
    method: 'POST',
    body: JSON.stringify({ rules }),
  });


// ============================================================
// Group Change Requests (standalone group create / modify / delete)
// ============================================================

export type GroupChangeOp =
  | 'create'
  | 'modify-add'
  | 'modify-remove'
  | 'delete';

export type GroupChangeRequest = {
  request_id: string;
  kind: 'group_change';
  op: GroupChangeOp;
  group_name: string;
  added_members: string[];
  removed_members: string[];
  environment: string;
  owner: string;
  owner_team: string;
  description?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Deployed' | 'Certified';
  created_at: string;
  updated_at: string;
  external_ticket_id?: string | null;
  external_ticket_url?: string | null;
  external_status?: string | null;
  external_system?: string | null;
  external_last_synced_at?: string | null;
};

export const listGroupChangeRequests = (params: {
  environment?: string;
  status?: string;
  team?: string;
} = {}) => {
  const q = new URLSearchParams();
  if (params.environment) q.set('environment', params.environment);
  if (params.status) q.set('status', params.status);
  if (params.team) q.set('team', params.team);
  const qs = q.toString();
  return fetchJSON<GroupChangeRequest[]>(
    `/api/groups/change-requests${qs ? `?${qs}` : ''}`,
  );
};

export const getGroupChangeRequest = (request_id: string) =>
  fetchJSON<GroupChangeRequest>(
    `/api/groups/change-requests/${encodeURIComponent(request_id)}`,
  );

export const createGroupChangeRequest = (
  payload: {
    op: GroupChangeOp;
    group_name: string;
    added_members?: string[];
    removed_members?: string[];
    environment?: string;
    owner?: string;
    owner_team?: string;
    description?: string;
    group_type?: string;
  },
) => fetchJSON<GroupChangeRequest>('/api/groups/change-requests', {
  method: 'POST',
  body: JSON.stringify(payload),
});

export const setGroupChangeRequestStatus = (
  request_id: string, status: string, note?: string,
) => fetchJSON<GroupChangeRequest>(
  `/api/groups/change-requests/${encodeURIComponent(request_id)}/status`,
  { method: 'PATCH', body: JSON.stringify({ status, note }) },
);

export const groupChangeArtifactBundleUrl = (request_id: string) =>
  `/api/groups/change-requests/${encodeURIComponent(request_id)}/artifacts/bundle.zip`;

export const groupChangeArtifactJsonUrl = (request_id: string) =>
  `/api/groups/change-requests/${encodeURIComponent(request_id)}/artifacts/manifest.json`;

export const groupChangeArtifactXlsxUrl = (request_id: string) =>
  `/api/groups/change-requests/${encodeURIComponent(request_id)}/artifacts/manifest.xlsx`;

export const groupChangeArtifactVendorUrl = (request_id: string, vendor: string) =>
  `/api/groups/change-requests/${encodeURIComponent(request_id)}/artifacts/device-${encodeURIComponent(vendor)}.txt`;

export const downloadGroupChangeBulkBundle = async (request_ids: string[]) => {
  const res = await fetch(
    '/api/groups/change-requests/artifacts/bulk-bundle.zip',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_ids }),
    },
  );
  if (!res.ok) throw new Error(`Bulk export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'group-change-requests-bulk-export.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const submitGroupChangeToItsm = (
  request_id: string, connector_id?: string,
) => fetchJSON<{
  request_id: string;
  connector_id: string;
  kind: string;
  endpoint_url: string;
  rendered_payload: Record<string, unknown>;
  external_ticket_id: string;
  external_ticket_url: string;
  external_status: string;
}>(
  `/api/groups/change-requests/${encodeURIComponent(request_id)}/submit-itsm`,
  {
    method: 'POST',
    body: JSON.stringify(connector_id ? { connector_id } : {}),
  },
);

export const refreshGroupChangeExternalStatus = (request_id: string) =>
  fetchJSON<{
    request_id: string;
    external_ticket_id: string;
    external_status: string;
    external_last_synced_at: string;
  }>(
    `/api/groups/change-requests/${encodeURIComponent(request_id)}/refresh-external-status`,
    { method: 'POST', body: '{}' },
  );

// ============================================================
// Phase B — ITSM polling + webhook receiver
// ============================================================

export const pollItsmConnectors = () =>
  fetchJSON<{
    connectors_seen: number;
    transitions: Array<{
      request_id: string;
      kind: 'rule' | 'group_change';
      before: string;
      after: string;
    }>;
    polled_at: string;
  }>('/api/itsm/poll', { method: 'POST', body: '{}' });

export const itsmWebhookUrl = (connector_id: string) =>
  `/api/itsm/webhook/${encodeURIComponent(connector_id)}`;

export type RuleStatus = 'Draft' | 'Pending Review' | 'Approved' | 'Rejected' | 'Deployed' | 'Certified' | 'Expired' | 'Deleted';
export type PolicyResult = 'Permitted' | 'Blocked' | 'Exception Required' | 'Needs Review';
export type MigrationStatus = 'Auto-Mapped' | 'Needs Review' | 'New Group' | 'Conflict' | 'Blocked' | 'Draft' | 'Policy Review';

// Rule Lifecycle statuses (dual-status system)
export type RuleLifecycleStatus = 'Submitted' | 'In Progress' | 'Approved' | 'Rejected' | 'Deployed';
export type RuleMigrationStatus = 'Not Migrated' | 'Migrated';
export type MappingStatus = 'Automapped' | 'Needs Review' | 'Blocked';
export type SourceType = 'Single IP' | 'Subnet' | 'Range' | 'Group' | 'Server';

export interface SourceConfig {
  source_type: SourceType;
  ip_address: string | null;
  cidr: string | null;
  group_name: string | null;
  ports: string;
  neighbourhood: string | null;
  neighbourhood_name?: string | null;
  security_zone: string | null;
}

export interface DestinationConfig {
  name: string;
  friendly_name?: string | null;
  security_zone: string | null;
  dest_ip: string | null;
  ports: string;
  is_predefined: boolean;
  dest_type?: string | null;
}

export interface RuleCompliance {
  naming_valid: boolean;
  naming_errors?: string[];
  group_to_group: boolean;
  requires_exception: boolean;
}

export interface FirewallRule {
  id: string;
  rule_id: string;
  application: string;
  application_name?: string;
  environment: string;
  datacenter: string;
  source: SourceConfig;
  destination: DestinationConfig;
  policy_result: PolicyResult;
  status: RuleStatus;
  rule_status?: RuleLifecycleStatus;
  rule_migration_status?: RuleMigrationStatus;
  compliance?: RuleCompliance;
  expiry: string | null;
  owner: string;
  created_at: string;
  updated_at: string;
  certified_at: string | null;
  certified_by: string | null;
  description?: string;
  action?: string;
}

export interface MigrationDetails {
  id: string;
  application: string;
  source_legacy_dc: string;
  target_ngdc: string;
  map_to_standard_groups: boolean;
  map_to_subnet_cidr: boolean;
  status: string;
  created_at: string;
}

export interface MigrationMapping {
  id: string;
  migration_id: string;
  legacy_source: string;
  legacy_source_detail: string | null;
  legacy_group: string | null;
  ngdc_target: string;
  ngdc_target_detail: string | null;
  mapping_status: MigrationStatus;
  trust_zones_automapped: number;
  related_policies: string[];
  naming_compliant?: boolean;
}

export interface MigrationRuleLifecycle {
  id: string;
  migration_id: string;
  rule_id: string;
  source: string;
  source_ip: string | null;
  mapping_status: string;
  ngdc_target: string;
  destination_detail: string | null;
  naming_compliant?: boolean;
}

export interface Neighbourhood {
  name: string;
  nh_id?: string;
  zone?: string;
  subnets: string[];
}

export interface IPRange {
  cidr: string;
  description: string;
  dc: string;
}

export interface NeighbourhoodRegistry {
  id?: string;
  nh_id: string;
  name: string;
  zone: string;
  environment: string;
  description?: string;
  ip_ranges?: IPRange[];
}

export interface NGDCDataCenter {
  name: string;
  code: string;
  neighbourhoods: Neighbourhood[];
  ip_groups: { name: string; entries: { name: string; ip?: string; cidr?: string }[] }[];
  rule_count: number;
}

export interface SecurityZone {
  name: string;
  code: string;
  description: string;
  risk_level?: string;
  pci_scope?: boolean;
  ip_ranges?: IPRange[];
}

export interface PredefinedDestination {
  name: string;
  security_zone: string;
  description: string | null;
  friendly_name?: string;
}

export interface Application {
  [key: string]: unknown;
  id?: string;
  name: string;
  app_name?: string;
  app_id: string;
  app_distributed_id: string;
  owner: string;
  nh: string;
  sz: string;
  dc?: string;
  neighborhoods?: string;
  szs?: string;
  dcs?: string;
  snow_sysid?: string;
  criticality?: number | string;
  pci_scope?: boolean;
  // Egress/Ingress architecture fields
  has_ingress?: boolean;
  egress_ip?: string;
  ingress_ips?: string;
  ingress_components?: string;
  direction?: 'egress' | 'ingress' | 'both';
  // Mandatory primary DC. Rule Builder defaults the source to this DC.
  primary_dc?: string;
  deployment_mode?: 'all_ngdc' | 'selective' | 'all_ngdc_with_exceptions';
  excluded_dcs?: string[];
  // Owning team. SNS team is the global reviewer/approver and sees
  // every app/service; everyone else sees only their own.
  owner_team?: string;
  // Tier definition (NH x SZ x has_ingress). When deployment_mode is
  // 'all_ngdc' or 'all_ngdc_with_exceptions', the backend auto-fans
  // one presence per tier into every target NGDC DC.
  tiers?: TierSpec[];
  // Heritage tiers — one per Heritage DC the app/service still
  // serves from. Materialises into a flat presence (no NH/SZ) and a
  // `grp-<APP>-HERITAGE-<DC>` group during auto-fan.
  heritage_tiers?: HeritageTierSpec[];
  environments?: Environment[];
}

export interface TierSpec {
  nh_id: string;
  sz_code: string;
  has_ingress?: boolean;
  label?: string;
}

export interface HeritageTierSpec {
  dc_id: string;
  has_ingress?: boolean;
  label?: string;
}

export interface OrgConfig {
  org_name: string;
  org_code: string;
  servicenow_instance: string;
  servicenow_api_path: string;
  gitops_repo: string;
  gitops_branch: string;
  approval_required: boolean;
  auto_certify_birthright: boolean;
  notification_email: string;
  notification_slack_channel: string;
  max_rule_expiry_days: number;
  enforce_group_to_group: boolean;
}

export interface PolicyMatrixEntry {
  source_zone: string;
  dest_zone: string;
  default_action: string;
  requires_exception: boolean;
  description: string;
}

export interface EnvironmentEntry {
  code: string;
  name: string;
  description: string;
}

export interface NamingStandardsInfo {
  prefixes: Record<string, { description: string; pattern: string; example: string }>;
  valid_nh_ids: string[];
  valid_sz_codes: string[];
  valid_subtypes: Record<string, string>;
  enforcement_rules: string[];
}

export interface PolicyValidationResult {
  result: PolicyResult;
  message: string;
  details: string[];
  ngdc_zone_check: boolean;
  birthright_compliant: boolean;
  naming_compliant?: boolean;
  group_to_group_compliant?: boolean;
}

export interface CHGRequest {
  id: string;
  chg_number: string;
  rule_ids: string[];
  migration_id: string | null;
  status: string;
  created_at: string;
  description: string;
}

export interface RuleHistoryEntry {
  id: string;
  rule_id: string;
  action: string;
  timestamp: string;
  user: string;
  details: string;
}

export interface GroupMember {
  type: 'ip' | 'subnet' | 'cidr' | 'group' | 'range';
  value: string;
  description: string;
}

export interface FirewallGroup {
  name: string;
  app_id: string;
  nh: string;
  sz: string;
  subtype: string;
  description: string;
  members: GroupMember[];
  created_at?: string;
  updated_at?: string;
  direction?: 'egress' | 'ingress';
  app_distributed_id?: string;
}

export interface CompiledRule {
  rule_id: string;
  vendor_format: 'generic' | 'palo_alto' | 'checkpoint' | 'fortigate';
  compiled_text: string;
  source_objects: string[];
  destination_objects: string[];
  services: string[];
  action: string;
  logging: boolean;
  comment: string;
}

export interface ReviewRequest {
  id: string;
  rule_id: string;
  rule_name: string;
  request_type: 'new_rule' | 'modify_rule' | 'delete_rule' | 'migration' | 'certification' | 'group_policy_change' | 'group_created' | 'group_member_change' | 'policy_add' | 'policy_modify' | 'policy_delete';
  requestor: string;
  reviewer: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
  submitted_at: string;
  reviewed_at: string | null;
  comments: string;
  review_notes: string | null;
  modification_id?: string;
  delta?: RuleDelta;
  module?: 'design-studio' | 'firewall-management' | 'migration-studio' | 'org-admin';
  policy_change_id?: string;
  linked_rule_id?: string;
  rule_summary: {
    application: string;
    source: string;
    destination: string;
    ports: string;
    environment: string;
  };
  /** Per-(src_dc,dst_dc) physical-row count for a fanned-out rule
   * request. Drives the "DCs" badge in the Review queue so reviewers
   * see at a glance how many devices a single submission will touch. */
  dc_fanout_count?: number;
  /** Distinct DC pair labels (e.g. "ALPHA→ALPHA, BETA→BETA, …") for
   * tooltip/sort use in the Review table. */
  dc_pairs?: string[];
  /** Origin queue this row came from. Lets the Review tab break down
   * counts by queue ("Rule Requests / Group Changes / Modifications /
   * Other Reviews") instead of conflating everything into one number. */
  subqueue?: 'rule_request' | 'group_change' | 'modification' | 'review';
}

export interface RuleDelta {
  added: Record<string, string[]>;
  removed: Record<string, string[]>;
  changed: Record<string, { from: string; to: string }>;
}

export interface RuleModification {
  id: string;
  rule_id: string;
  original: Record<string, string>;
  modified: Record<string, string>;
  delta: RuleDelta;
  comments: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewer: string | null;
  review_notes: string | null;
}

export interface ServiceRecommendation {
  service: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface MappingSummary {
  total: number;
  from_mapping_table: number;
  from_existing_groups: number;
  auto_generated: number;
}

export interface ComponentGroup {
  component: string;
  direction: 'source' | 'destination';
  ips: string[];
  ngdc_ips?: string[];
  ip_count: number;
  legacy_group: string | null;
  ngdc_group: string;
  nh: string;
  sz: string;
  dc: string;
  cidr: string;
  environment?: string;
  customizable: boolean;
}

export interface NGDCRecommendation {
  rule_id: string;
  rule: LegacyRule;
  recommended_nh: string;
  recommended_nh_name: string;
  recommended_sz: string;
  recommended_sz_name: string;
  recommended_dc?: string;
  nh_sz_source?: 'app_dc_mapping' | 'application_config' | 'rule_zone_mapping' | 'default';
  // Direction-specific NH/SZ from rule's actual source/dest zones
  source_nh?: string;
  source_sz?: string;
  source_dc?: string;
  source_nh_name?: string;
  source_sz_name?: string;
  destination_nh?: string;
  destination_sz?: string;
  destination_dc?: string;
  destination_nh_name?: string;
  destination_sz_name?: string;
  source_mappings: IPMapping[];
  destination_mappings: IPMapping[];
  component_groups?: ComponentGroup[];
  service_entries: string[];
  service_recommendations?: ServiceRecommendation[];
  mapping_summary?: MappingSummary;
  naming_standard: string;
  available_nhs: { nh_id: string; name: string }[];
  available_szs: { code: string; name: string }[];
  app_distributed_id?: string;
  legacy_group_mappings?: Record<string, unknown>[];
  legacy_source_groups?: Record<string, unknown>[];
  legacy_dest_groups?: Record<string, unknown>[];
  app_dc_mappings?: Record<string, string>[];
  available_components?: string[];
}

export interface IPMapping {
  legacy: string;
  ngdc_recommended: string;
  type: 'group' | 'server' | 'subnet' | 'range' | 'other';
  existing_group: string | null;
  customizable: boolean;
  mapping_source?: 'ngdc_mapping_table' | 'existing_group' | 'auto_generated';
  mapping_id?: string | null;
  mapping_status?: string;
  ngdc_nh?: string;
  ngdc_sz?: string;
}

export interface BirthrightValidation {
  compliant: boolean;
  violations: BirthrightEntry[];
  warnings: BirthrightEntry[];
  permitted: BirthrightEntry[];
  summary: string;
  matrix_used?: string;
  environment?: string;
  firewall_devices_needed?: string[];
  firewall_path_info?: string[];
  firewall_request_required?: boolean;
}

export interface BirthrightEntry {
  matrix: string;
  rule: string;
  action: string;
  reason: string;
}

export interface LegacyRule {
  id: string;
  app_id: number | string;
  app_distributed_id: string;
  app_name: string;
  inventory_item: string;
  policy_name: string;
  rule_global: boolean;
  rule_action: string;
  rule_source: string;
  rule_source_expanded: string;
  rule_source_zone: string;
  rule_destination: string;
  rule_destination_expanded: string;
  rule_destination_zone: string;
  rule_service: string;
  rule_service_expanded: string;
  rn: number;
  rc: number;
  is_standard: boolean;
  migration_status: 'Not Started' | 'In Progress' | 'Mapped' | 'Needs Review' | 'Completed';
  rule_status?: RuleLifecycleStatus;
  rule_migration_status?: RuleMigrationStatus;
  migrated_at?: string;
}

export interface MigrationHistoryEntry {
  id: string;
  rule_id: string;
  action: string;
  from_status: string;
  to_status: string;
  details: string;
  timestamp: string;
  user: string;
}

// AD User Integration
export interface ADUserGroup {
  id: string;
  group_name: string;
  access_type: 'Admin' | 'Approver' | 'Operator' | 'Viewer' | 'Auditor';
  description: string;
  member_count: number;
  applications: string[];
}

export interface ADUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  groups: string[];
  access_type: string;
  last_login: string | null;
  is_active: boolean;
}

export interface ADConfig {
  server_url: string;
  base_dn: string;
  bind_user: string;
  search_filter: string;
  group_mapping: Record<string, string>;
  sync_interval_minutes: number;
  is_connected: boolean;
  last_sync: string | null;
}

// Data Source Import
export interface DataImportJob {
  id: string;
  source_type: 'json' | 'csv' | 'xlsx' | 'mongodb';
  source_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_records: number;
  imported_records: number;
  failed_records: number;
  target: 'legacy_rules' | 'firewall_rules' | 'groups';
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

// Firewall Management (as-is rules)
export interface AsIsRule {
  id: string;
  app_id: string;
  app_name: string;
  rule_name: string;
  source: string;
  source_zone: string;
  destination: string;
  destination_zone: string;
  port: string;
  protocol: string;
  action: string;
  is_standard: boolean;
  compliance_status: 'Compliant' | 'Non-Compliant' | 'Pending Review';
  last_reviewed: string | null;
  request_type: 'existing' | 'new' | 'modification';
  output_generated: boolean;
}

// SZ-level CIDR entry (from NH security_zones with DC context)
export interface NhSecurityZone {
  nh: string;
  nh_name: string;
  sz: string;
  dc: string;
  cidr: string;
  vrf_id: string;
  description: string;
}

// App-to-DC/NH/SZ Mapping (simplified - no per-component, app-level)
export interface AppDCMapping {
  id?: string;
  app_id: string;
  app_distributed_id?: string;
  component?: 'WEB' | 'APP' | 'DB' | 'MQ' | 'BAT' | 'API';
  dc_location: 'NGDC' | 'Legacy';
  dc: string;
  nh: string;
  sz: string;
  cidr: string;
  legacy_dc: string;
  legacy_cidr: string;
  status: 'Active' | 'Inactive';
  notes?: string;
}

// Lifecycle Management
export type LifecycleStatus =
  | 'Draft' | 'Submitted' | 'In Progress' | 'Approved' | 'Rejected'
  | 'Deployed' | 'Certified' | 'Expired'
  | 'Decommissioning' | 'Decommissioned' | 'Deleted';

export type LifecycleEventType =
  | 'created' | 'submitted' | 'approved' | 'rejected'
  | 'deployed' | 'certified' | 'expired' | 'decommission_requested'
  | 'decommissioned' | 'soft_deleted' | 'restored'
  | 'modified' | 'migrated' | 'comment' | 'bulk_action'
  | 'recertified' | 'ownership_changed';

export interface LifecycleEvent {
  id: string;
  rule_id: string;
  event_type: LifecycleEventType;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  module: string;
  details: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface LifecycleDashboard {
  ngdc_rules: { total: number; status_distribution: Record<string, number> };
  legacy_rules: { total: number; status_distribution: Record<string, number> };
  certification: {
    expiring_soon: number;
    already_expired: number;
    expiring_rules: { rule_id: string; application: string; expiry_date: string; days_until_expiry: number }[];
    expired_rules: { rule_id: string; application: string; expiry_date: string; days_overdue: number }[];
  };
  decommission_queue: { rule_id: string; application: string; requested_at: string; requested_by: string; store: string }[];
  recent_events: LifecycleEvent[];
  app_breakdown: Record<string, Record<string, number>>;
}

export interface BulkOperationResult {
  results: { rule_id: string; success: boolean; detail: string }[];
  total: number;
  succeeded: number;
  failed: number;
}

// Exception request for individual IPs/subnets
export interface ExceptionRequest {
  id: string;
  rule_id: string;
  exception_type: 'ip' | 'subnet';
  value: string;
  justification: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}


// ============================================================
// Revamp: Shared Services, Presences, Multi-DC Fan-out
// ============================================================

export type Environment = 'Production' | 'Non-Production' | 'Pre-Production';
export type MemberTypeKind = 'ip' | 'cidr' | 'subnet' | 'range' | 'group';
export type OwnerKind = 'app_egress' | 'app_ingress' | 'shared_service' | 'adhoc_destination';
export type DestinationEntityKind = 'app_ingress' | 'shared_service' | 'adhoc';
export type SharedServiceCategory =
  | 'Messaging' | 'Database' | 'Observability' | 'Identity' | 'Cache' | 'Other';

export interface MemberSpec {
  type: MemberTypeKind;
  value: string;
  description?: string;
  dc_id?: string;
}

export interface PortBinding {
  port_id?: string | null;
  protocol?: 'TCP' | 'UDP' | 'ICMP' | null;
  port?: number | null;
  label?: string;
}

export interface AppPresence {
  app_distributed_id: string;
  dc_id: string;
  dc_type?: 'NGDC' | 'Legacy';
  environment: Environment;
  nh_id: string;
  sz_code: string;
  has_ingress: boolean;
  egress_members?: MemberSpec[];
  ingress_members?: MemberSpec[];
  /** Listener/ingress ports exposed by this presence. Surfaced as
   *  defaults in the rule builder's Port Picker when this app is
   *  chosen as the destination. */
  ingress_ports?: PortBinding[];
}

export interface ClassifyResult {
  matched: boolean;
  dc: string;
  nh: string;
  sz: string;
  cidr: string;
  reason: string;
  ip?: string;
}

export interface OccupantApp {
  app_distributed_id: string;
  dc_id: string;
  environment: Environment;
  nh_id: string;
  sz_code: string;
  has_ingress: boolean;
  egress_count: number;
  ingress_count: number;
  egress_group: string;
  ingress_group?: string;
}

export interface OccupantSharedService {
  service_id: string;
  dc_id: string;
  environment: Environment;
  nh_id: string;
  sz_code: string;
  member_count: number;
  group: string;
}

export interface OccupantsResponse {
  filter: { dc: string; nh: string; sz: string; environment: string };
  applications: OccupantApp[];
  shared_services: OccupantSharedService[];
  total: number;
}

export interface IngestMembersResult {
  app_distributed_id: string;
  environment: Environment;
  classified: Array<{
    kind: string; value: string;
    dc: string; nh: string; sz: string; cidr: string;
  }>;
  unclassified: Array<{ kind: string; value: string; reason: string }>;
  presences: AppPresence[];
}

export interface SharedServicePresence {
  service_id: string;
  dc_id: string;
  dc_type?: 'NGDC' | 'Legacy';
  environment: Environment;
  nh_id: string;
  sz_code: string;
  members: MemberSpec[];
}

export interface SharedService {
  service_id: string;
  name: string;
  category: SharedServiceCategory;
  owner?: string;
  /** Owning team. SNS sees everything; other teams see only their own. */
  owner_team?: string;
  description?: string;
  icon?: string;
  color?: string;
  environments: Environment[];
  tags?: string[];
  /** Mandatory primary DC. Rule Builder pins the destination to this DC. */
  primary_dc?: string;
  deployment_mode?: 'all_ngdc' | 'selective' | 'all_ngdc_with_exceptions';
  excluded_dcs?: string[];
  /** Port-catalog IDs treated as defaults for this service. */
  standard_ports?: string[];
  /** Service-specific custom ports that don't belong in the shared library. */
  additional_ports?: PortBinding[];
  /** Tier definition. Auto-fans into all NGDC DCs when deployment_mode='all_ngdc'. */
  tiers?: TierSpec[];
  /** Heritage tiers — one per Heritage DC. Materialises into flat
   * (no NH/SZ) presences with `grp-<SVC>-HERITAGE-<DC>` groups. */
  heritage_tiers?: HeritageTierSpec[];
  created_at?: string;
  updated_at?: string;
}

export interface PhysicalRuleExpansion {
  rule_id?: string;
  request_id?: string;
  src_dc: string;
  dst_dc: string;
  src_group_ref: string;
  dst_group_ref: string;
  src_nh?: string;
  src_sz?: string;
  dst_nh?: string;
  dst_sz?: string;
  ports: string;
  action: string;
  environment: Environment;
  cross_dc?: boolean;
  policy_result?: PolicyResult | null;
  compiled_text?: string | null;
  lifecycle_status?: string;
  /** True when the side has no NH/SZ and the DC is a Heritage DC.
   * Surfaces in the UI so the rule preview shows
   * `grp-<APP>-HERITAGE-<DC>` / VRF=`HERITAGE-<DC>` instead of the
   * NGDC convention. */
  src_is_heritage?: boolean;
  dst_is_heritage?: boolean;
  /** Zone-scoped CIDR expansion. Populated by the backend when the
   * source SZ is one of the shared/zone-scoped zones (GEN/STD/Shared/
   * UGen/USTD): the rule's "true" source IP space is the SZ's
   * registered CIDRs, not the per-app egress IPs. */
  src_cidrs?: string[];
  dst_cidrs?: string[];
  vrf?: string;
}

export interface DedupMatch {
  rule_id: string;
  verdict: 'identical' | 'subset' | 'overlap' | 'conflict' | 'none';
  src_group: string;
  dst_group: string;
  existing_ports: string;
  existing_action: string;
  lifecycle_status: string;
  /** 'name' = src/dst group names match exactly; 'member' = the IP/CIDR
   * of the requested rule is contained in some existing group's members
   * even though the group names differ. */
  match_kind?: 'name' | 'member';
  /** When match_kind=='member', which existing group's members
   * contained the requested src/dst. */
  via_src_group?: string;
  via_dst_group?: string;
  /** IP/CIDR containment relation of new vs existing src/dst members. */
  src_relation?: 'exact' | 'subset' | 'superset' | 'overlap' | 'disjoint';
  dst_relation?: 'exact' | 'subset' | 'superset' | 'overlap' | 'disjoint';
}

export interface DedupResult {
  verdict: 'identical' | 'subset' | 'overlap' | 'conflict' | 'ok';
  block: boolean;
  matches: DedupMatch[];
}

export interface BirthrightMatch {
  birthright_id: string;
  destination_ref: string;
  ports: string;
  description?: string;
}

export interface BirthrightResult {
  covered: boolean;
  matches: BirthrightMatch[];
}

export interface RuleRequestRecord {
  request_id: string | null;
  application_ref: string;
  source_kind?: 'app' | 'shared_service';
  source_ref?: string;
  destination_kind: DestinationEntityKind;
  destination_ref?: string | null;
  environment: Environment;
  ports: string;
  action: string;
  description?: string;
  owner?: string;
  owner_team?: string;
  status: string;
  expansion: PhysicalRuleExpansion[];
  warnings?: string[];
  created_at?: string;
  updated_at?: string;
  // Submit hard-block fields
  block_submit?: boolean;
  validation_message?: string;
  dedup?: DedupResult;
  birthright?: BirthrightResult;
  // ITSM / external ticket plumbing
  external_system?: string | null;
  external_connector_id?: string | null;
  external_ticket_id?: string | null;
  external_ticket_url?: string | null;
  external_status?: string | null;
  external_last_synced_at?: string | null;
}

export interface RuleExpansionPreview {
  physical_rules: PhysicalRuleExpansion[];
  warnings: string[];
  dedup?: DedupResult;
  birthright?: BirthrightResult;
  block_submit?: boolean;
}

export interface ItsmConnector {
  connector_id?: string;
  kind: 'servicenow' | 'generic_rest' | 'internal';
  name?: string;
  endpoint_url: string;
  auth_mode?: 'api_key' | 'basic' | 'oauth2' | 'vault' | 'none';
  auth_user?: string;
  auth_secret?: string;
  vault_path?: string;
  payload_template?: Record<string, unknown>;
  status_mapping?: Record<string, string>;
  auto_submit_on_approval?: boolean;
}

export interface BirthrightRule {
  birthright_id?: string;
  scope_dc?: string;
  scope_nh?: string;
  scope_sz?: string;
  destination_kind: 'shared_service' | 'app_ingress';
  destination_ref: string;
  ports: string;
  description?: string;
}

export interface DeploymentArtifactsBundle {
  manifest: Record<string, unknown> & {
    request_id: string;
    rules: Array<Record<string, unknown>>;
    groups: Array<Record<string, unknown>>;
    dc_id?: string | null;
    dcs_touched?: string[];
  };
  xlsx_sheets: Record<string, string[][]>;
  vendor_configs: Record<string, string>;
  vendor_configs_json?: Record<string, Record<string, unknown>>;
}

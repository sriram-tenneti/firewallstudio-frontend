import { useState, useEffect } from 'react';
import { Modal } from '../shared/Modal';
import { getGroups, createGroup, addGroupMember, removeGroupMember, getAppDCMappings, getAffectedRules, submitGroupPolicyChanges } from '@/lib/api';
import type { FirewallGroup, GroupMember } from '@/types';
import { autoPrefix, isNgdcGroupName } from '@/lib/utils';

interface GroupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  appId?: string;
  applications?: { app_id: string; app_distributed_id?: string; name: string }[];
  environment?: string;
  /**
   * When true the modal is a *listing only* — no Create / Add-member /
   * Remove / Submit-policy controls. Eliminates the redundancy between
   * Studio's "App Groups" view and the Group Change Request flow:
   * mutations only happen via Group Change Requests, this surface just
   * shows what's currently materialised. Default false to preserve the
   * Migration Studio create-during-rename flow that pre-dates this.
   */
  readOnly?: boolean;
}

export function GroupManagerModal({ isOpen, onClose, appId, applications = [], environment, readOnly = false }: GroupManagerModalProps) {
  const [groups, setGroups] = useState<FirewallGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<FirewallGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterAppId, setFilterAppId] = useState(appId || '');
  const [filterEnv, setFilterEnv] = useState(environment || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [newGroup, setNewGroup] = useState({ app_id: appId || '', dc: '', nh: '', sz: '', subtype: '', customSuffix: '', description: '', environment: environment || 'Production', direction: 'egress' as 'egress' | 'ingress' });
  const [createValidationError, setCreateValidationError] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ type: 'ip' as GroupMember['type'], value: '', description: '' });

  // Policy change tracking — when group members change, affected rules need review
  const [affectedRulesCount, setAffectedRulesCount] = useState(0);
  const [pendingChanges, setPendingChanges] = useState<{ type: string; detail: string; delta?: Record<string, unknown> }[]>([]);
  const [submittingPolicy, setSubmittingPolicy] = useState(false);
  const [policySubmitResult, setPolicySubmitResult] = useState<string | null>(null);

  // Compile group as device policy (like rule compile)
  const [compileVendor, setCompileVendor] = useState('palo_alto');
  const [compiledPolicy, setCompiledPolicy] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [copiedPolicy, setCopiedPolicy] = useState(false);

  // Inline members for group creation (Issue #5)
  const [createMembers, setCreateMembers] = useState<{ type: GroupMember['type']; value: string; description: string }[]>([]);
  const [createMemberType, setCreateMemberType] = useState<GroupMember['type']>('ip');
  const [createMemberValue, setCreateMemberValue] = useState('');
  const [createMemberDesc, setCreateMemberDesc] = useState('');

  // App DC mappings for auto-populating NH/SZ dropdowns
  const [allAppDCMappings, setAllAppDCMappings] = useState<Record<string, unknown>[]>([]);
  const [appNHOptions, setAppNHOptions] = useState<string[]>([]);
  const [appSZOptions, setAppSZOptions] = useState<string[]>([]);
  const [appDCOptions, setAppDCOptions] = useState<string[]>([]);
  const [appComponentOptions, setAppComponentOptions] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFilterAppId(appId || '');
      setFilterEnv(environment || '');
      loadGroups(appId || '', environment || '');
      loadAppDCMappings();
    }
  }, [isOpen, appId, environment]);

  const loadAppDCMappings = async () => {
    try {
      const mappings = await getAppDCMappings();
      setAllAppDCMappings(mappings);
      // If we have an initial app, populate its options
      if (appId) updateAppOptions(appId, mappings);
    } catch { /* ignore */ }
  };

  // Resolve app_distributed_id or app_id to matching app_dc_mappings rows
  const getAppMappings = (selectedAppId: string, mappings?: Record<string, unknown>[]) => {
    const source = mappings || allAppDCMappings;
    const resolvedAppId = (() => {
      const app = applications.find(a => (a.app_distributed_id || a.app_id) === selectedAppId);
      return app ? app.app_id : selectedAppId;
    })();
    return source.filter(m => {
      const mDistId = String(m.app_distributed_id || '');
      const mAppId = String(m.app_id || '');
      return mDistId === selectedAppId || mAppId === selectedAppId || mAppId === resolvedAppId || mDistId === resolvedAppId;
    });
  };

  const updateAppOptions = (selectedAppId: string, mappings?: Record<string, unknown>[]) => {
    const appMappings = getAppMappings(selectedAppId, mappings);
    const dcs = [...new Set(appMappings.map(m => String(m.dc || '')).filter(Boolean))].sort();
    // In egress/ingress model, components are only relevant for ingress (destination) groups
    const comps = [...new Set(appMappings.map(m => String(m.component || '')).filter(Boolean))].sort();
    // Show all NHs/SZs for the app (no component filtering for egress)
    const nhs = [...new Set(appMappings.map(m => String(m.nh || '')).filter(Boolean))].sort();
    const szs = [...new Set(appMappings.map(m => String(m.sz || '')).filter(Boolean))].sort();
    setAppNHOptions(nhs);
    setAppSZOptions(szs);
    setAppDCOptions(dcs);
    setAppComponentOptions(comps);
    // Reset downstream selections
    setNewGroup(prev => ({
      ...prev,
      app_id: selectedAppId,
      subtype: '',
      nh: nhs.length === 1 ? nhs[0] : '',
      sz: szs.length === 1 ? szs[0] : '',
      direction: 'egress',
    }));
  };

  // When component changes, filter NH and SZ options based on that app+component
  const _updateForComponent = (component: string): void => {
    if (!component || !newGroup.app_id) {
      // No component selected — show all NHs/SZs for the app
      const appMappings = getAppMappings(newGroup.app_id);
      const nhs = [...new Set(appMappings.map(m => String(m.nh || '')).filter(Boolean))].sort();
      const szs = [...new Set(appMappings.map(m => String(m.sz || '')).filter(Boolean))].sort();
      setAppNHOptions(nhs);
      setAppSZOptions(szs);
      setNewGroup(prev => ({ ...prev, subtype: '', nh: '', sz: '' }));
      return;
    }
    const appMappings = getAppMappings(newGroup.app_id);
    const compMappings = appMappings.filter(m => String(m.component || '') === component);
    const nhs = [...new Set(compMappings.map(m => String(m.nh || '')).filter(Boolean))].sort();
    const szs = [...new Set(compMappings.map(m => String(m.sz || '')).filter(Boolean))].sort();
    setAppNHOptions(nhs);
    setAppSZOptions(szs);
    // Auto-select NH/SZ if only one option
    setNewGroup(prev => ({
      ...prev,
      subtype: component,
      nh: nhs.length === 1 ? nhs[0] : '',
      sz: szs.length === 1 ? szs[0] : '',
    }));
  };

  void _updateForComponent;

  const loadGroups = async (forAppId?: string, forEnv?: string) => {
    setLoading(true);
    try {
      const data = await getGroups(forAppId || undefined);
      // Client-side environment filter since backend groups may have environment field
      const filtered = forEnv ? data.filter(g => {
        const gEnv = (g as unknown as Record<string, string>).environment;
        return !gEnv || gEnv === forEnv;
      }) : data;
      // Deduplicate by composite (name, dc_id, environment) so per-DC
      // group instances stay distinguishable. The same logical name lives
      // as one record per NGDC DC (DC-local members only) and we want
      // every instance visible in the listing.
      const seen = new Set<string>();
      const deduped = filtered.filter(g => {
        const raw = g as unknown as Record<string, unknown>;
        const dcId = String(raw.dc_id ?? '');
        const env = String(raw.environment ?? '');
        const key = `${g.name}|${dcId}|${env}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setGroups(deduped);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleAppFilterChange = (newAppId: string) => {
    setFilterAppId(newAppId);
    setSelectedGroup(null);
    loadGroups(newAppId, filterEnv);
    setNewGroup(prev => ({ ...prev, app_id: newAppId }));
    // Also update NH/SZ options when filter app changes
    if (newAppId) updateAppOptions(newAppId);
  };

  const handleEnvFilterChange = (newEnv: string) => {
    setFilterEnv(newEnv);
    setSelectedGroup(null);
    loadGroups(filterAppId, newEnv);
    setNewGroup(prev => ({ ...prev, environment: newEnv || 'Production' }));
  };

  // Search across name / app_id / description / members / dc_id.
  // Every field is coerced to a safe lower-cased string before
  // matching so a missing description or app_id on a per-DC group
  // instance can no longer throw and blank the whole modal.
  const filteredGroups = groups.filter(g => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const raw = g as unknown as Record<string, unknown>;
    const safe = (v: unknown) => String(v ?? '').toLowerCase();
    if (safe(g.name).includes(q)) return true;
    if (safe(g.app_id).includes(q)) return true;
    if (safe(g.description).includes(q)) return true;
    if (safe(raw.dc_id).includes(q)) return true;
    if (safe(raw.environment).includes(q)) return true;
    if ((g.members || []).some((m) => safe(m?.value).includes(q))) return true;
    return false;
  });

  const handleAddCreateMember = () => {
    if (!createMemberValue.trim()) return;
    const prefixed = autoPrefix(createMemberValue.trim(), createMemberType);
    setCreateMembers(prev => [...prev, { type: createMemberType, value: prefixed, description: createMemberDesc }]);
    setCreateMemberValue('');
    setCreateMemberDesc('');
  };

  const handleRemoveCreateMember = (idx: number) => {
    setCreateMembers(prev => prev.filter((_, i) => i !== idx));
  };

  // Auto-generate group name based on direction:
  // Egress (source): grp-{APP}-{NH}-{SZ}
  // Ingress (destination): grp-{APP}-{NH}-{SZ}-{COMP}-Ingress
  const autoGroupName = (() => {
    if (!newGroup.app_id || !newGroup.nh || !newGroup.sz) return '';
    if (newGroup.direction === 'egress') {
      // Source group: grp-{APP}-{NH}-{SZ}
      return `grp-${newGroup.app_id}-${newGroup.nh}-${newGroup.sz}`;
    } else {
      // Destination group: grp-{APP}-{NH}-{SZ}-{COMP}-Ingress
      if (!newGroup.subtype) return '';
      let name = `grp-${newGroup.app_id}-${newGroup.nh}-${newGroup.sz}-${newGroup.subtype}-Ingress`;
      if (newGroup.customSuffix.trim()) name = `grp-${newGroup.app_id}-${newGroup.nh}-${newGroup.sz}-${newGroup.subtype}-${newGroup.customSuffix.trim()}-Ingress`;
      return name;
    }
  })();

  // Validation: all required fields + at least 1 member
  // Egress: app + nh + sz + members
  // Ingress: app + nh + sz + component + members
  const canCreateGroup = (() => {
    if (!newGroup.app_id || !newGroup.nh || !newGroup.sz || createMembers.length === 0 || !autoGroupName) return false;
    if (newGroup.direction === 'ingress' && !newGroup.subtype) return false;
    return true;
  })();

  const handleCreateGroup = async () => {
    if (!newGroup.app_id) { setCreateValidationError('Application is required'); return; }
    if (!newGroup.nh) { setCreateValidationError('Neighbourhood (NH) is required'); return; }
    if (!newGroup.sz) { setCreateValidationError('Security Zone (SZ) is required'); return; }
    if (newGroup.direction === 'ingress' && !newGroup.subtype) { setCreateValidationError('Component is required for Ingress (destination) groups'); return; }
    if (createMembers.length === 0) { setCreateValidationError('At least one member (IP/subnet/group) is required — empty groups are not allowed'); return; }
    setCreateValidationError(null);
    try {
      const prefixedGroup = {
        ...newGroup,
        name: autoGroupName,
        members: createMembers.map(m => ({ type: m.type, value: m.value, description: m.description })),
      };
      await createGroup(prefixedGroup);
      // Track group creation as a policy change — new group affects any rule referencing it
      setPendingChanges(prev => [...prev, { type: 'group_created', detail: `Created group ${autoGroupName} with ${createMembers.length} member(s)` }]);
      setShowCreate(false);
      setNewGroup({ app_id: filterAppId || '', dc: '', nh: '', sz: '', subtype: '', customSuffix: '', description: '', environment: filterEnv || 'Production', direction: 'egress' });
      setCreateMembers([]);
      setCreateValidationError(null);
      loadGroups(filterAppId, filterEnv);
    } catch { setCreateValidationError('Failed to create group — check for duplicates'); }
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !newMember.value) return;
    try {
      const prefixedMember = { ...newMember, value: autoPrefix(newMember.value, newMember.type) };
      // Per-DC architecture: each NGDC DC carries its own copy of the
      // logical group with DC-local members only. Pass dc_id so the
      // addition lands on this DC's instance, not the first match.
      const dcId = (selectedGroup as unknown as Record<string, string>).dc_id || undefined;
      const updated = await addGroupMember(selectedGroup.name, prefixedMember, dcId);
      setSelectedGroup(updated);
      setNewMember({ type: 'ip', value: '', description: '' });
      loadGroups();
      // Track this as a pending policy change
      const delta = { added: { [`group:${selectedGroup.name}@${dcId || '*'}`]: [prefixedMember.value] }, removed: {}, changed: {} };
      setPendingChanges(prev => [...prev, { type: 'member_added', detail: `Added ${prefixedMember.value} to ${selectedGroup.name} @ ${dcId || 'all DCs'}`, delta }]);
      // Check affected rules count
      try { const res = await getAffectedRules(selectedGroup.name); setAffectedRulesCount(res.affected_rules); } catch { /* ignore */ }
    } catch { /* ignore */ }
  };

  const handleRemoveMember = async (memberValue: string) => {
    if (!selectedGroup) return;
    try {
      const dcId = (selectedGroup as unknown as Record<string, string>).dc_id || undefined;
      const updated = await removeGroupMember(selectedGroup.name, memberValue, dcId);
      setSelectedGroup(updated);
      loadGroups();
      // Track this as a pending policy change
      const dcId2 = (selectedGroup as unknown as Record<string, string>).dc_id || undefined;
      const delta = { added: {}, removed: { [`group:${selectedGroup.name}@${dcId2 || '*'}`]: [memberValue] }, changed: {} };
      setPendingChanges(prev => [...prev, { type: 'member_removed', detail: `Removed ${memberValue} from ${selectedGroup.name} @ ${dcId2 || 'all DCs'}`, delta }]);
      // Check affected rules count
      try { const res = await getAffectedRules(selectedGroup.name); setAffectedRulesCount(res.affected_rules); } catch { /* ignore */ }
    } catch { /* ignore */ }
  };

  const handleSubmitPolicyChanges = async () => {
    if (!selectedGroup || pendingChanges.length === 0) return;
    setSubmittingPolicy(true);
    try {
      // Merge all pending deltas
      const mergedDelta: Record<string, unknown> = { added: {} as Record<string, string[]>, removed: {} as Record<string, string[]>, changed: {} };
      for (const pc of pendingChanges) {
        if (pc.delta) {
          const d = pc.delta as { added?: Record<string, string[]>; removed?: Record<string, string[]> };
          for (const [k, v] of Object.entries(d.added || {})) {
            (mergedDelta.added as Record<string, string[]>)[k] = [...((mergedDelta.added as Record<string, string[]>)[k] || []), ...v];
          }
          for (const [k, v] of Object.entries(d.removed || {})) {
            (mergedDelta.removed as Record<string, string[]>)[k] = [...((mergedDelta.removed as Record<string, string[]>)[k] || []), ...v];
          }
        }
      }
      const changeDetails = pendingChanges.map(c => c.detail).join('; ');
      const result = await submitGroupPolicyChanges(selectedGroup.name, 'group_member_change', changeDetails, mergedDelta);
      setPolicySubmitResult(`Submitted ${result.affected_rules} rule(s) for policy review`);
      setPendingChanges([]);
      setAffectedRulesCount(0);
    } catch {
      setPolicySubmitResult('Failed to submit policy changes');
    } finally {
      setSubmittingPolicy(false);
      setTimeout(() => setPolicySubmitResult(null), 5000);
    }
  };

  // Classify group as NGDC or Legacy based on naming standard: grp-{APP}-{NH}-{SZ}-{Component}
  const classifyGroup = (g: FirewallGroup): 'NGDC' | 'Legacy' | 'Unknown' => {
    const name = g.name || '';
    if (isNgdcGroupName(name) && g.nh && g.sz && g.subtype) return 'NGDC';
    // Legacy groups often come from imports without structured naming
    if ((g as unknown as Record<string, unknown>).type === 'migration' || !g.nh || !g.sz) return 'Legacy';
    return isNgdcGroupName(name) ? 'NGDC' : 'Legacy';
  };

  // Compile group as vendor-specific device policy (like rule compile)
  const generateGroupPolicy = (group: FirewallGroup, vendor: string): string => {
    const members = (group.members || []);
    const ips = members.filter(m => m.type === 'ip').map(m => m.value);
    const subnets = members.filter(m => m.type === 'subnet' || m.type === 'cidr').map(m => m.value);
    const ranges = members.filter(m => m.type === 'range').map(m => m.value);
    const nestedGroups = members.filter(m => m.type === 'group').map(m => m.value);

    switch (vendor) {
      case 'palo_alto': {
        let policy = `# Palo Alto PAN-OS Address Group Configuration\n`;
        policy += `# Group: ${group.name}\n`;
        policy += `# Generated: ${new Date().toISOString()}\n\n`;
        // Individual address objects
        for (const ip of ips) {
          policy += `set address ${ip.replace(/\./g, '_')} ip-netmask ${ip}/32\n`;
        }
        for (const subnet of subnets) {
          const objName = subnet.replace(/[\/\.]/g, '_');
          policy += `set address ${objName} ip-netmask ${subnet}\n`;
        }
        for (const range of ranges) {
          const objName = range.replace(/[\.\-]/g, '_');
          policy += `set address ${objName} ip-range ${range}\n`;
        }
        policy += `\n# Address Group\n`;
        const allMembers = [
          ...ips.map(ip => ip.replace(/\./g, '_')),
          ...subnets.map(s => s.replace(/[\/\.]/g, '_')),
          ...ranges.map(r => r.replace(/[\.\-]/g, '_')),
          ...nestedGroups,
        ];
        policy += `set address-group ${group.name} static [ ${allMembers.join(' ')} ]\n`;
        if (group.description) {
          policy += `set address-group ${group.name} description "${group.description}"\n`;
        }
        return policy;
      }
      case 'checkpoint': {
        let policy = `# Check Point SmartConsole CLI (mgmt_cli) Configuration\n`;
        policy += `# Group: ${group.name}\n`;
        policy += `# Generated: ${new Date().toISOString()}\n\n`;
        for (const ip of ips) {
          policy += `mgmt_cli add host name "${ip}" ip-address "${ip}"\n`;
        }
        for (const subnet of subnets) {
          const [net, mask] = subnet.split('/');
          policy += `mgmt_cli add network name "${subnet.replace(/[\/\.]/g, '_')}" subnet "${net}" mask-length "${mask}"\n`;
        }
        for (const range of ranges) {
          const [start, end] = range.split('-');
          policy += `mgmt_cli add address-range name "${range.replace(/[\.\-]/g, '_')}" ip-address-first "${start}" ip-address-last "${end}"\n`;
        }
        policy += `\nmgmt_cli add group name "${group.name}"\n`;
        for (const ip of ips) {
          policy += `mgmt_cli set group name "${group.name}" members.add "${ip}"\n`;
        }
        for (const subnet of subnets) {
          policy += `mgmt_cli set group name "${group.name}" members.add "${subnet.replace(/[\/\.]/g, '_')}"\n`;
        }
        for (const range of ranges) {
          policy += `mgmt_cli set group name "${group.name}" members.add "${range.replace(/[\.\-]/g, '_')}"\n`;
        }
        for (const ng of nestedGroups) {
          policy += `mgmt_cli set group name "${group.name}" members.add "${ng}"\n`;
        }
        policy += `\nmgmt_cli publish\n`;
        return policy;
      }
      case 'fortigate': {
        let policy = `# FortiGate CLI Configuration\n`;
        policy += `# Group: ${group.name}\n`;
        policy += `# Generated: ${new Date().toISOString()}\n\n`;
        for (const ip of ips) {
          policy += `config firewall address\n  edit "${ip}"\n    set type ipmask\n    set subnet ${ip}/32\n  next\nend\n\n`;
        }
        for (const subnet of subnets) {
          const objName = subnet.replace(/[\/\.]/g, '_');
          policy += `config firewall address\n  edit "${objName}"\n    set type ipmask\n    set subnet ${subnet}\n  next\nend\n\n`;
        }
        for (const range of ranges) {
          const [start, end] = range.split('-');
          const objName = range.replace(/[\.\-]/g, '_');
          policy += `config firewall address\n  edit "${objName}"\n    set type iprange\n    set start-ip ${start}\n    set end-ip ${end}\n  next\nend\n\n`;
        }
        policy += `config firewall addrgrp\n  edit "${group.name}"\n`;
        const fgMembers = [
          ...ips,
          ...subnets.map(s => s.replace(/[\/\.]/g, '_')),
          ...ranges.map(r => r.replace(/[\.\-]/g, '_')),
          ...nestedGroups,
        ];
        policy += `    set member ${fgMembers.map(m => `"${m}"`).join(' ')}\n`;
        if (group.description) {
          policy += `    set comment "${group.description}"\n`;
        }
        policy += `  next\nend\n`;
        return policy;
      }
      default: {
        let policy = `# Generic Firewall Group Configuration\n`;
        policy += `# Group: ${group.name}\n`;
        policy += `# App: ${group.app_id} | NH: ${group.nh} | SZ: ${group.sz} | Component: ${group.subtype}\n`;
        policy += `# Description: ${group.description || 'N/A'}\n`;
        policy += `# Generated: ${new Date().toISOString()}\n`;
        policy += `# Members: ${members.length}\n\n`;
        policy += `GROUP_NAME=${group.name}\n`;
        policy += `GROUP_TYPE=address-group\n\n`;
        policy += `# Member Objects\n`;
        for (const m of members) {
          policy += `MEMBER type=${m.type} value=${m.value}${m.description ? ` desc="${m.description}"` : ''}\n`;
        }
        if (nestedGroups.length > 0) {
          policy += `\n# Nested Groups\n`;
          for (const ng of nestedGroups) {
            policy += `NESTED_GROUP=${ng}\n`;
          }
        }
        return policy;
      }
    }
  };

  const handleCompileGroup = () => {
    if (!selectedGroup) return;
    setCompiling(true);
    setCopiedPolicy(false);
    // Simulate compilation delay for UX
    setTimeout(() => {
      const policy = generateGroupPolicy(selectedGroup, compileVendor);
      setCompiledPolicy(policy);
      setCompiling(false);
    }, 300);
  };

  const handleCopyPolicy = async () => {
    if (!compiledPolicy) return;
    try {
      await navigator.clipboard.writeText(compiledPolicy);
      setCopiedPolicy(true);
      setTimeout(() => setCopiedPolicy(false), 3000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = compiledPolicy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedPolicy(true);
      setTimeout(() => setCopiedPolicy(false), 3000);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Group Management" subtitle={[filterEnv, filterAppId].filter(Boolean).join(' | ') || 'All Environments & Applications'} size="xl">
      <div className="flex gap-4 min-h-[400px]">
        {/* Left panel - Group list */}
        <div className="w-1/3 border-r pr-4">
          {/* Environment filter */}
          <div className="mb-2">
            <select
              value={filterEnv}
              onChange={e => handleEnvFilterChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Environments</option>
              <option value="Production">Production</option>
              <option value="Non-Production">Non-Production</option>
              <option value="Pre-Production">Pre-Production</option>
            </select>
          </div>
          {/* App Distributed Id filter */}
          <div className="mb-3">
            <select
              value={filterAppId}
              onChange={e => handleAppFilterChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Applications</option>
              {applications.map(app => (
                <option key={app.app_distributed_id || app.app_id} value={app.app_distributed_id || app.app_id}>{app.app_distributed_id || app.app_id}</option>
              ))}
            </select>
          </div>
          {/* Search within groups */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search groups, IPs, subnets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-between mb-3">
            {(() => {
              // Group identity is per-(name, dc_id, environment) — one
              // logical name materialises as N per-DC instances. Show
              // both numbers so the badge reconciles with the App
              // Groups badge in App Management (which also counts
              // every per-DC instance) and the operator can tell at a
              // glance whether a difference is real or just per-DC
              // expansion.
              const logical = new Set(filteredGroups.map(g => g.name)).size;
              const instances = filteredGroups.length;
              const diff = instances !== logical;
              return (
                <h3 className="text-sm font-semibold text-gray-700" title="Logical groups × per-DC instances. Both surfaces (App Groups badge + this listing) count instances so they align.">
                  Groups ({instances}{diff ? ` instances · ${logical} logical` : ''})
                </h3>
              );
            })()}
            {!readOnly && (
              <button onClick={() => setShowCreate(!showCreate)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                {showCreate ? 'Cancel' : '+ New'}
              </button>
            )}
          </div>

          {readOnly && (
            <div className="mb-3 p-2 rounded border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
              <strong>Read-only.</strong> Group Management is viewable here. To create or modify a group, raise a <em>Group Change Request</em> from the Studio &mdash; it goes through the same Pending &rarr; Approved &rarr; Deployed lifecycle as a rule.
            </div>
          )}

          {!readOnly && showCreate && (
            <div className="mb-3 p-3 bg-blue-50 rounded-lg space-y-2">
              {/* Standards notice */}
              <div className="p-2 bg-blue-100 border border-blue-200 rounded text-[10px] text-blue-800">
                <strong>NGDC Naming Standard:</strong>
                {newGroup.direction === 'egress'
                  ? <> Source group: <span className="font-mono">grp-{'{APP}'}-{'{NH}'}-{'{SZ}'}</span>. One per app per NH/SZ.</>
                  : <> Destination group: <span className="font-mono">grp-{'{APP}'}-{'{NH}'}-{'{SZ}'}-{'{COMP}'}-Ingress</span>. Only for apps with incoming clients.</>
                }
                <br />At least one member is required.
              </div>
              {/* Direction selector (Egress/Ingress) */}
              <div className="flex gap-2 mb-1">
                <button
                  onClick={() => setNewGroup({ ...newGroup, direction: 'egress', subtype: '', customSuffix: '' })}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    newGroup.direction === 'egress' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Egress (Source)
                </button>
                <button
                  onClick={() => setNewGroup({ ...newGroup, direction: 'ingress' })}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    newGroup.direction === 'ingress' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Ingress (Destination)
                </button>
              </div>
              <div>
                <label className="text-xs text-gray-500">Application <span className="text-red-500">*</span></label>
                <select className={inputClass} value={newGroup.app_id} onChange={e => { setNewGroup({ ...newGroup, app_id: e.target.value, dc: '', nh: '', sz: '', subtype: '', customSuffix: '' }); updateAppOptions(e.target.value); setCreateValidationError(null); }}>
                  <option value="">-- Select Application --</option>
                  {applications.map(app => (
                    <option key={app.app_distributed_id || app.app_id} value={app.app_distributed_id || app.app_id}>{app.app_distributed_id || app.app_id}</option>
                  ))}
                </select>
                {newGroup.app_id && appDCOptions.length > 0 && (
                  <p className="text-[9px] text-gray-500 mt-0.5">DCs: {appDCOptions.join(', ')} (group applies to all mapped DCs)</p>
                )}
              </div>
              <div className={`grid ${newGroup.direction === 'ingress' ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                <div>
                  <label className="text-xs text-gray-500">NH <span className="text-red-500">*</span></label>
                  <select className={inputClass} value={newGroup.nh} onChange={e => { setNewGroup({ ...newGroup, nh: e.target.value }); setCreateValidationError(null); }} disabled={!newGroup.app_id}>
                    <option value="">-- Select NH --</option>
                    {appNHOptions.map(nh => <option key={nh} value={nh}>{nh}</option>)}
                  </select>
                  {!newGroup.app_id && <p className="text-[9px] text-gray-400 mt-0.5">Select an app first</p>}
                  {newGroup.app_id && appNHOptions.length === 0 && <p className="text-[9px] text-amber-600 mt-0.5">No NHs mapped</p>}
                </div>
                <div>
                  <label className="text-xs text-gray-500">SZ <span className="text-red-500">*</span></label>
                  <select className={inputClass} value={newGroup.sz} onChange={e => { setNewGroup({ ...newGroup, sz: e.target.value }); setCreateValidationError(null); }} disabled={!newGroup.app_id}>
                    <option value="">-- Select SZ --</option>
                    {appSZOptions.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                  </select>
                  {!newGroup.app_id && <p className="text-[9px] text-gray-400 mt-0.5">Select an app first</p>}
                  {newGroup.app_id && appSZOptions.length === 0 && <p className="text-[9px] text-amber-600 mt-0.5">No SZs mapped</p>}
                </div>
                {newGroup.direction === 'ingress' && (
                  <div>
                    <label className="text-xs text-gray-500">Component <span className="text-red-500">*</span></label>
                    <select className={inputClass} value={newGroup.subtype} onChange={e => { setNewGroup({ ...newGroup, subtype: e.target.value }); setCreateValidationError(null); }} disabled={!newGroup.app_id}>
                      <option value="">-- Select Component --</option>
                      {appComponentOptions.length > 0
                        ? appComponentOptions.map(c => <option key={c} value={c}>{c}</option>)
                        : ['DB','API','VIP','APP','WEB','MQ'].map(c => <option key={c} value={c}>{c}</option>)
                      }
                    </select>
                    <p className="text-[9px] text-gray-400 mt-0.5">Ingress component (DB, API, VIP, etc.)</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {newGroup.direction === 'ingress' && (
                  <div>
                    <label className="text-xs text-gray-500">Custom Suffix <span className="text-gray-400">(optional)</span></label>
                    <input className={inputClass} placeholder="e.g. primary, cluster01" value={newGroup.customSuffix} onChange={e => setNewGroup({ ...newGroup, customSuffix: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} />
                    <p className="text-[9px] text-gray-400 mt-0.5">Additional differentiation before -Ingress</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500">Environment</label>
                  <select className={inputClass} value={newGroup.environment} onChange={e => setNewGroup({ ...newGroup, environment: e.target.value })}>
                    <option value="Production">Production</option>
                    <option value="Non-Production">Non-Production</option>
                    <option value="Pre-Production">Pre-Production</option>
                  </select>
                </div>
              </div>
              {/* Auto-generated group name preview */}
              <div className={`rounded px-2 py-1.5 text-xs font-mono ${autoGroupName ? (newGroup.direction === 'egress' ? 'bg-blue-50 border border-blue-200 text-blue-800' : 'bg-purple-50 border border-purple-200 text-purple-800') : 'bg-gray-100 border border-gray-200 text-gray-400'}`}>
                {autoGroupName || (newGroup.direction === 'egress' ? 'grp-{APP}-{NH}-{SZ} — select app, NH, and SZ' : 'grp-{APP}-{NH}-{SZ}-{COMP}-Ingress — select all required fields')}
              </div>
              <input className={inputClass} placeholder="Description" value={newGroup.description} onChange={e => setNewGroup({ ...newGroup, description: e.target.value })} />
              {/* Inline member creation during group creation — REQUIRED */}
              <div className={`border rounded-md p-2 ${createMembers.length === 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                <div className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1">
                  <span className={createMembers.length === 0 ? 'text-red-600' : 'text-gray-500'}>Members <span className="text-red-500">*</span> (at least 1 required)</span>
                  {createMembers.length > 0 && <span className="text-green-600">({createMembers.length} added)</span>}
                </div>
                {createMembers.length > 0 && (
                  <div className="space-y-1 mb-2 max-h-24 overflow-y-auto">
                    {createMembers.map((m, i) => (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs">
                        <span className={`px-1 py-0.5 text-[9px] font-bold uppercase rounded ${
                          m.type === 'ip' ? 'bg-blue-100 text-blue-700' :
                          m.type === 'cidr' ? 'bg-green-100 text-green-700' :
                          m.type === 'range' ? 'bg-amber-100 text-amber-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>{m.type}</span>
                        <span className="flex-1 font-mono text-gray-700 truncate">{m.value}</span>
                        <button onClick={() => handleRemoveCreateMember(i)} className="text-red-500 hover:text-red-700 text-[10px] font-medium">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1">
                  <select className="px-1.5 py-1 border border-gray-300 rounded text-[10px]" value={createMemberType} onChange={e => setCreateMemberType(e.target.value as GroupMember['type'])}>
                    <option value="ip">IP</option>
                    <option value="cidr">CIDR</option>
                    <option value="range">Range</option>
                    <option value="group">Group</option>
                  </select>
                  <input className="flex-1 px-1.5 py-1 border border-gray-300 rounded text-[10px]" placeholder={createMemberType === 'cidr' ? '10.0.1.0/24' : createMemberType === 'range' ? '10.0.1.1-10.0.1.50' : createMemberType === 'group' ? 'grp-name' : '10.0.1.1'} value={createMemberValue} onChange={e => setCreateMemberValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddCreateMember(); }} />
                  <input className="w-20 px-1.5 py-1 border border-gray-300 rounded text-[10px]" placeholder="Desc" value={createMemberDesc} onChange={e => setCreateMemberDesc(e.target.value)} />
                  <button onClick={handleAddCreateMember} disabled={!createMemberValue.trim()} className="px-2 py-1 text-[10px] font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap">+</button>
                </div>
              </div>
              {createValidationError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-700 font-medium">
                  {createValidationError}
                </div>
              )}
              <button onClick={handleCreateGroup} disabled={!canCreateGroup} className={`w-full px-3 py-1.5 text-xs font-medium text-white rounded-md ${canCreateGroup ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}>
                {canCreateGroup ? `Create Group "${autoGroupName}" with ${createMembers.length} member${createMembers.length > 1 ? 's' : ''}` : 'Complete all required fields & add members'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {filteredGroups.map(g => {
                // Group identity is per-DC: same logical name materialises
                // as one record per NGDC DC (DC-local members only).
                // Compose a stable key + selection check so each DC's
                // instance is addressable independently in the UI.
                const dcId = (g as unknown as Record<string, string>).dc_id || '';
                const compositeKey = `${g.name}__${dcId}`;
                const selDcId = (selectedGroup as unknown as Record<string, string> | null)?.dc_id || '';
                const isSelected = selectedGroup?.name === g.name && selDcId === dcId;
                const memberCount = g.members?.length || 0;
                return (
                <button
                  key={compositeKey}
                  onClick={() => setSelectedGroup(g)}
                  className={`w-full text-left p-2 rounded-md text-xs transition-colors ${
                    isSelected ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium truncate">{g.name}</span>
                    {dcId && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-slate-100 text-slate-700 border border-slate-200">{dcId}</span>
                    )}
                    {(() => {
                      const cls = classifyGroup(g);
                      return cls === 'NGDC'
                        ? <span className="flex-shrink-0 px-1 py-0.5 text-[8px] font-bold uppercase rounded bg-blue-100 text-blue-700">NGDC</span>
                        : cls === 'Legacy'
                        ? <span className="flex-shrink-0 px-1 py-0.5 text-[8px] font-bold uppercase rounded bg-amber-100 text-amber-700">Legacy</span>
                        : null;
                    })()}
                    {(g as unknown as Record<string, unknown>).type === 'migration' && (
                      <span className="flex-shrink-0 px-1 py-0.5 text-[8px] font-bold uppercase rounded bg-emerald-100 text-emerald-700">migrated</span>
                    )}
                  </div>
                  <div className="text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className={memberCount === 0 ? 'text-rose-600 font-medium' : ''}>
                      {memberCount} member{memberCount === 1 ? '' : 's'}
                      {memberCount === 0 && ' — empty (no egress IPs for this DC)'}
                    </span>
                    {g.nh && <span className="text-gray-400">NH: {g.nh}</span>}
                    {g.sz && <span className="text-gray-400">SZ: {g.sz}</span>}
                  </div>
                </button>
                );
              })}
              {groups.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No groups found</p>}
            </div>
          )}
        </div>

        {/* Right panel - Group details */}
        <div className="flex-1 pl-2">
          {selectedGroup ? (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-800">{selectedGroup.name}</h3>
                  {(() => {
                    const cls = classifyGroup(selectedGroup);
                    return cls === 'NGDC'
                      ? <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-blue-100 text-blue-700">NGDC</span>
                      : cls === 'Legacy'
                      ? <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-100 text-amber-700">Legacy</span>
                      : null;
                  })()}
                </div>
                <p className="text-xs text-gray-500 mt-1">{selectedGroup.description}</p>
                <div className="flex gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                  <span>App: {selectedGroup.app_id}</span>
                  {(() => {
                    const dcId = (selectedGroup as unknown as Record<string, string>).dc_id
                      || (selectedGroup as unknown as Record<string, string>).dc;
                    return dcId ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-100 text-slate-700 border border-slate-200">DC: {dcId}</span>
                    ) : null;
                  })()}
                  <span>NH: {selectedGroup.nh}</span>
                  <span>SZ: {selectedGroup.sz}</span>
                  <span>Component: {selectedGroup.subtype}</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500 italic">
                  Members shown below are <strong>only the IPs that will deploy to a device in this DC</strong>. The same logical group has a separate instance per NGDC DC, each with that DC's egress IPs only.
                </p>
              </div>

              {/* Add member form */}
              {!readOnly && (
                <div className="flex gap-2 mb-3">
                  <select className="px-2 py-1.5 border border-gray-300 rounded-md text-xs" value={newMember.type} onChange={e => setNewMember({ ...newMember, type: e.target.value as GroupMember['type'] })}>
                    <option value="ip">IP Address</option>
                    <option value="cidr">Subnet (CIDR)</option>
                    <option value="range">IP Range</option>
                    <option value="group">Nested Group</option>
                  </select>
                  <input className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs" placeholder={newMember.type === 'cidr' ? '10.0.1.0/24' : newMember.type === 'range' ? '10.0.1.1-10.0.1.50' : '10.0.1.1'} value={newMember.value} onChange={e => setNewMember({ ...newMember, value: e.target.value })} />
                  <input className="w-32 px-2 py-1.5 border border-gray-300 rounded-md text-xs" placeholder="Description" value={newMember.description} onChange={e => setNewMember({ ...newMember, description: e.target.value })} />
                  <button onClick={handleAddMember} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 whitespace-nowrap">Add</button>
                </div>
              )}

              {/* Members list */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Value</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Description</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(selectedGroup.members || []).map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                            m.type === 'ip' ? 'bg-blue-100 text-blue-700' :
                            m.type === 'cidr' ? 'bg-green-100 text-green-700' :
                            m.type === 'range' ? 'bg-amber-100 text-amber-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {m.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono">{m.value}</td>
                        <td className="px-3 py-2 text-gray-500">{m.description}</td>
                        <td className="px-3 py-2 text-right">
                          {readOnly ? (
                            <span className="text-[10px] text-gray-400 italic">view-only</span>
                          ) : (
                            <button onClick={() => handleRemoveMember(m.value)} className="text-red-500 hover:text-red-700 font-medium">Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!selectedGroup.members || selectedGroup.members.length === 0) && (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No members in this group</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              Select a group to view and manage its members
            </div>
          )}
        </div>
      </div>

      {/* Policy change notification bar */}
      {!readOnly && pendingChanges.length > 0 && affectedRulesCount > 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-800">
                {pendingChanges.length} group change(s) affect {affectedRulesCount} rule(s)
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Submit for policy review to ensure affected rules are reviewed, approved, and compiled.
              </p>
              <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                {pendingChanges.map((pc, i) => <li key={i}>{pc.detail}</li>)}
              </ul>
            </div>
            <button
              onClick={handleSubmitPolicyChanges}
              disabled={submittingPolicy}
              className="px-4 py-2 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap ml-4"
            >
              {submittingPolicy ? 'Submitting...' : 'Submit for Policy Review'}
            </button>
          </div>
        </div>
      )}
      {policySubmitResult && (
        <div className={`mt-2 p-2 rounded text-xs font-medium ${policySubmitResult.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {policySubmitResult}
        </div>
      )}

      {/* Compile group as device policy */}
      {selectedGroup && (
        <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold text-indigo-800">Compile Group Policy</p>
              <p className="text-xs text-indigo-600 mt-0.5">Generate device-specific policy for <span className="font-mono font-semibold">{selectedGroup.name}</span></p>
            </div>
            <div className="flex items-center gap-2">
              <select value={compileVendor} onChange={e => { setCompileVendor(e.target.value); setCompiledPolicy(null); setCopiedPolicy(false); }} className="px-2 py-1 text-xs border border-indigo-300 rounded-md bg-white">
                <option value="palo_alto">Palo Alto PAN-OS</option>
                <option value="checkpoint">Check Point SmartConsole</option>
                <option value="fortigate">FortiGate CLI</option>
                <option value="generic">Generic</option>
              </select>
              <button
                onClick={handleCompileGroup}
                disabled={compiling}
                className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {compiling ? 'Compiling...' : 'Compile'}
              </button>
            </div>
          </div>
          {compiledPolicy && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-indigo-700 uppercase">
                  {compileVendor === 'palo_alto' ? 'PAN-OS' : compileVendor === 'checkpoint' ? 'SmartConsole CLI' : compileVendor === 'fortigate' ? 'FortiGate CLI' : 'Generic'} Output
                </span>
                <button
                  onClick={handleCopyPolicy}
                  className={`px-3 py-1 text-[10px] font-medium rounded-md border transition-colors ${
                    copiedPolicy
                      ? 'bg-green-100 text-green-700 border-green-300'
                      : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                  }`}
                >
                  {copiedPolicy ? 'Copied!' : 'Copy to Clipboard'}
                </button>
              </div>
              <pre className="bg-gray-900 text-green-400 text-[11px] font-mono p-3 rounded-md overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre leading-relaxed">
                {compiledPolicy}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end mt-4 pt-4 border-t">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Close</button>
      </div>
    </Modal>
  );
}

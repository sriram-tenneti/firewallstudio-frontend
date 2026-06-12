import { useState, useEffect, useCallback } from 'react';
import { DataTable } from '@/components/shared/DataTable';
import { Tabs } from '@/components/shared/Tabs';
import { Notification } from '@/components/shared/Notification';
import { Modal } from '@/components/shared/Modal';
import { useNotification } from '@/hooks/useNotification';
import { useModal } from '@/hooks/useModal';
import { getLegacyRules, createRuleModification, compileLegacyRule, getGroups, getApplications, isHideSeedEnabled, submitGroupPolicyChanges, bulkUpdateLegacyRuleAppId } from '@/lib/api';
import { autoCreateLegacyGroupsFromRules } from '@/lib/legacyGroupAutoCreate';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { GroupManagerModal } from '@/components/design-studio/GroupManagerModal';
import type { LegacyRule, CompiledRule, RuleDelta, FirewallGroup, Application } from '@/types';
import { autoPrefix } from '@/lib/utils';
import { detectEntryType, parseToResourceEntries, parseExpandedToDisplayLines } from '@/lib/nestingParser';
import type { ResourceEntry } from '@/lib/nestingParser';
import type { Column } from '@/components/shared/DataTable';

interface ModifyState {
  rule_source: string;
  rule_destination: string;
  rule_service: string;
  rule_source_expanded: string;
  rule_destination_expanded: string;
  rule_service_expanded: string;
  rule_source_zone: string;
  rule_destination_zone: string;
  rule_action: string;
}

function DeltaView({ delta }: { delta: RuleDelta }) {
  const hasAdded = Object.keys(delta.added).length > 0;
  const hasRemoved = Object.keys(delta.removed).length > 0;
  const hasChanged = Object.keys(delta.changed).length > 0;
  if (!hasAdded && !hasRemoved && !hasChanged) {
    return <p className="text-sm text-gray-500 italic">No changes detected</p>;
  }
  return (
    <div className="space-y-3">
      {hasAdded && (
        <div>
          <h4 className="text-xs font-semibold text-green-700 mb-1">Added</h4>
          {Object.entries(delta.added).map(([field, values]) => (
            <div key={field} className="ml-2">
              <span className="text-xs text-gray-500">{field.replace(/rule_/g, '').replace(/_/g, ' ')}:</span>
              {values.map((v, i) => (
                <div key={i} className="text-xs text-green-700 font-mono ml-2">+ {v}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      {hasRemoved && (
        <div>
          <h4 className="text-xs font-semibold text-red-700 mb-1">Removed</h4>
          {Object.entries(delta.removed).map(([field, values]) => (
            <div key={field} className="ml-2">
              <span className="text-xs text-gray-500">{field.replace(/rule_/g, '').replace(/_/g, ' ')}:</span>
              {values.map((v, i) => (
                <div key={i} className="text-xs text-red-700 font-mono ml-2">- {v}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      {hasChanged && (
        <div>
          <h4 className="text-xs font-semibold text-blue-700 mb-1">Changed</h4>
          {Object.entries(delta.changed).map(([field, change]) => (
            <div key={field} className="ml-2 text-xs">
              <span className="text-gray-500">{field.replace(/rule_/g, '').replace(/_/g, ' ')}:</span>
              <span className="text-red-600 line-through ml-1">{change.from}</span>
              <span className="mx-1">{'->'}</span>
              <span className="text-green-600">{change.to}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function computeLocalDelta(original: ModifyState, modified: ModifyState): RuleDelta {
  const delta: RuleDelta = { added: {}, removed: {}, changed: {} };
  const fields = Object.keys(original) as (keyof ModifyState)[];
  for (const field of fields) {
    const origVal = (original[field] || '').trim();
    const modVal = (modified[field] || '').trim();
    if (origVal === modVal) continue;
    if (origVal.includes('\n') || modVal.includes('\n')) {
      const origLines = new Set(origVal.split('\n').map(l => l.trim()).filter(Boolean));
      const modLines = new Set(modVal.split('\n').map(l => l.trim()).filter(Boolean));
      const added = [...modLines].filter(l => !origLines.has(l));
      const removed = [...origLines].filter(l => !modLines.has(l));
      if (added.length) delta.added[field] = added;
      if (removed.length) delta.removed[field] = removed;
    } else {
      delta.changed[field] = { from: origVal, to: modVal };
    }
  }
  return delta;
}

// Types and parser functions imported from shared nestingParser module.
// Local interfaces removed — use the shared GroupMemberEntry / ResourceEntry.

// parseToResourceEntries is now imported from @/lib/nestingParser

function entriesToRaw(entries: ResourceEntry[]): string {
  return entries.map(e => e.value).join('\n');
}

/** Display-friendly member type label */
function memberTypeLabel(t: string): string {
  if (t === 'cidr' || t === 'subnet') return 'NET';
  if (t === 'range') return 'RNG';
  if (t === 'ip') return 'IP';
  if (t === 'group') return 'GRP';
  return t.toUpperCase();
}

function memberTypeColor(t: string): string {
  if (t === 'cidr' || t === 'subnet') return 'bg-purple-100 text-purple-700';
  if (t === 'range') return 'bg-orange-100 text-orange-700';
  if (t === 'group') return 'bg-emerald-100 text-emerald-700';
  return 'bg-blue-100 text-blue-700';
}

let _nextId = 1;

function ResourceEditor({ label, entries, onChange, appGroups, colorScheme }: {
  label: string;
  entries: ResourceEntry[];
  onChange: (entries: ResourceEntry[]) => void;
  appGroups: FirewallGroup[];
  colorScheme: { bg: string; border: string; text: string; headerBg: string };
}) {
  const [addType, setAddType] = useState<'ip' | 'subnet' | 'range' | 'group'>('ip');
  const [addValue, setAddValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // All groups auto-expand on load to show IPs/subnets
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Group member editing
  const [addingMemberToGroup, setAddingMemberToGroup] = useState<string | null>(null);
  const [newMemberType, setNewMemberType] = useState<string>('ip');
  const [newMemberValue, setNewMemberValue] = useState('');
  // Nested sub-group member editing
  const [addingMemberToSubGroup, setAddingMemberToSubGroup] = useState<string | null>(null); // "entryId:memberIdx"
  const [subMemberType, setSubMemberType] = useState<string>('ip');
  const [subMemberValue, setSubMemberValue] = useState('');
  // Add child group to parent group
  const [addingChildGroupTo, setAddingChildGroupTo] = useState<string | null>(null);
  const [childGroupName, setChildGroupName] = useState('');
  // New group wizard
  const [showNewGroupWizard, setShowNewGroupWizard] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<{type: string; value: string}[]>([]);
  const [wizMemberType, setWizMemberType] = useState('ip');
  const [wizMemberValue, setWizMemberValue] = useState('');

  const allGroupNames = new Set(appGroups.map(g => g.name));

  const handleAdd = () => {
    if (!addValue.trim()) return;
    const prefixed = autoPrefix(addValue.trim(), addType);
    if (addType === 'group') {
      // For groups, check if it matches an existing group (try both raw and prefixed)
      const matched = appGroups.find(g => g.name === prefixed || g.name === addValue.trim());
      if (matched) {
        if (entries.some(e => e.value === matched.name)) return;
        onChange([...entries, {
          id: `new-${_nextId++}`,
          type: 'group',
          value: matched.name,
          groupMembers: matched.members.map(m => ({ type: m.type, value: m.value })),
          isNew: true,
        }]);
        setAddValue('');
      } else {
        // Open the new group wizard so user can add members
        setNewGroupName(prefixed);
        setNewGroupMembers([]);
        setShowNewGroupWizard(true);
        setAddValue('');
      }
      return;
    }
    onChange([...entries, {
      id: `new-${_nextId++}`,
      type: addType,
      value: prefixed,
      isNew: true,
    }]);
    setAddValue('');
  };

  const handleDelete = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry?.type === 'group' && entry.groupMembers && entry.groupMembers.length > 0) {
      // Group removal cascades — removing group also removes its members from the entries list
      // (members are stored inline, so just removing the group entry is sufficient)
    }
    onChange(entries.filter(e => e.id !== id));
  };

  const handleSaveEdit = (id: string) => {
    if (!editValue.trim()) return;
    const detectedType = detectEntryType(editValue.trim(), allGroupNames);
    const prefixed = autoPrefix(editValue.trim(), detectedType);
    onChange(entries.map(e => e.id === id ? { ...e, value: prefixed, type: detectedType, isModified: true } : e));
    setEditingId(null);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedGroups(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const handleAddGroupMember = (entryId: string) => {
    if (!newMemberValue.trim()) return;
    const memberPrefixed = autoPrefix(newMemberValue.trim(), newMemberType as 'ip' | 'subnet' | 'cidr' | 'group' | 'range');
    if (newMemberType === 'group') {
      // When adding a group as member, check if it exists in appGroups
      const matched = appGroups.find(g => g.name === memberPrefixed || g.name === newMemberValue.trim());
      const children = matched
        ? matched.members.map(m => ({ type: m.type, value: m.value }))
        : []; // Empty children — user will add via sub-group UI
      onChange(entries.map(e => {
        if (e.id !== entryId) return e;
        const members = [...(e.groupMembers || []), { type: 'group', value: matched?.name || memberPrefixed, children }];
        return { ...e, groupMembers: members, isModified: true };
      }));
    } else {
      onChange(entries.map(e => {
        if (e.id !== entryId) return e;
        const members = [...(e.groupMembers || []), { type: newMemberType, value: memberPrefixed }];
        return { ...e, groupMembers: members, isModified: true };
      }));
    }
    setNewMemberValue('');
  };

  const handleRemoveGroupMember = (entryId: string, memberIdx: number) => {
    onChange(entries.map(e => {
      if (e.id !== entryId) return e;
      const members = (e.groupMembers || []).filter((_, i) => i !== memberIdx);
      return { ...e, groupMembers: members, isModified: true };
    }));
  };

  // Add a member to a nested sub-group
  const handleAddSubGroupMember = (entryId: string, memberIdx: number) => {
    if (!subMemberValue.trim()) return;
    const memberPrefixed = autoPrefix(subMemberValue.trim(), subMemberType as 'ip' | 'subnet' | 'cidr' | 'group' | 'range');
    onChange(entries.map(e => {
      if (e.id !== entryId) return e;
      const members = (e.groupMembers || []).map((m, i) => {
        if (i !== memberIdx) return m;
        const children = [...(m.children || []), { type: subMemberType, value: memberPrefixed }];
        return { ...m, children };
      });
      return { ...e, groupMembers: members, isModified: true };
    }));
    setSubMemberValue('');
  };

  // Remove a member from a nested sub-group
  const handleRemoveSubGroupMember = (entryId: string, memberIdx: number, childIdx: number) => {
    onChange(entries.map(e => {
      if (e.id !== entryId) return e;
      const members = (e.groupMembers || []).map((m, i) => {
        if (i !== memberIdx) return m;
        const children = (m.children || []).filter((_, ci) => ci !== childIdx);
        return { ...m, children };
      });
      return { ...e, groupMembers: members, isModified: true };
    }));
  };

  // Add a child group (sub-group) as a member of a parent group
  const handleAddChildGroup = (entryId: string) => {
    if (!childGroupName.trim()) return;
    const grpName = autoPrefix(childGroupName.trim(), 'group');
    onChange(entries.map(e => {
      if (e.id !== entryId) return e;
      const members = [...(e.groupMembers || []), { type: 'group', value: grpName, children: [] }];
      return { ...e, groupMembers: members, isModified: true };
    }));
    setChildGroupName('');
    setAddingChildGroupTo(null);
  };

  const handleCreateNewGroup = () => {
    if (!newGroupName.trim() || newGroupMembers.length === 0) return;
    const grpName = autoPrefix(newGroupName.trim(), 'group');
    onChange([...entries, {
      id: `new-${_nextId++}`,
      type: 'group',
      value: grpName,
      groupMembers: [...newGroupMembers],
      isNew: true,
    }]);
    setShowNewGroupWizard(false);
    setNewGroupName('');
    setNewGroupMembers([]);
  };

  const handleWizAddMember = () => {
    if (!wizMemberValue.trim()) return;
    const memberPrefixed = autoPrefix(wizMemberValue.trim(), wizMemberType as 'ip' | 'subnet' | 'cidr' | 'group' | 'range');
    setNewGroupMembers(prev => [...prev, { type: wizMemberType, value: memberPrefixed }]);
    setWizMemberValue('');
  };

  const typeColors: Record<string, string> = {
    ip: 'bg-blue-50 text-blue-700 border-blue-200',
    subnet: 'bg-purple-50 text-purple-700 border-purple-200',
    range: 'bg-orange-50 text-orange-700 border-orange-200',
    group: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  const typeLabels: Record<string, string> = {
    ip: 'IP',
    subnet: 'NET',
    range: 'RNG',
    group: 'GRP',
  };

  const totalIPs = entries.reduce((sum, e) => {
    if (e.type === 'group') {
      let count = 0;
      for (const m of (e.groupMembers || [])) {
        if (m.type === 'group' && m.children) count += m.children.length;
        else count += 1;
      }
      return sum + count;
    }
    return sum + 1;
  }, 0);

  return (
    <div className={`border ${colorScheme.border} rounded-lg overflow-hidden`}>
      <div className={`px-4 py-3 ${colorScheme.headerBg} border-b ${colorScheme.border} flex items-center justify-between`}>
        <h3 className={`text-sm font-semibold ${colorScheme.text}`}>{label}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{entries.length} entries</span>
          <span className="text-xs text-gray-400">|</span>
          <span className="text-xs text-gray-500">{totalIPs} total IPs/subnets</span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {/* Entry List */}
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {entries.length === 0 && <p className="text-xs text-gray-400 italic py-3 text-center">No entries. Add IPs, subnets, or groups below.</p>}
          {entries.map(entry => (
            <div key={entry.id}>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${entry.isNew ? 'bg-green-50 border-green-200' : entry.isModified ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded border ${typeColors[entry.type]}`}>{typeLabels[entry.type]}</span>
                {editingId === entry.id ? (
                  <div className="flex-1 flex gap-1.5">
                    <input type="text" className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(entry.id); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                    <button onClick={() => handleSaveEdit(entry.id)} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-mono text-gray-800">{entry.value}</span>
                    {entry.isNew && <span className="text-[10px] text-green-600 font-medium">NEW</span>}
                    {entry.isModified && <span className="text-[10px] text-amber-600 font-medium">MODIFIED</span>}
                    {entry.type === 'group' && (
                      <button onClick={() => toggleCollapse(entry.id)} className="px-2 py-0.5 text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                        {collapsedGroups.has(entry.id) ? `Show (${(entry.groupMembers || []).length} members)` : 'Hide'}
                      </button>
                    )}
                    <button onClick={() => { setEditingId(entry.id); setEditValue(entry.value); }} className="px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded">Edit</button>
                    <button onClick={() => handleDelete(entry.id)} className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded">Del</button>
                  </>
                )}
              </div>
              {/* Group members — shown by default (auto-expanded), hidden when user collapses */}
              {entry.type === 'group' && !collapsedGroups.has(entry.id) && (
                <div className="ml-6 mt-1 mb-2 border-l-2 border-emerald-200 pl-3 space-y-1">
                  {(entry.groupMembers || []).length === 0 && <p className="text-[10px] text-amber-600 italic py-1">No IPs/subnets configured for this group. Add members below.</p>}
                  {(entry.groupMembers || []).map((m, mi) => (
                    <div key={mi}>
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded text-xs">
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${memberTypeColor(m.type)}`}>{memberTypeLabel(m.type)}</span>
                        <span className="font-mono flex-1 text-gray-800">{m.value}</span>
                        {m.type === 'group' && m.children && <span className="text-[10px] text-gray-400">{m.children.length} member{m.children.length !== 1 ? 's' : ''}</span>}
                        <button onClick={() => handleRemoveGroupMember(entry.id, mi)} className="text-red-500 hover:text-red-700 text-[10px] font-medium">Remove</button>
                      </div>
                      {/* Render nested sub-group children */}
                      {m.type === 'group' && (
                        <div className="ml-5 mt-0.5 mb-1 border-l-2 border-teal-200 pl-3 space-y-0.5">
                          {(m.children || []).length === 0 && <p className="text-[10px] text-amber-600 italic py-0.5">No members in this sub-group. Add members below.</p>}
                          {(m.children || []).map((cm, ci) => (
                            <div key={ci} className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded text-xs">
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${memberTypeColor(cm.type)}`}>{memberTypeLabel(cm.type)}</span>
                              <span className="font-mono flex-1 text-gray-700">{cm.value}</span>
                              <button onClick={() => handleRemoveSubGroupMember(entry.id, mi, ci)} className="text-red-500 hover:text-red-700 text-[10px] font-medium">Remove</button>
                            </div>
                          ))}
                          {/* Add member to sub-group */}
                          {addingMemberToSubGroup === `${entry.id}:${mi}` ? (
                            <div className="flex gap-1.5 items-center mt-1 bg-white border border-gray-200 rounded p-1.5">
                              <select value={subMemberType} onChange={e => setSubMemberType(e.target.value)} className="px-1 py-0.5 text-[10px] border border-gray-300 rounded">
                                <option value="ip">IP (svr-)</option>
                                <option value="subnet">Subnet (net-)</option>
                                <option value="range">Range (rng-)</option>
                                <option value="group">Group (grp-)</option>
                              </select>
                              <input type="text" value={subMemberValue} onChange={e => setSubMemberValue(e.target.value)} placeholder="10.0.1.5" className="flex-1 px-1.5 py-0.5 text-[10px] font-mono border border-gray-300 rounded" onKeyDown={e => { if (e.key === 'Enter') handleAddSubGroupMember(entry.id, mi); }} />
                              <button onClick={() => handleAddSubGroupMember(entry.id, mi)} disabled={!subMemberValue.trim()} className="px-1.5 py-0.5 text-[10px] font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:bg-gray-300">Add</button>
                              <button onClick={() => setAddingMemberToSubGroup(null)} className="text-[10px] text-gray-500 hover:text-gray-700">Done</button>
                            </div>
                          ) : (
                            <button onClick={() => { setAddingMemberToSubGroup(`${entry.id}:${mi}`); setSubMemberType('ip'); setSubMemberValue(''); }} className="text-[10px] text-teal-600 hover:text-teal-800 font-medium mt-0.5 flex items-center gap-1">
                              <span>+</span> Add member to {m.value}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Always show add-member form for groups */}
                  {addingMemberToGroup === entry.id ? (
                    <div className="flex gap-1.5 items-center mt-1 bg-white border border-gray-200 rounded p-2">
                      <select value={newMemberType} onChange={e => setNewMemberType(e.target.value)} className="px-1.5 py-1 text-xs border border-gray-300 rounded">
                        <option value="ip">IP (svr-)</option>
                        <option value="subnet">Subnet (net-)</option>
                        <option value="range">Range (rng-)</option>
                        <option value="group">Group (grp-)</option>
                      </select>
                      <input type="text" value={newMemberValue} onChange={e => setNewMemberValue(e.target.value)} placeholder={newMemberType === 'ip' ? '10.0.1.5' : newMemberType === 'subnet' ? '10.0.1.0/24' : newMemberType === 'range' ? '10.0.1.1-10.0.1.50' : 'grp-APP-NH-SZ-comp'} className="flex-1 px-2 py-1 text-xs font-mono border border-gray-300 rounded" onKeyDown={e => { if (e.key === 'Enter') handleAddGroupMember(entry.id); }} />
                      <button onClick={() => handleAddGroupMember(entry.id)} disabled={!newMemberValue.trim()} className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:bg-gray-300">Add</button>
                      <button onClick={() => setAddingMemberToGroup(null)} className="text-xs text-gray-500 hover:text-gray-700">Done</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 mt-1">
                      <button onClick={() => { setAddingMemberToGroup(entry.id); setNewMemberType('ip'); setNewMemberValue(''); }} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1">
                        <span>+</span> Add Member (IP / Subnet / Range / Group)
                      </button>
                      {addingChildGroupTo === entry.id ? (
                        <div className="flex gap-1.5 items-center bg-white border border-emerald-200 rounded p-1.5">
                          <input type="text" value={childGroupName} onChange={e => setChildGroupName(e.target.value)} placeholder="Sub-group name" className="px-2 py-1 text-xs font-mono border border-gray-300 rounded w-40" onKeyDown={e => { if (e.key === 'Enter') handleAddChildGroup(entry.id); }} />
                          <button onClick={() => handleAddChildGroup(entry.id)} disabled={!childGroupName.trim()} className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:bg-gray-300">Add</button>
                          <button onClick={() => setAddingChildGroupTo(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingChildGroupTo(entry.id); setChildGroupName(''); }} className="text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1">
                          <span>+</span> Add Child Group
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new entry */}
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="flex gap-2">
            <select value={addType} onChange={e => setAddType(e.target.value as 'ip' | 'subnet' | 'range' | 'group')} className="px-2 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white">
              <option value="ip">IP Address (svr-)</option>
              <option value="subnet">Subnet (net-)</option>
              <option value="range">Range (rng-)</option>
              <option value="group">Group (grp-)</option>
            </select>
            <input type="text" placeholder={addType === 'ip' ? 'e.g. 10.0.1.5' : addType === 'subnet' ? 'e.g. 10.0.1.0/24' : addType === 'range' ? 'e.g. 10.0.1.1-10.0.1.50' : 'e.g. grp-APP01-NH01-STD-web'} value={addValue} onChange={e => setAddValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500" />
            <button onClick={handleAdd} disabled={!addValue.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">+ Add</button>
          </div>
          {/* "Choose from existing groups" dropdown removed — in Firewall Management context,
              NGDC groups should not be offered as selections since this module manages
              existing legacy rules, not NGDC migration targets. Users should type group
              names manually following the naming standard (grp-APP-COMPONENT-NH-SZ). */}
        </div>

        {/* New Group Wizard */}
        {showNewGroupWizard && (
          <div className="border-2 border-emerald-300 rounded-lg p-4 bg-emerald-50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-emerald-800">Create New Group</h4>
              <button onClick={() => setShowNewGroupWizard(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Group Name</label>
              <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-md" placeholder="grp-APP01-NH01-STD-web" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Group Members (IPs / Subnets / Ranges)</label>
              {newGroupMembers.length === 0 && <p className="text-xs text-amber-600 italic mb-2">Add at least one IP, subnet, or range to this group.</p>}
              {newGroupMembers.map((m, mi) => (
                <div key={mi} className="flex items-center gap-2 mb-1 px-2 py-1 bg-white rounded border border-gray-200">
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${memberTypeColor(m.type)}`}>{memberTypeLabel(m.type)}</span>
                  <span className="font-mono text-xs flex-1">{m.value}</span>
                  <button onClick={() => setNewGroupMembers(prev => prev.filter((_, i) => i !== mi))} className="text-red-500 text-[10px]">Remove</button>
                </div>
              ))}
              <div className="flex gap-1.5 items-center mt-2">
                <select value={wizMemberType} onChange={e => setWizMemberType(e.target.value)} className="px-1.5 py-1 text-xs border border-gray-300 rounded">
                  <option value="ip">IP (svr-)</option>
                  <option value="subnet">Subnet (net-)</option>
                  <option value="range">Range (rng-)</option>
                  <option value="group">Group (grp-)</option>
                </select>
                <input type="text" value={wizMemberValue} onChange={e => setWizMemberValue(e.target.value)} placeholder={wizMemberType === 'ip' ? '10.0.1.5' : wizMemberType === 'subnet' ? '10.0.1.0/24' : '10.0.1.1-10.0.1.50'} className="flex-1 px-2 py-1 text-xs font-mono border border-gray-300 rounded" onKeyDown={e => { if (e.key === 'Enter') handleWizAddMember(); }} />
                <button onClick={handleWizAddMember} disabled={!wizMemberValue.trim()} className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:bg-gray-300">Add</button>
              </div>
            </div>
            <button onClick={handleCreateNewGroup} disabled={!newGroupName.trim() || newGroupMembers.length === 0} className="w-full px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
              Create Group with {newGroupMembers.length} member{newGroupMembers.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FirewallManagementPage() {
  const [rules, setRules] = useState<LegacyRule[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [selectedEnv, setSelectedEnv] = useState<string>('');
  const [activeTab, setActiveTab] = useState('all');
  const [modifyViewMode, setModifyViewMode] = useState<'edit' | 'preview'>('edit');
  const [, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const { notification, showNotification, clearNotification } = useNotification();
  const detailModal = useModal<LegacyRule>();
  const [modifyRule, setModifyRule] = useState<LegacyRule | null>(null);
  const [modifyState, setModifyState] = useState<ModifyState | null>(null);
  const [originalState, setOriginalState] = useState<ModifyState | null>(null);
  const [modifyComments, setModifyComments] = useState('');
  // showDelta toggle removed - delta is always visible
  const [submitting, setSubmitting] = useState(false);
  const [compiledRule, setCompiledRule] = useState<CompiledRule | null>(null);
  const [compileVendor, setCompileVendor] = useState('generic');
  const [compiling, setCompiling] = useState(false);
  const [appGroups, setAppGroups] = useState<FirewallGroup[]>([]);
  const [showLegacyGroupsModal, setShowLegacyGroupsModal] = useState(false);
  const [allApplications, setAllApplications] = useState<Application[]>([]);
  const [autoGroupStatus, setAutoGroupStatus] = useState<{ groupsCreated: number; nestedGroupsCreated: number; membersAdded: number } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportApps, setSelectedExportApps] = useState<Set<string>>(new Set());
  // Resource-based modify state
  const [sourceEntries, setSourceEntries] = useState<ResourceEntry[]>([]);
  const [destEntries, setDestEntries] = useState<ResourceEntry[]>([]);
  const [serviceEntries, setServiceEntries] = useState<ResourceEntry[]>([]);
  // Advanced filter state
  const [advFilterSource, setAdvFilterSource] = useState('');
  const [advFilterDest, setAdvFilterDest] = useState('');
  const [advFilterGeneral, setAdvFilterGeneral] = useState('');
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  // Bulk update App Distributed ID state
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  const [showBulkUpdatePanel, setShowBulkUpdatePanel] = useState(false);
  const [bulkAppDistId, setBulkAppDistId] = useState('');
  const [bulkAppName, setBulkAppName] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [autoLookedUpName, setAutoLookedUpName] = useState('');
  // Issue 5: Missing details popup state
  const [showMissingDetailsPopup, setShowMissingDetailsPopup] = useState(false);
  const [missingExtraFields, setMissingExtraFields] = useState<Record<string, string>>({});
  const [pendingBulkResult, setPendingBulkResult] = useState<{ updated: number; fields_copied: string[] } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesData, appsData] = await Promise.all([
        getLegacyRules(selectedApp || undefined, true),
        getApplications(),
      ]);
      setRules(rulesData);
      setApplications(appsData);
      setAllApplications(appsData);
      // Auto-create Legacy Groups from imported rules (with members & nesting)
      // Runs in background — best-effort, won't block page load
      if (rulesData.length > 0) {
        autoCreateLegacyGroupsFromRules(rulesData).then(result => {
          if (result.groupsCreated > 0 || result.nestedGroupsCreated > 0) {
            setAutoGroupStatus({
              groupsCreated: result.groupsCreated,
              nestedGroupsCreated: result.nestedGroupsCreated,
              membersAdded: result.membersAdded,
            });
          }
        }).catch(() => { /* best-effort */ });
      }
    } catch {
      showNotification('Failed to load data', 'error');
    }
    setLoading(false);
  }, [selectedApp, showNotification]);

  useEffect(() => { loadData(); }, [loadData]);

  const envFilteredRules = rules.filter(r => {
    if (selectedEnv && (r as unknown as Record<string, string>).environment !== selectedEnv) return false;
    return true;
  });

  // Apply advanced filters on top of environment + tab filters
  const advFilteredRules = envFilteredRules.filter(r => {
    if (activeTab === 'non_standard' && r.is_standard) return false;
    if (activeTab === 'standard' && !r.is_standard) return false;
    const srcLower = advFilterSource.toLowerCase().trim();
    const dstLower = advFilterDest.toLowerCase().trim();
    const genLower = advFilterGeneral.toLowerCase().trim();
    if (srcLower) {
      const srcFields = [r.rule_source, r.rule_source_expanded, r.rule_source_zone].map(f => (f || '').toLowerCase());
      if (!srcFields.some(f => f.includes(srcLower))) return false;
    }
    if (dstLower) {
      const dstFields = [r.rule_destination, r.rule_destination_expanded, r.rule_destination_zone].map(f => (f || '').toLowerCase());
      if (!dstFields.some(f => f.includes(dstLower))) return false;
    }
    if (genLower) {
      const allFields = [
        r.id, String(r.app_id), r.app_distributed_id, r.app_name,
        r.rule_source, r.rule_source_expanded, r.rule_destination, r.rule_destination_expanded,
        r.rule_source_zone, r.rule_destination_zone, r.rule_service, r.inventory_item,
      ].map(f => (f || '').toLowerCase());
      if (!allFields.some(f => f.includes(genLower))) return false;
    }
    return true;
  });

  const filteredRules = advFilteredRules;

  // Auto-lookup app name when bulkAppDistId changes
  const handleBulkAppDistIdChange = (val: string) => {
    setBulkAppDistId(val);
    setAutoLookedUpName('');
    if (val.trim()) {
      const existing = rules.find(r => r.app_distributed_id === val.trim() && r.app_name);
      if (existing) {
        setAutoLookedUpName(existing.app_name || '');
        if (!bulkAppName) setBulkAppName(existing.app_name || '');
      }
    }
  };

  const handleBulkUpdate = async (extraFields?: Record<string, string>) => {
    if (!bulkAppDistId.trim() || selectedRuleIds.size === 0) return;
    setBulkUpdating(true);
    try {
      const result = await bulkUpdateLegacyRuleAppId(
        Array.from(selectedRuleIds), bulkAppDistId.trim(), bulkAppName.trim() || undefined, extraFields
      );
      // Issue 5: If app not found, show popup for missing details
      if (!result.app_found && !extraFields) {
        setPendingBulkResult({ updated: result.updated, fields_copied: result.fields_copied });
        setShowMissingDetailsPopup(true);
        setBulkUpdating(false);
        return;
      }
      const fieldsCopied = result.fields_copied.length > 0
        ? ` (also updated: ${result.fields_copied.join(', ')})`
        : '';
      showNotification(`Updated ${result.updated} rule(s) with App Distributed ID: ${bulkAppDistId}${fieldsCopied}`, 'success');
      setSelectedRuleIds(new Set());
      setBulkAppDistId('');
      setBulkAppName('');
      setAutoLookedUpName('');
      setShowBulkUpdatePanel(false);
      setShowMissingDetailsPopup(false);
      setMissingExtraFields({});
      setPendingBulkResult(null);
      loadData();
    } catch {
      showNotification('Failed to bulk update rules', 'error');
    }
    setBulkUpdating(false);
  };

  const handleMissingDetailsSubmit = () => {
    setShowMissingDetailsPopup(false);
    handleBulkUpdate(missingExtraFields);
  };

  const handleMissingDetailsSkip = () => {
    setShowMissingDetailsPopup(false);
    setMissingExtraFields({});
    setPendingBulkResult(null);
    if (pendingBulkResult && pendingBulkResult.updated > 0) {
      showNotification(`Updated ${pendingBulkResult.updated} rule(s) with App Distributed ID: ${bulkAppDistId}`, 'success');
      setSelectedRuleIds(new Set());
      setBulkAppDistId('');
      setBulkAppName('');
      setAutoLookedUpName('');
      setShowBulkUpdatePanel(false);
      loadData();
    }
  };

  const toggleSelectRule = (id: string) => {
    setSelectedRuleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (visibleIds?: string[]) => {
    // visibleIds comes from DataTable's internal search/filter — use it when available
    const ids = visibleIds || filteredRules.map(r => r.id);
    if (selectedRuleIds.size === ids.length && ids.every(id => selectedRuleIds.has(id))) {
      setSelectedRuleIds(new Set());
    } else {
      setSelectedRuleIds(new Set(ids));
    }
  };

  const standardCount = envFilteredRules.filter(r => r.is_standard).length;
  const nonStandardCount = envFilteredRules.filter(r => !r.is_standard).length;

  const appOptions = Array.from(new Set(rules.map(r => `${r.app_distributed_id || r.app_id}|${r.app_id}|${r.app_name}`))).map(key => {
    const [distId] = key.split('|');
    return { value: distId, label: distId };
  }).sort((a, b) => a.label.localeCompare(b.label));

  /** Use the same nesting parser for View and Modify so Source/Destination hierarchy is consistent everywhere. */
  const parseExpandedTree = (raw: string, expanded: string): { text: string; indent: number; type: 'group' | 'ip' | 'subnet' | 'range' }[] => {
    // Delegate to shared parser which already handles fallback to raw when expanded is empty
    return parseExpandedToDisplayLines(raw, expanded);
  };

  const openModifyModal = async (rule: LegacyRule) => {
    setModifyRule(rule);
    setModifyComments('');
    setCompiledRule(null);
    let groups: FirewallGroup[] = [];
    try {
      groups = await getGroups(String(rule.app_id));
      setAppGroups(groups);
    } catch {
      setAppGroups([]);
    }
    // Parse entries into resource model — use expanded text for hierarchical group→member structure
    const srcEntries = parseToResourceEntries(rule.rule_source || '', groups, rule.rule_source_expanded || '');
    const dstEntries = parseToResourceEntries(rule.rule_destination || '', groups, rule.rule_destination_expanded || '');
    const svcEntries = parseToResourceEntries(rule.rule_service || '', []);
    setSourceEntries(srcEntries);
    setDestEntries(dstEntries);
    setServiceEntries(svcEntries);
    // Build the baseline state from the parsed entries so roundtrip matches exactly (no false delta)
    const baselineState: ModifyState = {
      rule_source: entriesToRaw(srcEntries),
      rule_destination: entriesToRaw(dstEntries),
      rule_service: entriesToRaw(svcEntries),
      rule_source_expanded: buildExpandedText(srcEntries),
      rule_destination_expanded: buildExpandedText(dstEntries),
      rule_service_expanded: buildExpandedText(svcEntries),
      rule_source_zone: rule.rule_source_zone || '',
      rule_destination_zone: rule.rule_destination_zone || '',
      rule_action: rule.rule_action || '',
    };
    setModifyState({ ...baselineState });
    setOriginalState({ ...baselineState });
  };

  const closeModifyModal = () => {
    setModifyRule(null);
    setModifyState(null);
    setOriginalState(null);
    setAppGroups([]);
  };

  const handleModifyField = (field: keyof ModifyState, value: string) => {
    if (!modifyState) return;
    setModifyState({ ...modifyState, [field]: value });
  };

  /** Build expanded text from resource entries using plain indentation format.
   * This must match the original expanded text format so delta comparisons are consistent
   * between the Modify modal preview and the Review page. */
  const buildExpandedText = (entries: ResourceEntry[]): string => {
    const lines: string[] = [];
    for (const e of entries) {
      if (e.type === 'group') {
        lines.push(e.value);
        for (const m of (e.groupMembers || [])) {
          lines.push(`  ${m.value}`);
          // Emit nested sub-group children at deeper indent
          if (m.type === 'group' && m.children) {
            for (const cm of m.children) {
              lines.push(`    ${cm.value}`);
            }
          }
        }
      } else {
        lines.push(e.value);
      }
    }
    return lines.join('\n');
  };

  const handleSubmitModification = async () => {
    if (!modifyRule || !modifyState) return;
    setSubmitting(true);
    try {
      // Sync resource entries back to modifyState before submitting
      const finalState = {
        ...modifyState,
        rule_source: entriesToRaw(sourceEntries),
        rule_destination: entriesToRaw(destEntries),
        rule_service: entriesToRaw(serviceEntries),
        rule_source_expanded: buildExpandedText(sourceEntries),
        rule_destination_expanded: buildExpandedText(destEntries),
        rule_service_expanded: buildExpandedText(serviceEntries),
      };
      await createRuleModification(modifyRule.id, finalState as unknown as Record<string, string>, modifyComments);
      // If source or destination groups changed, also submit group policy change for Review & Approval
      if (originalState && (finalState.rule_source !== originalState.rule_source || finalState.rule_destination !== originalState.rule_destination)) {
        const groupDelta = {
          added: {} as Record<string, string[]>,
          removed: {} as Record<string, string[]>,
          changed: { source: finalState.rule_source !== originalState.rule_source ? { from: originalState.rule_source, to: finalState.rule_source } : undefined, destination: finalState.rule_destination !== originalState.rule_destination ? { from: originalState.rule_destination, to: finalState.rule_destination } : undefined },
        };
        const changeDetail = `Rule ${modifyRule.id} modified: source/destination group changes`;
        try {
          await submitGroupPolicyChanges(modifyRule.id, 'rule_group_modification', changeDetail, groupDelta);
        } catch { /* best-effort — rule modification itself already submitted */ }
      }
      showNotification('Modification submitted for review', 'success');
      closeModifyModal();
      loadData();
    } catch {
      showNotification('Failed to submit modification', 'error');
    }
    setSubmitting(false);
  };

  const handleCompile = async (ruleId: string) => {
    setCompiling(true);
    try {
      const result = await compileLegacyRule(ruleId, compileVendor);
      setCompiledRule(result);
    } catch {
      showNotification('Failed to compile rule', 'error');
    }
    setCompiling(false);
  };


  // Sync resource entries back to modifyState when entries change
  useEffect(() => {
    if (!modifyState) return;
    const newSource = entriesToRaw(sourceEntries);
    const newDest = entriesToRaw(destEntries);
    const newService = entriesToRaw(serviceEntries);
    if (newSource !== modifyState.rule_source || newDest !== modifyState.rule_destination || newService !== modifyState.rule_service) {
      setModifyState(prev => prev ? { ...prev, rule_source: newSource, rule_destination: newDest, rule_service: newService } : prev);
    }
  }, [sourceEntries, destEntries, serviceEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Multi-app export with selection
  const handleMultiAppExport = () => {
    if (selectedExportApps.size === 0) { showNotification('Select at least one app to export', 'error'); return; }
    const exportRules = envFilteredRules.filter(r => selectedExportApps.has(String(r.app_id)) || selectedExportApps.has(r.app_distributed_id || ''));
    if (exportRules.length === 0) {
      // Fallback: if no match by app_id/dist_id, export all env-filtered rules for selected apps
      exportRulesToCSV(envFilteredRules, Array.from(selectedExportApps).join('-'));
    } else {
      exportRulesToCSV(exportRules, Array.from(selectedExportApps).join('-'));
    }
    setShowExportModal(false);
  };

  // Format expanded column text: preserve hierarchy with indentation using parseExpandedToDisplayLines
  const formatExpandedForExport = (raw: string | undefined, expanded: string | undefined): string => {
    if (!expanded && !raw) return '';
    const lines = parseExpandedToDisplayLines(raw || '', expanded || '');
    if (lines.length === 0) return expanded || raw || '';
    return lines.map(l => {
      const indent = '  '.repeat(l.indent);
      const prefix = l.type === 'group' ? '[GRP] ' : '';
      return `${indent}${prefix}${l.text}`;
    }).join('\n');
  };

  const exportRulesToCSV = (exportRules: LegacyRule[], fileLabel: string) => {
    const headers = ['App ID', 'App Current Distributed ID', 'App Name', 'Inventory Item', 'Policy Name', 'Rule Global', 'Rule Action', 'Rule Source', 'Rule Source Expanded', 'Rule Source Zone', 'Rule Destination', 'Rule Destination Expanded', 'Rule Destination Zone', 'Rule Service', 'Rule Service Expanded', 'RN', 'RC'];
    const rows = exportRules.map(r => [
      r.app_id, r.app_distributed_id, r.app_name, r.inventory_item, r.policy_name,
      r.rule_global ? 'TRUE' : 'FALSE', r.rule_action,
      r.rule_source,
      formatExpandedForExport(r.rule_source, r.rule_source_expanded),
      r.rule_source_zone,
      r.rule_destination,
      formatExpandedForExport(r.rule_destination, r.rule_destination_expanded),
      r.rule_destination_zone,
      r.rule_service,
      formatExpandedForExport(r.rule_service, r.rule_service_expanded),
      r.rn, r.rc
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firewall-rules-${fileLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Spreadsheet exported', 'success');
  };

  const columns: Column<LegacyRule>[] = [
    { key: 'id', header: 'Rule ID', sortable: true, width: '80px' },
    { key: 'app_id', header: 'App ID', sortable: true, width: '70px',
      render: (_, row) => <span className="text-xs">{String(row.app_id)}</span>,
    },
    { key: 'app_distributed_id', header: 'Dist ID', sortable: true, width: '70px' },
    { key: 'app_name', header: 'App Name', sortable: true, width: '110px' },
    { key: 'inventory_item', header: 'Inventory', sortable: true, width: '120px' },
    { key: 'policy_name', header: 'Policy', sortable: true, width: '90px' },
    { key: 'rule_action', header: 'Action', sortable: true, width: '70px',
      render: (_, row) => (
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${row.rule_action === 'Accept' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {row.rule_action}
        </span>
      ),
    },
    { key: 'rule_source', header: 'Source', sortable: false, width: '150px',
      render: (_, row) => {
        const entries = (row.rule_source || '').split('\n').filter(Boolean);
        // Structure-based: count groups by checking expansion column for entries with indented children
        const expLines = (row.rule_source_expanded || '').split('\n').filter((l: string) => l.trim());
        const expData = expLines.map((l: string) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
        const groupCount = expData.filter((_: { indent: number; text: string }, idx: number) => idx + 1 < expData.length && expData[idx + 1].indent > _.indent && _.indent === 0).length;
        return (
          <span className="font-mono text-xs">
            {groupCount > 0 && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded mr-1">{groupCount} grp</span>}
            {entries.slice(0, 2).map((e: string) => e.trim()).join(', ')}{entries.length > 2 ? ` +${entries.length - 2}` : ''}
          </span>
        );
      },
    },
    { key: 'rule_source_zone', header: 'Src Zone', sortable: true, width: '100px' },
    { key: 'rule_destination', header: 'Destination', sortable: false, width: '150px',
      render: (_, row) => {
        const entries = (row.rule_destination || '').split('\n').filter(Boolean);
        const expLines = (row.rule_destination_expanded || '').split('\n').filter((l: string) => l.trim());
        const expData = expLines.map((l: string) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
        const groupCount = expData.filter((_: { indent: number; text: string }, idx: number) => idx + 1 < expData.length && expData[idx + 1].indent > _.indent && _.indent === 0).length;
        return (
          <span className="font-mono text-xs">
            {groupCount > 0 && <span className="text-[9px] bg-fuchsia-100 text-fuchsia-700 px-1 py-0.5 rounded mr-1">{groupCount} grp</span>}
            {entries.slice(0, 2).map((e: string) => e.trim()).join(', ')}{entries.length > 2 ? ` +${entries.length - 2}` : ''}
          </span>
        );
      },
    },
    { key: 'rule_destination_zone', header: 'Dst Zone', sortable: true, width: '90px' },
    { key: 'rule_service', header: 'Service', sortable: false, width: '100px',
      render: (_, row) => <span className="text-xs">{row.rule_service || 'N/A'}</span>,
    },
    { key: 'is_standard', header: 'Std', sortable: true, width: '60px',
      render: (_, row) => (
        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${row.is_standard ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {row.is_standard ? 'Y' : 'N'}
        </span>
      ),
    },
    { key: 'rule_status' as keyof LegacyRule, header: 'Rule Status', sortable: true, width: '100px',
      render: (_, row) => <StatusBadge status={row.rule_status || 'Deployed'} />,
    },
    { key: 'rule_migration_status' as keyof LegacyRule, header: 'Migration', sortable: true, width: '110px',
      render: (_, row) => <StatusBadge status={row.rule_migration_status || 'Yet to Migrate'} />,
    },
    { key: '_actions', header: 'Actions', width: '160px', sortable: false,
      render: (_, row) => {
        const migStatus = row.rule_migration_status || 'Yet to Migrate';
        const isMigrationDeployed = migStatus === 'Migrated';
        // In FM: Modify allowed only if NOT yet migrated (still in legacy)
        // Once migrated, rule is managed in Studio
        const canModify = !isMigrationDeployed && row.migration_status !== 'Completed';
        return (
          <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => detailModal.open(row)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View</button>
            {isMigrationDeployed ? (
              <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded" title="This rule is managed in Firewall Studio">Studio</span>
            ) : canModify ? (
              <button onClick={() => openModifyModal(row)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">Modify</button>
            ) : null}
          </div>
        );
      },
    },
  ];

  const tabs = [
    { id: 'all', label: `All Rules (${envFilteredRules.length})` },
    { id: 'standard', label: `Standard (${standardCount})` },
    { id: 'non_standard', label: `Non-Standard (${nonStandardCount})` },
  ];

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {notification && <Notification message={notification.message} type={notification.type} onClose={clearNotification} />}

      {isHideSeedEnabled() && (
        <div className="mb-4 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-700">REAL DATA MODE</span>
          <span className="text-xs text-indigo-500">Seed/test data is hidden. Showing only real imported data. Change in Settings &gt; Data Management.</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Firewall Management</h1>
          <p className="text-sm text-gray-500 mt-1">View and modify imported legacy rules, generate output per application, handle exceptions</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedApp} onChange={e => setSelectedApp(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
            <option value="">All Applications</option>
            {appOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select value={selectedEnv} onChange={e => setSelectedEnv(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
            <option value="">All Environments</option>
            <option value="Production">Production</option>
            <option value="Non-Production">Non-Production</option>
            <option value="Pre-Production">Pre-Production</option>
          </select>
          <button onClick={() => setShowLegacyGroupsModal(true)} className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100">
            Legacy Groups
          </button>
          <button onClick={() => { setSelectedExportApps(selectedApp ? new Set([selectedApp]) : new Set()); setShowExportModal(true); }} className="px-4 py-2 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100">
            Export Rules
          </button>
        </div>
      </div>

      {/* Auto-created Legacy Groups notification */}
      {autoGroupStatus && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-amber-800">Legacy Groups Auto-Created: </span>
            <span className="text-xs text-amber-700">
              {autoGroupStatus.groupsCreated} group(s)
              {autoGroupStatus.nestedGroupsCreated > 0 && `, ${autoGroupStatus.nestedGroupsCreated} nested sub-group(s)`}
              {autoGroupStatus.membersAdded > 0 && `, ${autoGroupStatus.membersAdded} member(s) associated`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLegacyGroupsModal(true)} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline">View Groups</button>
            <button onClick={() => setAutoGroupStatus(null)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Rules', value: envFilteredRules.length, color: 'from-slate-100 to-slate-200 text-slate-800' },
          { label: 'Standard', value: standardCount, color: 'from-green-100 to-green-200 text-green-800' },
          { label: 'Non-Standard', value: nonStandardCount, color: 'from-red-100 to-red-200 text-red-800' },
          { label: 'Modifications', value: envFilteredRules.filter(r => r.rule_action === 'Modify').length, color: 'from-amber-100 to-amber-200 text-amber-800' },
        ].map(card => (
          <div key={card.label} className={`p-4 rounded-lg bg-gradient-to-br ${card.color}`}>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-sm font-medium mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Advanced Filter Panel */}
      <div className="mt-4 mb-3">
        <button onClick={() => setShowAdvFilter(!showAdvFilter)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
          <span>{showAdvFilter ? 'Hide' : 'Show'} Advanced Filters</span>
          <span className="text-[10px]">{showAdvFilter ? '\u25B2' : '\u25BC'}</span>
          {(advFilterSource || advFilterDest || advFilterGeneral) && <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px]">Active</span>}
        </button>
        {showAdvFilter && (
          <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Source (IP / Subnet / Group / Zone)</label>
                <input type="text" value={advFilterSource} onChange={e => setAdvFilterSource(e.target.value)}
                  placeholder="e.g. 10.25.1.10, CRM_WebFarm, STD..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Destination (IP / Subnet / Group / Zone)</label>
                <input type="text" value={advFilterDest} onChange={e => setAdvFilterDest(e.target.value)}
                  placeholder="e.g. 10.25.3.10, CRM-DB-Servers, GEN..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">General Search (any field)</label>
                <input type="text" value={advFilterGeneral} onChange={e => setAdvFilterGeneral(e.target.value)}
                  placeholder="e.g. AD-1001, Payment, tcp/443..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
              <span className="text-xs text-gray-500">{filteredRules.length} rule(s) match filters</span>
              <button onClick={() => { setAdvFilterSource(''); setAdvFilterDest(''); setAdvFilterGeneral(''); }}
                className="text-xs font-medium text-gray-600 hover:text-gray-800">Clear Filters</button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Update App Distributed ID Panel */}
      {selectedRuleIds.size > 0 && (
        <div className="mb-3 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-indigo-800">{selectedRuleIds.size} rule(s) selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBulkUpdatePanel(!showBulkUpdatePanel)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                {showBulkUpdatePanel ? 'Hide' : 'Update App Distributed ID'}
              </button>
              <button onClick={() => setSelectedRuleIds(new Set())}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                Clear Selection
              </button>
            </div>
          </div>
          {showBulkUpdatePanel && (
            <div className="mt-3 pt-3 border-t border-indigo-200">
              <div className="grid grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-indigo-700 mb-1">App Distributed ID *</label>
                  <input type="text" value={bulkAppDistId} onChange={e => handleBulkAppDistIdChange(e.target.value)}
                    placeholder="e.g. AD-1001"
                    className="w-full px-3 py-2 text-sm border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white" />
                  {autoLookedUpName && (
                    <p className="mt-1 text-[10px] text-indigo-600">Auto-found: {autoLookedUpName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-indigo-700 mb-1">App Name {autoLookedUpName ? '(auto-populated)' : '(optional)'}</label>
                  <input type="text" value={bulkAppName} onChange={e => setBulkAppName(e.target.value)}
                    placeholder="e.g. Customer Relationship Manager"
                    className="w-full px-3 py-2 text-sm border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white" />
                </div>
                <div>
                  <button onClick={() => handleBulkUpdate()} disabled={!bulkAppDistId.trim() || bulkUpdating}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {bulkUpdating ? 'Updating...' : `Apply to ${selectedRuleIds.size} Rule(s)`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRules}
            keyField="id"
            defaultPageSize={15}
            emptyMessage="No rules found. Import rules via Data Import page."
            searchPlaceholder="Search by IP, group, app, rule ID, zone, service..."
            searchFields={['id', 'app_id', 'app_distributed_id', 'app_name', 'rule_source', 'rule_source_expanded', 'rule_destination', 'rule_destination_expanded', 'rule_source_zone', 'rule_destination_zone', 'rule_service', 'inventory_item']}
            selectedIds={selectedRuleIds}
            onSelect={toggleSelectRule}
            onSelectAll={toggleSelectAll}
            onRowClick={(row) => detailModal.open(row)}
          />
        )}
      </div>

      {/* Export Rules Modal */}
      <Modal isOpen={showExportModal} onClose={() => setShowExportModal(false)} title="Export Rules" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-600">Select a single app, multiple apps, or all apps to export their rules as a CSV spreadsheet with expanded groups. Use <strong>Select All</strong> to export everything at once.</p>
          <div className="flex items-center justify-between">
            <button onClick={() => {
              if (selectedExportApps.size === appOptions.length) setSelectedExportApps(new Set());
              else setSelectedExportApps(new Set(appOptions.map(a => a.value)));
            }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
              {selectedExportApps.size === appOptions.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-xs text-gray-500">{selectedExportApps.size} selected</span>
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
            {appOptions.map(app => (
              <label key={app.value} className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs cursor-pointer transition-colors ${selectedExportApps.has(app.value) ? 'bg-teal-100 border border-teal-300' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
                <input type="checkbox" checked={selectedExportApps.has(app.value)} onChange={() => {
                  setSelectedExportApps(prev => { const n = new Set(prev); if (n.has(app.value)) n.delete(app.value); else n.add(app.value); return n; });
                }} className="rounded border-gray-300 text-teal-600" />
                {app.label}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={handleMultiAppExport} disabled={selectedExportApps.size === 0} className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50">
              Export {selectedExportApps.size} App(s)
            </button>
          </div>
        </div>
      </Modal>

      {/* View Detail Modal */}
      <Modal isOpen={detailModal.isOpen} onClose={detailModal.close} title={`Rule: ${detailModal.data?.id || ''}`} size="xl">
        {detailModal.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {([
                ['Rule ID', detailModal.data.id],
                ['App ID', String(detailModal.data.app_id)],
                ['App Distributed ID', detailModal.data.app_distributed_id],
                ['App Name', detailModal.data.app_name],
                ['Inventory Item', detailModal.data.inventory_item],
                ['Policy Name', detailModal.data.policy_name],
                ['Rule Global', detailModal.data.rule_global ? 'Yes' : 'No'],
                ['Rule Action', detailModal.data.rule_action],
                ['Source Zone', detailModal.data.rule_source_zone],
                ['Destination Zone', detailModal.data.rule_destination_zone],
                ['Service', detailModal.data.rule_service],
                ['Standard', detailModal.data.is_standard ? 'Yes' : 'No'],
                ['RN', String(detailModal.data.rn)],
                ['RC', String(detailModal.data.rc)],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className="p-2 bg-gray-50 rounded">
                  <span className="text-xs text-gray-500">{label}</span>
                  <p className="text-sm font-medium text-gray-800 break-all">{val}</p>
                </div>
              ))}
            </div>
            {/* Source Expanded — structure-based group detection */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-blue-50 border-b">
                <h3 className="text-sm font-semibold text-blue-800">Source (Expanded IPs/Groups)</h3>
              </div>
              <div className="p-3 bg-gray-900 max-h-60 overflow-y-auto">
                {parseExpandedTree(detailModal.data.rule_source || '', detailModal.data.rule_source_expanded || '').map((item, i) => (
                  <div key={i} className="font-mono text-xs text-green-400 flex items-center gap-1" style={{ paddingLeft: `${item.indent * 8}px` }}>
                    {item.type === 'group' && <span className="text-[9px] bg-green-700 text-white px-1 rounded">GRP</span>}
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
            {/* Destination Expanded — structure-based group detection */}
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 border-b">
                <h3 className="text-sm font-semibold text-purple-800">Destination (Expanded IPs/Groups)</h3>
              </div>
              <div className="p-3 bg-gray-900 max-h-60 overflow-y-auto">
                {parseExpandedTree(detailModal.data.rule_destination || '', detailModal.data.rule_destination_expanded || '').map((item, i) => (
                  <div key={i} className="font-mono text-xs text-purple-400 flex items-center gap-1" style={{ paddingLeft: `${item.indent * 8}px` }}>
                    {item.type === 'group' && <span className="text-[9px] bg-purple-700 text-white px-1 rounded">GRP</span>}
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-amber-50 border-b">
                <h3 className="text-sm font-semibold text-amber-800">Service (Expanded)</h3>
              </div>
              <div className="p-3 bg-gray-900">
                {(detailModal.data.rule_service_expanded || '').split('\n').map((line, i) => (
                  <div key={i} className="font-mono text-xs text-amber-400">{line}</div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { detailModal.close(); openModifyModal(detailModal.data!); }} className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700">
                Modify Rule
              </button>
              <button onClick={detailModal.close} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modify Rule Modal */}
      <Modal isOpen={!!modifyRule} onClose={closeModifyModal} title={`Modify Rule: ${modifyRule?.id || ''}`} size="xl">
        {modifyRule && modifyState && originalState && (() => {
          const currentDelta = computeLocalDelta(originalState, {
            ...modifyState,
            rule_source: entriesToRaw(sourceEntries),
            rule_destination: entriesToRaw(destEntries),
            rule_service: entriesToRaw(serviceEntries),
            rule_source_expanded: buildExpandedText(sourceEntries),
            rule_destination_expanded: buildExpandedText(destEntries),
            rule_service_expanded: buildExpandedText(serviceEntries),
          });
          const hasAnyChange = Object.keys(currentDelta.added).length > 0 || Object.keys(currentDelta.removed).length > 0 || Object.keys(currentDelta.changed).length > 0;
          return (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Rule summary header */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div><span className="text-gray-500">Rule ID:</span> <span className="font-medium">{modifyRule.id}</span></div>
                <div><span className="text-gray-500">App ID:</span> <span className="font-medium">{String(modifyRule.app_id)}</span></div>
                <div><span className="text-gray-500">App Name:</span> <span className="font-medium">{modifyRule.app_name}</span></div>
                <div><span className="text-gray-500">Policy:</span> <span className="font-medium">{modifyRule.policy_name}</span></div>
              </div>
            </div>

            {/* Edit / Preview toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                <button onClick={() => setModifyViewMode('edit')} className={`px-3 py-1.5 text-xs font-medium ${modifyViewMode === 'edit' ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Edit</button>
                <button onClick={() => setModifyViewMode('preview')} className={`px-3 py-1.5 text-xs font-medium ${modifyViewMode === 'preview' ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Preview Changes{hasAnyChange ? ` (${Object.keys(currentDelta.added).length + Object.keys(currentDelta.removed).length + Object.keys(currentDelta.changed).length})` : ''}
                </button>
              </div>
              {modifyViewMode === 'preview' && !hasAnyChange && (
                <span className="text-xs text-gray-400 italic">No changes yet</span>
              )}
            </div>

            {modifyViewMode === 'edit' ? (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    Edit source, destination, and service entries below. For groups, expand to view and edit associated IPs/subnets. You can add new IPs, subnets, or groups and manage group members.
                  </p>
                </div>

                {/* Source Section */}
                <ResourceEditor label="Source" entries={sourceEntries} onChange={setSourceEntries} appGroups={appGroups} colorScheme={{ bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', headerBg: 'bg-blue-50' }} />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Source Zone</label>
                    <input type="text" value={modifyState.rule_source_zone} onChange={e => handleModifyField('rule_source_zone', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Destination Zone</label>
                    <input type="text" value={modifyState.rule_destination_zone} onChange={e => handleModifyField('rule_destination_zone', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                {/* Destination Section */}
                <ResourceEditor label="Destination" entries={destEntries} onChange={setDestEntries} appGroups={appGroups} colorScheme={{ bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', headerBg: 'bg-purple-50' }} />

                {/* Service Section */}
                <ResourceEditor label="Service / Ports" entries={serviceEntries} onChange={setServiceEntries} appGroups={[]} colorScheme={{ bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', headerBg: 'bg-amber-50' }} />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Rule Action</label>
                    <select value={modifyState.rule_action} onChange={e => handleModifyField('rule_action', e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md">
                      <option value="Accept">Accept</option>
                      <option value="DROP">DROP</option>
                      <option value="Reject">Reject</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Modification Comments</label>
                    <textarea value={modifyComments} onChange={e => setModifyComments(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md h-[38px] resize-none" placeholder="Reason for modification..." />
                  </div>
                </div>

                {/* Compile Option */}
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs font-medium text-gray-700">Compile Rule:</label>
                    <select value={compileVendor} onChange={e => setCompileVendor(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-md">
                      <option value="generic">Generic</option>
                      <option value="palo_alto">Palo Alto</option>
                      <option value="checkpoint">Check Point</option>
                      <option value="fortigate">FortiGate</option>
                    </select>
                    <button onClick={() => handleCompile(modifyRule.id)} disabled={compiling} className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                      {compiling ? 'Compiling...' : 'Compile'}
                    </button>
                  </div>
                  {compiledRule && (
                    <div className="bg-gray-900 rounded p-3 mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Format: {compiledRule.vendor_format}</span>
                        <button onClick={() => navigator.clipboard.writeText(compiledRule.compiled_text)} className="text-xs text-blue-400 hover:text-blue-300">Copy</button>
                      </div>
                      <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{compiledRule.compiled_text}</pre>
                    </div>
                  )}
                </div>

                {/* Delta inline while editing — only show when there are actual changes */}
                {hasAnyChange && (
                  <div className="border rounded-lg p-4 border-blue-200 bg-blue-50">
                    <h3 className="text-sm font-semibold mb-2 text-blue-800">
                      Change Delta
                    </h3>
                    <DeltaView delta={currentDelta} />
                  </div>
                )}
              </>
            ) : (
              /* Preview Mode: Delta-only view for reviewers */
              <div className="space-y-4">
                {hasAnyChange ? (
                  <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                    <h3 className="text-sm font-semibold text-orange-800 mb-3">Changes Only (Delta Preview)</h3>
                    <div className="space-y-3">
                      {Object.keys(currentDelta.added).length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-green-700 mb-1">Added</h4>
                          {Object.entries(currentDelta.added).map(([field, values]) => (
                            <div key={field} className="ml-2">
                              <span className="text-xs font-medium text-gray-600">{field.replace(/rule_/g, '').replace(/_/g, ' ')}:</span>
                              {values.map((v, i) => (
                                <div key={i} className="text-sm text-green-700 font-mono ml-3 bg-green-50 px-2 py-0.5 rounded my-0.5">+ {v}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      {Object.keys(currentDelta.removed).length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-red-700 mb-1">Removed</h4>
                          {Object.entries(currentDelta.removed).map(([field, values]) => (
                            <div key={field} className="ml-2">
                              <span className="text-xs font-medium text-gray-600">{field.replace(/rule_/g, '').replace(/_/g, ' ')}:</span>
                              {values.map((v, i) => (
                                <div key={i} className="text-sm text-red-700 font-mono ml-3 bg-red-50 px-2 py-0.5 rounded my-0.5 line-through">- {v}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      {Object.keys(currentDelta.changed).length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-blue-700 mb-1">Changed</h4>
                          {Object.entries(currentDelta.changed).map(([field, change]) => (
                            <div key={field} className="ml-2 py-1">
                              <span className="text-xs font-medium text-gray-600">{field.replace(/rule_/g, '').replace(/_/g, ' ')}:</span>
                              <div className="ml-3 mt-0.5">
                                <span className="text-sm text-red-600 line-through font-mono">{change.from}</span>
                                <span className="mx-2 text-gray-400">&rarr;</span>
                                <span className="text-sm text-green-600 font-mono">{change.to}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 text-center">
                    <p className="text-sm text-gray-500">No changes to preview yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Switch to Edit mode to make changes.</p>
                  </div>
                )}

                {/* Compile in preview too */}
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs font-medium text-gray-700">Compile Rule:</label>
                    <select value={compileVendor} onChange={e => setCompileVendor(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-md">
                      <option value="generic">Generic</option>
                      <option value="palo_alto">Palo Alto</option>
                      <option value="checkpoint">Check Point</option>
                      <option value="fortigate">FortiGate</option>
                    </select>
                    <button onClick={() => handleCompile(modifyRule.id)} disabled={compiling} className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                      {compiling ? 'Compiling...' : 'Compile'}
                    </button>
                  </div>
                  {compiledRule && (
                    <div className="bg-gray-900 rounded p-3 mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Format: {compiledRule.vendor_format}</span>
                        <button onClick={() => navigator.clipboard.writeText(compiledRule.compiled_text)} className="text-xs text-blue-400 hover:text-blue-300">Copy</button>
                      </div>
                      <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{compiledRule.compiled_text}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={closeModifyModal} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmitModification} disabled={submitting || !hasAnyChange} className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          </div>
          );
        })()}
      </Modal>

      {/* Legacy Groups Modal */}
      <GroupManagerModal
        isOpen={showLegacyGroupsModal}
        onClose={() => setShowLegacyGroupsModal(false)}
        appId={selectedApp || undefined}
        applications={allApplications.map(a => ({ app_id: a.app_id, app_distributed_id: a.app_distributed_id, name: a.name }))}
        environment={selectedEnv || undefined}
      />

      {/* Issue 5: Missing Details Popup when App Distributed ID not found */}
      {showMissingDetailsPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-amber-700 mb-2">App Not Found — Provide Additional Details</h3>
            <p className="text-xs text-gray-600 mb-4">
              No existing rules or applications match <strong>{bulkAppDistId}</strong>.
              You can provide additional details below, or skip to apply just the App Distributed ID.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Policy Name</label>
                <input type="text" value={missingExtraFields.policy_name || ''}
                  onChange={e => setMissingExtraFields(prev => ({ ...prev, policy_name: e.target.value }))}
                  placeholder="e.g. FW-PROD-ALPHA"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Inventory Item</label>
                <input type="text" value={missingExtraFields.inventory_item || ''}
                  onChange={e => setMissingExtraFields(prev => ({ ...prev, inventory_item: e.target.value }))}
                  placeholder="e.g. INV-12345"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Source Zone</label>
                  <input type="text" value={missingExtraFields.rule_source_zone || ''}
                    onChange={e => setMissingExtraFields(prev => ({ ...prev, rule_source_zone: e.target.value }))}
                    placeholder="e.g. Trust"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Destination Zone</label>
                  <input type="text" value={missingExtraFields.rule_destination_zone || ''}
                    onChange={e => setMissingExtraFields(prev => ({ ...prev, rule_destination_zone: e.target.value }))}
                    placeholder="e.g. Untrust"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rule Action</label>
                <select value={missingExtraFields.rule_action || ''}
                  onChange={e => setMissingExtraFields(prev => ({ ...prev, rule_action: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500">
                  <option value="">-- Leave unchanged --</option>
                  <option value="Allow">Allow</option>
                  <option value="Deny">Deny</option>
                  <option value="Drop">Drop</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5 pt-3 border-t">
              <button onClick={handleMissingDetailsSkip}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Skip — Apply ID Only
              </button>
              <button onClick={handleMissingDetailsSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700">
                Apply with Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
